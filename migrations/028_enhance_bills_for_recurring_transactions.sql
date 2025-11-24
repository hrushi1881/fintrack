-- Migration: Enhance bills table for recurring transactions
-- Description: Add support for all recurring transaction types (Subscription, Bill, Payment, Income)
--              with enhanced frequency options, amount patterns, and tracking fields

-- Add new columns for recurring transaction structure
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS direction TEXT CHECK (direction IN ('income', 'expense')) DEFAULT 'expense';

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS nature TEXT CHECK (nature IN ('subscription', 'bill', 'payment', 'income'));

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS amount_type TEXT CHECK (amount_type IN ('fixed', 'variable')) DEFAULT 'fixed';

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS estimated_amount DECIMAL(12,2);

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS fund_type TEXT CHECK (fund_type IN ('personal', 'liability', 'goal')) DEFAULT 'personal';

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS specific_fund_id UUID;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'halfyearly', 'yearly', 'custom'));

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS custom_pattern JSONB;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS end_type TEXT CHECK (end_type IN ('never', 'on_date', 'after_count')) DEFAULT 'never';

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS occurrence_count INTEGER;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS auto_create BOOLEAN DEFAULT true;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS auto_create_days_before INTEGER DEFAULT 3;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS remind_before BOOLEAN DEFAULT true;

-- Note: reminder_days already exists, we'll enhance it but keep compatibility
-- The new reminder_days array will support multiple reminder days

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS is_subscription BOOLEAN DEFAULT false;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS subscription_provider TEXT;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS subscription_plan TEXT;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS subscription_start_date DATE;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS linked_budget_id UUID REFERENCES budgets(id);

-- Note: linked_liability_id already exists from migration 022
-- Note: goal_id already exists (maps to linked_goal_id)

-- Enhanced status for recurring transactions
-- Keep existing status column, but we'll use it more flexibly
-- Add paused_until for recurring transactions
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS paused_until DATE;

-- Statistics and tracking fields
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS total_occurrences INTEGER DEFAULT 0;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS completed_occurrences INTEGER DEFAULT 0;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS skipped_occurrences INTEGER DEFAULT 0;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS total_paid DECIMAL(12,2) DEFAULT 0;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS average_amount DECIMAL(12,2) DEFAULT 0;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS last_transaction_date DATE;

-- Note: next_due_date already exists, but we'll also use next_transaction_date for clarity
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS next_transaction_date DATE;

-- Update recurrence_pattern constraint to include new frequencies (backward compatibility)
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_recurrence_pattern_check;

