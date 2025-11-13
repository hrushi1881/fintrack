-- Migration 018: Create users_profile table with RLS

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_users_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_profile_updated_at ON users_profile;
CREATE TRIGGER trg_users_profile_updated_at
BEFORE UPDATE ON users_profile
FOR EACH ROW EXECUTE FUNCTION set_users_profile_updated_at();

-- Indexes (helpful for joins)
CREATE INDEX IF NOT EXISTS idx_users_profile_currency ON users_profile(base_currency);

-- Enable RLS
ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_profile_select_own ON users_profile;
CREATE POLICY users_profile_select_own ON users_profile
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS users_profile_insert_own ON users_profile;
CREATE POLICY users_profile_insert_own ON users_profile
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS users_profile_update_own ON users_profile;
CREATE POLICY users_profile_update_own ON users_profile
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS users_profile_delete_own ON users_profile;
CREATE POLICY users_profile_delete_own ON users_profile
  FOR DELETE USING (auth.uid() = user_id);


















