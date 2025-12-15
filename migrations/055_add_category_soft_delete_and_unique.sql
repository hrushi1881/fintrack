-- Migration: Add soft-delete support and parent-aware uniqueness for categories
-- Description:
-- 1) Add is_deleted/deleted_at columns for safe deletion.
-- 2) Make the unique index parent-aware AND ignore deleted rows so users can
--    recreate a category name after soft-deleting the old one.
-- 3) Keep existing parent_id support (from migration 054).

-- 1) Soft delete columns
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2) Update uniqueness to be parent-aware and exclude deleted rows
-- Drop old unique index if it exists
DROP INDEX IF EXISTS unique_user_category_name_parent;
DROP INDEX IF EXISTS unique_user_category_name; -- legacy from initial migration

-- Recreate unique index that:
-- - scopes by user_id + name + parent_id (NULL parent handled via COALESCE)
-- - only applies to active (not deleted) rows
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_category_name_parent_active
ON categories (
  user_id,
  name,
  COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::UUID)
)
WHERE is_deleted = false;

-- 3) (Optional) backfill existing rows to ensure is_deleted is false
UPDATE categories
SET is_deleted = COALESCE(is_deleted, false)
WHERE is_deleted IS NULL;

-- Add a comment for clarity
COMMENT ON COLUMN categories.is_deleted IS 'Soft delete flag. true = hidden/archived, false = active.';
COMMENT ON COLUMN categories.deleted_at IS 'Timestamp when category was soft-deleted.';













