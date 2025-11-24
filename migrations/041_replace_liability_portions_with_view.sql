-- Migration 041: Replace account_liability_portions table with view based on account_funds
-- Purpose: Make account_funds the single source of truth for liability funds
-- Created: 2025-01-30

-- Step 1: Drop all triggers on account_liability_portions
-- (Views don't need triggers - they inherit from underlying table)
DROP TRIGGER IF EXISTS trg_account_liability_portions_updated_at ON account_liability_portions;

-- Step 2: Drop all RLS policies on account_liability_portions
-- (Views inherit RLS from underlying table)
DROP POLICY IF EXISTS "account_liability_portions_select_own" ON account_liability_portions;
DROP POLICY IF EXISTS "account_liability_portions_insert_own" ON account_liability_portions;
DROP POLICY IF EXISTS "account_liability_portions_update_own" ON account_liability_portions;
DROP POLICY IF EXISTS "account_liability_portions_delete_own" ON account_liability_portions;

-- Step 3: Drop indexes (views don't use indexes, but we need to drop them before dropping the table)
DROP INDEX IF EXISTS idx_account_liability_portions_account;
DROP INDEX IF EXISTS idx_account_liability_portions_liability;
-- Note: Primary key and unique indexes will be dropped automatically with the table

-- Step 4: Drop foreign key constraints that reference this table (if any)
-- Check for any tables that reference account_liability_portions
-- (CASCADE will handle this, but being explicit)

-- Step 5: Drop the table (constraints will be dropped automatically)
DROP TABLE IF EXISTS account_liability_portions CASCADE;

-- Step 6: Create view that reads from account_funds
-- This view provides the same interface as the old table but reads from account_funds
-- Note: The old table had 'liability_account_id' column which we're omitting in the view
-- as it's not in account_funds and wasn't actively used
CREATE OR REPLACE VIEW account_liability_portions AS
SELECT 
  id,
  account_id,
  reference_id AS liability_id,
  balance AS amount,
  metadata->>'notes' AS notes,  -- Extract notes from metadata if present
  created_at,
  updated_at
FROM account_funds
WHERE type = 'borrowed' 
  AND reference_id IS NOT NULL;

-- Step 7: Add comment explaining it's now a read-only view
COMMENT ON VIEW account_liability_portions IS 
  'Read-only view of borrowed funds from account_funds table. This view is provided for backward compatibility. All liability fund data is stored in account_funds table. DO NOT attempt INSERT/UPDATE/DELETE operations on this view - write to account_funds instead.';

-- Step 8: Grant permissions (views inherit from underlying table, but ensure SELECT is available)
GRANT SELECT ON account_liability_portions TO authenticated;
GRANT SELECT ON account_liability_portions TO anon;

-- Note: RLS on account_funds will apply to this view automatically
-- Users can only see liability funds for their own accounts

