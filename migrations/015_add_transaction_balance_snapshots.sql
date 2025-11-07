-- Migration 015: Add balance_before and balance_after columns to transactions table
-- Created: 2025-01-29
-- Purpose: Store account balance snapshots at the time of transaction creation

-- Add balance_before and balance_after columns to transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS balance_before DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS balance_after DECIMAL(14,2);

-- Add index for performance when querying by balance
CREATE INDEX IF NOT EXISTS idx_transactions_balance_before ON transactions(balance_before);
CREATE INDEX IF NOT EXISTS idx_transactions_balance_after ON transactions(balance_after);

-- Add comment for documentation
COMMENT ON COLUMN transactions.balance_before IS 'Account balance immediately before this transaction was applied';
COMMENT ON COLUMN transactions.balance_after IS 'Account balance immediately after this transaction was applied';

