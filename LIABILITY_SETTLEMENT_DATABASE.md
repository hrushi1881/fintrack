# Liability Settlement - Database Requirements

## 📊 Database Overview

The liability settlement feature uses existing database tables and functions. No new migrations are strictly required, but a verification migration is provided to ensure all dependencies exist.

## ✅ Required Database Tables

### 1. `liabilities` Table
**Migration**: `011_create_liabilities_system.sql`

**Required Fields for Settlement**:
- `id` (UUID) - Primary key
- `user_id` (UUID) - Owner of liability
- `current_balance` (DECIMAL) - Remaining amount owed
- `original_amount` (DECIMAL) - Total loan amount
- `disbursed_amount` (DECIMAL) - Amount disbursed/borrowed
- `currency` (TEXT) - Currency code
- `is_deleted` (BOOLEAN) - Soft delete flag
- `deleted_at` (TIMESTAMP) - Deletion timestamp
- `is_active` (BOOLEAN) - Active status

**Usage in Settlement**:
- Check remaining balance vs liability funds
- Update `current_balance` during repayments
- Soft delete (`is_deleted = true`) after settlement

### 2. `account_liability_portions` Table
**Migration**: `012_create_account_liability_portions.sql`

**Required Fields for Settlement**:
- `id` (UUID) - Primary key
- `account_id` (UUID) - Account holding liability funds
- `liability_id` (UUID) - Linked liability
- `liability_account_id` (UUID) - Liability account (required by schema, but not used in settlement)
- `amount` (DECIMAL) - Amount of liability funds in account
- `notes` (TEXT) - Optional notes

**Usage in Settlement**:
- Query all liability funds across accounts
- Update/delete portions during refunds/conversions
- Track which accounts hold liability funds

### 3. `accounts` Table
**Required Fields**:
- `id` (UUID) - Primary key
- `user_id` (UUID) - Owner
- `balance` (DECIMAL) - Account balance
- `currency` (TEXT) - Currency code
- `type` (TEXT) - Account type

**Usage in Settlement**:
- Update balances during repayments/refunds
- Filter accounts for adjustment selection
- Verify account ownership

### 4. `transactions` Table
**Required Fields**:
- `id` (UUID) - Primary key
- `user_id` (UUID) - Owner
- `account_id` (UUID) - Account
- `amount` (DECIMAL) - Transaction amount
- `currency` (TEXT) - Currency code
- `type` (TEXT) - 'income', 'expense', 'transfer'
- `description` (TEXT) - Transaction description
- `date` (DATE) - Transaction date
- `metadata` (JSONB) - Additional data (stores settlement info)
- `balance_before` (DECIMAL) - Balance before transaction
- `balance_after` (DECIMAL) - Balance after transaction

**Usage in Settlement**:
- Create transaction records for all adjustments
- Store settlement metadata in `metadata` field
- Audit trail for settlement operations

## 🔧 Required RPC Functions

### 1. `repay_liability`
**Migration**: `016_update_rpcs_with_balance_snapshots.sql`

**Signature**:
```sql
repay_liability(
  p_user_id uuid,
  p_account_id uuid,
  p_liability_id uuid,
  p_amount numeric,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text
)
RETURNS void
```

**Purpose**:
- Record a liability repayment
- Reduce account balance
- Reduce liability `current_balance`
- Create transaction record
- Capture balance snapshots

**Usage in Settlement**:
- Used for "Repayment" adjustment type
- Automatically handles balance updates and transaction creation

**Note**: This function may try to insert into `liability_activity_log` table, which might not exist. The function will work regardless, but the activity log insert will fail silently if the table doesn't exist (this is handled in the settlement code).

## 📋 Optional Database Components

### `liability_activity_log` Table
**Status**: Optional (not required for settlement)

**Purpose**: Activity logging for liabilities

**Usage**: 
- The `repay_liability` function may try to log activities here
- Settlement feature does NOT require this table
- If it doesn't exist, activity log inserts are skipped

## 🎯 Database Operations in Settlement

### 1. Settlement Status Check
```sql
-- Get liability details
SELECT current_balance, original_amount, currency
FROM liabilities
WHERE id = :liability_id AND user_id = :user_id;

-- Get liability funds in accounts
SELECT account_id, amount, account.name
FROM account_liability_portions
JOIN accounts ON account_liability_portions.account_id = accounts.id
WHERE liability_id = :liability_id;
```

