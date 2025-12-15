-- Migration 026: Update liability_type constraint to include new types
-- Created: 2025-01-30
-- Purpose: Add support for 'loan', 'emi', and 'line_of_credit' liability types

-- Drop the old constraint
ALTER TABLE liabilities DROP CONSTRAINT IF EXISTS liabilities_liability_type_check;

-- Add new constraint with all supported types
ALTER TABLE liabilities ADD CONSTRAINT liabilities_liability_type_check 
  CHECK (liability_type IN (
    'credit_card', 
    'personal_loan', 
    'auto_loan', 
    'student_loan', 
    'medical', 
    'mortgage', 
    'loan',          -- Generic loan type
    'emi',           -- EMI purchase
    'line_of_credit', -- Overdraft/Line of credit
    'other'
  ));






















