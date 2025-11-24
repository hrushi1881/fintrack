-- Migration 030: Add enhancements to organizations table
-- Description: Add is_active, is_deleted, type, and description fields to organizations

-- Add new columns to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('bank', 'wallet', 'investment', 'cash', 'custom')),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Update existing organizations to have default type
UPDATE organizations
SET type = 'custom'
WHERE type IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_organizations_is_deleted ON organizations(user_id, is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(user_id, type);

-- Comments for documentation
COMMENT ON COLUMN organizations.is_active IS 'Whether the organization is currently active';
COMMENT ON COLUMN organizations.is_deleted IS 'Soft delete flag for organizations';
COMMENT ON COLUMN organizations.deleted_at IS 'Timestamp when organization was deleted';
COMMENT ON COLUMN organizations.type IS 'Type of organization: bank, wallet, investment, cash, or custom';
COMMENT ON COLUMN organizations.description IS 'Optional description for the organization';

