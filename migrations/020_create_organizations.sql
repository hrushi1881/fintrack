-- Migration 020: Introduce organizations and link accounts

-- Ensure required extension exists
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  logo_url TEXT,
  theme_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_organizations_user_id ON organizations(user_id);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_own ON organizations;
CREATE POLICY organizations_select_own ON organizations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS organizations_insert_own ON organizations;
CREATE POLICY organizations_insert_own ON organizations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS organizations_update_own ON organizations;
CREATE POLICY organizations_update_own ON organizations
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS organizations_delete_own ON organizations;
CREATE POLICY organizations_delete_own ON organizations
  FOR DELETE USING (auth.uid() = user_id);

-- Extend accounts with organization linkage and credit limit metadata
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(14,2);

CREATE INDEX IF NOT EXISTS idx_accounts_organization_id ON accounts(organization_id);

-- Backfill: create a default organization per user and attach existing accounts
WITH user_defaults AS (
  SELECT DISTINCT ON (user_id) user_id, currency, created_at
  FROM accounts
  ORDER BY user_id, created_at
),
inserted AS (
  INSERT INTO organizations (user_id, name, currency)
  SELECT u.user_id, 'My Accounts', COALESCE(u.currency, 'USD')
  FROM user_defaults u
  ON CONFLICT (user_id, name) DO NOTHING
  RETURNING id, user_id
)
UPDATE accounts a
SET organization_id = COALESCE(i.id, o.id)
FROM user_defaults u
LEFT JOIN organizations o ON o.user_id = u.user_id AND o.name = 'My Accounts'
LEFT JOIN inserted i ON i.user_id = u.user_id
WHERE a.user_id = u.user_id
  AND a.organization_id IS NULL;

-- Ensure any future accounts default to null org (handled by app)

