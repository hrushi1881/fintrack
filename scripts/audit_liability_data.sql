-- Liability Data Audit Script
-- Run this before migration to identify inconsistencies
-- Purpose: Find orphaned data, mismatches, and sync issues

-- ============================================
-- 1. Find orphaned account_liability_portions (no matching account_funds)
-- ============================================
SELECT 
  'ORPHANED_PORTIONS' as issue_type,
  alp.id,
  alp.account_id,
  alp.liability_id,
  alp.amount,
  alp.created_at
FROM account_liability_portions alp
LEFT JOIN account_funds af 
  ON af.account_id = alp.account_id 
  AND af.type = 'borrowed'
  AND af.reference_id = alp.liability_id
WHERE af.id IS NULL;

-- ============================================
-- 2. Find mismatched amounts between portions and funds
-- ============================================
SELECT 
  'AMOUNT_MISMATCH' as issue_type,
  alp.account_id,
  alp.liability_id,
  alp.amount as portions_amount,
  af.balance as funds_balance,
  alp.amount - af.balance as difference,
  ABS(alp.amount - af.balance) as abs_difference
FROM account_liability_portions alp
JOIN account_funds af 
  ON af.account_id = alp.account_id 
  AND af.type = 'borrowed'
  AND af.reference_id = alp.liability_id
WHERE ABS(alp.amount - af.balance) > 0.01;  -- Allow 0.01 tolerance for rounding

-- ============================================
-- 3. Find liability disbursed_amount mismatches
-- ============================================
SELECT 
  'DISBURSED_MISMATCH' as issue_type,
  l.id as liability_id,
  l.title as liability_name,
  l.disbursed_amount as liability_reported,
  COALESCE(SUM(af.balance), 0) as actual_in_funds,
  l.disbursed_amount - COALESCE(SUM(af.balance), 0) as difference,
  ABS(l.disbursed_amount - COALESCE(SUM(af.balance), 0)) as abs_difference
FROM liabilities l
LEFT JOIN account_funds af 
  ON af.type = 'borrowed' 
  AND af.reference_id = l.id
WHERE l.is_deleted = false
GROUP BY l.id, l.title, l.disbursed_amount
HAVING ABS(l.disbursed_amount - COALESCE(SUM(af.balance), 0)) > 0.01;

-- ============================================
-- 4. Check for wrong column name usage (fund_type should not exist)
-- ============================================
SELECT 
  'WRONG_COLUMN' as issue_type,
  af.id,
  af.account_id,
  af.fund_type as wrong_column_value,
  af.type as correct_column_value
FROM account_funds af
WHERE af.type = 'borrowed'
  AND af.fund_type IS NOT NULL;  -- Should be NULL, type is the correct column

-- ============================================
-- 5. Find account_funds without corresponding portions (shouldn't happen, but check)
-- ============================================
SELECT 
  'FUNDS_WITHOUT_PORTIONS' as issue_type,
  af.id as fund_id,
  af.account_id,
  af.reference_id as liability_id,
  af.balance,
  af.created_at
FROM account_funds af
LEFT JOIN account_liability_portions alp
  ON alp.account_id = af.account_id
  AND alp.liability_id = af.reference_id
WHERE af.type = 'borrowed'
  AND af.reference_id IS NOT NULL
  AND alp.id IS NULL;

-- ============================================
-- 6. Summary counts
-- ============================================
SELECT 
  'SUMMARY' as report_type,
  (SELECT COUNT(*) FROM account_liability_portions) as total_portions,
  (SELECT COUNT(*) FROM account_funds WHERE type = 'borrowed' AND reference_id IS NOT NULL) as total_borrowed_funds,
  (SELECT COUNT(DISTINCT liability_id) FROM account_liability_portions) as liabilities_with_portions,
  (SELECT COUNT(DISTINCT reference_id) FROM account_funds WHERE type = 'borrowed' AND reference_id IS NOT NULL) as liabilities_with_funds,
  (SELECT COUNT(*) FROM liabilities WHERE is_deleted = false) as total_active_liabilities;

