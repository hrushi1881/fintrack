-- Migration 017: Fix balance calculation and add diagnostic tools
-- Created: 2025-01-29
-- Purpose: Ensure account balances are correctly calculated from transactions and fix any drift

-- Function to recalculate account balance from transactions
-- Uses the most recent transaction's balance_after if available (most accurate)
-- Otherwise calculates from transaction history
CREATE OR REPLACE FUNCTION recalculate_account_balance(p_account_id UUID, p_user_id UUID)
RETURNS DECIMAL(14,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_initial_balance DECIMAL(14,2) := 0;
  v_calculated_balance DECIMAL(14,2);
  v_current_balance DECIMAL(14,2);
  v_transaction_sum DECIMAL(14,2) := 0;
  v_latest_balance_after DECIMAL(14,2);
BEGIN
  -- Get current balance from accounts table
  SELECT balance INTO v_current_balance
  FROM accounts
  WHERE id = p_account_id AND user_id = p_user_id;
  
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Account not found or access denied';
  END IF;
  
  -- Try to use the most recent transaction's balance_after (most accurate)
  SELECT balance_after INTO v_latest_balance_after
  FROM transactions
  WHERE account_id = p_account_id 
    AND user_id = p_user_id
    AND balance_after IS NOT NULL
  ORDER BY date DESC, created_at DESC
  LIMIT 1;
  
  -- If we have a balance_after from the latest transaction, use it
  IF v_latest_balance_after IS NOT NULL THEN
    v_calculated_balance := v_latest_balance_after;
  ELSE
    -- Fallback: Calculate balance from transaction history
    -- Income transactions have positive amounts, expense transactions have negative amounts
    -- Transfer transactions: negative for from_account, positive for to_account
    SELECT COALESCE(SUM(
      CASE 
        WHEN type = 'income' THEN amount
        WHEN type = 'expense' THEN amount  -- Already negative
        WHEN type = 'transfer' AND account_id = p_account_id THEN amount  -- Can be positive or negative
        ELSE 0
      END
    ), 0) INTO v_transaction_sum
    FROM transactions
    WHERE account_id = p_account_id AND user_id = p_user_id;
    
    -- Calculate initial balance (what the balance was before any transactions)
    -- If there are no transactions, initial balance = current balance
    v_initial_balance := v_current_balance - v_transaction_sum;
    
    -- Recalculate current balance
    v_calculated_balance := v_initial_balance + v_transaction_sum;
  END IF;
  
  -- Update account balance if it differs significantly
  IF ABS(v_calculated_balance - v_current_balance) > 0.01 THEN
    UPDATE accounts
    SET balance = v_calculated_balance,
        updated_at = NOW()
    WHERE id = p_account_id AND user_id = p_user_id;
    
    RAISE NOTICE 'Balance corrected for account %: was %, now %', p_account_id, v_current_balance, v_calculated_balance;
  END IF;
  
  RETURN v_calculated_balance;
END;
$$;

-- Function to recalculate all account balances for a user
CREATE OR REPLACE FUNCTION recalculate_all_account_balances(p_user_id UUID)
RETURNS TABLE(account_id UUID, account_name TEXT, old_balance DECIMAL(14,2), new_balance DECIMAL(14,2))
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account RECORD;
  v_calculated_balance DECIMAL(14,2);
BEGIN
  FOR v_account IN 
    SELECT id, name, balance
    FROM accounts
    WHERE user_id = p_user_id AND is_active = true
  LOOP
    BEGIN
      v_calculated_balance := recalculate_account_balance(v_account.id, p_user_id);
      
      IF ABS(v_calculated_balance - v_account.balance) > 0.01 THEN
        account_id := v_account.id;
        account_name := v_account.name;
        old_balance := v_account.balance;
        new_balance := v_calculated_balance;
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error recalculating balance for account %: %', v_account.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- Improved version of spend_from_account_bucket with better error handling
CREATE OR REPLACE FUNCTION spend_from_account_bucket(
  p_user_id uuid,
  p_account_id uuid,
  p_bucket jsonb,
  p_amount numeric,
  p_category text,
  p_description text,
  p_date date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT 'USD'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_balance DECIMAL(14,2);
  v_balance_before DECIMAL(14,2);
  v_balance_after DECIMAL(14,2);
  v_total_liability DECIMAL(14,2) := 0;
  v_total_goal DECIMAL(14,2) := 0;
  v_personal_available DECIMAL(14,2);
  v_type TEXT := lower(p_bucket->>'type');
  v_id UUID := NULL;
  v_category_id UUID := NULL;
  v_rows_updated INTEGER;
BEGIN
  -- Validate inputs
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be positive';
  END IF;
  
  IF v_type NOT IN ('personal','liability','goal') THEN
    RAISE EXCEPTION 'Invalid bucket type: %', v_type;
  END IF;
  
  IF v_type IN ('liability','goal') THEN
    v_id := (p_bucket->>'id')::UUID;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Missing bucket id'; END IF;
  END IF;

  -- Cast category from TEXT to UUID (handle NULL)
  IF p_category IS NOT NULL AND p_category != '' THEN
    BEGIN
      v_category_id := p_category::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid category UUID: %', p_category;
    END;
  END IF;

  -- Get current balance (this is balance_before) - with user_id check
  SELECT balance INTO v_balance_before 
  FROM accounts 
  WHERE id = p_account_id AND user_id = p_user_id;
  
  IF v_balance_before IS NULL THEN 
    RAISE EXCEPTION 'Account not found or access denied for account %', p_account_id;
  END IF;
  
  -- Calculate balance_after immediately (this is what it should be)
  v_balance_after := v_balance_before - p_amount;

  -- Sum liability portions for account
  SELECT COALESCE(SUM((amount)::DECIMAL),0) INTO v_total_liability
  FROM account_liability_portions
  WHERE account_id = p_account_id;

  -- Sum goal portions for account
  SELECT COALESCE(SUM((amount)::DECIMAL),0) INTO v_total_goal
  FROM account_goal_portions
  WHERE account_id = p_account_id;

  v_personal_available := GREATEST(v_balance_before - v_total_liability - v_total_goal, 0);

  -- Validate sufficient funds based on bucket type
  IF v_type = 'personal' THEN
    IF p_amount > v_personal_available THEN
      RAISE EXCEPTION 'Insufficient personal funds (available %)', v_personal_available;
    END IF;
  ELSIF v_type = 'liability' THEN
    -- Ensure sufficient specific liability portion
    IF NOT EXISTS (
      SELECT 1 FROM account_liability_portions
      WHERE account_id = p_account_id AND liability_id = v_id AND amount >= p_amount
    ) THEN
      RAISE EXCEPTION 'Insufficient liability funds in selected bucket';
    END IF;
    -- Deduct portion
    UPDATE account_liability_portions
    SET amount = amount - p_amount,
        updated_at = NOW()
    WHERE account_id = p_account_id AND liability_id = v_id;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
      RAISE EXCEPTION 'Failed to update liability portion';
    END IF;
    
    DELETE FROM account_liability_portions
    WHERE account_id = p_account_id AND liability_id = v_id AND amount <= 0;
  ELSE
    -- goal
    IF NOT EXISTS (
      SELECT 1 FROM account_goal_portions
      WHERE account_id = p_account_id AND goal_id = v_id AND amount >= p_amount
    ) THEN
      RAISE EXCEPTION 'Insufficient goal funds in selected bucket';
    END IF;
    UPDATE account_goal_portions
    SET amount = amount - p_amount,
        updated_at = NOW()
    WHERE account_id = p_account_id AND goal_id = v_id;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
      RAISE EXCEPTION 'Failed to update goal portion';
    END IF;
    
    DELETE FROM account_goal_portions
    WHERE account_id = p_account_id AND goal_id = v_id AND amount <= 0;
  END IF;

  -- Update account balance FIRST (with user_id check for security)
  -- Use the calculated balance_after directly to ensure accuracy
  UPDATE accounts 
  SET balance = v_balance_after, 
      updated_at = NOW() 
  WHERE id = p_account_id AND user_id = p_user_id;
  
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Failed to update account balance - account not found or access denied';
  END IF;
  
  -- Verify the balance was updated correctly
  DECLARE
    v_verified_balance DECIMAL(14,2);
  BEGIN
    SELECT balance INTO v_verified_balance 
    FROM accounts 
    WHERE id = p_account_id AND user_id = p_user_id;
    
    IF ABS(v_verified_balance - v_balance_after) > 0.01 THEN
      RAISE EXCEPTION 'Balance update verification failed: expected %, got %', 
        v_balance_after, v_verified_balance;
    END IF;
  END;
  
  -- Insert expense transaction with balance snapshots (use calculated values)
  INSERT INTO transactions (
    user_id, account_id, amount, currency, type,
    description, date, category_id, metadata,
    balance_before, balance_after
  ) VALUES (
    p_user_id, p_account_id, -p_amount, p_currency, 'expense',
    p_description, p_date, v_category_id,
    jsonb_build_object('bucket_type', v_type, 'bucket_id', v_id),
    v_balance_before, v_balance_after
  );
  
  -- Verify transaction was inserted
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to insert transaction record';
  END IF;
END;
$function$;

-- Improved version of receive_to_account_bucket with better error handling
CREATE OR REPLACE FUNCTION receive_to_account_bucket(
  p_user_id uuid,
  p_account_id uuid,
  p_bucket_type text,
  p_bucket_id uuid,
  p_amount numeric,
  p_category text,
  p_description text,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text,
  p_currency text DEFAULT 'INR'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_category_id uuid;
  v_account_currency text;
  v_balance_before DECIMAL(14,2);
  v_balance_after DECIMAL(14,2);
  v_rows_updated INTEGER;
BEGIN
  -- Validate inputs
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be positive';
  END IF;
  
  -- Get account currency and current balance (balance_before)
  SELECT currency, balance INTO v_account_currency, v_balance_before 
  FROM accounts 
  WHERE id = p_account_id AND user_id = p_user_id;
  
  IF v_account_currency IS NULL OR v_balance_before IS NULL THEN
    RAISE EXCEPTION 'Account not found or access denied for account %', p_account_id;
  END IF;
  
  -- Calculate balance_after immediately (this is what it should be)
  v_balance_after := v_balance_before + p_amount;
  
  -- Find or create category
  IF p_category IS NOT NULL AND p_category != '' THEN
    SELECT id INTO v_category_id
    FROM categories
    WHERE user_id = p_user_id 
      AND (name = p_category OR id::text = p_category)
      AND is_deleted = false
    LIMIT 1;
    
    -- If not found by name, try as UUID
    IF v_category_id IS NULL THEN
      BEGIN
        v_category_id := p_category::UUID;
      EXCEPTION WHEN OTHERS THEN
        v_category_id := NULL;
      END;
    END IF;
  END IF;

  -- Update account balance FIRST (with user_id check for security)
  -- Use the calculated balance_after directly to ensure accuracy
  UPDATE accounts 
  SET balance = v_balance_after,
      updated_at = NOW()
  WHERE id = p_account_id AND user_id = p_user_id;
  
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Failed to update account balance - account not found or access denied';
  END IF;
  
  -- Verify the balance was updated correctly
  DECLARE
    v_verified_balance DECIMAL(14,2);
  BEGIN
    SELECT balance INTO v_verified_balance 
    FROM accounts 
    WHERE id = p_account_id AND user_id = p_user_id;
    
    IF ABS(v_verified_balance - v_balance_after) > 0.01 THEN
      RAISE EXCEPTION 'Balance update verification failed: expected %, got %', 
        v_balance_after, v_verified_balance;
    END IF;
  END;

  -- If bucket_type is 'goal', add/update account_goal_portions
  IF p_bucket_type = 'goal' AND p_bucket_id IS NOT NULL THEN
    INSERT INTO account_goal_portions (account_id, goal_id, amount, notes)
    VALUES (p_account_id, p_bucket_id, p_amount, p_notes)
    ON CONFLICT (account_id, goal_id)
    DO UPDATE SET 
      amount = account_goal_portions.amount + EXCLUDED.amount,
      updated_at = NOW();
      
    -- Update goal current_amount
    UPDATE goals
    SET current_amount = current_amount + p_amount,
        updated_at = NOW()
    WHERE id = p_bucket_id;
  END IF;

  -- Create income transaction with balance snapshots (use calculated values)
  INSERT INTO transactions (
    user_id, account_id, amount, currency, type, 
    description, date, category_id, metadata,
    balance_before, balance_after
  ) VALUES (
    p_user_id, p_account_id, p_amount, COALESCE(v_account_currency, p_currency), 'income',
    p_description, p_date, v_category_id,
    jsonb_build_object(
      'bucket_type', p_bucket_type,
      'bucket_id', p_bucket_id,
      'notes', p_notes
    ),
    v_balance_before, v_balance_after
  );
  
  -- Verify transaction was inserted
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to insert transaction record';
  END IF;
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION recalculate_account_balance(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_all_account_balances(UUID) TO authenticated;

