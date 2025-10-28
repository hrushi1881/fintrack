# Budget Feature Database Migrations

This directory contains SQL migrations for the budget feature implementation in FinTrack.

## Migration Files

### 001_create_budgets_table.sql
Creates the core `budgets` table with:
- All budget types (monthly, category, goal_based, smart)
- Metadata and alert settings (JSONB fields)
- Row Level Security (RLS) policies
- Proper indexes for performance
- Generated columns for calculated fields

### 002_create_budget_accounts_table.sql
Creates the `budget_accounts` junction table:
- Links budgets to accounts with roles (owner, shared)
- Tracks last sync timestamps
- RLS policies for user data isolation
- Unique constraints to prevent duplicates

### 003_create_budget_transactions_table.sql
Creates the `budget_transactions` table:
- Links transactions to budgets
- Exclusion tracking with reasons
- Reconciliation status
- RLS policies for user data isolation

### 004_create_budget_events_table.sql
Creates the `budget_events` audit table:
- Tracks all budget operations
- Actor identification and reasons
- Metadata for additional context
- RLS policies for user data isolation

### 005_create_budget_functions.sql
Creates database functions for:
- Automatic budget transaction creation
- Budget progress calculations
- Daily spending pace analysis
- Budget limit checking

### 006_create_budget_views.sql
Creates useful views for:
- Budget summary with progress
- Daily pace analysis
- Budget alerts
- Transaction details with metadata

### 007_create_budget_indexes.sql
Creates performance indexes for:
- Common query patterns
- JSON metadata queries
- Date range searches
- Text search on budget names

### 008_create_budget_sample_data.sql
Inserts sample data for testing:
- Sample transaction categories
- Sample goals
- Sample budgets of different types
- Budget-account associations
- Sample audit events

## Installation Instructions

### Option 1: Supabase Dashboard
1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy and paste each migration file in order
4. Execute each migration

### Option 2: Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db reset
# Then apply migrations in order
```

### Option 3: Direct SQL Execution
1. Connect to your Supabase database
2. Execute migrations in numerical order (001-008)
3. Verify tables and functions are created

## Verification Queries

After running migrations, verify the installation:

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'budget%';

-- Check if functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%budget%';

-- Check if views exist
SELECT table_name FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'budget%';

-- Test sample data
SELECT * FROM budget_summary LIMIT 5;
```

## Database Schema Overview

```
budgets (Core table)
├── budget_accounts (Junction table)
├── budget_transactions (Transaction linking)
├── budget_events (Audit trail)
└── Views (Analytics)
    ├── budget_summary
    ├── budget_daily_pace
    ├── budget_alerts
    ├── budget_transaction_details
    └── budget_event_details
```

## Key Features

### Budget Types
- **Monthly**: Track total spending across all categories
- **Category**: Set spending limits for specific categories
- **Goal-Based**: Link budgets to savings goals (Types A, B, C)
- **Smart**: AI-powered recommendations (placeholder)

### Security
- Row Level Security (RLS) enabled on all tables
- User isolation - users can only access their own data
- Proper foreign key constraints
- Audit trail for all operations

### Performance
- Optimized indexes for common queries
- JSONB fields for flexible metadata
- Generated columns for calculated fields
- Efficient views for analytics

### Functions
- Automatic transaction linking
- Progress calculations
- Daily pace analysis
- Alert generation

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure RLS policies are properly set
2. **Foreign Key Errors**: Check that referenced tables exist
3. **Function Errors**: Verify all dependencies are installed
4. **Index Errors**: Check for naming conflicts

### Rollback Instructions

To rollback migrations (in reverse order):
```sql
-- 008: Remove sample data
DELETE FROM budget_events WHERE metadata->>'source' = 'sample_data';
DELETE FROM budget_accounts WHERE budget_id IN (SELECT id FROM budgets WHERE name LIKE '%Budget');
DELETE FROM budgets WHERE name LIKE '%Budget';

-- 007: Drop indexes
DROP INDEX IF EXISTS idx_budgets_progress;
-- ... (drop other indexes)

-- 006: Drop views
DROP VIEW IF EXISTS budget_event_details;
DROP VIEW IF EXISTS budget_transaction_details;
-- ... (drop other views)

-- 005: Drop functions
DROP FUNCTION IF EXISTS get_budget_daily_pace(UUID);
DROP FUNCTION IF EXISTS get_budget_progress_percentage(UUID);
-- ... (drop other functions)

-- 004-001: Drop tables
DROP TABLE IF EXISTS budget_events CASCADE;
DROP TABLE IF EXISTS budget_transactions CASCADE;
DROP TABLE IF EXISTS budget_accounts CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
```

## Support

For issues with these migrations, check:
1. Supabase documentation for RLS and functions
2. PostgreSQL documentation for JSONB and indexes
3. Project README for application integration
