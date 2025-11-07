-- Apply all liability system migrations in correct order
-- Run this script to set up the complete liability management system

-- 1. First, ensure we have the basic account_liability_portions table
\i 012_create_account_liability_portions.sql

-- 2. Apply the main liabilities system
\i 011_create_liabilities_system.sql

-- 3. Add balance management RPCs
\i 013_add_balance_rpcs.sql

-- 4. Add transaction management RPCs
\i 014_add_transaction_rpcs.sql

-- Verify all tables exist
SELECT 
  table_name,
  CASE 
    WHEN table_name IN ('liabilities', 'liability_payments', 'liability_schedules', 'liability_adjustments', 'liability_calculations', 'account_liability_portions') 
    THEN '✓ Created'
    ELSE '✗ Missing'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('liabilities', 'liability_payments', 'liability_schedules', 'liability_adjustments', 'liability_calculations', 'account_liability_portions')
ORDER BY table_name;

-- Verify RPC functions exist
SELECT 
  routine_name,
  CASE 
    WHEN routine_name IN ('increment_account_balance', 'decrement_account_balance', 'pay_from_liability_funds', 'create_transfer_transaction', 'update_liability_principal', 'delete_liability_and_recover_funds', 'delete_liability_entirely') 
    THEN '✓ Created'
    ELSE '✗ Missing'
  END as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('increment_account_balance', 'decrement_account_balance', 'pay_from_liability_funds', 'create_transfer_transaction', 'update_liability_principal', 'delete_liability_and_recover_funds', 'delete_liability_entirely')
ORDER BY routine_name;

-- Success message
SELECT 'Liability system migrations completed successfully!' as message;
