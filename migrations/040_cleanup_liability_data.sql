-- Migration 040: Cleanup liability data inconsistencies
-- Purpose: Sync account_liability_portions with account_funds (single source of truth)
-- Created: 2025-01-30

-- Step 1: Delete orphaned portions (no matching account_funds)
-- These are invalid records that should not exist
DELETE FROM account_liability_portions alp
WHERE NOT EXISTS (
  SELECT 1 FROM account_funds af
  WHERE af.account_id = alp.account_id
    AND af.type = 'borrowed'
    AND af.reference_id = alp.liability_id
);

-- Step 2: Create missing portions for funds that exist but have no portion record
-- This reconciles any funds that were created but portions weren't
INSERT INTO account_liability_portions (id, account_id, liability_id, amount, created_at, updated_at)
SELECT 
  af.id as id,
  af.account_id,
  af.reference_id as liability_id,
  af.balance as amount,
  af.created_at,
  af.updated_at
FROM account_funds af
LEFT JOIN account_liability_portions alp
  ON alp.account_id = af.account_id
  AND alp.liability_id = af.reference_id
WHERE af.type = 'borrowed'
  AND af.reference_id IS NOT NULL
  AND alp.id IS NULL;

-- Step 3: Sync portions to match account_funds (funds is source of truth)
-- Update portion amounts to match fund balances
UPDATE account_liability_portions alp
SET amount = af.balance,
    updated_at = NOW()
FROM account_funds af
WHERE af.account_id = alp.account_id
  AND af.type = 'borrowed'
  AND af.reference_id = alp.liability_id
  AND ABS(alp.amount - af.balance) > 0.01;  -- Allow 0.01 tolerance for rounding

-- Step 4: Fix liability disbursed_amount to match actual funds
-- Update disbursed_amount from account_funds sum
UPDATE liabilities l
SET disbursed_amount = (
    SELECT COALESCE(SUM(balance), 0)
    FROM account_funds af
    WHERE af.type = 'borrowed'
      AND af.reference_id = l.id
  ),
  updated_at = NOW()
WHERE ABS(l.disbursed_amount - COALESCE((
    SELECT SUM(balance)
    FROM account_funds af
    WHERE af.type = 'borrowed'
      AND af.reference_id = l.id
  ), 0)) > 0.01;  -- Allow tolerance for rounding

-- Step 5: Verification - ensure no mismatches remain
DO $$
DECLARE
  v_orphaned_count INT;
  v_mismatch_count INT;
  v_disbursed_mismatch_count INT;
BEGIN
  -- Count orphaned portions
  SELECT COUNT(*) INTO v_orphaned_count
  FROM account_liability_portions alp
  LEFT JOIN account_funds af 
    ON af.account_id = alp.account_id 
    AND af.type = 'borrowed'
    AND af.reference_id = alp.liability_id
  WHERE af.id IS NULL;

  -- Count amount mismatches
  SELECT COUNT(*) INTO v_mismatch_count
  FROM account_liability_portions alp
  JOIN account_funds af 
    ON af.account_id = alp.account_id 
    AND af.type = 'borrowed'
    AND af.reference_id = alp.liability_id
  WHERE ABS(alp.amount - af.balance) > 0.01;

  -- Count disbursed_amount mismatches
  SELECT COUNT(*) INTO v_disbursed_mismatch_count
  FROM liabilities l
  WHERE l.is_deleted = false
    AND ABS(l.disbursed_amount - COALESCE((
      SELECT SUM(balance)
      FROM account_funds af
      WHERE af.type = 'borrowed'
        AND af.reference_id = l.id
    ), 0)) > 0.01;

  IF v_orphaned_count > 0 THEN
    RAISE WARNING 'Found % orphaned portions after cleanup', v_orphaned_count;
  END IF;

  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'Still have % amount mismatches between portions and funds. Manual review needed.', v_mismatch_count;
  END IF;

  IF v_disbursed_mismatch_count > 0 THEN
    RAISE WARNING 'Found % liabilities with disbursed_amount mismatches after cleanup', v_disbursed_mismatch_count;
  END IF;

  RAISE NOTICE 'Liability data cleanup completed successfully';
  RAISE NOTICE 'Orphaned portions: %, Amount mismatches: %, Disbursed mismatches: %', 
    v_orphaned_count, v_mismatch_count, v_disbursed_mismatch_count;
END $$;

