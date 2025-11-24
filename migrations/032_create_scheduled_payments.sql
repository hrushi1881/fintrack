-- Migration: Create scheduled_payments table
-- Description: One-time future payments (not recurring)
--              Bills view will aggregate these along with recurring transactions, liabilities, etc.

CREATE TABLE IF NOT EXISTS scheduled_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic Info
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  
  -- Amount
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Dates
  due_date DATE NOT NULL,
  scheduled_date DATE NOT NULL, -- When payment was scheduled
  
  -- Account & Fund
  linked_account_id UUID REFERENCES accounts(id),
  fund_type TEXT NOT NULL CHECK (fund_type IN ('personal', 'liability', 'goal')) DEFAULT 'personal',
  specific_fund_id UUID, -- For liability or goal funds
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'due_today', 'overdue', 'paid', 'cancelled', 'skipped', 'postponed')) DEFAULT 'scheduled',
  
  -- Reminders
  remind_before BOOLEAN DEFAULT true,
  reminder_days INTEGER[] DEFAULT ARRAY[7, 3, 1],
  
  -- Visual
  color TEXT NOT NULL DEFAULT '#F59E0B',
  icon TEXT NOT NULL DEFAULT 'calendar',
  
  -- Metadata
  tags TEXT[],
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Links (optional)
  related_transaction_id UUID REFERENCES transactions(id), -- Once paid, link to actual transaction
  linked_bill_id UUID, -- If created from old bills system (temporary migration field)
  
  -- Tracking
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE, -- When payment was made
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_user_id ON scheduled_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_category_id ON scheduled_payments(category_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_due_date ON scheduled_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status ON scheduled_payments(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_is_active ON scheduled_payments(is_active);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_is_deleted ON scheduled_payments(is_deleted);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_user_due_status ON scheduled_payments(user_id, due_date, status, is_deleted);

-- Add RLS (Row Level Security)
ALTER TABLE scheduled_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own scheduled payments" ON scheduled_payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scheduled payments" ON scheduled_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled payments" ON scheduled_payments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled payments" ON scheduled_payments
  FOR DELETE USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_scheduled_payments_updated_at
  BEFORE UPDATE ON scheduled_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE scheduled_payments IS 'One-time future payments - aggregated into bills view';
COMMENT ON COLUMN scheduled_payments.due_date IS 'When payment is due';
COMMENT ON COLUMN scheduled_payments.scheduled_date IS 'When payment was scheduled/created';

