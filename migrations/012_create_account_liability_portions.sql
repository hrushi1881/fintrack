-- Migration 012: Create account_liability_portions table
-- Created: 2025-01-29
-- Purpose: Track liability funds within regular accounts

-- Table to track liability portions within regular accounts
CREATE TABLE IF NOT EXISTS account_liability_portions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  liability_id UUID NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
  liability_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_liability_portions_account_id ON account_liability_portions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_liability_portions_liability_id ON account_liability_portions(liability_id);
CREATE INDEX IF NOT EXISTS idx_account_liability_portions_liability_account_id ON account_liability_portions(liability_account_id);

-- RLS Policies
ALTER TABLE account_liability_portions ENABLE ROW LEVEL SECURITY;

-- RLS for account_liability_portions
CREATE POLICY "account_liability_portions_select_own" ON account_liability_portions
  FOR SELECT USING (
    auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id)
  );

CREATE POLICY "account_liability_portions_insert_own" ON account_liability_portions
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id)
  );

CREATE POLICY "account_liability_portions_update_own" ON account_liability_portions
  FOR UPDATE USING (
    auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id)
  );

CREATE POLICY "account_liability_portions_delete_own" ON account_liability_portions
  FOR DELETE USING (
    auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id)
  );

-- Trigger for updated_at
CREATE TRIGGER trg_account_liability_portions_updated_at
  BEFORE UPDATE ON account_liability_portions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add foreign key constraint for account_liability_portions_account_id_fkey
-- This is referenced in the code but might not exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'account_liability_portions_account_id_fkey'
  ) THEN
    ALTER TABLE account_liability_portions 
    ADD CONSTRAINT account_liability_portions_account_id_fkey 
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
END $$;
