-- Migration 025: Standardize fund type naming
-- Purpose: Change 'liability' to 'borrowed' in account_funds table to match TypeScript code
-- Created: 2025-01-30

-- Update all existing 'liability' fund types to 'borrowed'
UPDATE account_funds
SET type = 'borrowed'
WHERE type = 'liability';

-- Update the check constraint to use 'borrowed' instead of 'liability'
ALTER TABLE account_funds DROP CONSTRAINT IF EXISTS account_funds_type_check;

ALTER TABLE account_funds
ADD CONSTRAINT account_funds_type_check
CHECK (type IN ('personal', 'borrowed', 'goal'));

-- Drop existing function before recreating it
DROP FUNCTION IF EXISTS spend_from_account_bucket(uuid,uuid,jsonb,numeric,text,text,date,text);

-- Update RPC functions that reference 'liability' to use 'borrowed'
-- Update spend_from_account_bucket function
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

-- Update receive_to_account_bucket function to handle 'borrowed' bucket type
-- Note: The function doesn't validate bucket_type, but we should document that 'borrowed' is now the standard
-- The function will work with 'borrowed' as passed from the application code

-- Update the comment/documentation
COMMENT ON COLUMN account_funds.type IS 'Fund type: personal (user own money), borrowed (liability/loan money), goal (saved for goals)';

