-- Migration 013: Add RPC functions for atomic balance updates
-- Created: 2025-01-29
-- Purpose: Provide safe atomic functions for incrementing and decrementing account balances

-- Increment account balance atomically
CREATE OR REPLACE FUNCTION increment_account_balance(
  p_account_id UUID,
  p_amount DECIMAL(14,2)
) RETURNS void AS $$
BEGIN
  UPDATE accounts 
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrement account balance atomically  
CREATE OR REPLACE FUNCTION decrement_account_balance(
  p_account_id UUID,
  p_amount DECIMAL(14,2)
) RETURNS void AS $$
BEGIN
  UPDATE accounts 
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION increment_account_balance(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_account_balance(UUID, DECIMAL) TO authenticated;

