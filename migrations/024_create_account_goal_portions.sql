-- Migration 024: Create account_goal_portions table
-- Created: 2025-01-30
-- Purpose: Track goal funds within regular accounts (mirrors account_liability_portions structure)

-- Table to track goal portions within regular accounts
CREATE TABLE IF NOT EXISTS account_goal_portions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique account-goal combinations
  UNIQUE(account_id, goal_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_goal_portions_account_id ON account_goal_portions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_goal_portions_goal_id ON account_goal_portions(goal_id);

-- RLS Policies
ALTER TABLE account_goal_portions ENABLE ROW LEVEL SECURITY;

-- RLS for account_goal_portions
CREATE POLICY "account_goal_portions_select_own" ON account_goal_portions
  FOR SELECT USING (
    auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id)
  );

CREATE POLICY "account_goal_portions_insert_own" ON account_goal_portions
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id)
  );

CREATE POLICY "account_goal_portions_update_own" ON account_goal_portions
  FOR UPDATE USING (
    auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id)
  );

CREATE POLICY "account_goal_portions_delete_own" ON account_goal_portions
  FOR DELETE USING (
    auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id)
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_goal_portions_updated_at ON account_goal_portions;
CREATE TRIGGER trg_account_goal_portions_updated_at
  BEFORE UPDATE ON account_goal_portions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

