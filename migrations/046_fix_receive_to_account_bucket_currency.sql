-- Fix: Remove currency column from account_funds INSERT statements
-- The account_funds table doesn't have a currency column - currency should be stored in metadata

CREATE OR REPLACE FUNCTION receive_to_account_bucket(
  p_user_id uuid,
  p_account_id uuid,
  p_bucket_type text,
  p_bucket_id uuid,
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
  v_bucket_type_normalized TEXT := lower(p_bucket_type);
  v_category_id UUID := NULL;
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
    -- Store currency in metadata JSONB, not as a column
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
    -- Upsert goal fund in account_funds
    -- Store currency in metadata JSONB, not as a column
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
    )
  );
END;
$function$;

