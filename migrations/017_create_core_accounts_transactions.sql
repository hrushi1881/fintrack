-- Migration 017: Create core accounts and transactions tables with RLS
-- Purpose: Provide schema required by app screens and RPCs

-- Ensure UUID generator is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'bank', 'card', 'wallet', 'cash',
    'checking', 'savings', 'credit_card', 'investment', 'loan', 'liability'
  )),
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  color TEXT,
  icon TEXT,
  include_in_totals BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(user_id, is_active);

-- Updated at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
CREATE TRIGGER trg_accounts_updated_at
BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Policies: users can manage only their own rows
DROP POLICY IF EXISTS accounts_select_own ON accounts;
CREATE POLICY accounts_select_own ON accounts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS accounts_insert_own ON accounts;
CREATE POLICY accounts_insert_own ON accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS accounts_update_own ON accounts;
CREATE POLICY accounts_update_own ON accounts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS accounts_delete_own ON accounts;
CREATE POLICY accounts_delete_own ON accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  category TEXT,
  description TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(user_id, date DESC);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_select_own ON transactions;
CREATE POLICY transactions_select_own ON transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS transactions_insert_own ON transactions;
CREATE POLICY transactions_insert_own ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS transactions_update_own ON transactions;
CREATE POLICY transactions_update_own ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS transactions_delete_own ON transactions;
CREATE POLICY transactions_delete_own ON transactions
  FOR DELETE USING (auth.uid() = user_id);


















