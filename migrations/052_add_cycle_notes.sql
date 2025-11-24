-- Migration: Add cycle_notes columns for Cycles feature
-- Adds JSONB columns to store cycle-specific notes for recurring transactions, goals, liabilities, and budgets

-- Add cycle_notes to recurring_transactions
ALTER TABLE recurring_transactions
ADD COLUMN IF NOT EXISTS cycle_notes JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN recurring_transactions.cycle_notes IS 'Notes for specific cycles, keyed by cycle number (e.g., {"1": "Paid late due to travel", "2": "..."})';

-- Add cycle_notes to goals
ALTER TABLE goals
ADD COLUMN IF NOT EXISTS cycle_notes JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN goals.cycle_notes IS 'Notes for specific goal contribution cycles, keyed by cycle number';

-- Add cycle_notes to liabilities
ALTER TABLE liabilities
ADD COLUMN IF NOT EXISTS cycle_notes JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN liabilities.cycle_notes IS 'Notes for specific liability payment cycles, keyed by cycle number';

-- Add cycle_notes to budgets
ALTER TABLE budgets
ADD COLUMN IF NOT EXISTS cycle_notes JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN budgets.cycle_notes IS 'Notes for specific budget cycles, keyed by cycle number';

-- Create indexes for faster JSONB queries
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_cycle_notes ON recurring_transactions USING gin(cycle_notes);
CREATE INDEX IF NOT EXISTS idx_goals_cycle_notes ON goals USING gin(cycle_notes);
CREATE INDEX IF NOT EXISTS idx_liabilities_cycle_notes ON liabilities USING gin(cycle_notes);
CREATE INDEX IF NOT EXISTS idx_budgets_cycle_notes ON budgets USING gin(cycle_notes);

-- Create helper functions for cycle notes

-- Function to update cycle note for recurring transaction
CREATE OR REPLACE FUNCTION update_recurring_transaction_cycle_note(
  p_recurring_transaction_id UUID,
  p_cycle_number TEXT,
  p_note TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE recurring_transactions
  SET cycle_notes = jsonb_set(
    COALESCE(cycle_notes, '{}'::jsonb),
    ARRAY[p_cycle_number],
    to_jsonb(p_note)
  ),
  updated_at = NOW()
  WHERE id = p_recurring_transaction_id
  AND user_id = auth.uid();
END;
$$;

-- Function to update cycle note for goal
CREATE OR REPLACE FUNCTION update_goal_cycle_note(
  p_goal_id UUID,
  p_cycle_number TEXT,
  p_note TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE goals
  SET cycle_notes = jsonb_set(
    COALESCE(cycle_notes, '{}'::jsonb),
    ARRAY[p_cycle_number],
    to_jsonb(p_note)
  ),
  updated_at = NOW()
  WHERE id = p_goal_id
  AND user_id = auth.uid();
END;
$$;

-- Function to update cycle note for liability
CREATE OR REPLACE FUNCTION update_liability_cycle_note(
  p_liability_id UUID,
  p_cycle_number TEXT,
  p_note TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE liabilities
  SET cycle_notes = jsonb_set(
    COALESCE(cycle_notes, '{}'::jsonb),
    ARRAY[p_cycle_number],
    to_jsonb(p_note)
  ),
  updated_at = NOW()
  WHERE id = p_liability_id
  AND user_id = auth.uid();
END;
$$;

-- Function to update cycle note for budget
CREATE OR REPLACE FUNCTION update_budget_cycle_note(
  p_budget_id UUID,
  p_cycle_number TEXT,
  p_note TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE budgets
  SET cycle_notes = jsonb_set(
    COALESCE(cycle_notes, '{}'::jsonb),
    ARRAY[p_cycle_number],
    to_jsonb(p_note)
  ),
  updated_at = NOW()
  WHERE id = p_budget_id
  AND user_id = auth.uid();
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_recurring_transaction_cycle_note(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_goal_cycle_note(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_liability_cycle_note(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_budget_cycle_note(UUID, TEXT, TEXT) TO authenticated;

