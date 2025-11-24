-- Migration 050: Add onboarding fields to users_profile table and is_deleted to categories
-- Description: Add country, profession, onboarding_completed, and default_currency fields to users_profile
--              Add is_deleted field to categories table for soft deletes

-- ============================================================================
-- USERS_PROFILE TABLE ENHANCEMENTS
-- ============================================================================

-- Add new columns to users_profile table
ALTER TABLE users_profile
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS profession TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';

-- Update existing profiles to set default_currency from base_currency if default_currency is not set
UPDATE users_profile
SET default_currency = base_currency
WHERE default_currency = 'USD' AND base_currency != 'USD';

-- Add index for onboarding_completed for faster queries
CREATE INDEX IF NOT EXISTS idx_users_profile_onboarding_completed ON users_profile(user_id, onboarding_completed) WHERE onboarding_completed = false;

-- Add index for country if needed for filtering
CREATE INDEX IF NOT EXISTS idx_users_profile_country ON users_profile(country) WHERE country IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN users_profile.country IS 'User country code or name';
COMMENT ON COLUMN users_profile.profession IS 'User profession or job title';
COMMENT ON COLUMN users_profile.onboarding_completed IS 'Whether user has completed onboarding flow';
COMMENT ON COLUMN users_profile.default_currency IS 'User default currency for transactions (defaults to base_currency)';

-- ============================================================================
-- CATEGORIES TABLE ENHANCEMENTS
-- ============================================================================

-- Add is_deleted and deleted_at columns to categories table for soft deletes
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add index for is_deleted for faster queries (filtering out deleted categories)
CREATE INDEX IF NOT EXISTS idx_categories_is_deleted ON categories(user_id, is_deleted) WHERE is_deleted = false;

-- Comments for documentation
COMMENT ON COLUMN categories.is_deleted IS 'Soft delete flag for categories';
COMMENT ON COLUMN categories.deleted_at IS 'Timestamp when category was deleted';

