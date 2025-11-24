-- Migration: Fix bill container constraint
-- Description: The check_bill_container_structure constraint is checking for columns that don't exist
--              (frequency and nature). This fixes it to use the actual columns (recurrence_pattern).
--              First fixes existing data, then updates the constraint.

-- Step 1: Fix existing container bills that are missing recurrence_pattern
UPDATE bills
SET recurrence_pattern = 'monthly'
WHERE parent_bill_id IS NULL
  AND bill_type IN ('recurring_fixed', 'recurring_variable', 'liability_linked')
  AND recurrence_pattern IS NULL;

-- Step 2: Drop the incorrect constraint (should already be dropped via execute_sql)
ALTER TABLE bills
DROP CONSTRAINT IF EXISTS check_bill_container_structure;

-- Step 3: Recreate the constraint with correct column names
ALTER TABLE bills
ADD CONSTRAINT check_bill_container_structure
CHECK (
  -- Container bill: parent_bill_id IS NULL, must have recurrence_pattern if not one_time
  (parent_bill_id IS NULL AND (
    bill_type = 'one_time' OR 
    (bill_type != 'one_time' AND recurrence_pattern IS NOT NULL)
  ))
  OR
  -- Payment bill: parent_bill_id IS NOT NULL, must have due_date
  (parent_bill_id IS NOT NULL AND due_date IS NOT NULL)
);

