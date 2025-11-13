-- Migration 019: Introduce account_funds table for per-account fund buckets
-- Purpose: Track personal, liability, and goal funds directly under each account

-- Ensure UUID generator is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS account_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('personal', 'liability', 'goal')),
  reference_id UUID,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate fund records per account/type/reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_funds_unique
  ON account_funds (account_id, type, COALESCE(reference_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_account_funds_account_id ON account_funds(account_id);
CREATE INDEX IF NOT EXISTS idx_account_funds_type ON account_funds(type);

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS trg_account_funds_updated_at ON account_funds;
CREATE TRIGGER trg_account_funds_updated_at
BEFORE UPDATE ON account_funds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row Level Security mirroring accounts table ownership
ALTER TABLE account_funds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_funds_select_own ON account_funds;
CREATE POLICY account_funds_select_own ON account_funds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = account_funds.account_id
        AND accounts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS account_funds_insert_own ON account_funds;
CREATE POLICY account_funds_insert_own ON account_funds
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = account_funds.account_id
        AND accounts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS account_funds_update_own ON account_funds;
CREATE POLICY account_funds_update_own ON account_funds
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = account_funds.account_id
        AND accounts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS account_funds_delete_own ON account_funds;
CREATE POLICY account_funds_delete_own ON account_funds
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = account_funds.account_id
        AND accounts.user_id = auth.uid()
    )
  );

-- Seed personal fund rows for existing accounts (idempotent)
INSERT INTO account_funds (account_id, type, balance)
SELECT a.id, 'personal', COALESCE(a.balance, 0)
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM account_funds f
  WHERE f.account_id = a.id
    AND f.type = 'personal'
    AND f.reference_id IS NULL
);


