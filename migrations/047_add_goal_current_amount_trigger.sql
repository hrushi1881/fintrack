-- ============================================================================
-- GOAL CURRENT_AMOUNT AUTO-SYNC TRIGGER
-- ============================================================================

-- Drop existing trigger/function if exists (for idempotency)
DROP TRIGGER IF EXISTS sync_goal_amount_on_fund_change ON account_funds;
DROP FUNCTION IF EXISTS sync_goal_current_amount();

-- Create sync function
CREATE OR REPLACE FUNCTION sync_goal_current_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_goal_id UUID;
  v_total_amount NUMERIC;
BEGIN
  -- Get goal_id from trigger
  IF TG_OP = 'DELETE' THEN
    v_goal_id := OLD.reference_id;
  ELSE
    v_goal_id := NEW.reference_id;
  END IF;
  
  -- Skip if not a goal fund
  IF v_goal_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate total from account_funds
  SELECT COALESCE(SUM(balance), 0)
  INTO v_total_amount
  FROM account_funds
  WHERE type = 'goal'
    AND reference_id = v_goal_id;
  
  -- Update goal
  UPDATE goals
  SET 
    current_amount = v_total_amount,
    updated_at = NOW()
  WHERE id = v_goal_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER sync_goal_amount_on_fund_change
  AFTER INSERT OR UPDATE OR DELETE ON account_funds
  FOR EACH ROW
  WHEN (
    (TG_OP = 'DELETE' AND OLD.type = 'goal') OR
    (TG_OP IN ('INSERT', 'UPDATE') AND NEW.type = 'goal')
  )
  EXECUTE FUNCTION sync_goal_current_amount();

-- One-time sync of existing goals
UPDATE goals g
SET current_amount = (
  SELECT COALESCE(SUM(af.balance), 0)
  FROM account_funds af
  WHERE af.type = 'goal'
    AND af.reference_id = g.id
);

-- Verify sync
SELECT 
  g.id,
  g.title,
  g.current_amount as shown,
  COALESCE(SUM(af.balance), 0) as actual
FROM goals g
LEFT JOIN account_funds af ON af.type = 'goal' AND af.reference_id = g.id
GROUP BY g.id
HAVING g.current_amount != COALESCE(SUM(af.balance), 0);
-- Should return 0 rows

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION sync_goal_current_amount() TO authenticated;
GRANT EXECUTE ON FUNCTION sync_goal_current_amount() TO anon;

COMMENT ON FUNCTION sync_goal_current_amount() IS 
  'Automatically updates goals.current_amount whenever account_funds changes for goal type funds. 
   This ensures goal.current_amount always reflects the sum of goal funds in account_funds.';

