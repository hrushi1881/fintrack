-- Test Database Setup for Budget Feature
-- Run this after applying all migrations to verify everything works

-- Test 1: Check if all tables exist
SELECT 
  'Tables Check' as test_name,
  CASE 
    WHEN COUNT(*) = 4 THEN 'PASS'
    ELSE 'FAIL - Expected 4 tables, found ' || COUNT(*)
  END as result
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('budgets', 'budget_accounts', 'budget_transactions', 'budget_events');

-- Test 2: Check if all functions exist
SELECT 
  'Functions Check' as test_name,
  CASE 
    WHEN COUNT(*) >= 4 THEN 'PASS'
    ELSE 'FAIL - Expected at least 4 functions, found ' || COUNT(*)
  END as result
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%budget%';

-- Test 3: Check if all views exist
SELECT 
  'Views Check' as test_name,
  CASE 
    WHEN COUNT(*) >= 4 THEN 'PASS'
    ELSE 'FAIL - Expected at least 4 views, found ' || COUNT(*)
  END as result
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'budget%';

-- Test 4: Check RLS policies
SELECT 
  'RLS Policies Check' as test_name,
  CASE 
    WHEN COUNT(*) >= 12 THEN 'PASS'
    ELSE 'FAIL - Expected at least 12 RLS policies, found ' || COUNT(*)
  END as result
FROM pg_policies 
WHERE tablename LIKE 'budget%';

-- Test 5: Check indexes
SELECT 
  'Indexes Check' as test_name,
  CASE 
    WHEN COUNT(*) >= 20 THEN 'PASS'
    ELSE 'FAIL - Expected at least 20 indexes, found ' || COUNT(*)
  END as result
FROM pg_indexes 
WHERE tablename LIKE 'budget%';

-- Test 6: Test budget creation (if sample data exists)
SELECT 
  'Sample Data Check' as test_name,
  CASE 
    WHEN COUNT(*) > 0 THEN 'PASS - Sample data found'
    ELSE 'INFO - No sample data (run 008_create_budget_sample_data.sql if needed)'
  END as result
FROM budgets;

-- Test 7: Test views functionality
SELECT 
  'Views Functionality Check' as test_name,
  CASE 
    WHEN COUNT(*) >= 0 THEN 'PASS - Views are queryable'
    ELSE 'FAIL - Views not working'
  END as result
FROM budget_summary;

-- Summary
SELECT 
  'Database Setup Test Complete' as summary,
  'Check the results above for any FAIL or ERROR messages' as note;
