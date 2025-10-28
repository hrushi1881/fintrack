-- Migration: Create budget views for easier querying
-- Description: Useful views for budget analytics and reporting

-- View for budget summary with progress
CREATE OR REPLACE VIEW budget_summary AS
SELECT 
  b.id,
  b.user_id,
  b.name,
  b.amount,
  b.currency,
  b.budget_type,
  b.start_date,
  b.end_date,
  b.spent_amount,
  b.remaining_amount,
  get_budget_progress_percentage(b.id) as progress_percentage,
  is_budget_over_limit(b.id) as is_over_limit,
  b.is_active,
  b.created_at,
  b.updated_at,
  -- Account count
  (SELECT COUNT(*) FROM budget_accounts ba WHERE ba.budget_id = b.id) as account_count,
  -- Transaction count
  (SELECT COUNT(*) FROM budget_transactions bt WHERE bt.budget_id = b.id AND bt.is_excluded = false) as transaction_count
FROM budgets b
WHERE b.is_deleted = false;

-- View for budget daily pace analysis
CREATE OR REPLACE VIEW budget_daily_pace AS
SELECT 
  b.id,
  b.name,
  b.budget_type,
  b.amount,
  b.spent_amount,
  b.remaining_amount,
  pace.ideal_daily_spend,
  pace.current_daily_avg,
  pace.on_track,
  b.start_date,
  b.end_date,
  CURRENT_DATE - b.start_date + 1 as days_elapsed,
  b.end_date - CURRENT_DATE + 1 as days_remaining
FROM budgets b
CROSS JOIN LATERAL get_budget_daily_pace(b.id) as pace
WHERE b.is_active = true AND b.is_deleted = false;

-- View for budget alerts
CREATE OR REPLACE VIEW budget_alerts AS
SELECT 
  b.id,
  b.user_id,
  b.name,
  b.budget_type,
  b.amount,
  b.spent_amount,
  get_budget_progress_percentage(b.id) as progress_percentage,
  is_budget_over_limit(b.id) as is_over_limit,
  CASE 
    WHEN is_budget_over_limit(b.id) THEN 'over_limit'
    WHEN get_budget_progress_percentage(b.id) >= 100 THEN 'at_limit'
    WHEN get_budget_progress_percentage(b.id) >= 80 THEN 'warning'
    ELSE 'on_track'
  END as alert_level,
  b.alert_settings,
  b.created_at
FROM budgets b
WHERE b.is_active = true AND b.is_deleted = false;

-- View for budget transactions with details
CREATE OR REPLACE VIEW budget_transaction_details AS
SELECT 
  bt.id,
  bt.budget_id,
  bt.transaction_id,
  bt.is_excluded,
  bt.excluded_at,
  bt.excluded_reason,
  bt.amount_counted,
  bt.applied_at,
  bt.reconciled,
  t.amount as transaction_amount,
  t.type as transaction_type,
  t.description as transaction_description,
  t.date as transaction_date,
  t.category_id,
  tc.name as category_name,
  a.name as account_name,
  a.color as account_color,
  a.icon as account_icon
FROM budget_transactions bt
JOIN transactions t ON bt.transaction_id = t.id
LEFT JOIN transaction_categories tc ON t.category_id = tc.id
LEFT JOIN accounts a ON t.account_id = a.id;

-- View for budget events with user details
CREATE OR REPLACE VIEW budget_event_details AS
SELECT 
  be.id,
  be.budget_id,
  be.event_type,
  be.actor_id,
  be.reason,
  be.metadata,
  be.created_at,
  b.name as budget_name,
  b.budget_type,
  au.email as actor_email
FROM budget_events be
JOIN budgets b ON be.budget_id = b.id
LEFT JOIN auth.users au ON be.actor_id = au.id
ORDER BY be.created_at DESC;
