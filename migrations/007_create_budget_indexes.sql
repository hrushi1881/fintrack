-- Migration: Create additional indexes for budget performance
-- Description: Optimize queries for budget operations

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_budgets_user_active_type ON budgets(user_id, is_active, budget_type);
CREATE INDEX IF NOT EXISTS idx_budgets_user_dates ON budgets(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_budgets_category_active ON budgets(category_id, is_active) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_goal_active ON budgets(goal_id, is_active) WHERE goal_id IS NOT NULL;

-- Indexes for budget_accounts performance
CREATE INDEX IF NOT EXISTS idx_budget_accounts_budget_role ON budget_accounts(budget_id, account_role);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_account_role ON budget_accounts(account_id, account_role);

-- Indexes for budget_transactions performance
CREATE INDEX IF NOT EXISTS idx_budget_transactions_budget_excluded ON budget_transactions(budget_id, is_excluded);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_budget_applied ON budget_transactions(budget_id, applied_at);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_transaction_excluded ON budget_transactions(transaction_id, is_excluded);

-- Indexes for budget_events performance
CREATE INDEX IF NOT EXISTS idx_budget_events_budget_type ON budget_events(budget_id, event_type);
CREATE INDEX IF NOT EXISTS idx_budget_events_actor_type ON budget_events(actor_id, event_type);
CREATE INDEX IF NOT EXISTS idx_budget_events_created_type ON budget_events(created_at, event_type);

-- Partial indexes for active records only
CREATE INDEX IF NOT EXISTS idx_budgets_active_only ON budgets(user_id, budget_type, start_date, end_date) 
  WHERE is_active = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_budget_accounts_active_only ON budget_accounts(budget_id, account_id) 
  WHERE EXISTS (
    SELECT 1 FROM budgets 
    WHERE budgets.id = budget_accounts.budget_id 
    AND budgets.is_active = true 
    AND budgets.is_deleted = false
  );

-- Indexes for text search on budget names
CREATE INDEX IF NOT EXISTS idx_budgets_name_text ON budgets USING GIN(to_tsvector('english', name));

-- Indexes for JSON metadata queries
CREATE INDEX IF NOT EXISTS idx_budgets_metadata_goal_subtype ON budgets USING GIN((metadata->>'goal_subtype'));
CREATE INDEX IF NOT EXISTS idx_budgets_metadata_template ON budgets USING GIN((metadata->>'template'));

-- Indexes for alert settings queries
CREATE INDEX IF NOT EXISTS idx_budgets_alert_thresholds ON budgets USING GIN((alert_settings->'thresholds'));
CREATE INDEX IF NOT EXISTS idx_budgets_alert_snooze ON budgets USING GIN((alert_settings->>'snooze_until'));

-- Indexes for date range queries
CREATE INDEX IF NOT EXISTS idx_budgets_date_range ON budgets(start_date, end_date) 
  WHERE is_active = true AND is_deleted = false;

-- Indexes for budget progress queries
CREATE INDEX IF NOT EXISTS idx_budgets_progress ON budgets(spent_amount, amount) 
  WHERE is_active = true AND is_deleted = false;
