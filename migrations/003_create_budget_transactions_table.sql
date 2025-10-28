-- Migration: Create budget_transactions table
-- Description: Links transactions to budgets with exclusion tracking and reconciliation

CREATE TABLE IF NOT EXISTS budget_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  is_excluded BOOLEAN DEFAULT false,
  excluded_at TIMESTAMP WITH TIME ZONE,
  excluded_reason TEXT,
  amount_counted DECIMAL(12,2) NOT NULL DEFAULT 0,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reconciled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique budget-transaction combinations
  UNIQUE(budget_id, transaction_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_budget_transactions_budget_id ON budget_transactions(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_transaction_id ON budget_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_is_excluded ON budget_transactions(is_excluded);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_applied_at ON budget_transactions(applied_at);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_reconciled ON budget_transactions(reconciled);

-- Add RLS (Row Level Security)
ALTER TABLE budget_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access budget_transactions for their own budgets
CREATE POLICY "Users can view budget_transactions for their budgets" ON budget_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_transactions.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert budget_transactions for their budgets" ON budget_transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_transactions.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update budget_transactions for their budgets" ON budget_transactions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_transactions.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete budget_transactions for their budgets" ON budget_transactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_transactions.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE TRIGGER update_budget_transactions_updated_at
  BEFORE UPDATE ON budget_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
