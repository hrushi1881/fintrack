-- Migration: Create budget utility functions
-- Description: Database functions for budget operations and calculations

-- Function to automatically create budget_transactions when transactions are created
CREATE OR REPLACE FUNCTION create_budget_transactions_for_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process expense transactions
  IF NEW.type = 'expense' THEN
    -- Find all active budgets that should include this transaction
    INSERT INTO budget_transactions (budget_id, transaction_id, amount_counted, applied_at)
    SELECT 
      b.id,
      NEW.id,
      NEW.amount,
      NOW()
    FROM budgets b
    LEFT JOIN budget_accounts ba ON b.id = ba.budget_id
    WHERE b.is_active = true 
      AND b.is_deleted = false
      AND (
        -- Monthly budgets: include all expense transactions from linked accounts
        (b.budget_type = 'monthly' AND ba.account_id = NEW.account_id)
        OR
        -- Category budgets: include transactions from linked accounts with matching category
        (b.budget_type = 'category' AND ba.account_id = NEW.account_id AND b.category_id = NEW.category_id)
        OR
        -- Goal-based budgets: include transactions from linked accounts (logic handled in application)
        (b.budget_type = 'goal_based' AND ba.account_id = NEW.account_id)
      )
    ON CONFLICT (budget_id, transaction_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic budget transaction creation
DROP TRIGGER IF EXISTS trigger_create_budget_transactions ON transactions;
CREATE TRIGGER trigger_create_budget_transactions
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION create_budget_transactions_for_transaction();

-- Function to update budget spent amounts
CREATE OR REPLACE FUNCTION update_budget_spent_amount(budget_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE budgets 
  SET spent_amount = (
    SELECT COALESCE(SUM(amount_counted), 0)
    FROM budget_transactions 
    WHERE budget_id = budget_uuid 
      AND is_excluded = false
  ),
  updated_at = NOW()
  WHERE id = budget_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to check if budget is over limit
CREATE OR REPLACE FUNCTION is_budget_over_limit(budget_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  budget_amount DECIMAL(12,2);
  spent_amount DECIMAL(12,2);
BEGIN
  SELECT amount, spent_amount INTO budget_amount, spent_amount
  FROM budgets 
  WHERE id = budget_uuid;
  
  RETURN spent_amount > budget_amount;
END;
$$ LANGUAGE plpgsql;

-- Function to get budget progress percentage
CREATE OR REPLACE FUNCTION get_budget_progress_percentage(budget_uuid UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  budget_amount DECIMAL(12,2);
  spent_amount DECIMAL(12,2);
  progress DECIMAL(5,2);
BEGIN
  SELECT amount, spent_amount INTO budget_amount, spent_amount
  FROM budgets 
  WHERE id = budget_uuid;
  
  IF budget_amount = 0 THEN
    RETURN 0;
  END IF;
  
  progress := (spent_amount / budget_amount) * 100;
  RETURN LEAST(progress, 999.99); -- Cap at 999.99%
END;
$$ LANGUAGE plpgsql;

-- Function to get daily spending pace
CREATE OR REPLACE FUNCTION get_budget_daily_pace(budget_uuid UUID)
RETURNS TABLE(
  ideal_daily_spend DECIMAL(12,2),
  current_daily_avg DECIMAL(12,2),
  on_track BOOLEAN
) AS $$
DECLARE
  budget_record RECORD;
  total_days INTEGER;
  days_elapsed INTEGER;
  days_remaining INTEGER;
  ideal_daily DECIMAL(12,2);
  current_avg DECIMAL(12,2);
  is_on_track BOOLEAN;
BEGIN
  SELECT * INTO budget_record
  FROM budgets 
  WHERE id = budget_uuid;
  
  -- Calculate total days in budget period
  total_days := budget_record.end_date - budget_record.start_date + 1;
  
  -- Calculate days elapsed
  days_elapsed := GREATEST(0, CURRENT_DATE - budget_record.start_date + 1);
  
  -- Calculate days remaining
  days_remaining := GREATEST(0, total_days - days_elapsed);
  
  -- Calculate ideal daily spend
  IF days_remaining > 0 THEN
    ideal_daily := budget_record.remaining_amount / days_remaining;
  ELSE
    ideal_daily := 0;
  END IF;
  
  -- Calculate current daily average
  IF days_elapsed > 0 THEN
    current_avg := budget_record.spent_amount / days_elapsed;
  ELSE
    current_avg := 0;
  END IF;
  
  -- Check if on track (within 20% tolerance)
  is_on_track := current_avg <= (ideal_daily * 1.2);
  
  RETURN QUERY SELECT ideal_daily, current_avg, is_on_track;
END;
$$ LANGUAGE plpgsql;
