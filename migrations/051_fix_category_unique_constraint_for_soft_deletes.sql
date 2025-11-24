-- Migration 051: Fix category unique constraint to support soft deletes
-- Description: Replace simple unique constraint with partial unique index that ignores deleted categories
-- This allows users to recreate categories with the same name after soft deletion

-- Drop the existing unique constraint
ALTER TABLE categories 
  DROP CONSTRAINT IF EXISTS unique_user_category_name;

ALTER TABLE categories 
  DROP CONSTRAINT IF EXISTS unique_category_name_per_user;

-- Create a partial unique index that only applies to non-deleted categories
-- This allows multiple categories with the same name if previous ones are deleted
CREATE UNIQUE INDEX IF NOT EXISTS unique_category_name_per_user_active 
ON categories(user_id, name) 
WHERE is_deleted = false;

-- Add comment for documentation
COMMENT ON INDEX unique_category_name_per_user_active IS 
'Ensures unique category names per user, but only for active (non-deleted) categories. Allows recreating categories with the same name after soft deletion.';

