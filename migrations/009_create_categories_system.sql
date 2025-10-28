-- Migration: Create comprehensive categories system
-- Description: Categories table with activity types, statistics tracking, and RLS policies

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  icon TEXT NOT NULL DEFAULT 'folder',
  is_default BOOLEAN DEFAULT false,
  activity_types TEXT[] NOT NULL DEFAULT ARRAY['expense'],
  total_spent DECIMAL(12,2) DEFAULT 0,
  total_received DECIMAL(12,2) DEFAULT 0,
  total_saved DECIMAL(12,2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraints
ALTER TABLE categories ADD CONSTRAINT check_activity_types 
  CHECK (activity_types <@ ARRAY['income', 'expense', 'goal', 'bill', 'liability', 'budget']);

ALTER TABLE categories ADD CONSTRAINT check_amounts_positive 
  CHECK (total_spent >= 0 AND total_received >= 0 AND total_saved >= 0);

ALTER TABLE categories ADD CONSTRAINT check_transaction_count_positive 
  CHECK (transaction_count >= 0);

-- Add unique constraint for user_id + name
ALTER TABLE categories ADD CONSTRAINT unique_user_category_name 
  UNIQUE(user_id, name);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_categories_activity_types ON categories USING GIN(activity_types);
CREATE INDEX IF NOT EXISTS idx_categories_is_default ON categories(is_default);
CREATE INDEX IF NOT EXISTS idx_categories_total_spent ON categories(total_spent DESC);
CREATE INDEX IF NOT EXISTS idx_categories_total_received ON categories(total_received DESC);

-- Add RLS (Row Level Security)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update category statistics
CREATE OR REPLACE FUNCTION update_category_statistics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update statistics for the affected category
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Update category stats for new/updated transaction
    UPDATE categories 
    SET 
      total_spent = COALESCE((
        SELECT SUM(amount) 
        FROM transactions 
        WHERE category_id = NEW.category_id 
        AND type = 'expense'
      ), 0),
      total_received = COALESCE((
        SELECT SUM(amount) 
        FROM transactions 
        WHERE category_id = NEW.category_id 
        AND type = 'income'
      ), 0),
      transaction_count = (
        SELECT COUNT(*) 
        FROM transactions 
        WHERE category_id = NEW.category_id
      ),
      updated_at = NOW()
    WHERE id = NEW.category_id;
  END IF;

  -- Update statistics for old category if transaction was moved
  IF TG_OP = 'UPDATE' AND OLD.category_id IS DISTINCT FROM NEW.category_id THEN
    UPDATE categories 
    SET 
      total_spent = COALESCE((
        SELECT SUM(amount) 
        FROM transactions 
        WHERE category_id = OLD.category_id 
        AND type = 'expense'
      ), 0),
      total_received = COALESCE((
        SELECT SUM(amount) 
        FROM transactions 
        WHERE category_id = OLD.category_id 
        AND type = 'income'
      ), 0),
      transaction_count = (
        SELECT COUNT(*) 
        FROM transactions 
        WHERE category_id = OLD.category_id
      ),
      updated_at = NOW()
    WHERE id = OLD.category_id;
  END IF;

  -- Update statistics for old category if transaction was deleted
  IF TG_OP = 'DELETE' THEN
    UPDATE categories 
    SET 
      total_spent = COALESCE((
        SELECT SUM(amount) 
        FROM transactions 
        WHERE category_id = OLD.category_id 
        AND type = 'expense'
      ), 0),
      total_received = COALESCE((
        SELECT SUM(amount) 
        FROM transactions 
        WHERE category_id = OLD.category_id 
        AND type = 'income'
      ), 0),
      transaction_count = (
        SELECT COUNT(*) 
        FROM transactions 
        WHERE category_id = OLD.category_id
      ),
      updated_at = NOW()
    WHERE id = OLD.category_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for transaction changes
CREATE TRIGGER update_category_stats_on_transaction
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_category_statistics();

-- Function to seed default categories for new users
CREATE OR REPLACE FUNCTION seed_default_categories(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  -- Income Categories
  INSERT INTO categories (user_id, name, color, icon, is_default, activity_types) VALUES
  (user_uuid, 'Salary', '#10B981', 'briefcase', true, ARRAY['income']),
  (user_uuid, 'Freelance', '#3B82F6', 'laptop', true, ARRAY['income']),
  (user_uuid, 'Investment Returns', '#8B5CF6', 'trending-up', true, ARRAY['income']),
  (user_uuid, 'Gift', '#F59E0B', 'gift', true, ARRAY['income']),
  (user_uuid, 'Other Income', '#6B7280', 'add-circle', true, ARRAY['income']);

  -- Expense Categories
  INSERT INTO categories (user_id, name, color, icon, is_default, activity_types) VALUES
  (user_uuid, 'Food & Dining', '#EF4444', 'restaurant', true, ARRAY['expense']),
  (user_uuid, 'Transportation', '#F59E0B', 'car', true, ARRAY['expense']),
  (user_uuid, 'Shopping', '#8B5CF6', 'bag', true, ARRAY['expense']),
  (user_uuid, 'Entertainment', '#EC4899', 'musical-notes', true, ARRAY['expense']),
  (user_uuid, 'Bills', '#3B82F6', 'receipt', true, ARRAY['expense', 'bill']),
  (user_uuid, 'Healthcare', '#10B981', 'medical', true, ARRAY['expense']),
  (user_uuid, 'Education', '#6366F1', 'school', true, ARRAY['expense']),
  (user_uuid, 'Housing', '#F97316', 'home', true, ARRAY['expense', 'bill']),
  (user_uuid, 'Other Expense', '#6B7280', 'ellipsis-horizontal', true, ARRAY['expense']);

  -- Bill Categories
  INSERT INTO categories (user_id, name, color, icon, is_default, activity_types) VALUES
  (user_uuid, 'Utilities', '#F59E0B', 'flash', true, ARRAY['bill']),
  (user_uuid, 'Rent/Mortgage', '#F97316', 'home', true, ARRAY['bill']),
  (user_uuid, 'Insurance', '#3B82F6', 'shield', true, ARRAY['bill']),
  (user_uuid, 'Subscriptions', '#8B5CF6', 'play', true, ARRAY['bill']),
  (user_uuid, 'Internet', '#10B981', 'wifi', true, ARRAY['bill']),
  (user_uuid, 'Phone', '#EC4899', 'call', true, ARRAY['bill']),
  (user_uuid, 'Other Bills', '#6B7280', 'receipt', true, ARRAY['bill']);

  -- Liability Categories
  INSERT INTO categories (user_id, name, color, icon, is_default, activity_types) VALUES
  (user_uuid, 'Credit Card', '#EF4444', 'card', true, ARRAY['liability']),
  (user_uuid, 'Personal Loan', '#F59E0B', 'cash', true, ARRAY['liability']),
  (user_uuid, 'Student Loan', '#3B82F6', 'school', true, ARRAY['liability']),
  (user_uuid, 'Auto Loan', '#8B5CF6', 'car', true, ARRAY['liability']),
  (user_uuid, 'Medical Debt', '#10B981', 'medical', true, ARRAY['liability']);

  -- Goal Categories
  INSERT INTO categories (user_id, name, color, icon, is_default, activity_types) VALUES
  (user_uuid, 'Emergency Fund', '#10B981', 'shield', true, ARRAY['goal']),
  (user_uuid, 'Vacation', '#3B82F6', 'airplane', true, ARRAY['goal']),
  (user_uuid, 'Home Purchase', '#F97316', 'home', true, ARRAY['goal']),
  (user_uuid, 'Education', '#6366F1', 'school', true, ARRAY['goal']),
  (user_uuid, 'Retirement', '#8B5CF6', 'time', true, ARRAY['goal']),
  (user_uuid, 'Other Goals', '#6B7280', 'flag', true, ARRAY['goal']);

  -- Budget Categories (reuse expense categories)
  INSERT INTO categories (user_id, name, color, icon, is_default, activity_types) VALUES
  (user_uuid, 'Monthly Budget', '#3B82F6', 'calendar', true, ARRAY['budget']),
  (user_uuid, 'Weekly Budget', '#10B981', 'calendar', true, ARRAY['budget']),
  (user_uuid, 'Yearly Budget', '#8B5CF6', 'calendar', true, ARRAY['budget']);
END;
$$ LANGUAGE plpgsql;

-- Create function to get category statistics
CREATE OR REPLACE FUNCTION get_category_stats(user_uuid UUID, time_range INTERVAL DEFAULT '1 month')
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  total_amount DECIMAL(12,2),
  transaction_count INTEGER,
  percentage DECIMAL(5,2),
  color TEXT,
  icon TEXT,
  activity_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as category_id,
    c.name as category_name,
    COALESCE(SUM(t.amount), 0) as total_amount,
    COUNT(t.id)::INTEGER as transaction_count,
    CASE 
      WHEN SUM(SUM(t.amount)) OVER() > 0 
      THEN ROUND((SUM(t.amount) / SUM(SUM(t.amount)) OVER()) * 100, 2)
      ELSE 0
    END as percentage,
    c.color,
    c.icon,
    CASE 
      WHEN SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) > 0 THEN 'income'
      WHEN SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) > 0 THEN 'expense'
      ELSE 'mixed'
    END as activity_type
  FROM categories c
  LEFT JOIN transactions t ON c.id = t.category_id 
    AND t.created_at >= NOW() - time_range
  WHERE c.user_id = user_uuid
  GROUP BY c.id, c.name, c.color, c.icon
  ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql;
