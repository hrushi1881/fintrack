-- Migration: Link bills to liabilities
-- Description: Add liability support to bills table, allowing bills to be used for liability payments

-- Add liability_id column to bills table
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS liability_id UUID REFERENCES liabilities(id) ON DELETE CASCADE;

-- Add interest and principal amount columns
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS interest_amount DECIMAL(12,2) CHECK (interest_amount >= 0);

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS principal_amount DECIMAL(12,2) CHECK (principal_amount >= 0);

-- Add payment number for liability bills
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS payment_number INTEGER CHECK (payment_number > 0);

-- Add flag to indicate if interest is included in total amount
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS interest_included BOOLEAN DEFAULT true;

-- Add index for liability_id
CREATE INDEX IF NOT EXISTS idx_bills_liability_id ON bills(liability_id);

-- Add index for payment_number
CREATE INDEX IF NOT EXISTS idx_bills_payment_number ON bills(payment_number) WHERE liability_id IS NOT NULL;

-- Add composite index for liability bills
CREATE INDEX IF NOT EXISTS idx_bills_liability_due_date ON bills(liability_id, due_date) WHERE liability_id IS NOT NULL;

-- Update bill_type check constraint to include liability_linked
-- Note: This requires dropping and recreating the constraint
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_type_check;

ALTER TABLE bills 
ADD CONSTRAINT bills_bill_type_check 
CHECK (bill_type IN ('one_time', 'recurring_fixed', 'recurring_variable', 'goal_linked', 'liability_linked'));

-- Add constraint: If liability_id is set, ensure amount and due_date are set
ALTER TABLE bills 
ADD CONSTRAINT check_liability_bill_required_fields 
CHECK (
  liability_id IS NULL OR 
  (amount IS NOT NULL AND amount > 0 AND due_date IS NOT NULL)
);

-- Add constraint: If interest_included is true, amount should equal principal + interest
ALTER TABLE bills 
ADD CONSTRAINT check_interest_included_consistency 
CHECK (
  interest_included IS FALSE OR 
  interest_amount IS NULL OR 
  principal_amount IS NULL OR 
  amount IS NULL OR
  ABS(amount - (principal_amount + interest_amount)) < 0.01
);

-- Add RLS policy for liability bills (already covered by existing policies, but ensure it works)
-- No additional RLS needed as existing policies check user_id

