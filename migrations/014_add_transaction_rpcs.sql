-- Migration 014: Add transaction management RPC functions
-- Created: 2025-01-29
-- Purpose: Provide transaction management functions for liability system

-- Begin transaction (placeholder - PostgreSQL doesn't have explicit transactions in RPC)
CREATE OR REPLACE FUNCTION begin_transaction()
RETURNS void AS $$
BEGIN
  -- PostgreSQL transactions are handled at the connection level
  -- This is a no-op function for compatibility
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Commit transaction (placeholder - PostgreSQL doesn't have explicit transactions in RPC)
CREATE OR REPLACE FUNCTION commit_transaction()
RETURNS void AS $$
BEGIN
  -- PostgreSQL transactions are handled at the connection level
  -- This is a no-op function for compatibility
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rollback transaction (placeholder - PostgreSQL doesn't have explicit transactions in RPC)
CREATE OR REPLACE FUNCTION rollback_transaction()
RETURNS void AS $$
BEGIN
  -- PostgreSQL transactions are handled at the connection level
  -- This is a no-op function for compatibility
  -- In a real implementation, you'd need to use a different approach
  -- for transaction management across RPC calls
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pay from liability funds (atomic operation)
CREATE OR REPLACE FUNCTION pay_from_liability_funds(
  p_user_id UUID,
  p_account_id UUID,
  p_liability_id UUID,
  p_amount DECIMAL(14,2),
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'USD'
)
RETURNS void AS $$
DECLARE
  v_portion_amount DECIMAL(14,2);
  v_liability_account_id UUID;
BEGIN
  -- Get liability portion amount
  SELECT amount, liability_account_id 
  INTO v_portion_amount, v_liability_account_id
  FROM account_liability_portions 
  WHERE account_id = p_account_id 
    AND liability_id = p_liability_id;
  
  IF v_portion_amount IS NULL THEN
    RAISE EXCEPTION 'No liability portion found for account % and liability %', p_account_id, p_liability_id;
  END IF;
  
  IF v_portion_amount < p_amount THEN
    RAISE EXCEPTION 'Insufficient liability funds: have %, need %', v_portion_amount, p_amount;
  END IF;
  
  -- Create transaction record
  INSERT INTO transactions (
    user_id, account_id, amount, currency, type, 
    description, date, category_id, metadata
  ) VALUES (
    p_user_id, p_account_id, -p_amount, p_currency, 'expense',
    COALESCE(p_description, 'Payment from liability funds'),
    p_date, p_category,
    jsonb_build_object(
      'liability_source_id', p_liability_id,
      'spent_from_liability_portion', true,
      'notes', p_notes
    )
  );
  
  -- Update account balance
  UPDATE accounts 
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE id = p_account_id;
  
  -- Update liability portion
  UPDATE account_liability_portions
  SET amount = amount - p_amount,
      updated_at = now()
  WHERE account_id = p_account_id 
    AND liability_id = p_liability_id;
  
  -- Delete portion if amount becomes zero or negative
  DELETE FROM account_liability_portions
  WHERE account_id = p_account_id 
    AND liability_id = p_liability_id
    AND amount <= 0;
    
  -- Update liability balance
  UPDATE liabilities
  SET current_balance = current_balance - p_amount,
      updated_at = now()
  WHERE id = p_liability_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create transfer transaction (atomic operation)
CREATE OR REPLACE FUNCTION create_transfer_transaction(
  p_user_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount DECIMAL(14,2),
  p_description TEXT DEFAULT NULL,
  p_date DATE DEFAULT CURRENT_DATE,
  p_currency TEXT DEFAULT 'USD'
)
RETURNS void AS $$
BEGIN
  -- Check if from account has sufficient balance
  IF (SELECT balance FROM accounts WHERE id = p_from_account_id) < p_amount THEN
    RAISE EXCEPTION 'Insufficient funds in source account';
  END IF;
  
  -- Create transfer transaction
  INSERT INTO transactions (
    user_id, from_account_id, to_account_id, amount, currency, type,
    description, date, metadata
  ) VALUES (
    p_user_id, p_from_account_id, p_to_account_id, p_amount, p_currency, 'transfer',
    COALESCE(p_description, 'Transfer between accounts'),
    p_date,
    jsonb_build_object('is_transfer', true)
  );
  
  -- Update from account balance
  UPDATE accounts 
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE id = p_from_account_id;
  
  -- Update to account balance
  UPDATE accounts 
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE id = p_to_account_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update liability principal (for adding funds)
CREATE OR REPLACE FUNCTION update_liability_principal(
  p_liability_id UUID,
  p_amount DECIMAL(14,2),
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  IF p_type = 'increase_disbursement' THEN
    -- Increase both total and current balance
    UPDATE liabilities
    SET 
      disbursed_amount = COALESCE(disbursed_amount, 0) + p_amount,
      original_amount = COALESCE(original_amount, 0) + p_amount,
      current_balance = current_balance + p_amount,
      updated_at = now()
    WHERE id = p_liability_id;
    
  ELSIF p_type = 'increase_correction' THEN
    -- Increase only total amount (correction)
    UPDATE liabilities
    SET 
      disbursed_amount = COALESCE(disbursed_amount, 0) + p_amount,
      original_amount = COALESCE(original_amount, 0) + p_amount,
      updated_at = now()
    WHERE id = p_liability_id;
    
  ELSE
    RAISE EXCEPTION 'Invalid adjustment type: %', p_type;
  END IF;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete liability with recovery options
CREATE OR REPLACE FUNCTION delete_liability_and_recover_funds(
  p_liability_id UUID,
  p_user_id UUID,
  p_target_account_id UUID
)
RETURNS void AS $$
DECLARE
  v_liability_account_id UUID;
  v_remaining_balance DECIMAL(14,2);
BEGIN
  -- Get liability account
  SELECT id INTO v_liability_account_id
  FROM accounts 
  WHERE user_id = p_user_id 
    AND type = 'liability' 
    AND is_active = true
  LIMIT 1;
  
  -- Get remaining balance in liability account
  SELECT balance INTO v_remaining_balance
  FROM accounts 
  WHERE id = v_liability_account_id;
  
  -- Transfer remaining balance to target account
  IF v_remaining_balance > 0 THEN
    -- Create transfer transaction
    INSERT INTO transactions (
      user_id, from_account_id, to_account_id, amount, currency, type,
      description, date, metadata
    ) VALUES (
      p_user_id, v_liability_account_id, p_target_account_id, v_remaining_balance, 'USD', 'transfer',
      'Liability account closure - funds recovered',
      CURRENT_DATE,
      jsonb_build_object('liability_closure', true, 'liability_id', p_liability_id)
    );
    
    -- Update account balances
    UPDATE accounts 
    SET balance = balance - v_remaining_balance,
        updated_at = now()
    WHERE id = v_liability_account_id;
    
    UPDATE accounts 
    SET balance = balance + v_remaining_balance,
        updated_at = now()
    WHERE id = p_target_account_id;
  END IF;
  
  -- Soft delete the liability
  UPDATE liabilities
  SET 
    is_deleted = true,
    deleted_at = now(),
    updated_at = now()
  WHERE id = p_liability_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete liability entirely (remove all funds)
CREATE OR REPLACE FUNCTION delete_liability_entirely(
  p_liability_id UUID,
  p_user_id UUID
)
RETURNS void AS $$
DECLARE
  v_liability_account_id UUID;
BEGIN
  -- Get liability account
  SELECT id INTO v_liability_account_id
  FROM accounts 
  WHERE user_id = p_user_id 
    AND type = 'liability' 
    AND is_active = true
  LIMIT 1;
  
  -- Remove all liability portions for this liability
  DELETE FROM account_liability_portions
  WHERE liability_id = p_liability_id;
  
  -- Soft delete the liability
  UPDATE liabilities
  SET 
    is_deleted = true,
    deleted_at = now(),
    updated_at = now()
  WHERE id = p_liability_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION begin_transaction() TO authenticated;
GRANT EXECUTE ON FUNCTION commit_transaction() TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_transaction() TO authenticated;
GRANT EXECUTE ON FUNCTION pay_from_liability_funds(UUID, UUID, UUID, DECIMAL, TEXT, TEXT, DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_transfer_transaction(UUID, UUID, UUID, DECIMAL, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_liability_principal(UUID, DECIMAL, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_liability_and_recover_funds(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_liability_entirely(UUID, UUID) TO authenticated;
