-- Migration 035: Fix goal current_amount sync
-- Purpose: Recalculate all goal current_amount values from account_funds (single source of truth)
-- Created: 2025-01-30

-- Recalculate goal current_amount from account_funds
-- This fixes any inconsistencies where goal.current_amount doesn't match actual fund balances
UPDATE goals
SET current_amount = (
  SELECT COALESCE(SUM(balance), 0)
  FROM account_funds
  WHERE type = 'goal'
    AND (reference_id = goals.id OR metadata->>'goal_id' = goals.id::text)
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM account_funds
  WHERE type = 'goal'
    AND (reference_id = goals.id OR metadata->>'goal_id' = goals.id::text)
);

-- For goals with no funds, set current_amount to 0
UPDATE goals
SET current_amount = 0,
    updated_at = NOW()
WHERE current_amount != 0
  AND NOT EXISTS (
    SELECT 1
    FROM account_funds
    WHERE type = 'goal'
      AND (reference_id = goals.id OR metadata->>'goal_id' = goals.id::text)
      AND balance > 0
  );