-- Function to validate bill date is within liability date range
CREATE OR REPLACE FUNCTION validate_liability_bill_date(
  p_bill_date DATE,
  p_liability_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  SELECT start_date, targeted_payoff_date
  INTO v_start_date, v_end_date
  FROM liabilities
  WHERE id = p_liability_id;
  
  IF v_start_date IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF p_bill_date < v_start_date THEN
    RETURN FALSE;
  END IF;
  
  IF v_end_date IS NOT NULL AND p_bill_date > v_end_date THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to generate bills for a liability
CREATE OR REPLACE FUNCTION generate_liability_bills(
  p_liability_id UUID,
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_frequency TEXT DEFAULT 'monthly',
  p_payment_amount DECIMAL(12,2),
  p_interest_rate DECIMAL(6,3),
  p_total_amount DECIMAL(14,2),
  p_interest_included BOOLEAN DEFAULT true,
  p_currency TEXT DEFAULT 'USD'
)
RETURNS INTEGER AS $$
DECLARE
  v_bill_count INTEGER := 0;
  v_current_date DATE;
  v_remaining_balance DECIMAL(14,2);
  v_payment_number INTEGER := 1;
  v_monthly_rate DECIMAL(10,8);
  v_interest_amount DECIMAL(12,2);
  v_principal_amount DECIMAL(12,2);
  v_bill_amount DECIMAL(12,2);
  v_liability_title TEXT;
  v_category_id UUID;
  v_days_to_add INTEGER;
BEGIN
  -- Get liability details
  SELECT title, category_id INTO v_liability_title, v_category_id
  FROM liabilities
  WHERE id = p_liability_id AND user_id = p_user_id;
  
  IF v_liability_title IS NULL THEN
    RAISE EXCEPTION 'Liability not found';
  END IF;
  
  -- Initialize
  v_current_date := p_start_date;
  v_remaining_balance := p_total_amount;
  v_monthly_rate := CASE 
    WHEN p_interest_rate > 0 THEN p_interest_rate / 12 / 100 
    ELSE 0 
  END;
  
  -- Calculate days to add based on frequency
  v_days_to_add := CASE p_frequency
    WHEN 'daily' THEN 1
    WHEN 'weekly' THEN 7
    WHEN 'bi-weekly' THEN 14
    WHEN 'monthly' THEN 30
    WHEN 'quarterly' THEN 90
    WHEN 'yearly' THEN 365
    ELSE 30
  END;
  
  -- Generate bills until end date or balance is zero
  WHILE v_current_date <= p_end_date AND v_remaining_balance > 0.01 LOOP
    -- Calculate interest for this payment
    IF v_monthly_rate > 0 THEN
      v_interest_amount := v_remaining_balance * v_monthly_rate * (v_days_to_add::DECIMAL / 30);
    ELSE
      v_interest_amount := 0;
    END IF;
    
    -- Calculate principal
    IF v_interest_included THEN
      -- Interest is included in payment amount
      v_principal_amount := p_payment_amount - v_interest_amount;
      v_bill_amount := p_payment_amount;
    ELSE
      -- Interest is separate
      v_principal_amount := p_payment_amount;
      v_bill_amount := p_payment_amount + v_interest_amount;
    END IF;
    
    -- Adjust for last payment
    IF v_remaining_balance <= v_principal_amount THEN
      v_principal_amount := v_remaining_balance;
      IF v_interest_included THEN
        v_bill_amount := v_principal_amount + v_interest_amount;
      ELSE
        v_bill_amount := v_principal_amount;
        -- Interest would be separate transaction
      END IF;
    END IF;
    
    -- Ensure principal is not negative
    IF v_principal_amount < 0 THEN
      v_principal_amount := 0;
    END IF;
    
    -- Create bill
    INSERT INTO bills (
      user_id,
      liability_id,
      title,
      description,
      amount,
      interest_amount,
      principal_amount,
      payment_number,
      interest_included,
      currency,
      category_id,
      bill_type,
      due_date,
      original_due_date,
      status,
      metadata,
      is_active,
      is_deleted
    ) VALUES (
      p_user_id,
      p_liability_id,
      v_liability_title || ' - Payment ' || v_payment_number,
      'Payment ' || v_payment_number || ' of ' || v_liability_title,
      v_bill_amount,
      v_interest_amount,
      v_principal_amount,
      v_payment_number,
      p_interest_included,
      p_currency,
      v_category_id,
      'liability_linked',
      v_current_date,
      v_current_date,
      'upcoming',
      jsonb_build_object(
        'principal_component', v_principal_amount,
        'interest_component', v_interest_amount,
        'payment_number', v_payment_number,
        'remaining_balance', v_remaining_balance - v_principal_amount
      ),
      true,
      false
    );
    
    -- Update for next iteration
    v_remaining_balance := v_remaining_balance - v_principal_amount;
    v_current_date := v_current_date + (v_days_to_add || ' days')::INTERVAL;
    v_payment_number := v_payment_number + 1;
    v_bill_count := v_bill_count + 1;
  END LOOP;
  
  RETURN v_bill_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-adjust bill amounts based on interest rate
CREATE OR REPLACE FUNCTION auto_adjust_liability_bills(
  p_liability_id UUID,
  p_user_id UUID,
  p_new_interest_rate DECIMAL(6,3)
)
RETURNS INTEGER AS $$
DECLARE
  v_bill_count INTEGER := 0;
  v_bill_record RECORD;
  v_monthly_rate DECIMAL(10,8);
  v_interest_amount DECIMAL(12,2);
  v_principal_amount DECIMAL(12,2);
  v_remaining_balance DECIMAL(14,2);
  v_liability_record RECORD;
BEGIN
  -- Get liability details
  SELECT * INTO v_liability_record
  FROM liabilities
  WHERE id = p_liability_id AND user_id = p_user_id;
  
  IF v_liability_record IS NULL THEN
    RAISE EXCEPTION 'Liability not found';
  END IF;
  
  -- Calculate monthly rate
  v_monthly_rate := CASE 
    WHEN p_new_interest_rate > 0 THEN p_new_interest_rate / 12 / 100 
    ELSE 0 
  END;
  
  -- Get current balance from liability
  v_remaining_balance := v_liability_record.current_balance;
  
  -- Update all pending bills
  FOR v_bill_record IN 
    SELECT * FROM bills
    WHERE liability_id = p_liability_id
      AND user_id = p_user_id
      AND status = 'upcoming'
      AND is_deleted = false
    ORDER BY due_date ASC
  LOOP
    -- Calculate new interest
    IF v_monthly_rate > 0 THEN
      v_interest_amount := v_remaining_balance * v_monthly_rate;
    ELSE
      v_interest_amount := 0;
    END IF;
    
    -- Calculate principal (keep original principal or recalculate)
    v_principal_amount := COALESCE(v_bill_record.principal_amount, v_bill_record.amount - v_interest_amount);
    
    -- Update bill
    UPDATE bills
    SET
      interest_amount = v_interest_amount,
      principal_amount = v_principal_amount,
      amount = CASE 
        WHEN v_bill_record.interest_included THEN v_principal_amount + v_interest_amount
        ELSE v_principal_amount
      END,
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{interest_component}',
        to_jsonb(v_interest_amount)
      ) || jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{principal_component}',
        to_jsonb(v_principal_amount)
      ) || jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{remaining_balance}',
        to_jsonb(v_remaining_balance - v_principal_amount)
      ),
      updated_at = NOW()
    WHERE id = v_bill_record.id;
    
    -- Update remaining balance
    v_remaining_balance := v_remaining_balance - v_principal_amount;
    v_bill_count := v_bill_count + 1;
  END LOOP;
  
  -- Update liability interest rate
  UPDATE liabilities
  SET
    interest_rate_apy = p_new_interest_rate,
    updated_at = NOW()
  WHERE id = p_liability_id AND user_id = p_user_id;
  
  RETURN v_bill_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View for liability bills with calculated status
CREATE OR REPLACE VIEW liability_bills_view AS
SELECT 
  b.*,
  l.title as liability_title,
  l.current_balance as liability_balance,
  l.interest_rate_apy,
  l.start_date as liability_start_date,
  l.targeted_payoff_date as liability_end_date,
  validate_liability_bill_date(b.due_date, b.liability_id) as date_valid
FROM bills b
LEFT JOIN liabilities l ON b.liability_id = l.id
WHERE b.liability_id IS NOT NULL
  AND b.is_deleted = false;

-- Grant access to view
GRANT SELECT ON liability_bills_view TO authenticated;

