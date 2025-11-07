-- Migration: Create comprehensive liabilities system
-- Description: Supports all frontend features including payments, schedules, calculations, and type-specific fields

-- Main liabilities table
CREATE TABLE IF NOT EXISTS liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic Info
  title TEXT NOT NULL,
  description TEXT,
  liability_type TEXT NOT NULL CHECK (liability_type IN (
    'credit_card', 'personal_loan', 'auto_loan', 'student_loan', 'medical', 'mortgage', 'other'
  )),
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Financial Details
  disbursed_amount DECIMAL(14,2) CHECK (disbursed_amount >= 0),
  original_amount DECIMAL(14,2) CHECK (original_amount >= 0),
  current_balance DECIMAL(14,2) NOT NULL CHECK (current_balance >= 0),
  interest_rate_apy DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (interest_rate_apy >= 0),
  interest_type TEXT NOT NULL DEFAULT 'reducing' CHECK (interest_type IN ('reducing', 'fixed', 'none')),
  minimum_payment DECIMAL(14,2) CHECK (minimum_payment >= 0),
  periodical_payment DECIMAL(14,2) CHECK (periodical_payment >= 0),
  periodical_frequency TEXT CHECK (periodical_frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  
  -- Credit Card specific
  credit_limit DECIMAL(14,2) CHECK (credit_limit >= 0),
  due_day_of_month INTEGER CHECK (due_day_of_month BETWEEN 1 AND 31),
  
  -- Loan specific
  loan_term_months INTEGER CHECK (loan_term_months > 0),
  loan_term_years INTEGER CHECK (loan_term_years > 0),
  
  -- Dates
  start_date DATE NOT NULL,
  targeted_payoff_date DATE,
  next_due_date DATE,
  last_payment_date DATE,
  paid_off_date DATE,
  
  -- Links
  linked_account_id UUID REFERENCES accounts(id),
  category_id UUID REFERENCES categories(id),
  
  -- Import tracking
  is_imported BOOLEAN NOT NULL DEFAULT false,
  import_snapshot_date DATE,
  import_snapshot_balance DECIMAL(14,2) CHECK (import_snapshot_balance >= 0),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'paused', 'overdue')),
  
  -- Visual
  color TEXT NOT NULL DEFAULT '#EF4444',
  icon TEXT NOT NULL DEFAULT 'card',
  
  -- Additional Info
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  
  -- Tracking
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Liability payments table
CREATE TABLE IF NOT EXISTS liability_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liability_id UUID NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  category_id UUID REFERENCES categories(id),
  
  -- Payment Details
  payment_type TEXT NOT NULL CHECK (payment_type IN ('scheduled', 'manual', 'prepayment', 'mock', 'historical')),
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  interest_component DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (interest_component >= 0),
  principal_component DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (principal_component >= 0),
  
  -- Payment tracking
  payment_date DATE NOT NULL,
  description TEXT,
  reference_number TEXT,
  is_mock BOOLEAN NOT NULL DEFAULT false,
  method TEXT CHECK (method IN ('import_snapshot', 'historical_import', 'manual', 'auto_pay')),
  
  -- Transaction Link
  transaction_id UUID REFERENCES transactions(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Liability schedules table (future scheduled payments)
CREATE TABLE IF NOT EXISTS liability_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liability_id UUID NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  
  -- Schedule Details
  due_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  auto_pay BOOLEAN NOT NULL DEFAULT false,
  reminder_days INTEGER[] DEFAULT ARRAY[1, 3, 7],
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Liability adjustments table (audit log for extend/modify/restructure)
CREATE TABLE IF NOT EXISTS liability_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liability_id UUID NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
  
  -- Adjustment Details
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('extend', 'reduce', 'restructure', 'top_up', 'interest_capitalization', 'fee')),
  amount DECIMAL(14,2) NOT NULL,
  reason TEXT,
  effective_date DATE NOT NULL,
  
  -- Schedule Impact
  schedule_impact TEXT CHECK (schedule_impact IN ('recalculate', 'keep_emi_extend_term', 'keep_term_increase_emi')),
  
  -- Metadata
  old_values JSONB,
  new_values JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Liability calculations cache (for performance)
