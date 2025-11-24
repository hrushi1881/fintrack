-- Migration: Add available_funds column to liabilities
-- Description: Track available funds separately from disbursed_amount for better fund management

-- Add available_funds column
ALTER TABLE liabilities 
ADD COLUMN IF NOT EXISTS available_funds DECIMAL(14,2) CHECK (available_funds >= 0);

-- Add constraint: available_funds <= original_amount (if original_amount exists)
-- Note: This constraint will be enforced in application logic since we need to handle NULL cases
-- We'll add a check constraint that allows NULL or ensures available_funds <= original_amount when both exist
ALTER TABLE liabilities
DROP CONSTRAINT IF EXISTS check_available_funds_le_original;

ALTER TABLE liabilities
ADD CONSTRAINT check_available_funds_le_original 
CHECK (
  available_funds IS NULL 
  OR original_amount IS NULL 
  OR available_funds <= original_amount
);

-- Initialize available_funds for existing liabilities
-- If original_amount exists, set available_funds = original_amount - disbursed_amount (if disbursed_amount exists)
-- Otherwise, set available_funds = original_amount
UPDATE liabilities
SET available_funds = CASE
  WHEN original_amount IS NOT NULL THEN
    GREATEST(0, COALESCE(original_amount, 0) - COALESCE(disbursed_amount, 0))
  ELSE NULL
END
WHERE available_funds IS NULL;

-- Add comment
COMMENT ON COLUMN liabilities.available_funds IS 'Available funds that can be withdrawn from this liability. Must be <= original_amount. Used funds = original_amount - available_funds.';

