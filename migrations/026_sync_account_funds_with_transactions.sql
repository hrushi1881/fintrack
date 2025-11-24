-- Migration 026: Sync account_funds table with transaction RPCs
-- Purpose: Ensure account_funds balances stay in sync when transactions occur
-- Created: 2025-01-30

-- Update spend_from_account_bucket to sync account_funds
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

  -- Cast category from TEXT to UUID (handle NULL)
  IF p_category IS NOT NULL AND p_category != '' THEN
    BEGIN
      v_category_id := p_category::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid category UUID: %', p_category;
    END;
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

-- Update receive_to_account_bucket to sync account_funds
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
  v_bucket_type_normalized TEXT := lower(p_bucket_type);
BEGIN
  -- Normalize bucket type
  IF v_bucket_type_normalized = 'liability' THEN
    v_bucket_type_normalized := 'borrowed';
  END IF;
  
  -- Get account currency and current balance (balance_before)
  SELECT currency, balance INTO v_account_currency, v_balance_before 
  FROM accounts 
  WHERE id = p_account_id AND user_id = p_user_id;
  
  IF v_account_currency IS NULL OR v_balance_before IS NULL THEN
    RAISE EXCEPTION 'Account not found or access denied';
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

  -- Update account balance (with user_id check for security)
  UPDATE accounts 
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE id = p_account_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update account balance - account not found or access denied';
  END IF;
  
  -- Get balance after
  SELECT balance INTO v_balance_after FROM accounts WHERE id = p_account_id AND user_id = p_user_id;

  -- Handle different bucket types
  IF v_bucket_type_normalized = 'goal' AND p_bucket_id IS NOT NULL THEN
    -- Goal fund: Update account_goal_portions
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
    
    -- Sync account_funds: Upsert goal fund
    -- For goal funds, reference_id is always the goal.id (never NULL)
    INSERT INTO account_funds (account_id, type, reference_id, balance, metadata)
    VALUES (p_account_id, 'goal', p_bucket_id, p_amount, jsonb_build_object('goal_id', p_bucket_id))
    ON CONFLICT (account_id, type, reference_id)
    DO UPDATE SET 
      balance = account_funds.balance + EXCLUDED.balance,
      updated_at = NOW();
  ELSIF v_bucket_type_normalized = 'borrowed' AND p_bucket_id IS NOT NULL THEN
    -- Borrowed/Liability fund: Update account_liability_portions
    INSERT INTO account_liability_portions (account_id, liability_id, liability_account_id, amount, notes)
    VALUES (p_account_id, p_bucket_id, p_account_id, p_amount, p_notes)
    ON CONFLICT (account_id, liability_id)
    DO UPDATE SET 
      amount = account_liability_portions.amount + EXCLUDED.amount,
      updated_at = NOW();
    
    -- Sync account_funds: Upsert borrowed fund
    -- For borrowed funds, reference_id is always the liability.id (never NULL)
    INSERT INTO account_funds (account_id, type, reference_id, balance, metadata)
    VALUES (p_account_id, 'borrowed', p_bucket_id, p_amount, jsonb_build_object('liability_id', p_bucket_id))
    ON CONFLICT (account_id, type, reference_id)
    DO UPDATE SET 
      balance = account_funds.balance + EXCLUDED.balance,
      updated_at = NOW();
  END IF;
  -- Note: Personal funds are calculated (account balance - liability - goal), not stored

  -- Create income transaction with balance snapshots
  INSERT INTO transactions (
    user_id, account_id, amount, currency, type, 
    description, date, category_id, metadata,
    balance_before, balance_after
  ) VALUES (
    p_user_id, p_account_id, p_amount, COALESCE(v_account_currency, p_currency), 'income',
    p_description, p_date, v_category_id,
    jsonb_build_object(
      'bucket_type', v_bucket_type_normalized,
      'bucket_id', p_bucket_id,
      'notes', p_notes
    ),
    v_balance_before, v_balance_after
  );