CREATE TABLE IF NOT EXISTS liability_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id UUID UNIQUE NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
  
  -- Cached calculations
  monthly_interest DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_interest_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_principal_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
  payoff_months INTEGER,
  payoff_date DATE,
  days_until_due INTEGER,
  
  -- Last calculated
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_liabilities_user_id ON liabilities(user_id);
CREATE INDEX IF NOT EXISTS idx_liabilities_status ON liabilities(status);
CREATE INDEX IF NOT EXISTS idx_liabilities_type ON liabilities(liability_type);
CREATE INDEX IF NOT EXISTS idx_liabilities_next_due_date ON liabilities(next_due_date);
CREATE INDEX IF NOT EXISTS idx_liabilities_category_id ON liabilities(category_id);
CREATE INDEX IF NOT EXISTS idx_liabilities_is_active ON liabilities(is_active);
CREATE INDEX IF NOT EXISTS idx_liabilities_is_deleted ON liabilities(is_deleted);

CREATE INDEX IF NOT EXISTS idx_liability_payments_user_id ON liability_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_liability_payments_liability_id ON liability_payments(liability_id);
CREATE INDEX IF NOT EXISTS idx_liability_payments_date ON liability_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_liability_payments_type ON liability_payments(payment_type);

CREATE INDEX IF NOT EXISTS idx_liability_schedules_user_id ON liability_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_liability_schedules_liability_id ON liability_schedules(liability_id);
CREATE INDEX IF NOT EXISTS idx_liability_schedules_due_date ON liability_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_liability_schedules_status ON liability_schedules(status);

CREATE INDEX IF NOT EXISTS idx_liability_adjustments_user_id ON liability_adjustments(user_id);
CREATE INDEX IF NOT EXISTS idx_liability_adjustments_liability_id ON liability_adjustments(liability_id);

-- RLS Policies
ALTER TABLE liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_calculations ENABLE ROW LEVEL SECURITY;

-- Liabilities RLS
CREATE POLICY "liabilities_select_own" ON liabilities
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "liabilities_insert_own" ON liabilities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "liabilities_update_own" ON liabilities
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "liabilities_delete_own" ON liabilities
  FOR DELETE USING (auth.uid() = user_id);

-- Liability payments RLS
CREATE POLICY "liability_payments_select_own" ON liability_payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "liability_payments_insert_own" ON liability_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "liability_payments_update_own" ON liability_payments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "liability_payments_delete_own" ON liability_payments
  FOR DELETE USING (auth.uid() = user_id);

-- Liability schedules RLS
CREATE POLICY "liability_schedules_select_own" ON liability_schedules
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "liability_schedules_insert_own" ON liability_schedules
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "liability_schedules_update_own" ON liability_schedules
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "liability_schedules_delete_own" ON liability_schedules
  FOR DELETE USING (auth.uid() = user_id);

-- Liability adjustments RLS
CREATE POLICY "liability_adjustments_select_own" ON liability_adjustments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "liability_adjustments_insert_own" ON liability_adjustments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Calculations RLS
CREATE POLICY "liability_calculations_select_own" ON liability_calculations
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM liabilities WHERE id = liability_id));

CREATE POLICY "liability_calculations_upsert_own" ON liability_calculations
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM liabilities WHERE id = liability_id));

CREATE POLICY "liability_calculations_update_own" ON liability_calculations
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM liabilities WHERE id = liability_id));

-- Triggers for updated_at
CREATE TRIGGER trg_liabilities_updated_at
  BEFORE UPDATE ON liabilities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_liability_payments_updated_at
  BEFORE UPDATE ON liability_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_liability_schedules_updated_at
  BEFORE UPDATE ON liability_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper functions
CREATE OR REPLACE FUNCTION calculate_liability_interest(
  p_balance DECIMAL,
  p_interest_rate_apy DECIMAL,
  p_days INTEGER DEFAULT 30
) RETURNS DECIMAL AS $$
BEGIN
  RETURN ROUND((p_balance * (p_interest_rate_apy/100) * p_days / 365), 2);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_payoff_months(
  p_balance DECIMAL,
  p_monthly_payment DECIMAL,
  p_interest_rate_apy DECIMAL
) RETURNS INTEGER AS $$
DECLARE
  monthly_rate DECIMAL := (p_interest_rate_apy/100)/12;
