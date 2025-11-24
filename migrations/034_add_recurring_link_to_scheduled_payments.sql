-- Migration: Add linked_recurring_transaction_id to scheduled_payments
-- Description: Link scheduled payments to recurring transactions for cycle tracking

ALTER TABLE scheduled_payments
ADD COLUMN IF NOT EXISTS linked_recurring_transaction_id UUID REFERENCES recurring_transactions(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_recurring_transaction_id 
ON scheduled_payments(linked_recurring_transaction_id);

-- Add comment
COMMENT ON COLUMN scheduled_payments.linked_recurring_transaction_id IS 'Links to recurring_transaction if this scheduled payment is from a recurring transaction cycle';

