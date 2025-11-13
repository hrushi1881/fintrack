-- Migration 020: Verify liability settlement requirements
-- Created: 2025-01-29
-- Purpose: Verify and document database requirements for liability settlement feature

-- ============================================================================
-- REQUIRED TABLES (should already exist)
-- ============================================================================

-- 1. liabilities table (from migration 011)
-- Required fields for settlement:
--   - id (UUID)
--   - user_id (UUID)
--   - current_balance (DECIMAL) - remaining amount owed
--   - original_amount (DECIMAL) - total loan amount
--   - disbursed_amount (DECIMAL) - amount disbursed/borrowed
--   - currency (TEXT)
--   - is_deleted (BOOLEAN)
--   - deleted_at (TIMESTAMP)
--   - is_active (BOOLEAN)

-- 2. account_liability_portions table (from migration 012)
-- Required fields for settlement:
--   - id (UUID)
--   - account_id (UUID) - account holding the liability funds
--   - liability_id (UUID) - linked liability
--   - liability_account_id (UUID) - liability account (may not be used in settlement)
--   - amount (DECIMAL) - amount of liability funds in this account
--   - notes (TEXT)

-- 3. accounts table (should exist)
-- Required fields:
--   - id (UUID)
--   - user_id (UUID)
--   - balance (DECIMAL)
--   - currency (TEXT)
--   - type (TEXT)

-- 4. transactions table (should exist)
-- Required fields:
--   - id (UUID)
--   - user_id (UUID)
--   - account_id (UUID)
--   - amount (DECIMAL)
--   - currency (TEXT)
--   - type (TEXT) - 'income', 'expense', 'transfer'
--   - description (TEXT)
--   - date (DATE)
--   - metadata (JSONB) - for storing settlement info

-- ============================================================================
-- REQUIRED RPC FUNCTIONS (should already exist)
-- ============================================================================

-- 1. repay_liability (from migration 016)
-- Signature:
--   repay_liability(
--     p_user_id uuid,
--     p_account_id uuid,
--     p_liability_id uuid,
--     p_amount numeric,
--     p_date date DEFAULT CURRENT_DATE,
--     p_notes text DEFAULT NULL::text
--   )
-- Returns: void
-- Purpose: Record a liability repayment, reduce account balance and liability balance

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check if liabilities table exists and has required fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'liabilities'
  ) THEN
    RAISE EXCEPTION 'liabilities table does not exist. Run migration 011 first.';
  END IF;
  
  -- Check required columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'liabilities' AND column_name = 'current_balance'
  ) THEN
    RAISE EXCEPTION 'liabilities table missing current_balance column';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'liabilities' AND column_name = 'is_deleted'
  ) THEN
    RAISE EXCEPTION 'liabilities table missing is_deleted column';
  END IF;
END $$;

-- Check if account_liability_portions table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'account_liability_portions'
  ) THEN
    RAISE EXCEPTION 'account_liability_portions table does not exist. Run migration 012 first.';
  END IF;
END $$;

-- Check if repay_liability function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'repay_liability'
  ) THEN
    RAISE EXCEPTION 'repay_liability function does not exist. Run migration 016 first.';
  END IF;
END $$;

-- ============================================================================
-- OPTIONAL: Create view for liability settlement status
-- ============================================================================

-- View to help with settlement status checks
CREATE OR REPLACE VIEW liability_settlement_status AS
SELECT 
  l.id AS liability_id,
  l.user_id,
  l.title,
  l.current_balance AS remaining_owed,
  l.original_amount AS total_loan,
  l.currency,
  COALESCE(SUM(alp.amount), 0) AS liability_funds_in_accounts,
  COUNT(DISTINCT alp.account_id) AS accounts_with_funds,
  CASE 
    WHEN l.current_balance = 0 AND COALESCE(SUM(alp.amount), 0) = 0 THEN true
    ELSE false
  END AS is_balanced,
  CASE 
    WHEN l.current_balance > 0 OR COALESCE(SUM(alp.amount), 0) > 0 THEN true
    ELSE false
  END AS needs_settlement,
  GREATEST(0, COALESCE(SUM(alp.amount), 0) - l.current_balance) AS overfunded_by
FROM liabilities l
LEFT JOIN account_liability_portions alp ON l.id = alp.liability_id
WHERE l.is_deleted = false
GROUP BY l.id, l.user_id, l.title, l.current_balance, l.original_amount, l.currency;

-- Grant access to authenticated users
GRANT SELECT ON liability_settlement_status TO authenticated;

-- ============================================================================
-- INDEXES FOR PERFORMANCE (if not already created)
-- ============================================================================

-- Index for checking settlement status by liability_id
CREATE INDEX IF NOT EXISTS idx_account_liability_portions_settlement 
ON account_liability_portions(liability_id, amount) 
WHERE amount > 0;

-- Index for liabilities by deletion status (for settlement checks)
CREATE INDEX IF NOT EXISTS idx_liabilities_settlement 
ON liabilities(user_id, is_deleted, current_balance) 
WHERE is_deleted = false;

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. The liability_activity_log table is OPTIONAL and not required for settlement
--    The settlement feature uses transaction records as audit trail instead.

-- 2. The account_liability_portions.liability_account_id field exists but may
--    not be used in the settlement flow. The settlement focuses on:
--    - liability_id (which liability)
--    - account_id (which account holds the funds)
--    - amount (how much)

-- 3. All settlement operations are performed using:
--    - Direct table updates (for liability balances)
--    - RPC functions (for repayments)
--    - Transaction records (for audit trail)

-- 4. The settlement feature ensures data consistency by:
--    - Checking balances before operations
--    - Using transactions where possible
--    - Creating transaction records for all adjustments
--    - Soft-deleting liabilities (is_deleted = true) instead of hard deletion

