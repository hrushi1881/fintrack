-- Migration 043: Add metadata support to bucket RPCs
-- Purpose: Align RPC signatures with app calls that send p_metadata
-- Created: 2025-02-03

-- spend_from_account_bucket: add optional p_metadata and store it on the transaction
CREATE OR REPLACE FUNCTION spend_from_account_bucket(
  p_user_id uuid,
  p_account_id uuid,
  p_bucket jsonb,
  p_amount numeric,
  p_category text,
  p_description text,
  p_date date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT 'USD'::text,
  p_metadata jsonb DEFAULT NULL::jsonb
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
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
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

  -- Sum liability funds for account (using account_funds instead of account_liability_portions)
  SELECT COALESCE(SUM((balance)::DECIMAL),0) INTO v_total_liability
  FROM account_funds
  WHERE account_id = p_account_id 
    AND type = 'borrowed';

  -- Sum goal funds for account (already using account_funds)
  SELECT COALESCE(SUM((balance)::DECIMAL),0) INTO v_total_goal
  FROM account_funds
  WHERE account_id = p_account_id AND type = 'goal';

  v_personal_available := GREATEST(v_balance - v_total_liability - v_total_goal, 0);

  IF v_type = 'personal' THEN
    IF p_amount > v_personal_available THEN
      RAISE EXCEPTION 'Insufficient personal funds (available %)', v_personal_available;
    END IF;
    -- Personal fund is calculated, not stored - no account_funds update needed
  ELSIF v_type = 'borrowed' THEN
    -- Ensure sufficient specific liability fund exists
    IF NOT EXISTS (
      SELECT 1 FROM account_funds
      WHERE account_id = p_account_id 
        AND type = 'borrowed'
        AND reference_id = v_id 
        AND balance >= p_amount
    ) THEN
      RAISE EXCEPTION 'Insufficient liability funds in selected bucket';
    END IF;
    
    -- Deduct from account_funds (borrowed type)
    UPDATE account_funds
    SET balance = balance - p_amount,
        updated_at = NOW()
    WHERE account_id = p_account_id
      AND type = 'borrowed'
      AND reference_id = v_id;
      
    -- If balance reaches zero or below, delete the fund entry
    DELETE FROM account_funds
    WHERE account_id = p_account_id
      AND type = 'borrowed'
      AND reference_id = v_id
      AND balance <= 0;
      
  ELSIF v_type = 'goal' THEN
    -- Goal funds handled the same way as borrowed (already updated in migration 034)
    -- Ensure sufficient specific goal fund exists
    IF NOT EXISTS (
      SELECT 1 FROM account_funds
      WHERE account_id = p_account_id 
        AND type = 'goal'
        AND reference_id = v_id 
        AND balance >= p_amount
    ) THEN
      RAISE EXCEPTION 'Insufficient goal funds in selected bucket';
    END IF;
    
    -- Deduct from account_funds (goal type)
    UPDATE account_funds
    SET balance = balance - p_amount,
        updated_at = NOW()
    WHERE account_id = p_account_id
      AND type = 'goal'
      AND reference_id = v_id;
      
    -- If balance reaches zero or below, delete the fund entry
    DELETE FROM account_funds
    WHERE account_id = p_account_id
      AND type = 'goal'
      AND reference_id = v_id
      AND balance <= 0;
  END IF;

  -- Update account balance
  v_balance_after := v_balance_before - p_amount;
  UPDATE accounts 
  SET balance = v_balance_after,
      updated_at = NOW()
  WHERE id = p_account_id;

  -- Create transaction
  INSERT INTO transactions (
    user_id,
    account_id,
    category_id,
    amount,
    currency,
    type,
    description,
    date,
    balance_before,
    balance_after,
    metadata
  ) VALUES (
    p_user_id,
    p_account_id,
    v_category_id,
    -p_amount,  -- Negative for expense
    p_currency,
    'expense',
    p_description,
    p_date,
    v_balance_before,
    v_balance_after,
    jsonb_build_object(
      'bucket_type', v_type,
      'bucket_id', v_id
    ) || v_meta
  );
END;
$function$;

-- receive_to_account_bucket: add optional p_metadata and store it on the transaction
CREATE OR REPLACE FUNCTION receive_to_account_bucket(
  p_user_id uuid,
  p_account_id uuid,
  p_bucket_type text,
  p_bucket_id uuid,
  p_amount numeric,
  p_category text,
  p_description text,
  p_date date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT 'USD'::text,
  p_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_balance DECIMAL(14,2);
  v_balance_before DECIMAL(14,2);
  v_balance_after DECIMAL(14,2);
  v_bucket_type_normalized TEXT := lower(p_bucket_type);
  v_category_id UUID := NULL;
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  -- Map 'liability' to 'borrowed' for backward compatibility
  IF v_bucket_type_normalized = 'liability' THEN
    v_bucket_type_normalized := 'borrowed';
  END IF;

  IF v_bucket_type_normalized NOT IN ('personal','borrowed','goal') THEN
    RAISE EXCEPTION 'Invalid bucket type: %', p_bucket_type;
  END IF;

  IF v_bucket_type_normalized IN ('borrowed','goal') AND p_bucket_id IS NULL THEN
    RAISE EXCEPTION 'Bucket ID required for borrowed or goal funds';
  END IF;

  -- Handle category: p_category can be either UUID or name
  IF p_category IS NOT NULL AND p_category != '' THEN
    BEGIN
      v_category_id := p_category::UUID;
    EXCEPTION WHEN OTHERS THEN
      SELECT id INTO v_category_id
      FROM categories
      WHERE user_id = p_user_id 
        AND name = p_category 
        AND is_deleted = false
      LIMIT 1;
    END;
  END IF;

  -- Get current balance
  SELECT balance INTO v_balance FROM accounts WHERE id = p_account_id AND user_id = p_user_id;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Account not found or access denied'; END IF;
  v_balance_before := v_balance;

  -- Update account balance
  v_balance_after := v_balance_before + p_amount;
  UPDATE accounts 
  SET balance = v_balance_after,
      updated_at = NOW()
  WHERE id = p_account_id;

  -- Handle bucket-specific updates
  IF v_bucket_type_normalized = 'personal' THEN
    -- Personal funds are calculated, not stored - no action needed
    NULL;
  ELSIF v_bucket_type_normalized = 'borrowed' AND p_bucket_id IS NOT NULL THEN
    -- Upsert borrowed fund in account_funds
    INSERT INTO account_funds (
      account_id,
      type,
      reference_id,
      balance,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      p_account_id,
      'borrowed',
      p_bucket_id,
      p_amount,
      jsonb_build_object(
        'notes', p_description,
        'currency', p_currency
      ),
      NOW(),
      NOW()
    )
    ON CONFLICT (account_id, type, reference_id) WHERE reference_id IS NOT NULL
    DO UPDATE SET
      balance = account_funds.balance + p_amount,
      metadata = COALESCE(account_funds.metadata, '{}'::jsonb) || jsonb_build_object('currency', p_currency),
      updated_at = NOW();
      
  ELSIF v_bucket_type_normalized = 'goal' AND p_bucket_id IS NOT NULL THEN
    -- Upsert goal fund in account_funds (already handled in migration 034)
    INSERT INTO account_funds (
      account_id,
      type,
      reference_id,
      balance,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      p_account_id,
      'goal',
      p_bucket_id,
      p_amount,
      jsonb_build_object(
        'notes', p_description,
        'currency', p_currency
      ),
      NOW(),
      NOW()
    )
    ON CONFLICT (account_id, type, reference_id) WHERE reference_id IS NOT NULL
    DO UPDATE SET
      balance = account_funds.balance + p_amount,
      metadata = COALESCE(account_funds.metadata, '{}'::jsonb) || jsonb_build_object('currency', p_currency),
      updated_at = NOW();
  END IF;

  -- Create transaction
  INSERT INTO transactions (
    user_id,
    account_id,
    category_id,
    amount,
    currency,
    type,
    description,
    date,
    balance_before,
    balance_after,
    metadata
  ) VALUES (
    p_user_id,
    p_account_id,
    v_category_id,
    p_amount,  -- Positive for income
    p_currency,
    'income',
    p_description,
    p_date,
    v_balance_before,
    v_balance_after,
    jsonb_build_object(
      'bucket_type', v_bucket_type_normalized,
      'bucket_id', p_bucket_id
    ) || v_meta
  );
END;
$function$;

-- Note: No data migrations required; functions are updated in place.




