-- Migration: Add payment tracking method to recurring transactions
-- Description: Allows container to choose how payments are tracked (bills, scheduled transactions, direct, or manual)

ALTER TABLE recurring_transactions
ADD COLUMN IF NOT EXISTS payment_tracking_method TEXT 
  CHECK (payment_tracking_method IN ('bill', 'scheduled_transaction', 'direct', 'manual'))
  DEFAULT 'bill';

COMMENT ON COLUMN recurring_transactions.payment_tracking_method IS 
  'How payments are tracked: bill (creates bills), scheduled_transaction (creates scheduled transactions), direct (creates transactions directly), manual (just tracks cycles)';

-- Update existing records to have default
UPDATE recurring_transactions
SET payment_tracking_method = 'bill'
WHERE payment_tracking_method IS NULL;