BEGIN
  IF p_balance <= 0 OR p_monthly_payment <= 0 THEN 
    RETURN NULL; 
  END IF;
  
  IF monthly_rate = 0 THEN 
    RETURN CEIL(p_balance / p_monthly_payment); 
  END IF;
  
  RETURN GREATEST(CEIL(
    LOG(1 + (p_balance * monthly_rate)/p_monthly_payment) / 
    LOG(1 + monthly_rate)
  ), 1);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_liability_calculations(p_liability_id UUID)
RETURNS VOID AS $$
DECLARE
  l RECORD;
  totals RECORD;
  days_until_due INTEGER;
  monthly_interest DECIMAL;
  payoff_months INTEGER;
  payoff_date DATE;
BEGIN
  SELECT * INTO l FROM liabilities WHERE id = p_liability_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Get payment totals
  SELECT
    COALESCE(SUM(interest_component),0) AS total_interest,
    COALESCE(SUM(principal_component),0) AS total_principal
  INTO totals
  FROM liability_payments 
  WHERE liability_id = p_liability_id;

  -- Calculate days until due
  IF l.next_due_date IS NOT NULL THEN
    days_until_due := (l.next_due_date - CURRENT_DATE);
  ELSE
    days_until_due := NULL;
  END IF;

  -- Calculate monthly interest
  monthly_interest := calculate_liability_interest(l.current_balance, l.interest_rate_apy, 30);
  
  -- Calculate payoff months and date
  payoff_months := calculate_payoff_months(l.current_balance, l.periodical_payment, l.interest_rate_apy);
  
  IF payoff_months IS NOT NULL AND l.periodical_payment > 0 THEN
    payoff_date := CURRENT_DATE + INTERVAL '1 month' * payoff_months;
  ELSE
    payoff_date := NULL;
  END IF;

  -- Upsert calculations
  INSERT INTO liability_calculations(
    liability_id, 
    monthly_interest, 
    total_interest_paid, 
    total_principal_paid, 
    payoff_months, 
    payoff_date,
    days_until_due, 
    calculated_at
  )
  VALUES (
    p_liability_id, 
    monthly_interest, 
    totals.total_interest, 
    totals.total_principal, 
    payoff_months, 
    payoff_date,
    days_until_due, 
    NOW()
  )
  ON CONFLICT (liability_id) 
  DO UPDATE SET
    monthly_interest = EXCLUDED.monthly_interest,
    total_interest_paid = EXCLUDED.total_interest_paid,
    total_principal_paid = EXCLUDED.total_principal_paid,
    payoff_months = EXCLUDED.payoff_months,
    payoff_date = EXCLUDED.payoff_date,
    days_until_due = EXCLUDED.days_until_due,
    calculated_at = EXCLUDED.calculated_at;

  -- Auto-mark as paid off if balance is zero
  IF l.current_balance = 0 AND l.status <> 'paid_off' THEN
    UPDATE liabilities 
    SET status = 'paid_off', paid_off_date = CURRENT_DATE 
    WHERE id = p_liability_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger functions
CREATE OR REPLACE FUNCTION trg_refresh_liability_calcs()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_liability_calculations(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_refresh_liability_calcs_from_payment()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_liability_calculations(NEW.liability_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-refresh calculations
CREATE TRIGGER t_liabilities_after_upsert
  AFTER INSERT OR UPDATE ON liabilities
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_liability_calcs();

CREATE TRIGGER t_liability_payments_after_upsert
  AFTER INSERT OR UPDATE ON liability_payments
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_liability_calcs_from_payment();

-- Sample data for testing (commented out for production)
/*
INSERT INTO liabilities (
  user_id, title, description, liability_type, disbursed_amount, current_balance,
  interest_rate_apy, minimum_payment, start_date, next_due_date,
  color, icon, status
) VALUES 
  (
    (SELECT id FROM auth.users LIMIT 1),
    'Credit Card Debt',
    'High-interest credit card debt from emergency expenses',
    'credit_card',
    2500.00,
    2500.00,
    18.5,
    75.00,
    '2023-01-15',
    '2024-02-15',
    '#EF4444',
    'card',
    'active'
  );
*/
