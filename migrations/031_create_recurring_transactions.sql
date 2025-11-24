-- Migration: Create recurring_transactions table
-- Description: Separate system for recurring transactions (Netflix, Rent, etc.)
--              This is a separate entity from bills - bills will aggregate upcoming payments from multiple sources

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic Info
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense')) DEFAULT 'expense',
  
  -- Amount
  amount DECIMAL(12,2),
  amount_type TEXT NOT NULL CHECK (amount_type IN ('fixed', 'variable')) DEFAULT 'fixed',
  estimated_amount DECIMAL(12,2), -- For variable amounts
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Recurrence (using recurrence engine format)
  frequency TEXT NOT NULL CHECK (frequency IN ('day', 'week', 'month', 'quarter', 'year', 'custom')) DEFAULT 'month',
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval > 0),
  start_date DATE NOT NULL,
  end_date DATE, -- Optional end date
  date_of_occurrence INTEGER, -- Specific day of month/week (e.g., 15th of month, Monday)
  
  -- Custom recurrence
  custom_unit TEXT CHECK (custom_unit IN ('day', 'week', 'month', 'quarter', 'year')),
  custom_interval INTEGER CHECK (custom_interval > 0),
  
  -- Account & Fund
  linked_account_id UUID REFERENCES accounts(id),
  fund_type TEXT NOT NULL CHECK (fund_type IN ('personal', 'liability', 'goal')) DEFAULT 'personal',
  specific_fund_id UUID, -- For liability or goal funds
  
  -- Nature & Metadata
  nature TEXT CHECK (nature IN ('subscription', 'bill', 'payment', 'income')),
  is_subscription BOOLEAN DEFAULT false,
  subscription_provider TEXT,
  subscription_plan TEXT,
  subscription_start_date DATE,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'cancelled')) DEFAULT 'active',
  paused_until DATE, -- If paused, when to resume
  
  -- Auto-Creation Settings
  auto_create BOOLEAN DEFAULT true,
  auto_create_days_before INTEGER DEFAULT 3,
  remind_before BOOLEAN DEFAULT true,
  reminder_days INTEGER[] DEFAULT ARRAY[7, 3, 1],
  
  -- Visual
  color TEXT NOT NULL DEFAULT '#F59E0B',
  icon TEXT NOT NULL DEFAULT 'repeat',
  
  -- Tracking
  total_occurrences INTEGER DEFAULT 0,
  completed_occurrences INTEGER DEFAULT 0,
  skipped_occurrences INTEGER DEFAULT 0,
  total_paid DECIMAL(12,2) DEFAULT 0,
  average_amount DECIMAL(12,2) DEFAULT 0,
  last_transaction_date DATE,
  next_transaction_date DATE,
  
  -- Metadata
  tags TEXT[],
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Tracking
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_category_id ON recurring_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_status ON recurring_transactions(status);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_next_date ON recurring_transactions(next_transaction_date);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_frequency ON recurring_transactions(frequency);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_is_active ON recurring_transactions(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_is_deleted ON recurring_transactions(is_deleted);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_status ON recurring_transactions(user_id, status, is_active, is_deleted);

-- Add RLS (Row Level Security)
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own recurring transactions" ON recurring_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recurring transactions" ON recurring_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring transactions" ON recurring_transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring transactions" ON recurring_transactions
  FOR DELETE USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_recurring_transactions_updated_at
  BEFORE UPDATE ON recurring_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE recurring_transactions IS 'Recurring transaction definitions (Netflix, Rent, etc.) - separate from bills';
COMMENT ON COLUMN recurring_transactions.frequency IS 'Recurrence frequency: day, week, month, quarter, year, or custom';
COMMENT ON COLUMN recurring_transactions.date_of_occurrence IS 'Specific day of month/week for occurrence (e.g., 15 = 15th of month, 1 = Monday)';
COMMENT ON COLUMN recurring_transactions.next_transaction_date IS 'Next occurrence date - calculated using recurrence engine';