END;
$function$;

-- Update draw_liability_funds to sync account_funds
CREATE OR REPLACE FUNCTION draw_liability_funds(
  p_user_id uuid,
  p_liability_id uuid,
  p_distributions jsonb,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text,
  p_category_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_total_drawn DECIMAL(14,2) := 0;
  v_original_amount DECIMAL(14,2);
  v_disbursed_amount DECIMAL(14,2);
  v_available DECIMAL(14,2);
  v_item JSONB;
  v_account_id UUID;
  v_amount DECIMAL(14,2);
  v_balance_before DECIMAL(14,2);
  v_balance_after DECIMAL(14,2);
  v_currency TEXT;
BEGIN
  SELECT COALESCE(original_amount,0), COALESCE(disbursed_amount,0)
    INTO v_original_amount, v_disbursed_amount
  FROM liabilities
  WHERE id = p_liability_id AND user_id = p_user_id;

  IF v_original_amount IS NULL THEN
    RAISE EXCEPTION 'Liability not found';
  END IF;

  v_available := GREATEST(v_original_amount - v_disbursed_amount, 0);

  -- Sum requested draw
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_distributions)
  LOOP
    v_total_drawn := v_total_drawn + ((v_item->>'amount')::DECIMAL);
  END LOOP;

  -- If over available, increase totals accordingly
  IF v_total_drawn > v_available THEN
    UPDATE liabilities
      SET original_amount = COALESCE(original_amount,0) + (v_total_drawn - v_available),
          current_balance = COALESCE(current_balance,0) + (v_total_drawn - v_available),
          updated_at = NOW()
      WHERE id = p_liability_id;

    INSERT INTO liability_activity_log (liability_id, user_id, activity_type, amount, notes, metadata)
    VALUES (p_liability_id, p_user_id, 'limit_increase', v_total_drawn - v_available, p_notes, jsonb_build_object('reason','draw_exceeds_available'));
  END IF;

  -- Credit accounts and upsert portions
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_distributions)
  LOOP
    v_account_id := (v_item->>'account_id')::UUID;
    v_amount := (v_item->>'amount')::DECIMAL;
    IF v_amount <= 0 THEN CONTINUE; END IF;

    -- Get current balance and currency (balance_before) - with user_id check
    SELECT balance, currency INTO v_balance_before, v_currency
    FROM accounts
    WHERE id = v_account_id AND user_id = p_user_id;
    
    IF v_balance_before IS NULL THEN
      RAISE EXCEPTION 'Account not found or access denied: %', v_account_id;
    END IF;

    v_balance_after := v_balance_before + v_amount;

    -- Update account balance using direct SET for accuracy
    UPDATE accounts 
    SET balance = v_balance_after, 
        updated_at = NOW() 
    WHERE id = v_account_id AND user_id = p_user_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update account balance for account %', v_account_id;
    END IF;
    
    -- Verify balance was updated correctly
    DECLARE
      v_verified_balance DECIMAL(14,2);
    BEGIN
      SELECT balance INTO v_verified_balance 
      FROM accounts 
      WHERE id = v_account_id AND user_id = p_user_id;
      
      IF ABS(v_verified_balance - v_balance_after) > 0.01 THEN
        RAISE EXCEPTION 'Balance update verification failed for account %: expected %, got %', 
          v_account_id, v_balance_after, v_verified_balance;
      END IF;
    END;

    -- upsert into account_liability_portions
    INSERT INTO account_liability_portions(account_id, liability_id, liability_account_id, amount)
    VALUES (v_account_id, p_liability_id, v_account_id, v_amount)
    ON CONFLICT (account_id, liability_id)
    DO UPDATE SET amount = account_liability_portions.amount + EXCLUDED.amount, updated_at = NOW();

    -- Sync account_funds: Upsert borrowed fund
    INSERT INTO account_funds (account_id, type, reference_id, balance, metadata)
    VALUES (v_account_id, 'borrowed', p_liability_id, v_amount, jsonb_build_object('liability_id', p_liability_id))
    ON CONFLICT (account_id, type, COALESCE(reference_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET 
      balance = account_funds.balance + EXCLUDED.balance,
      updated_at = NOW();

    -- Insert transaction as income with balance snapshots
    INSERT INTO transactions(user_id, account_id, amount, currency, type, description, date, category_id, metadata, balance_before, balance_after)
    VALUES (
      p_user_id, v_account_id, v_amount, v_currency, 'income', 
      COALESCE(p_notes,'Liability Draw'), p_date, p_category_id,
      jsonb_build_object('liability_id', p_liability_id, 'bucket','liability_draw'),
      v_balance_before, v_balance_after
    );
  END LOOP;

  -- Update disbursed amount (+ total draw)
  UPDATE liabilities
    SET disbursed_amount = COALESCE(disbursed_amount,0) + v_total_drawn,
        updated_at = NOW()
    WHERE id = p_liability_id;

  -- Log draw
  INSERT INTO liability_activity_log (liability_id, user_id, activity_type, amount, notes)
  VALUES (p_liability_id, p_user_id, 'draw', v_total_drawn, p_notes);
END;
$function$;

-- Update settle_liability_portion to sync account_funds
CREATE OR REPLACE FUNCTION settle_liability_portion(
  p_user_id uuid,
  p_account_id uuid,
  p_liability_id uuid,
  p_amount numeric,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_portion_amount DECIMAL(14,2);
  v_balance_before DECIMAL(14,2);
  v_balance_after DECIMAL(14,2);
  v_currency TEXT;
BEGIN
  -- Get liability portion amount
  SELECT amount INTO v_portion_amount
  FROM account_liability_portions 
  WHERE account_id = p_account_id 
    AND liability_id = p_liability_id;
  
  IF v_portion_amount IS NULL THEN
    RAISE EXCEPTION 'No liability portion found for account % and liability %', p_account_id, p_liability_id;
  END IF;
  
  IF v_portion_amount < p_amount THEN
    RAISE EXCEPTION 'Insufficient liability funds: have %, need %', v_portion_amount, p_amount;
  END IF;

  -- Get current balance and currency (balance_before)
  SELECT balance, currency INTO v_balance_before, v_currency
  FROM accounts
  WHERE id = p_account_id AND user_id = p_user_id;
  
  IF v_balance_before IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;

  v_balance_after := v_balance_before - p_amount;

  -- Deduct from account balance using direct SET for accuracy
  UPDATE accounts 
  SET balance = v_balance_after,
      updated_at = now()
  WHERE id = p_account_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update account balance - account not found or access denied';
  END IF;
  
  -- Verify balance was updated correctly
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
  
  -- Sync account_funds: Update borrowed fund balance
  UPDATE account_funds
  SET balance = GREATEST(balance - p_amount, 0),
      updated_at = NOW()
  WHERE account_id = p_account_id
    AND type = 'borrowed'
    AND reference_id = p_liability_id;
  
  -- Delete fund if balance becomes 0
  DELETE FROM account_funds
  WHERE account_id = p_account_id
    AND type = 'borrowed'
    AND reference_id = p_liability_id
    AND balance <= 0;
    
  -- Update liability balance
  UPDATE liabilities
  SET current_balance = current_balance - p_amount,
      updated_at = now()
  WHERE id = p_liability_id;
  
  -- Create transaction record with balance snapshots
  INSERT INTO transactions (
    user_id, account_id, amount, currency, type, 
    description, date, metadata,
    balance_before, balance_after
  ) VALUES (
    p_user_id, p_account_id, -p_amount, v_currency, 'expense',
    COALESCE(p_notes, 'Payment from liability funds'),
    p_date,
    jsonb_build_object(
      'liability_source_id', p_liability_id,
      'spent_from_liability_portion', true,
      'notes', p_notes
    ),
    v_balance_before, v_balance_after
  );
END;
$function$;
