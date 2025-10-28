-- Migration: Create budget_accounts table
-- Description: Junction table linking budgets to accounts with role and sync tracking

CREATE TABLE IF NOT EXISTS budget_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  account_role TEXT NOT NULL DEFAULT 'owner' CHECK (account_role IN ('owner', 'shared')),
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique budget-account combinations
  UNIQUE(budget_id, account_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_budget_accounts_budget_id ON budget_accounts(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_account_id ON budget_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_role ON budget_accounts(account_role);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_last_synced ON budget_accounts(last_synced_at);

-- Add RLS (Row Level Security)
ALTER TABLE budget_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access budget_accounts for their own budgets
CREATE POLICY "Users can view budget_accounts for their budgets" ON budget_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_accounts.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert budget_accounts for their budgets" ON budget_accounts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_accounts.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update budget_accounts for their budgets" ON budget_accounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_accounts.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete budget_accounts for their budgets" ON budget_accounts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_accounts.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE TRIGGER update_budget_accounts_updated_at
  BEFORE UPDATE ON budget_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