### 2. Repayment Adjustment
```sql
-- Uses RPC function
SELECT repay_liability(
  :user_id,
  :account_id,
  :liability_id,
  :amount,
  :date,
  :notes
);
```

### 3. Refund Adjustment
```sql
-- Update account balance
UPDATE accounts
SET balance = balance - :amount
WHERE id = :account_id;

-- Update/delete liability portion
UPDATE account_liability_portions
SET amount = amount - :amount
WHERE account_id = :account_id AND liability_id = :liability_id;

-- Delete if amount becomes zero
DELETE FROM account_liability_portions
WHERE account_id = :account_id 
  AND liability_id = :liability_id
  AND amount <= 0;

-- Create transaction record
INSERT INTO transactions (...)
VALUES (...);
```

### 4. Convert to Personal
```sql
-- Update/delete liability portion (no balance change)
UPDATE account_liability_portions
SET amount = amount - :amount
WHERE account_id = :account_id AND liability_id = :liability_id;

-- Create transaction record (amount = 0)
INSERT INTO transactions (amount = 0, type = 'transfer', ...)
VALUES (...);
```

### 5. Expense Write-off
```sql
-- Update account balance
UPDATE accounts
SET balance = balance - :amount
WHERE id = :account_id;

-- Update/delete liability portion
UPDATE account_liability_portions
SET amount = amount - :amount
WHERE account_id = :account_id AND liability_id = :liability_id;

-- Create expense transaction
INSERT INTO transactions (amount = -:amount, type = 'expense', ...)
VALUES (...);
```

### 6. Final Deletion
```sql
-- Soft delete liability
UPDATE liabilities
SET 
  is_deleted = true,
  deleted_at = NOW(),
  is_active = false,
  updated_at = NOW()
WHERE id = :liability_id AND user_id = :user_id;
```

## 🔍 Verification Migration

**File**: `020_verify_liability_settlement_requirements.sql`

**Purpose**:
- Verify all required tables exist
- Verify required columns exist
- Verify RPC functions exist
- Create helpful views for settlement status
- Create performance indexes

**Run this migration to**:
1. Ensure all dependencies are met
2. Create `liability_settlement_status` view for easy status checks
3. Add performance indexes for settlement queries

## 📊 Settlement Status View

The verification migration creates a view `liability_settlement_status` that provides:

- `liability_id` - Liability ID
- `user_id` - Owner
- `title` - Liability title
- `remaining_owed` - Current balance
- `total_loan` - Original amount
- `liability_funds_in_accounts` - Total funds in accounts
- `accounts_with_funds` - Number of accounts
- `is_balanced` - Whether liability is balanced
- `needs_settlement` - Whether settlement is needed
- `overfunded_by` - Amount overfunded (if any)

## ⚠️ Important Notes

1. **Soft Delete**: Liabilities are soft-deleted (`is_deleted = true`), not hard-deleted. This preserves history.

2. **Transaction Records**: All settlement operations create transaction records for audit trail.

3. **Balance Snapshots**: Transaction records include `balance_before` and `balance_after` for accurate tracking.

4. **Activity Log**: The `liability_activity_log` table is optional. If it doesn't exist, activity logging is skipped.

5. **Currency Matching**: Settlement operations require currency matching between liability and accounts.

6. **RLS Policies**: All operations respect Row Level Security (RLS) policies to ensure users can only access their own data.

7. **Atomic Operations**: Settlement operations should be performed in sequence, but individual operations (like RPC calls) are atomic.

## 🚀 Migration Order

If setting up from scratch, run migrations in this order:

1. `011_create_liabilities_system.sql` - Creates liabilities table
2. `012_create_account_liability_portions.sql` - Creates liability portions table
3. `016_update_rpcs_with_balance_snapshots.sql` - Creates/updates RPC functions
4. `020_verify_liability_settlement_requirements.sql` - Verifies and enhances (optional but recommended)

## ✅ Testing Checklist

- [ ] `liabilities` table exists with required columns
- [ ] `account_liability_portions` table exists
- [ ] `accounts` table exists
- [ ] `transactions` table exists with `metadata` and balance snapshot columns
- [ ] `repay_liability` RPC function exists
- [ ] RLS policies are in place
- [ ] Indexes are created for performance
- [ ] Settlement status view works (if migration 020 is applied)

