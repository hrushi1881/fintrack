-- Migration: Create sample budget data for testing
-- Description: Insert sample data to test budget functionality

-- Sample transaction categories (if they don't exist)
INSERT INTO transaction_categories (id, user_id, name, type, color, icon, is_default, is_active)
VALUES 
  (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1), 'Food & Dining', 'expense', '#FF6B6B', 'restaurant', true, true),
  (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1), 'Transportation', 'expense', '#4ECDC4', 'car', true, true),
  (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1), 'Shopping', 'expense', '#45B7D1', 'bag', true, true),
  (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1), 'Entertainment', 'expense', '#96CEB4', 'game-controller', true, true),
  (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1), 'Utilities', 'expense', '#FFEAA7', 'flash', true, true)
ON CONFLICT DO NOTHING;

-- Sample goals (if they don't exist)
INSERT INTO goals (id, user_id, title, description, target_amount, current_amount, target_date, category, color, icon, is_achieved, created_at, updated_at)
VALUES 
  (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1), 'Emergency Fund', 'Build emergency savings', 10000.00, 2500.00, '2024-12-31', 'Emergency', '#FF6B6B', 'shield', false, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1), 'Vacation Fund', 'Save for summer vacation', 5000.00, 1200.00, '2024-06-30', 'Travel', '#4ECDC4', 'airplane', false, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1), 'New Car', 'Down payment for new car', 15000.00, 5000.00, '2024-08-31', 'Transportation', '#45B7D1', 'car', false, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Sample budgets
INSERT INTO budgets (id, user_id, name, amount, currency, created_by, budget_type, start_date, end_date, category_id, goal_id, metadata, alert_settings, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM auth.users LIMIT 1),
  'Monthly Food Budget',
  800.00,
  'USD',
  (SELECT id FROM auth.users LIMIT 1),
  'category',
  DATE_TRUNC('month', CURRENT_DATE),
  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
  (SELECT id FROM transaction_categories WHERE name = 'Food & Dining' LIMIT 1),
  NULL,
  '{"description": "Monthly food and dining expenses"}',
  '{"thresholds": [50, 80, 100], "daily_pace_enabled": true}',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM budgets WHERE name = 'Monthly Food Budget');

INSERT INTO budgets (id, user_id, name, amount, currency, created_by, budget_type, start_date, end_date, category_id, goal_id, metadata, alert_settings, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM auth.users LIMIT 1),
  'Monthly Transportation',
  400.00,
  'USD',
  (SELECT id FROM auth.users LIMIT 1),
  'category',
  DATE_TRUNC('month', CURRENT_DATE),
  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
  (SELECT id FROM transaction_categories WHERE name = 'Transportation' LIMIT 1),
  NULL,
  '{"description": "Monthly transportation expenses"}',
  '{"thresholds": [75, 90, 100], "daily_pace_enabled": true}',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM budgets WHERE name = 'Monthly Transportation');

INSERT INTO budgets (id, user_id, name, amount, currency, created_by, budget_type, start_date, end_date, category_id, goal_id, metadata, alert_settings, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM auth.users LIMIT 1),
  'Emergency Fund Budget',
  2000.00,
  'USD',
  (SELECT id FROM auth.users LIMIT 1),
  'goal_based',
  DATE_TRUNC('month', CURRENT_DATE),
  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
  NULL,
  (SELECT id FROM goals WHERE title = 'Emergency Fund' LIMIT 1),
  '{"goal_subtype": "B", "description": "Monthly savings for emergency fund"}',
  '{"thresholds": [50, 80, 100], "daily_pace_enabled": false}',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM budgets WHERE name = 'Emergency Fund Budget');

-- Link budgets to accounts (assuming accounts exist)
INSERT INTO budget_accounts (budget_id, account_id, account_role, created_at, updated_at)
SELECT 
  b.id,
  a.id,
  'owner',
  NOW(),
  NOW()
FROM budgets b
CROSS JOIN accounts a
WHERE a.user_id = b.user_id
  AND a.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM budget_accounts ba 
    WHERE ba.budget_id = b.id AND ba.account_id = a.id
  );

-- Create some sample budget events
INSERT INTO budget_events (budget_id, event_type, actor_id, reason, metadata, created_at, updated_at)
SELECT 
  b.id,
  'budget_created',
  b.created_by,
  'Budget created with sample data',
  '{"source": "sample_data", "version": "1.0"}',
  b.created_at,
  b.updated_at
FROM budgets b
WHERE NOT EXISTS (
  SELECT 1 FROM budget_events be 
  WHERE be.budget_id = b.id AND be.event_type = 'budget_created'
);
