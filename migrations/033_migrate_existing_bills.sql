-- Migration: Migrate existing bills to new system
-- Description: Converts existing bills data to recurring_transactions and scheduled_payments
--              This migration preserves data while transitioning to the new aggregated bills view

-- Migrate recurring bills to recurring_transactions
INSERT INTO recurring_transactions (
  id,
  user_id,
  title,
  description,
  category_id,
  direction,
  amount,
  amount_type,
  estimated_amount,
  currency,
  frequency,
  interval,
  start_date,
  end_date,
  date_of_occurrence,
  custom_unit,
  custom_interval,
  linked_account_id,
  fund_type,
  nature,
  is_subscription,
  status,
  auto_create,
  auto_create_days_before,
  remind_before,
  reminder_days,
  color,
  icon,
  notes,
  metadata,
  is_active,
  is_deleted,
  created_at,
  updated_at,
  next_transaction_date
)
SELECT 
  id,
  user_id,
  title,
  description,
  category_id,
  'expense' as direction,
  amount,
  CASE 
    WHEN bill_type = 'recurring_fixed' THEN 'fixed'
    WHEN bill_type = 'recurring_variable' THEN 'variable'
    ELSE 'fixed'
  END as amount_type,
  amount as estimated_amount,
  currency,
  CASE 
    WHEN recurrence_pattern = 'daily' THEN 'day'
    WHEN recurrence_pattern = 'weekly' THEN 'week'
    WHEN recurrence_pattern = 'monthly' THEN 'month'
    WHEN recurrence_pattern = 'yearly' THEN 'year'
    WHEN recurrence_pattern = 'custom' THEN 'custom'
    ELSE 'month'
  END as frequency,
  COALESCE(recurrence_interval, 1) as interval,
  COALESCE(original_due_date, due_date) as start_date,
  recurrence_end_date as end_date,
  EXTRACT(DAY FROM due_date)::INTEGER as date_of_occurrence,
  CASE 
    WHEN recurrence_pattern = 'custom' THEN 
      COALESCE((custom_recurrence_config->>'unit')::TEXT, 'month')
    ELSE NULL
  END as custom_unit,
  CASE 
    WHEN recurrence_pattern = 'custom' THEN 
      COALESCE((custom_recurrence_config->>'interval')::INTEGER, 1)
    ELSE NULL
  END as custom_interval,
  linked_account_id,
  'personal' as fund_type,
  CASE 
    WHEN metadata->>'nature' IS NOT NULL THEN (metadata->>'nature')::TEXT
    WHEN metadata->>'source_type' = 'subscription' THEN 'subscription'
    WHEN goal_id IS NOT NULL THEN 'payment'
    ELSE 'bill'
  END as nature,
  (metadata->>'source_type' = 'subscription')::BOOLEAN as is_subscription,
  CASE 
    WHEN status = 'cancelled' THEN 'cancelled'
    WHEN status = 'paid' THEN 'completed'
    WHEN status = 'postponed' THEN 'paused'
    ELSE 'active'
  END as status,
  true as auto_create,
  3 as auto_create_days_before,
  true as remind_before,
  COALESCE(reminder_days, ARRAY[7, 3, 1]) as reminder_days,
  color,
  icon,
  notes,
  COALESCE(metadata, '{}'::JSONB) as metadata,
  COALESCE(is_active, true) as is_active,
  is_deleted,
  created_at,
  updated_at,
  COALESCE(next_due_date, due_date) as next_transaction_date
FROM bills
WHERE bill_type IN ('recurring_fixed', 'recurring_variable', 'goal_linked')
  AND recurrence_pattern IS NOT NULL
  AND is_deleted = false
ON CONFLICT (id) DO NOTHING;

-- Migrate one-time bills (with future due dates) to scheduled_payments
INSERT INTO scheduled_payments (
  id,
  user_id,
  title,
  description,
  category_id,
  amount,
  currency,
  due_date,
  scheduled_date,
  linked_account_id,
  fund_type,
  status,
  remind_before,
  reminder_days,
  color,
  icon,
  notes,
  metadata,
  linked_bill_id,
  is_active,
  is_deleted,
  created_at,
  updated_at
)
SELECT 
  id,
  user_id,
  title,
  description,
  category_id,
  COALESCE(amount, 0) as amount,
  currency,
  due_date,
  created_at::DATE as scheduled_date,
  linked_account_id,
  'personal' as fund_type,
  CASE 
    WHEN status = 'paid' THEN 'paid'
    WHEN status = 'cancelled' THEN 'cancelled'
    WHEN due_date < CURRENT_DATE AND status != 'paid' THEN 'overdue'
    WHEN due_date = CURRENT_DATE THEN 'due_today'
    ELSE 'scheduled'
  END as status,
  true as remind_before,
  COALESCE(reminder_days, ARRAY[7, 3, 1]) as reminder_days,
  color,
  icon,
  notes,
  COALESCE(metadata, '{}'::JSONB) as metadata,
  id as linked_bill_id, -- Keep reference to original bill
  COALESCE(is_active, true) as is_active,
  is_deleted,
  created_at,
  updated_at
FROM bills
WHERE bill_type = 'one_time'
  AND due_date >= CURRENT_DATE -- Only migrate future one-time bills
  AND is_deleted = false
ON CONFLICT (id) DO NOTHING;

-- Add comment to bills table indicating migration
COMMENT ON TABLE bills IS 'DEPRECATED: Bills table is now deprecated. Use recurring_transactions and scheduled_payments instead. Bills view aggregates data from multiple sources.';

-- Note: We're keeping the bills table for historical data and backward compatibility
-- The bills view will now use the aggregator to pull from recurring_transactions, scheduled_payments, liabilities, and goals

