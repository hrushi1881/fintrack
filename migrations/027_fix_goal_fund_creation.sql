-- Migration 027: Fix goal fund creation in receive_to_account_bucket RPC
-- Purpose: Ensure goal funds are properly created/updated in account_funds table
-- Created: 2025-01-30

-- The issue was that ON CONFLICT clause couldn't match the unique index properly
-- Since goal and borrowed funds always have a non-NULL reference_id, we can use direct column matching

-- Update receive_to_account_bucket function to fix category handling and goal fund creation
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
    -- Use direct column matching since reference_id is never NULL for goal funds
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
    p_user_id, p_account_id, p_amount, p_currency, 'income',
    p_description, p_date, v_category_id,
    jsonb_build_object('bucket_type', v_bucket_type_normalized, 'bucket_id', p_bucket_id),
    v_balance_before, v_balance_after
  );
END;
$function$;

