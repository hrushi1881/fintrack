-- Apply All Budget Migrations
-- This script applies all budget-related migrations in the correct order
-- Run this in your Supabase SQL Editor

-- Migration 001: Create budgets table
\i 001_create_budgets_table.sql

-- Migration 002: Create budget_accounts table  
\i 002_create_budget_accounts_table.sql

-- Migration 003: Create budget_transactions table
\i 003_create_budget_transactions_table.sql

-- Migration 004: Create budget_events table
\i 004_create_budget_events_table.sql

-- Migration 005: Create budget functions
\i 005_create_budget_functions.sql

-- Migration 006: Create budget views
\i 006_create_budget_views.sql

-- Migration 007: Create additional indexes
\i 007_create_budget_indexes.sql

-- Migration 008: Create sample data (optional)
-- Uncomment the next line if you want sample data
-- \i 008_create_budget_sample_data.sql

-- Verification queries
SELECT 'Migration completed successfully!' as status;

-- Check table creation
SELECT 
  'Tables created: ' || COUNT(*) as tables_created
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'budget%';

-- Check function creation
SELECT 
  'Functions created: ' || COUNT(*) as functions_created
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%budget%';

-- Check view creation
SELECT 
  'Views created: ' || COUNT(*) as views_created
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'budget%';
