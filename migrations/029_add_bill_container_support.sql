-- Migration: Add bill container support
-- Description: Add parent_bill_id field to support bill containers (like liabilities)
--              Container bills generate payment bills, similar to how liabilities work

-- Add parent_bill_id column to bills table (self-referential)
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS parent_bill_id UUID REFERENCES bills(id) ON DELETE CASCADE;

-- Add index for parent_bill_id lookups
CREATE INDEX IF NOT EXISTS idx_bills_parent_bill_id ON bills(parent_bill_id) WHERE parent_bill_id IS NOT NULL;

-- Add composite index for container queries
CREATE INDEX IF NOT EXISTS idx_bills_container_status ON bills(parent_bill_id, status, due_date) WHERE parent_bill_id IS NOT NULL;

-- Add constraint: Container bills (parent_bill_id IS NULL) must have recurrence fields
-- Payment bills (parent_bill_id IS NOT NULL) should have due_date set
ALTER TABLE bills
ADD CONSTRAINT check_bill_container_structure
CHECK (
  -- Container bill: parent_bill_id IS NULL, must have recurrence if not one_time
  (parent_bill_id IS NULL AND (
    bill_type = 'one_time' OR 
    (bill_type != 'one_time' AND frequency IS NOT NULL AND nature IS NOT NULL)
  ))
  OR
  -- Payment bill: parent_bill_id IS NOT NULL, must have due_date
  (parent_bill_id IS NOT NULL AND due_date IS NOT NULL)
);

-- Prevent circular references (a bill cannot be its own parent)
ALTER TABLE bills
ADD CONSTRAINT check_bill_no_self_parent
CHECK (parent_bill_id IS NULL OR parent_bill_id != id);

-- Add constraint: Container bills should not have liability_id (only payment bills can be liability-linked)
-- Exception: If the bill IS a liability-linked bill container, it's okay
-- But generally, liability_id should only be on payment bills generated from liability
-- For now, we'll allow flexibility but note this in comments
-- ALTER TABLE bills
-- ADD CONSTRAINT check_container_no_liability
-- CHECK (parent_bill_id IS NULL OR liability_id IS NULL);

-- Comments for documentation
COMMENT ON COLUMN bills.parent_bill_id IS 'Parent bill container ID. NULL for containers, set for payment bills generated from container.';

-- Update existing bills: Mark recurring bills as containers if they don't have parent_bill_id
-- All existing recurring bills become containers
UPDATE bills
SET parent_bill_id = NULL
WHERE parent_bill_id IS NULL
  AND bill_type IN ('recurring_fixed', 'recurring_variable')
  AND frequency IS NOT NULL
  AND nature IS NOT NULL;

