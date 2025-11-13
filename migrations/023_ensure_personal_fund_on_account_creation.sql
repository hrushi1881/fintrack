-- Migration 023: Ensure personal fund is created when account is created
-- Purpose: Automatically create personal fund for new accounts
-- Created: 2025-01-30

-- Function to ensure personal fund exists for an account
CREATE OR REPLACE FUNCTION ensure_personal_fund(p_account_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert personal fund if it doesn't exist
  INSERT INTO account_funds (account_id, type, balance, reference_id)
  SELECT 
    p_account_id,
    'personal',
    COALESCE((SELECT balance FROM accounts WHERE id = p_account_id), 0),
    NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM account_funds
    WHERE account_id = p_account_id
      AND type = 'personal'
      AND reference_id IS NULL
  );
END;
$$;

-- Trigger function to create personal fund when account is created
CREATE OR REPLACE FUNCTION trigger_create_personal_fund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create personal fund for new account
  PERFORM ensure_personal_fund(NEW.id);
  RETURN NEW;
END;
$$;

-- Create trigger on accounts table
DROP TRIGGER IF EXISTS trg_create_personal_fund ON accounts;
CREATE TRIGGER trg_create_personal_fund
  AFTER INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_personal_fund();

-- Ensure personal funds exist for all existing accounts that don't have one
INSERT INTO account_funds (account_id, type, balance, reference_id)
SELECT 
  a.id,
  'personal',
  COALESCE(a.balance, 0),
  NULL
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM account_funds f
  WHERE f.account_id = a.id
    AND f.type = 'personal'
    AND f.reference_id IS NULL
);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION ensure_personal_fund(UUID) TO authenticated;

