-- Fix: Remove duplicate receive_to_account_bucket function
-- There were two versions: one with p_notes parameter and one without
-- This caused PostgreSQL to be unable to choose which function to use
-- We keep the standard version without p_notes (9 parameters)

-- Drop the duplicate function with p_notes parameter (10 parameters)
DROP FUNCTION IF EXISTS receive_to_account_bucket(
  uuid,  -- p_user_id
  uuid,  -- p_account_id
  text,  -- p_bucket_type
  uuid,  -- p_bucket_id
  numeric, -- p_amount
  text,  -- p_category
  text,  -- p_description
  date,  -- p_date
  text,  -- p_notes (this is the extra parameter)
  text   -- p_currency
);

-- Verify only one version remains (should be the 9-parameter version)
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'receive_to_account_bucket'
    AND pronamespace = 'public'::regnamespace;
  
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 receive_to_account_bucket function, found %', v_count;
  END IF;
  
  RAISE NOTICE 'Successfully removed duplicate receive_to_account_bucket function. % version(s) remaining.', v_count;
END $$;

