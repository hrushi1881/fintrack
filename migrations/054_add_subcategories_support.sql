-- Migration: Add subcategories support to categories table
-- Description: Adds parent_id field to support category hierarchy (categories and subcategories)
-- Date: 2025-01-XX

-- Add parent_id column to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;

-- Add index for parent_id for efficient subcategory queries
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- Add constraint to prevent circular references (a category cannot be its own parent)
ALTER TABLE categories 
ADD CONSTRAINT check_no_self_parent 
CHECK (parent_id IS NULL OR parent_id != id);

-- Add constraint to ensure parent category exists and belongs to same user
-- Note: This is handled by the foreign key constraint, but we add a check for same user_id
CREATE OR REPLACE FUNCTION check_parent_same_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM categories 
      WHERE id = NEW.parent_id 
      AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Parent category must belong to the same user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce parent category belongs to same user
DROP TRIGGER IF EXISTS check_parent_category_user ON categories;
CREATE TRIGGER check_parent_category_user
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION check_parent_same_user();

-- Update unique constraint to allow same subcategory name under different parents
-- But still enforce unique category names at the same level (same parent or both NULL)
-- We'll use a unique index with COALESCE to handle NULL parent_id values
ALTER TABLE categories 
DROP CONSTRAINT IF EXISTS unique_user_category_name;

-- Create unique index that allows same subcategory name under different parents
-- Uses COALESCE to convert NULL parent_id to a sentinel UUID for uniqueness check
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_category_name_parent 
ON categories(user_id, name, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- Add comment to document the field
COMMENT ON COLUMN categories.parent_id IS 'Reference to parent category. NULL means this is a top-level category. Non-NULL means this is a subcategory.';

