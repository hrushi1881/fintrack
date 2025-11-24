-- Migration: Add parent_bill_id column for container/payment bill pattern
-- Description: Enables bills to have a parent-child relationship where:
--              - Container bills (parent_bill_id = NULL) are recurring templates
--              - Payment bills (parent_bill_id = <container_id>) are individual occurrences

-- Add parent_bill_id column to bills table
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS parent_bill_id UUID REFERENCES bills(id) ON DELETE CASCADE;

-- Add index for parent_bill_id for efficient queries
CREATE INDEX IF NOT EXISTS idx_bills_parent_bill_id ON bills(parent_bill_id);

-- Add index for container bills (parent_bill_id IS NULL) - these are the recurring templates
CREATE INDEX IF NOT EXISTS idx_bills_container ON bills(parent_bill_id) WHERE parent_bill_id IS NULL;

-- Add index for payment bills (parent_bill_id IS NOT NULL) - these are individual occurrences
CREATE INDEX IF NOT EXISTS idx_bills_payment ON bills(parent_bill_id) WHERE parent_bill_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN bills.parent_bill_id IS 'NULL for container bills (recurring templates), or ID of parent container for payment bills (individual occurrences)';

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'bills' 
    AND column_name = 'parent_bill_id'
  ) THEN
    RAISE NOTICE 'SUCCESS: parent_bill_id column added to bills table';
  ELSE
    RAISE EXCEPTION 'FAILED: parent_bill_id column was not added';
  END IF;
END $$;

