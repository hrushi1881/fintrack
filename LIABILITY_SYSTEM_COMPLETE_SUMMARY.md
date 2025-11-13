# Liability System - Complete Technical Summary

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Database Architecture](#database-architecture)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Functions (RPCs)](#backend-functions-rpcs)
5. [Core Features](#core-features)
6. [Data Flow & Business Logic](#data-flow--business-logic)
7. [Integration Points](#integration-points)
8. [Key Components](#key-components)

---

## System Overview

The Liability System in FinTrack is a comprehensive debt management solution that allows users to:
- Track various types of liabilities (loans, EMIs, one-time debts)
- Manage liability funds within regular accounts
- Record payments and draw funds
- Settle liabilities with proper balance reconciliation
- Monitor payoff progress and payment history

### Core Concepts

1. **Liability**: A debt obligation (loan, credit card, etc.)
2. **Liability Portions**: Funds from a liability that are allocated to regular accounts
3. **Account Balance Breakdown**: Each account balance can be split into:
   - Personal funds (actual money you own)
   - Liability portions (borrowed money)
   - Goal portions (saved money)
4. **Settlement**: Process of reconciling and closing a liability before deletion

---

## Database Architecture

### Core Tables

#### 1. `liabilities` Table
**Purpose**: Stores all liability/debt information

**Key Fields**:
```sql
- id (UUID) - Primary key
- user_id (UUID) - Owner
- title (TEXT) - Liability name
- description (TEXT) - Optional description
- liability_type (TEXT) - Type: 'credit_card', 'personal_loan', 'auto_loan', 'student_loan', 'medical', 'mortgage', 'other'
- currency (TEXT) - Currency code (default: 'USD')

-- Financial Fields
- disbursed_amount (DECIMAL) - Amount already drawn/disbursed
- original_amount (DECIMAL) - Total loan amount
- current_balance (DECIMAL) - Remaining amount owed
- interest_rate_apy (DECIMAL) - Annual interest rate
- interest_type (TEXT) - 'reducing', 'fixed', 'none'
- minimum_payment (DECIMAL) - Minimum payment required
- periodical_payment (DECIMAL) - Regular payment amount (EMI)
- periodical_frequency (TEXT) - Payment frequency

-- Credit Card Specific
- credit_limit (DECIMAL) - Credit limit
- due_day_of_month (INTEGER) - Day of month payment is due

-- Loan Specific
- loan_term_months (INTEGER) - Loan term in months
- loan_term_years (INTEGER) - Loan term in years

-- Dates
- start_date (DATE) - When liability started
- targeted_payoff_date (DATE) - Target payoff date
- next_due_date (DATE) - Next payment due date
- last_payment_date (DATE) - Last payment made
- paid_off_date (DATE) - When liability was paid off

-- Links
- linked_account_id (UUID) - Linked account
- category_id (UUID) - Category for categorization

-- Status
- status (TEXT) - 'active', 'paid_off', 'paused', 'overdue'
- is_active (BOOLEAN) - Active flag
- is_deleted (BOOLEAN) - Soft delete flag
- deleted_at (TIMESTAMP) - Deletion timestamp

-- Visual
- color (TEXT) - Display color
- icon (TEXT) - Display icon

-- Metadata
- metadata (JSONB) - Additional data (EMI details, one-time debt info, etc.)
- notes (TEXT) - Additional notes
```

**Indexes**:
- `idx_liabilities_user_id` - User queries
- `idx_liabilities_status` - Status filtering
- `idx_liabilities_type` - Type filtering
- `idx_liabilities_next_due_date` - Due date queries
- `idx_liabilities_is_active` - Active filtering
- `idx_liabilities_is_deleted` - Deleted filtering

**RLS Policies**:
- Users can only access their own liabilities
- All CRUD operations are user-scoped

#### 2. `liability_payments` Table
**Purpose**: Tracks all payments made against liabilities

**Key Fields**:
```sql
- id (UUID) - Primary key
- user_id (UUID) - Owner
- liability_id (UUID) - Related liability
- account_id (UUID) - Account used for payment
- category_id (UUID) - Category for payment

-- Payment Details
- payment_type (TEXT) - 'scheduled', 'manual', 'prepayment', 'mock', 'historical'
- amount (DECIMAL) - Payment amount
- interest_component (DECIMAL) - Interest portion of payment
- principal_component (DECIMAL) - Principal portion of payment

-- Tracking
- payment_date (DATE) - Payment date
- description (TEXT) - Payment description
- reference_number (TEXT) - Reference number
- is_mock (BOOLEAN) - Whether payment affects balances
- method (TEXT) - 'import_snapshot', 'historical_import', 'manual', 'auto_pay'

-- Transaction Link
- transaction_id (UUID) - Related transaction record
```

**Indexes**:
- `idx_liability_payments_user_id` - User queries
- `idx_liability_payments_liability_id` - Liability payments
- `idx_liability_payments_date` - Date queries
- `idx_liability_payments_type` - Payment type filtering

#### 3. `account_liability_portions` Table
**Purpose**: Tracks liability funds allocated to regular accounts

**Key Fields**:
```sql
- id (UUID) - Primary key
- account_id (UUID) - Account holding the funds
- liability_id (UUID) - Source liability
- liability_account_id (UUID) - Liability account (required by schema, may not be used)
- amount (DECIMAL) - Amount of liability funds in account
- notes (TEXT) - Optional notes
```

**Purpose**: 
- Tracks which accounts hold funds from which liabilities
- Enables account balance breakdown (personal vs borrowed vs goal funds)
- Allows repayment from liability portions

**Indexes**:
- `idx_account_liability_portions_account_id` - Account queries
- `idx_account_liability_portions_liability_id` - Liability queries
- `idx_account_liability_portions_settlement` - Settlement queries

#### 4. `liability_schedules` Table
**Purpose**: Stores scheduled future payments (future feature)

**Key Fields**:
```sql
- id (UUID) - Primary key
- user_id (UUID) - Owner
- liability_id (UUID) - Related liability
- account_id (UUID) - Payment account
- due_date (DATE) - Due date
- amount (DECIMAL) - Payment amount
- auto_pay (BOOLEAN) - Auto-pay enabled
- reminder_days (INTEGER[]) - Reminder days
- status (TEXT) - 'pending', 'completed', 'cancelled', 'overdue'
```

#### 5. `liability_adjustments` Table
**Purpose**: Audit log for liability modifications

**Key Fields**:
```sql
- id (UUID) - Primary key
- user_id (UUID) - Owner
- liability_id (UUID) - Related liability
- adjustment_type (TEXT) - 'extend', 'reduce', 'restructure', 'top_up', 'interest_capitalization', 'fee'
- amount (DECIMAL) - Adjustment amount
- reason (TEXT) - Reason for adjustment
- effective_date (DATE) - When adjustment takes effect
- old_values (JSONB) - Previous values
- new_values (JSONB) - New values
```

#### 6. `liability_calculations` Table
**Purpose**: Cached calculations for performance

**Key Fields**:
```sql
- id (UUID) - Primary key
- liability_id (UUID) - Related liability (unique)
- monthly_interest (DECIMAL) - Monthly interest amount
- total_interest_paid (DECIMAL) - Total interest paid
- total_principal_paid (DECIMAL) - Total principal paid
- payoff_months (INTEGER) - Months until payoff
- payoff_date (DATE) - Projected payoff date
- days_until_due (INTEGER) - Days until next payment
- calculated_at (TIMESTAMP) - When calculated
```

**Triggers**: Auto-refreshed when liability or payment changes

#### 7. `liability_activity_log` Table (Optional)
**Purpose**: Activity logging for liabilities

**Status**: Optional - not required for core functionality
**Usage**: Logs activities like draws, repayments, adjustments

---

## Frontend Architecture

### Main Screens

#### 1. Liabilities List Screen (`app/(tabs)/liabilities.tsx`)
**Purpose**: Display all liabilities with summary metrics

**Features**:
- Summary card showing:
  - Total outstanding balance
  - Total monthly payments
  - Active liabilities count
  - Average interest rate
- Segmented control: "Upcoming" vs "All"
- Liability cards showing:
  - Title and type
  - Current balance
  - Monthly payment
  - Progress bar (paid vs owed)
  - Due date and days until due
  - Status badge (active, paid off, overdue, paused)
- Empty states for no liabilities
- Add liability button

**Key Logic**:
- Filters liabilities by status and due date
- Calculates summary metrics from all liabilities
- Sorts upcoming liabilities by due date
- Calculates progress percentage

#### 2. Liability Detail Screen (`app/liability/[id].tsx`)
**Purpose**: Detailed view of a single liability

**Features**:
- Hero card with current outstanding balance
- Metric cards:
  - Total amount
  - Minimum payment
  - Interest rate
  - Next payment due
- Payoff progress section (placeholder for graph)
- Transaction history (payment list)
- Linked accounts (accounts holding liability funds)
- Recent activity log
- Action buttons:
  - Draw funds
  - Make payment
  - Delete liability (with settlement check)

**Key Logic**:
- Loads liability details, payments, allocations, and activity
- Calculates available funds to draw
- Checks settlement status before deletion
- Shows settlement modal if needed

### Modals

#### 1. Add Liability Modal (`app/modals/add-liability.tsx`)
**Purpose**: Create a new liability with multi-step wizard

**Steps**:
1. **Select Type**: Loan, EMI, or One-time Debt
2. **Amount Owed**: 
   - Liability name
   - Amount owed (required)
   - Original amount (optional)
   - Interest rate (optional)
   - Description (optional)
   - Start date (optional, defaults to today)
   - Target payoff date (optional)
   - Type-specific fields (EMI details, one-time debt info)
3. **Money Received?**: 
   - Yes: Money went into tracked accounts
   - No: Just tracking debt (no funds allocated)
4. **Allocate Funds** (if money received):
   - Total amount received
   - Distribute to accounts
   - Allocation descriptions
5. **Review & Create**: Summary and final creation

**Key Logic**:
- Validates all inputs
- Maps frontend types to database types
- Creates liability record
- Allocates funds to accounts if provided
- Records initial payments if provided
- Updates account balances
- Creates liability portions
- Logs activity

#### 2. Pay Liability Modal (`app/modals/pay-liability.tsx`)
**Purpose**: Record a payment against a liability

**Features**:
- Liability info display
- Account selection
- Fund source selection (FundPicker):
  - Personal funds
  - Liability funds (from same liability)
- Payment amount input
- Payment date picker
- Description input
- Mock payment toggle (data only, no balance change)

**Key Logic**:
- Fetches liability and accounts
- Shows fund picker for account breakdown
- Validates fund source (only personal or same liability)
- Calls appropriate RPC:
  - Personal funds: `repay_liability`
  - Liability funds: `settle_liability_portion`
- Refreshes data after payment

#### 3. Draw Liability Funds Modal (`app/modals/draw-liability-funds.tsx`)
**Purpose**: Draw funds from a liability into accounts

**Features**:
- Liability info with available amount
- Date selection
- Account distribution:
  - Multiple accounts
  - Amount per account
  - Total distribution calculation
- Category selection
- Notes input
- Overdraw handling (raises limit if needed)

**Key Logic**:
- Calculates available funds (original_amount - disbursed_amount)
- Validates distributions sum equals received amount
- Handles overdraw (increases original_amount if needed)
- Calls `draw_liability_funds` RPC
- Updates account balances and liability portions
- Creates income transactions
- Updates disbursed_amount

#### 4. Liability Settlement Modal (`app/modals/liability-settlement.tsx`)
**Purpose**: Settle and delete a liability with balance reconciliation

**Features**:
- Settlement status check:
  - Remaining owed
  - Liability funds in accounts
  - Overfunded amount
- Adjustment transactions:
  - Repayment (reduce liability balance)
  - Refund (remove liability funds from account)
  - Convert to personal (reclassify funds)
  - Expense write-off (mark as spent)
- Projected balances calculation
- Final action for unaccounted amounts:
  - Forgive debt (convert to personal)
  - Erase funds (remove from accounts)
- Final preview with confirmation
- DELETE confirmation

**Key Logic**:
- Checks settlement status
- Allows adding adjustment transactions
- Calculates projected balances
- Handles unaccounted amounts
- Executes all adjustments
- Soft deletes liability
- Creates transaction records for audit

### Context Provider

#### LiabilitiesContext (`contexts/LiabilitiesContext.tsx`)
**Purpose**: Centralized state management for liabilities

**Functions**:
- `fetchLiabilities()` - Load all liabilities
- `createLiability()` - Create new liability with allocations
- `updateLiability()` - Update liability details
- `deleteLiability()` - Soft delete liability
- `allocateReceivedFunds()` - Allocate funds to accounts
- `recordInitialPayments()` - Record historical payments
- `getAccountBreakdown()` - Get account balance breakdown
- `fetchLiabilityAllocations()` - Get liability allocations
- `fetchLiability()` - Get single liability
- `convertLiabilityToPersonal()` - Convert liability funds to personal
- `getAccountsWithLiabilityPortions()` - Get all accounts with liability portions

**Key Logic**:
- Manages liability state
- Handles fund allocation to accounts
- Updates account balances
- Creates liability portions
- Handles payment recording
- Manages account breakdown calculations

### Utility Functions

#### Liability Utilities (`utils/liabilities.ts`)
**Purpose**: Helper functions for liability operations

**Functions**:
- `checkLiabilitySettlementStatus()` - Check if liability is balanced
- `executeLiabilitySettlement()` - Execute settlement with adjustments

**Key Logic**:
- Calculates settlement status
- Handles different adjustment types
- Updates balances and portions
- Creates transaction records
- Soft deletes liability

---

## Backend Functions (RPCs)

### 1. `repay_liability`
**Purpose**: Record a liability repayment from personal funds

**Parameters**:
```sql
- p_user_id (UUID) - User ID
- p_account_id (UUID) - Account used for payment
- p_liability_id (UUID) - Liability being paid
- p_amount (NUMERIC) - Payment amount
- p_date (DATE) - Payment date (default: today)
- p_notes (TEXT) - Optional notes
```

**Logic**:
1. Validates account ownership and balance
2. Captures balance_before
3. Reduces account balance
4. Reduces liability current_balance
5. Captures balance_after
6. Creates expense transaction with balance snapshots
7. Logs activity (if table exists)
8. Updates liability status if paid off

**Returns**: void

**Transaction Created**: Expense transaction with metadata `{liability_id, bucket: 'repay'}`

### 2. `settle_liability_portion`
**Purpose**: Pay liability using liability portion funds from same liability

**Parameters**:
```sql
- p_user_id (UUID) - User ID
- p_account_id (UUID) - Account with liability portion
- p_liability_id (UUID) - Liability being paid
- p_amount (NUMERIC) - Payment amount
- p_date (DATE) - Payment date (default: today)
- p_notes (TEXT) - Optional notes
```

**Logic**:
1. Validates liability portion exists and has sufficient funds
2. Captures balance_before
3. Reduces account balance
4. Reduces liability portion amount
5. Deletes portion if amount becomes zero
6. Reduces liability current_balance
7. Captures balance_after
8. Creates expense transaction with balance snapshots

**Returns**: void

**Transaction Created**: Expense transaction with metadata `{liability_source_id, spent_from_liability_portion: true}`

### 3. `draw_liability_funds`
**Purpose**: Draw funds from liability into accounts

**Parameters**:
```sql
- p_user_id (UUID) - User ID
- p_liability_id (UUID) - Liability to draw from
- p_distributions (JSONB) - Array of {account_id, amount}
- p_date (DATE) - Draw date (default: today)
- p_notes (TEXT) - Optional notes
- p_category_id (UUID) - Optional category
```

**Logic**:
1. Gets liability original_amount and disbursed_amount
2. Calculates available funds
3. Sums requested draw amount
4. If overdraw: increases original_amount and current_balance
5. For each distribution:
   - Validates account ownership
   - Captures balance_before
   - Increases account balance
   - Upserts liability portion (adds to existing or creates new)
   - Captures balance_after
   - Creates income transaction with balance snapshots
6. Updates disbursed_amount
7. Logs draw activity

**Returns**: void

**Transactions Created**: Income transactions for each account with metadata `{liability_id, bucket: 'liability_draw'}`

### 4. Helper Functions

#### `calculate_liability_interest`
**Purpose**: Calculate interest for a given balance and rate

**Parameters**:
- `p_balance` (DECIMAL) - Current balance
- `p_interest_rate_apy` (DECIMAL) - Annual interest rate
- `p_days` (INTEGER) - Number of days (default: 30)

**Returns**: DECIMAL - Interest amount

#### `calculate_payoff_months`
**Purpose**: Calculate months until payoff

**Parameters**:
- `p_balance` (DECIMAL) - Current balance
- `p_monthly_payment` (DECIMAL) - Monthly payment
- `p_interest_rate_apy` (DECIMAL) - Annual interest rate

**Returns**: INTEGER - Months until payoff

#### `refresh_liability_calculations`
**Purpose**: Refresh cached calculations for a liability

**Parameters**:
- `p_liability_id` (UUID) - Liability ID

**Logic**:
1. Gets liability details
2. Calculates payment totals (interest, principal)
3. Calculates days until due
4. Calculates monthly interest
5. Calculates payoff months and date
6. Upserts calculations cache
7. Auto-marks as paid off if balance is zero

**Triggers**: Automatically triggered on liability or payment changes

---

## Core Features

### 1. Liability Creation
**Flow**:
1. User selects liability type (Loan, EMI, One-time)
2. Enters basic info (name, amount, interest rate, etc.)
3. Indicates if money was received into accounts
4. If received: allocates funds to accounts
5. Optionally records initial payments
6. Creates liability record
7. Updates account balances
8. Creates liability portions

**Key Points**:
- Supports three liability types with type-specific fields
- Handles funds allocation during creation
- Supports historical payment recording
- Maps frontend types to database types

### 2. Fund Drawing
**Flow**:
1. User selects liability
2. Views available funds (original_amount - disbursed_amount)
3. Distributes funds to multiple accounts
4. System validates distribution
5. Handles overdraw (increases limit if needed)
6. Updates account balances
7. Creates liability portions
8. Updates disbursed_amount
9. Creates income transactions

**Key Points**:
- Allows drawing funds into multiple accounts
- Handles overdraw by increasing original_amount
- Creates liability portions for tracking
- Creates income transactions for each account

### 3. Payment Recording
**Flow**:
1. User selects liability and account
2. Selects fund source (personal or liability portion)
3. Enters payment amount and date
4. System validates fund availability
5. Calls appropriate RPC:
   - Personal: `repay_liability`
   - Liability: `settle_liability_portion`
6. Updates account balance
7. Updates liability balance
8. Updates liability portion (if applicable)
9. Creates expense transaction
10. Updates liability status if paid off

**Key Points**:
- Supports payment from personal or liability funds
- Different RPCs for different fund sources
- Automatically updates all related balances
- Creates transaction records for audit

### 4. Account Balance Breakdown
**Concept**:
Each account balance is conceptually split into:
- **Personal Funds**: Actual money you own
- **Liability Portions**: Borrowed money from liabilities
- **Goal Portions**: Saved money for goals

**Calculation**:
```typescript
totalBalance = account.balance
liabilityPortions = sum(account_liability_portions.amount where account_id = account.id)
goalPortions = sum(account_goal_portions.amount where account_id = account.id)
personalFunds = totalBalance - liabilityPortions - goalPortions
```

**Usage**:
- Fund picker shows breakdown
- Payment modal shows available funds by source
- Prevents spending liability funds on non-liability expenses
- Allows repayment from liability portions

### 5. Liability Settlement
**Purpose**: Properly close a liability before deletion

**Flow**:
1. User attempts to delete liability
2. System checks settlement status:
   - Remaining owed
   - Liability funds in accounts
   - Overfunded amount
3. If unbalanced: shows settlement modal
4. User adds adjustment transactions:
   - Repayment: reduce liability balance
   - Refund: remove liability funds
   - Convert to personal: reclassify funds
   - Expense write-off: mark as spent
5. System calculates projected balances
6. User handles unaccounted amounts:
   - Forgive debt: convert to personal
   - Erase funds: remove from accounts
7. User confirms deletion
8. System executes all adjustments
9. System soft deletes liability

**Key Points**:
- Ensures balances are reconciled before deletion
- Supports multiple adjustment types
- Handles unaccounted amounts
- Creates transaction records for audit
- Soft deletes (preserves history)

### 6. Payment History
**Features**:
- Lists all payments for a liability
- Shows payment amount, date, description
- Marks mock/historical payments
- Links to transactions
- Calculates total paid
- Shows interest vs principal breakdown

### 7. Liability Tracking
**Features**:
- Status tracking (active, paid off, paused, overdue)
- Due date tracking
- Payment reminders
- Progress tracking (paid vs owed)
- Interest calculations
- Payoff projections

---

## Data Flow & Business Logic

### Creating a Liability with Fund Allocation

```
1. User fills form → createLiability()
2. Create liability record in database
3. If allocations provided:
   a. For each allocation:
      - Create/update account_liability_portions
      - Update account.balance (+amount)
   b. Update liability.disbursed_amount
   c. Create activity log entry
4. If initial payments provided:
   a. For each payment:
      - Create liability_payment record
      - If affect_balance: update account.balance (-amount)
      - Update liability.current_balance (-amount)
      - Update liability portion (-amount)
      - Create transaction record
5. Refresh liabilities list
```

### Drawing Funds

```
1. User selects liability and accounts → draw_liability_funds RPC
2. Calculate available: original_amount - disbursed_amount
3. If overdraw: increase original_amount and current_balance
4. For each distribution:
   a. Validate account ownership
   b. Update account.balance (+amount)
   c. Upsert account_liability_portions (+amount)
   d. Create income transaction
5. Update liability.disbursed_amount (+total)
6. Create activity log entry
7. Refresh data
```

### Making a Payment (Personal Funds)

```
1. User selects liability, account, amount → repay_liability RPC
2. Validate account balance >= amount
3. Update account.balance (-amount)
4. Update liability.current_balance (-amount)
5. Create expense transaction
6. Create liability_payment record
7. Log activity (if table exists)
8. Update liability status if paid off
9. Refresh data
```

### Making a Payment (Liability Funds)

```
1. User selects liability, account, liability portion → settle_liability_portion RPC
2. Validate liability portion >= amount
3. Update account.balance (-amount)
4. Update account_liability_portions.amount (-amount)
5. Delete portion if amount becomes zero
6. Update liability.current_balance (-amount)
7. Create expense transaction
8. Create liability_payment record
9. Refresh data
```

### Settlement Process

```
1. User attempts delete → checkLiabilitySettlementStatus()
2. Calculate:
   - remainingOwed = liability.current_balance
   - liabilityFundsInAccounts = sum(account_liability_portions.amount)
   - isBalanced = (remainingOwed == 0 && liabilityFundsInAccounts == 0)
3. If not balanced: show settlement modal
4. User adds adjustments:
   - Repayment: repay_liability RPC
   - Refund: manual balance and portion updates
   - Convert to personal: update portion only
   - Expense write-off: update balance and portion
5. Calculate projected balances
6. Handle unaccounted amounts:
   - Forgive debt: update liability.current_balance
   - Erase funds: update account balances and portions
7. Execute executeLiabilitySettlement()
8. Soft delete liability
9. Refresh data
```

---

## Integration Points

### 1. Accounts System
**Integration**:
- Account balances are updated when drawing/repaying
- Liability portions are tracked in `account_liability_portions`
- Account balance breakdown includes liability portions
- Fund picker shows liability portions in accounts

### 2. Transactions System
**Integration**:
- All liability operations create transaction records
- Transactions have metadata linking to liabilities
- Transaction types: 'income' (draws), 'expense' (payments)
- Balance snapshots are stored in transactions

### 3. Categories System
**Integration**:
- Liabilities can be linked to categories
- Payments can be categorized
- Draws can be categorized
- Categories support 'liability' activity type

### 4. Goals System
**Integration**:
- Similar fund tracking model (goal portions)
- Fund picker shows both liability and goal portions
- Accounts can hold both liability and goal funds

### 5. Bills System
**Integration**:
- Similar payment tracking model
- Both use transaction system
- Both support recurring payments

---

## Key Components

### Frontend Components

1. **LiabilitiesScreen** (`app/(tabs)/liabilities.tsx`)
   - Main list view
   - Summary metrics
   - Filtering and sorting

2. **LiabilityDetailScreen** (`app/liability/[id].tsx`)
   - Detail view
   - Payment history
   - Linked accounts
   - Action buttons

3. **AddLiabilityModal** (`app/modals/add-liability.tsx`)
   - Multi-step wizard
   - Type selection
   - Fund allocation
   - Payment recording

4. **PayLiabilityModal** (`app/modals/pay-liability.tsx`)
   - Payment recording
   - Fund source selection
   - Amount and date input

5. **DrawLiabilityFundsModal** (`app/modals/draw-liability-funds.tsx`)
   - Fund drawing
   - Account distribution
   - Overdraw handling

6. **LiabilitySettlementModal** (`app/modals/liability-settlement.tsx`)
   - Settlement process
   - Adjustment transactions
   - Balance reconciliation

7. **LiabilitiesContext** (`contexts/LiabilitiesContext.tsx`)
   - State management
   - CRUD operations
   - Fund allocation
   - Account breakdown

8. **Liability Utilities** (`utils/liabilities.ts`)
   - Settlement status check
   - Settlement execution
   - Adjustment handling

### Backend Components

1. **Database Tables**:
   - `liabilities` - Main liability records
   - `liability_payments` - Payment history
   - `account_liability_portions` - Fund tracking
   - `liability_schedules` - Scheduled payments
   - `liability_adjustments` - Adjustment log
   - `liability_calculations` - Cached calculations

2. **RPC Functions**:
   - `repay_liability` - Repayment from personal funds
   - `settle_liability_portion` - Repayment from liability funds
   - `draw_liability_funds` - Draw funds into accounts
   - `calculate_liability_interest` - Interest calculation
   - `calculate_payoff_months` - Payoff calculation
   - `refresh_liability_calculations` - Refresh cache

3. **Triggers**:
   - Auto-refresh calculations on liability/payment changes
   - Auto-update timestamps
   - Auto-mark as paid off when balance is zero

4. **Views**:
   - `liability_settlement_status` - Settlement status view

---

## Key Business Rules

### 1. Fund Allocation Rules
- Liability funds are tracked separately from personal funds
- Account balance = personal funds + liability portions + goal portions
- Liability portions can only be used to pay the same liability
- Personal funds can be used for any purpose

### 2. Payment Rules
- Payments reduce both account balance and liability balance
- Payments from liability portions also reduce the portion amount
- Payments create transaction records for audit
- Mock payments don't affect balances but are recorded

### 3. Drawing Rules
- Can only draw up to original_amount
- Overdraw increases original_amount and current_balance
- Draws create liability portions in accounts
- Draws create income transactions

### 4. Settlement Rules
- Liabilities must be balanced before deletion
- Balanced means: remainingOwed == 0 && liabilityFundsInAccounts == 0
- Unaccounted amounts must be handled (forgive or erase)
- All adjustments create transaction records
- Liabilities are soft-deleted (preserves history)

### 5. Balance Rules
- Account balances are always updated atomically
- Balance snapshots are stored in transactions
- Liability portions are updated separately from account balances
- All operations are validated for sufficient funds

---

## Security & Data Integrity

### 1. Row Level Security (RLS)
- All tables have RLS policies
- Users can only access their own data
- All RPCs check user ownership
- Account access is validated in all operations

### 2. Data Validation
- All amounts are validated (>= 0)
- Account balances are checked before operations
- Liability portions are checked before operations
- Currency matching is enforced

### 3. Transaction Integrity
- All operations are atomic (RPC level)
- Balance snapshots are captured
- Transaction records are created for audit
- Soft deletes preserve history

### 4. Error Handling
- All operations validate inputs
- Insufficient funds are checked
- Account ownership is verified
- Errors are properly handled and reported

---

## Future Enhancements

### Planned Features
1. **Interest Calculations**: Real-time interest accrual
2. **Payment Scheduling**: Automatic payment scheduling
3. **Payoff Strategies**: Debt snowball/avalanche strategies
4. **Credit Score Integration**: Credit score tracking
5. **Payment Reminders**: Automated reminders
6. **Debt Consolidation**: Consolidation tools
7. **Analytics**: Spending insights and recommendations

### Technical Improvements
1. **Performance**: Optimize queries and caching
2. **Real-time Updates**: WebSocket support
3. **Offline Support**: Offline data sync
4. **Export**: Data export functionality
5. **Import**: Bank statement import
6. **Notifications**: Push notifications for payments

---

## Summary

The Liability System is a comprehensive debt management solution that:
- Tracks various types of liabilities
- Manages liability funds within accounts
- Records payments and draws
- Settles liabilities with proper reconciliation
- Maintains data integrity and security
- Provides audit trails through transactions
- Supports complex financial scenarios
- Integrates with other FinTrack systems

The system is built on a solid foundation with:
- Well-designed database schema
- Comprehensive RPC functions
- Robust frontend components
- Proper error handling
- Security and data integrity
- Extensibility for future features

