-- Migration 033: Replace account_goal_portions table with view based on account_funds
-- Purpose: Make account_funds the single source of truth for goal funds
-- Created: 2025-01-30

-- Step 1: Drop all triggers and policies on account_goal_portions
-- (Views don't need triggers or RLS policies - they inherit from underlying table)

DROP TRIGGER IF EXISTS trg_account_goal_portions_updated_at ON account_goal_portions;
DROP POLICY IF EXISTS "account_goal_portions_select_own" ON account_goal_portions;
DROP POLICY IF EXISTS "account_goal_portions_insert_own" ON account_goal_portions;
DROP POLICY IF EXISTS "account_goal_portions_update_own" ON account_goal_portions;
DROP POLICY IF EXISTS "account_goal_portions_delete_own" ON account_goal_portions;

-- Step 2: Drop indexes (views don't use indexes, but we need to drop them before dropping the table)
DROP INDEX IF EXISTS idx_account_goal_portions_account_id;
DROP INDEX IF EXISTS idx_account_goal_portions_goal_id;

-- Step 3: Drop the table (constraints will be dropped automatically)
DROP TABLE IF EXISTS account_goal_portions CASCADE;

-- Step 4: Create view that reads from account_funds
-- This view provides the same interface as the old table but reads from account_funds
CREATE OR REPLACE VIEW account_goal_portions AS
SELECT 
  id,
  account_id,
  reference_id as goal_id,
  balance as amount,
  NULL::text as notes,
  created_at,
  updated_at
FROM account_funds
WHERE type = 'goal' AND reference_id IS NOT NULL;

-- Step 5: Add comment explaining it's now a read-only view
COMMENT ON VIEW account_goal_portions IS 'Read-only view of goal funds from account_funds. This view is provided for backward compatibility. All goal fund data is stored in account_funds table.';

-- Step 6: Grant permissions (views inherit from underlying table, but ensure SELECT is available)
GRANT SELECT ON account_goal_portions TO authenticated;

-- Note: RLS on account_funds will apply to this view automatically
-- Users can only see goal funds for their own accounts

