-- Migration: Create goal_accounts table
-- Description: Junction table linking goals to accounts where goal funds can be stored

CREATE TABLE IF NOT EXISTS goal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique goal-account combinations
  UNIQUE(goal_id, account_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_goal_accounts_goal_id ON goal_accounts(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_accounts_account_id ON goal_accounts(account_id);

-- Add RLS (Row Level Security)
ALTER TABLE goal_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access goal_accounts for their own goals
CREATE POLICY "Users can view goal_accounts for their goals" ON goal_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM goals 
      WHERE goals.id = goal_accounts.goal_id 
      AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert goal_accounts for their goals" ON goal_accounts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals 
      WHERE goals.id = goal_accounts.goal_id 
      AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update goal_accounts for their goals" ON goal_accounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM goals 
      WHERE goals.id = goal_accounts.goal_id 
      AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete goal_accounts for their goals" ON goal_accounts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM goals 
      WHERE goals.id = goal_accounts.goal_id 
      AND goals.user_id = auth.uid()
    )
  );

-- Comments for documentation
COMMENT ON TABLE goal_accounts IS 'Junction table linking goals to accounts where goal funds can be stored';
COMMENT ON COLUMN goal_accounts.goal_id IS 'Reference to the goal';
COMMENT ON COLUMN goal_accounts.account_id IS 'Reference to the account where goal funds can be stored';

