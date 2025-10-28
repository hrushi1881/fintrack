-- Migration: Create budgets table
-- Description: Core budgets table with all budget types and metadata

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  budget_type TEXT NOT NULL CHECK (budget_type IN ('monthly', 'category', 'goal_based', 'smart')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('monthly', 'weekly', 'yearly', 'custom')),
  rollover_enabled BOOLEAN DEFAULT false,
  category_id UUID REFERENCES transaction_categories(id),
  goal_id UUID REFERENCES goals(id),
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  spent_amount DECIMAL(12,2) DEFAULT 0,
  remaining_amount DECIMAL(12,2) GENERATED ALWAYS AS (amount - spent_amount) STORED,
  metadata JSONB DEFAULT '{}',
  alert_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraints
ALTER TABLE budgets ADD CONSTRAINT check_dates CHECK (end_date > start_date);
ALTER TABLE budgets ADD CONSTRAINT check_spent_amount CHECK (spent_amount >= 0);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_budget_type ON budgets(budget_type);
CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_goal_id ON budgets(goal_id);
CREATE INDEX IF NOT EXISTS idx_budgets_is_active ON budgets(is_active);
CREATE INDEX IF NOT EXISTS idx_budgets_dates ON budgets(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_budgets_metadata ON budgets USING GIN(metadata);

-- Add RLS (Row Level Security)
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own budgets" ON budgets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own budgets" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budgets" ON budgets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budgets" ON budgets
  FOR DELETE USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