ALTER TABLE bills 
ADD CONSTRAINT bills_recurrence_pattern_check 
CHECK (recurrence_pattern IS NULL OR recurrence_pattern IN ('daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'halfyearly', 'yearly', 'custom'));

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_bills_direction ON bills(direction);
CREATE INDEX IF NOT EXISTS idx_bills_nature ON bills(nature);
CREATE INDEX IF NOT EXISTS idx_bills_amount_type ON bills(amount_type);
CREATE INDEX IF NOT EXISTS idx_bills_frequency ON bills(frequency);
CREATE INDEX IF NOT EXISTS idx_bills_fund_type ON bills(fund_type);
CREATE INDEX IF NOT EXISTS idx_bills_specific_fund_id ON bills(specific_fund_id);
CREATE INDEX IF NOT EXISTS idx_bills_end_type ON bills(end_type);
CREATE INDEX IF NOT EXISTS idx_bills_is_subscription ON bills(is_subscription);
CREATE INDEX IF NOT EXISTS idx_bills_linked_budget_id ON bills(linked_budget_id);
CREATE INDEX IF NOT EXISTS idx_bills_next_transaction_date ON bills(next_transaction_date);
CREATE INDEX IF NOT EXISTS idx_bills_status_nature ON bills(status, nature);
CREATE INDEX IF NOT EXISTS idx_bills_nature_frequency ON bills(nature, frequency) WHERE nature IS NOT NULL;

-- Populate new fields from existing data (backward compatibility)
-- Update ALL existing bills (not just where nature IS NULL) to ensure all fields are populated
UPDATE bills 
SET 
  -- Populate nature from bill_type and metadata.source_type
  nature = CASE 
    WHEN bill_type = 'liability_linked' THEN 'payment'
    WHEN bill_type = 'recurring_variable' THEN 'bill'
    WHEN bill_type = 'recurring_fixed' AND (metadata->>'source_type')::TEXT = 'subscription' THEN 'subscription'
    WHEN bill_type = 'recurring_fixed' THEN 'bill'
    WHEN bill_type = 'one_time' THEN 'bill'
    ELSE COALESCE(nature, 'bill')
  END,
  -- Populate direction (default to expense for now, can be enhanced later)
  direction = COALESCE(direction, (metadata->>'direction')::TEXT, 'expense'),
  -- Populate amount_type from bill_type
  amount_type = CASE 
    WHEN bill_type IN ('recurring_fixed', 'liability_linked', 'goal_linked', 'one_time') THEN COALESCE(amount_type, 'fixed')
    WHEN bill_type = 'recurring_variable' THEN COALESCE(amount_type, 'variable')
    ELSE COALESCE(amount_type, 'fixed')
  END,
  -- Populate frequency from recurrence_pattern (map old values to new)
  -- IMPORTANT: Set frequency for ALL recurring bills, default to 'monthly' if pattern is NULL
  frequency = CASE 
    WHEN bill_type = 'one_time' THEN NULL
    WHEN recurrence_pattern = 'daily' THEN 'daily'
    WHEN recurrence_pattern = 'weekly' THEN 'weekly'
    WHEN recurrence_pattern = 'monthly' THEN 'monthly'
    WHEN recurrence_pattern = 'yearly' THEN 'yearly'
    WHEN recurrence_pattern = 'custom' THEN 'custom'
    WHEN recurrence_pattern IS NOT NULL THEN recurrence_pattern::TEXT
    ELSE COALESCE(frequency, 'monthly')
  END,
  -- Set is_subscription based on metadata.source_type
  is_subscription = COALESCE(is_subscription, (metadata->>'source_type')::TEXT = 'subscription', false),
  -- Set end_type based on recurrence_end_date
  end_type = CASE 
    WHEN recurrence_end_date IS NULL THEN COALESCE(end_type, 'never')
    ELSE COALESCE(end_type, 'on_date')
  END,
  -- Populate fund_type from metadata
  fund_type = COALESCE(fund_type, (metadata->>'fund_type')::TEXT, 'personal'),
  -- Set next_transaction_date from next_due_date
  next_transaction_date = COALESCE(next_transaction_date, next_due_date),
  -- Set estimated_amount for variable bills
  estimated_amount = CASE 
    WHEN bill_type = 'recurring_variable' AND estimated_amount IS NULL THEN amount
    ELSE estimated_amount
  END,
  -- Set auto_create and remind_before defaults
  auto_create = COALESCE(auto_create, (metadata->>'auto_create')::BOOLEAN, true),
  remind_before = COALESCE(remind_before, (metadata->>'remind_before')::BOOLEAN, true)
WHERE 
  -- Update all bills where at least one new field is NULL
  nature IS NULL 
  OR direction IS NULL
  OR amount_type IS NULL
  OR (bill_type != 'one_time' AND frequency IS NULL)
  OR end_type IS NULL
  OR fund_type IS NULL
  OR auto_create IS NULL
  OR remind_before IS NULL;

-- Add constraints for new fields
ALTER TABLE bills 
ADD CONSTRAINT check_occurrence_count_positive 
CHECK (occurrence_count IS NULL OR occurrence_count > 0);

ALTER TABLE bills 
ADD CONSTRAINT check_auto_create_days_before_positive 
CHECK (auto_create_days_before IS NULL OR auto_create_days_before >= 0);

ALTER TABLE bills 
ADD CONSTRAINT check_estimated_amount_positive 
CHECK (estimated_amount IS NULL OR estimated_amount > 0);

ALTER TABLE bills 
ADD CONSTRAINT check_total_paid_non_negative 
CHECK (total_paid >= 0);

ALTER TABLE bills 
ADD CONSTRAINT check_average_amount_non_negative 
CHECK (average_amount >= 0);

ALTER TABLE bills 
ADD CONSTRAINT check_total_occurrences_non_negative 
CHECK (total_occurrences >= 0);

ALTER TABLE bills 
ADD CONSTRAINT check_completed_occurrences_non_negative 
CHECK (completed_occurrences >= 0);

ALTER TABLE bills 
ADD CONSTRAINT check_skipped_occurrences_non_negative 
CHECK (skipped_occurrences >= 0);

-- Ensure recurrence_end_date is set if end_type is 'on_date'
ALTER TABLE bills 
ADD CONSTRAINT check_end_type_consistency 
CHECK (
  (end_type = 'never' AND recurrence_end_date IS NULL) OR
  (end_type = 'on_date' AND recurrence_end_date IS NOT NULL) OR
  (end_type = 'after_count' AND occurrence_count IS NOT NULL AND occurrence_count > 0)
);

-- Ensure nature is set for recurring bills
ALTER TABLE bills 
ADD CONSTRAINT check_recurring_bill_nature 
CHECK (
  bill_type = 'one_time' OR 
  nature IS NOT NULL
);

-- Ensure frequency is set for recurring bills (allow flexibility for backward compatibility)
-- Note: This constraint ensures that recurring bills have frequency, but allows NULL for one_time bills
-- Existing bills may have NULL frequency initially, which is handled by the UPDATE statement
ALTER TABLE bills 
ADD CONSTRAINT check_recurring_bill_frequency 
CHECK (
  bill_type = 'one_time' OR 
  frequency IS NOT NULL
);

-- Comments for documentation
COMMENT ON COLUMN bills.direction IS 'Transaction direction: income or expense';
COMMENT ON COLUMN bills.nature IS 'Recurring transaction nature: subscription, bill, payment, or income';
COMMENT ON COLUMN bills.amount_type IS 'Whether amount is fixed or variable';
COMMENT ON COLUMN bills.frequency IS 'Recurring frequency with extended options (biweekly, bimonthly, quarterly, halfyearly)';
COMMENT ON COLUMN bills.custom_pattern IS 'Custom recurrence pattern configuration (days, weekdays, dates)';
COMMENT ON COLUMN bills.end_type IS 'How recurrence ends: never, on_date, or after_count';
COMMENT ON COLUMN bills.fund_type IS 'Fund type: personal, liability, or goal';
COMMENT ON COLUMN bills.next_transaction_date IS 'Date of next scheduled transaction (enhanced version of next_due_date)';

