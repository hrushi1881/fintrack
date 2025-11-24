-- Migration 032: Allow spending from goal funds for withdrawals
-- Purpose: Enable withdrawFromGoal to work by allowing spend_from_account_bucket to handle goal funds
-- Created: 2025-01-30

-- Update spend_from_account_bucket to allow spending from goal funds (for withdrawals)
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
BEGIN
  -- Map 'liability' to 'borrowed' for backward compatibility
  IF v_type = 'liability' THEN
    v_type := 'borrowed';
  END IF;
  
  IF v_type NOT IN ('personal','borrowed','goal') THEN
    RAISE EXCEPTION 'Invalid bucket type';
  END IF;
  IF v_type IN ('borrowed','goal') THEN
    v_id := (p_bucket->>'id')::UUID;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Missing bucket id'; END IF;
  END IF;

  -- Handle category: p_category can be either UUID or name
  -- Try UUID first, then fall back to name lookup
  IF p_category IS NOT NULL AND p_category != '' THEN
    BEGIN
      -- Try to cast as UUID first
      v_category_id := p_category::UUID;
    EXCEPTION WHEN OTHERS THEN
      -- If not a UUID, try to find by name
      SELECT id INTO v_category_id
      FROM categories
      WHERE user_id = p_user_id 
        AND name = p_category 
        AND is_deleted = false
      LIMIT 1;
      
      IF v_category_id IS NULL THEN
        v_category_id := NULL;
      END IF;
    END;
  ELSE
    v_category_id := NULL;
  END IF;

  -- Get current balance (this is balance_before) - with user_id check
  SELECT balance INTO v_balance FROM accounts WHERE id = p_account_id AND user_id = p_user_id;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Account not found or access denied'; END IF;
  v_balance_before := v_balance;

  -- Sum liability portions for account
  SELECT COALESCE(SUM((amount)::DECIMAL),0) INTO v_total_liability
  FROM account_liability_portions
  WHERE account_id = p_account_id;

  -- Sum goal portions for account
  SELECT COALESCE(SUM((amount)::DECIMAL),0) INTO v_total_goal
  FROM account_goal_portions
  WHERE account_id = p_account_id;

  v_personal_available := GREATEST(v_balance - v_total_liability - v_total_goal, 0);

  IF v_type = 'personal' THEN
    IF p_amount > v_personal_available THEN
      RAISE EXCEPTION 'Insufficient personal funds (available %)', v_personal_available;
    END IF;
    -- Personal fund is calculated, not stored - no account_funds update needed
  ELSIF v_type = 'borrowed' THEN
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
    DELETE FROM account_liability_portions
    WHERE account_id = p_account_id AND liability_id = v_id AND amount <= 0;
    
    -- Sync account_funds: Update borrowed fund balance
    UPDATE account_funds
    SET balance = GREATEST(balance - p_amount, 0),
        updated_at = NOW()
    WHERE account_id = p_account_id
      AND type = 'borrowed'
      AND reference_id = v_id;
    
    -- Delete fund if balance becomes 0
    DELETE FROM account_funds
    WHERE account_id = p_account_id
      AND type = 'borrowed'
      AND reference_id = v_id
      AND balance <= 0;
  ELSIF v_type = 'goal' THEN
    -- Goal funds CAN be spent for withdrawals (moving to personal funds)
    -- Check if goal fund exists and has sufficient balance
    IF NOT EXISTS (
      SELECT 1 FROM account_goal_portions
      WHERE account_id = p_account_id AND goal_id = v_id AND amount >= p_amount
    ) THEN
      RAISE EXCEPTION 'Insufficient goal funds in selected bucket';
    END IF;
    -- Deduct goal portion
    UPDATE account_goal_portions
    SET amount = amount - p_amount,
        updated_at = NOW()
    WHERE account_id = p_account_id AND goal_id = v_id;
    DELETE FROM account_goal_portions
    WHERE account_id = p_account_id AND goal_id = v_id AND amount <= 0;
    
    -- Sync account_funds: Update goal fund balance
    UPDATE account_funds
    SET balance = GREATEST(balance - p_amount, 0),
        updated_at = NOW()
    WHERE account_id = p_account_id
      AND type = 'goal'
      AND reference_id = v_id;
    
    -- Delete fund if balance becomes 0
    DELETE FROM account_funds
    WHERE account_id = p_account_id
      AND type = 'goal'
      AND reference_id = v_id
      AND balance <= 0;
  END IF;

  -- Decrement account balance (with user_id check for security)
  UPDATE accounts 
  SET balance = balance - p_amount, 
      updated_at = NOW() 
  WHERE id = p_account_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update account balance - account not found or access denied';
  END IF;
  
  -- Get balance after (should be balance_before - p_amount)
  SELECT balance INTO v_balance_after FROM accounts WHERE id = p_account_id AND user_id = p_user_id;
  
  IF v_balance_after IS NULL THEN
    RAISE EXCEPTION 'Failed to retrieve updated account balance';
  END IF;
  
  -- Insert expense transaction with balance snapshots
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
END;
$function$;

