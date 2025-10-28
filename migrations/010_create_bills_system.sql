-- Migration: Create comprehensive bills system
-- Description: Bills and bill_payments tables with recurrence support and status tracking

CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(12,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  category_id UUID REFERENCES categories(id),
  
  -- Bill type and recurrence
  bill_type TEXT NOT NULL CHECK (bill_type IN ('one_time', 'recurring_fixed', 'recurring_variable', 'goal_linked')),
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  recurrence_interval INTEGER DEFAULT 1,
  custom_recurrence_config JSONB,
  
  -- Dates
  due_date DATE NOT NULL,
  original_due_date DATE,
  next_due_date DATE,
  last_paid_date DATE,
  recurrence_end_date DATE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due_today', 'overdue', 'paid', 'skipped', 'cancelled', 'postponed')),
  
  -- Links
  goal_id UUID REFERENCES goals(id),
  linked_account_id UUID REFERENCES accounts(id),
  
  -- Visual
  color TEXT NOT NULL DEFAULT '#F59E0B',
  icon TEXT NOT NULL DEFAULT 'receipt',
  
  -- Metadata
  reminder_days INTEGER[] DEFAULT ARRAY[1, 3, 7],
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Tracking
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraints
ALTER TABLE bills ADD CONSTRAINT check_amount_positive 
  CHECK (amount IS NULL OR amount > 0);

ALTER TABLE bills ADD CONSTRAINT check_recurrence_interval 
  CHECK (recurrence_interval > 0);

ALTER TABLE bills ADD CONSTRAINT check_due_date_after_original 
  CHECK (original_due_date IS NULL OR due_date >= original_due_date);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_category_id ON bills(category_id);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_bill_type ON bills(bill_type);
CREATE INDEX IF NOT EXISTS idx_bills_goal_id ON bills(goal_id);
CREATE INDEX IF NOT EXISTS idx_bills_linked_account_id ON bills(linked_account_id);
CREATE INDEX IF NOT EXISTS idx_bills_is_active ON bills(is_active);
CREATE INDEX IF NOT EXISTS idx_bills_is_deleted ON bills(is_deleted);
CREATE INDEX IF NOT EXISTS idx_bills_due_date_status ON bills(due_date, status);

-- Add RLS (Row Level Security)
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own bills" ON bills
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bills" ON bills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bills" ON bills
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bills" ON bills
  FOR DELETE USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create bill_payments table
CREATE TABLE IF NOT EXISTS bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL,
  payment_date DATE NOT NULL,
  actual_due_date DATE NOT NULL,
  
  transaction_id UUID REFERENCES transactions(id),
  account_id UUID REFERENCES accounts(id),
  
  payment_status TEXT NOT NULL CHECK (payment_status IN ('completed', 'partial', 'failed')),
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraints for bill_payments
ALTER TABLE bill_payments ADD CONSTRAINT check_payment_amount_positive 
  CHECK (amount > 0);

ALTER TABLE bill_payments ADD CONSTRAINT check_payment_date_not_future 
  CHECK (payment_date <= CURRENT_DATE);

-- Add indexes for bill_payments
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill_id ON bill_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_user_id ON bill_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_payment_date ON bill_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_bill_payments_payment_status ON bill_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_bill_payments_transaction_id ON bill_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_account_id ON bill_payments(account_id);

-- Add RLS for bill_payments
ALTER TABLE bill_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bill_payments
CREATE POLICY "Users can view their own bill payments" ON bill_payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bill payments" ON bill_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bill payments" ON bill_payments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bill payments" ON bill_payments
  FOR DELETE USING (auth.uid() = user_id);

-- Add updated_at trigger for bill_payments
CREATE TRIGGER update_bill_payments_updated_at
  BEFORE UPDATE ON bill_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate bill status based on due date
CREATE OR REPLACE FUNCTION calculate_bill_status(bill_due_date DATE, current_status TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Don't change status if already paid, cancelled, or skipped
  IF current_status IN ('paid', 'cancelled', 'skipped') THEN
    RETURN current_status;
  END IF;
  
  -- Calculate days until due
  IF bill_due_date < CURRENT_DATE THEN
    RETURN 'overdue';
  ELSIF bill_due_date = CURRENT_DATE THEN
    RETURN 'due_today';
  ELSE
    RETURN 'upcoming';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next bill occurrence for recurring bills
CREATE OR REPLACE FUNCTION generate_next_bill_instance(bill_uuid UUID)
RETURNS UUID AS $$
DECLARE
  bill_record RECORD;
  next_due_date DATE;
  new_bill_id UUID;
BEGIN
  -- Get the current bill record
  SELECT * INTO bill_record 
  FROM bills 
  WHERE id = bill_uuid AND is_deleted = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found or deleted';
  END IF;
  
  -- Check if it's a recurring bill
  IF bill_record.bill_type NOT IN ('recurring_fixed', 'recurring_variable', 'goal_linked') THEN
    RAISE EXCEPTION 'Bill is not recurring';
  END IF;
  
  -- Calculate next due date based on recurrence pattern
  CASE bill_record.recurrence_pattern
    WHEN 'daily' THEN
      next_due_date := bill_record.due_date + (bill_record.recurrence_interval || ' days')::INTERVAL;
    WHEN 'weekly' THEN
      next_due_date := bill_record.due_date + (bill_record.recurrence_interval || ' weeks')::INTERVAL;
    WHEN 'monthly' THEN
      next_due_date := bill_record.due_date + (bill_record.recurrence_interval || ' months')::INTERVAL;
    WHEN 'yearly' THEN
      next_due_date := bill_record.due_date + (bill_record.recurrence_interval || ' years')::INTERVAL;
    ELSE
      RAISE EXCEPTION 'Invalid recurrence pattern';
  END CASE;
  
  -- Check if we've reached the end date
  IF bill_record.recurrence_end_date IS NOT NULL AND next_due_date > bill_record.recurrence_end_date THEN
    RAISE EXCEPTION 'Recurrence end date reached';
  END IF;
  
  -- Create new bill instance
  INSERT INTO bills (
    user_id,
    title,
    description,
    amount,
    currency,
    category_id,
    bill_type,
    recurrence_pattern,
    recurrence_interval,
    custom_recurrence_config,
    due_date,
    original_due_date,
    next_due_date,
    goal_id,
    linked_account_id,
    color,
    icon,
    reminder_days,
    notes,
    metadata
  ) VALUES (
    bill_record.user_id,
    bill_record.title,
    bill_record.description,
    bill_record.amount,
    bill_record.currency,
    bill_record.category_id,
    bill_record.bill_type,
    bill_record.recurrence_pattern,
    bill_record.recurrence_interval,
    bill_record.custom_recurrence_config,
    next_due_date,
    bill_record.original_due_date,
    next_due_date + (bill_record.recurrence_interval || ' ' || bill_record.recurrence_pattern)::INTERVAL,
    bill_record.goal_id,
    bill_record.linked_account_id,
    bill_record.color,
    bill_record.icon,
    bill_record.reminder_days,
    bill_record.notes,
    bill_record.metadata
  ) RETURNING id INTO new_bill_id;
  
  -- Update the original bill's next_due_date
  UPDATE bills 
  SET next_due_date = next_due_date
  WHERE id = bill_uuid;
  
  RETURN new_bill_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get bill statistics
CREATE OR REPLACE FUNCTION get_bill_statistics(user_uuid UUID, time_range INTERVAL DEFAULT '1 month')
RETURNS TABLE (
  total_bills INTEGER,
  total_amount DECIMAL(12,2),
  paid_bills INTEGER,
  paid_amount DECIMAL(12,2),
  overdue_bills INTEGER,
  overdue_amount DECIMAL(12,2),
  upcoming_bills INTEGER,
  upcoming_amount DECIMAL(12,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_bills,
    COALESCE(SUM(amount), 0) as total_amount,
    COUNT(CASE WHEN status = 'paid' THEN 1 END)::INTEGER as paid_bills,
    COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as paid_amount,
    COUNT(CASE WHEN status = 'overdue' THEN 1 END)::INTEGER as overdue_bills,
    COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END), 0) as overdue_amount,
    COUNT(CASE WHEN status IN ('upcoming', 'due_today') THEN 1 END)::INTEGER as upcoming_bills,
    COALESCE(SUM(CASE WHEN status IN ('upcoming', 'due_today') THEN amount ELSE 0 END), 0) as upcoming_amount
  FROM bills
  WHERE user_id = user_uuid
    AND is_deleted = false
    AND created_at >= NOW() - time_range;
END;
$$ LANGUAGE plpgsql;

-- Function to update bill statuses (run daily)
CREATE OR REPLACE FUNCTION update_bill_statuses()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  bill_record RECORD;
BEGIN
  -- Update all active bills that need status recalculation
  FOR bill_record IN 
    SELECT id, due_date, status 
    FROM bills 
    WHERE is_active = true 
      AND is_deleted = false 
      AND status NOT IN ('paid', 'cancelled', 'skipped')
  LOOP
    UPDATE bills 
    SET 
      status = calculate_bill_status(bill_record.due_date, bill_record.status),
      updated_at = NOW()
    WHERE id = bill_record.id
      AND status != calculate_bill_status(bill_record.due_date, bill_record.status);
    
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Create a view for bills with calculated status
CREATE OR REPLACE VIEW bills_with_status AS
SELECT 
  b.*,
  calculate_bill_status(b.due_date, b.status) as calculated_status,
  CASE 
    WHEN b.due_date < CURRENT_DATE THEN 'overdue'
    WHEN b.due_date = CURRENT_DATE THEN 'due_today'
    ELSE 'upcoming'
  END as auto_status
FROM bills b
WHERE b.is_deleted = false;
