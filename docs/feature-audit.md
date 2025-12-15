# FinTrack Feature Audit

**Generated:** 2025-01-XX  
**Purpose:** Complete code-based audit of core financial features  
**Scope:** Recurring Transactions, Liabilities, Budgets, Bills

---

## Table of Contents

1. [Recurring Transactions](#recurring-transactions)
2. [Liabilities](#liabilities)
3. [Budgets](#budgets)
4. [Bills](#bills)
5. [Global Roadmap](#global-roadmap)

---

## Recurring Transactions

### What the Feature Does (Non-Technical)

**Recurring Transactions** are templates for transactions that repeat on a schedule. Users create a recurring transaction once (e.g., "Netflix subscription - ₹649 every month"), and the system tracks when payments are due, automatically generates bills or scheduled payments, and helps users stay organized.

**Key Use Cases:**
- **Subscriptions**: Netflix, Spotify, gym memberships (fixed monthly/yearly payments)
- **Bills**: Rent, utilities, internet (variable or fixed recurring payments)
- **Loan Payments**: EMIs linked to liabilities
- **Income**: Salary, rent received (regular income streams)

**What Users See:**
- A list of all their recurring transactions
- Next due date for each
- Total monthly/yearly cost of subscriptions
- Ability to pause, edit, or delete recurring transactions
- Automatic bills/scheduled payments generated from these templates

---

### Code-Level Behavior (Backend + Frontend)

#### Backend (Database Schema)

**Table: `recurring_transactions`** (Migration: `031_create_recurring_transactions.sql`)

Core fields:
- `id`, `user_id`, `name` (title), `description`
- `type` ('income' | 'expense'), `amount`, `amount_type` ('fixed' | 'variable')
- `frequency` ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')
- `interval`, `start_date`, `end_date`, `end_type`, `occurrence_count`
- `custom_pattern` (JSONB) - stores nature, date_of_occurrence, custom_unit, etc.
- `status` ('active' | 'paused' | 'completed' | 'cancelled')
- `account_id`, `category_id`, `fund_type`, `specific_fund_id`
- `is_subscription`, `subscription_provider`, `subscription_plan`
- `auto_create`, `auto_create_days_before`, `payment_tracking_method`
- `remind_before`, `reminder_days` (array)
- Statistics: `total_occurrences`, `completed_occurrences`, `skipped_occurrences`, `total_paid`, `average_amount`
- `next_transaction_date`, `last_transaction_date`

**Key Observations:**
- Uses `type` column for direction (maps to `direction` in frontend interface)
- Uses `name` column for title (maps to `title` in frontend)
- `frequency` stored as 'daily'/'weekly'/etc. (frontend uses 'day'/'week'/etc. - mapping exists)
- `nature` stored in `custom_pattern` JSONB (not a direct column)
- No database triggers for automatic bill generation (handled in application layer)
- No RPCs found specifically for recurring transactions (uses standard Supabase queries)

#### Frontend Implementation

**Main Screen:** `app/(tabs)/recurring.tsx`
- Lists all recurring transactions
- Shows next due date, amount, status
- Edit/delete actions
- Calculates totals

**Detail Screen:** `app/recurring/[id].tsx`
- Full details of a recurring transaction
- Uses `useRecurringTransactionCycles` hook
- Displays cycles with status and payment tracking

**Create/Edit Modal:** `app/modals/add-recurring-transaction.tsx`
- Form for creating/editing recurring transactions
- Supports all fields including payment tracking method

**Utilities:**
- `utils/recurringTransactions.ts` - CRUD operations
- `utils/recurringPaymentTracking.ts` - Handles different payment tracking methods
- `utils/recurringBillGeneration.ts` - Generates bills from recurring transactions
- `utils/recurringCycleScheduling.ts` - Cycle overrides and scheduling
- `hooks/useRecurringTransactionCycles.ts` - React hook for cycle display

#### Payment Tracking Methods

The system supports 4 methods (via `payment_tracking_method` field):

1. **`bill`** - Creates bills in the `bills` table
2. **`scheduled_transaction`** - Creates entries in `scheduled_transactions` table
3. **`direct`** - Creates transactions immediately
4. **`manual`** - User manually creates transactions

This is handled by `utils/recurringPaymentTracking.ts`.

---

### Data Flow Explanation

**Creating a Recurring Transaction:**

1. **Frontend**: User fills form in `add-recurring-transaction.tsx`
2. **Frontend → Backend**: Calls `createRecurringTransaction()` from `utils/recurringTransactions.ts`
3. **Backend**: Inserts row into `recurring_transactions` table via Supabase
4. **Backend → Frontend**: Returns created recurring transaction
5. **Frontend**: Updates UI, navigates back to list

**Automatic Bill/Payment Generation:**

1. **Background Process**: `processRecurringTransactionsForToday()` (in `recurringPaymentTracking.ts`)
2. **Checks**: Finds recurring transactions due in X days (based on `auto_create_days_before`)
3. **Generates**: Based on `payment_tracking_method`:
   - If `bill`: Creates bill via `createBillForCycle()`
   - If `scheduled_transaction`: Creates scheduled transaction
   - If `direct`: Creates transaction immediately
4. **Updates**: Sets `next_transaction_date` on recurring transaction

**Viewing Recurring Transactions:**

1. **Frontend**: Calls `fetchRecurringTransactions()` from `utils/recurringTransactions.ts`
2. **Backend**: Queries `recurring_transactions` table
3. **Frontend**: Maps database format to interface format (frequency, direction, title)
4. **Frontend**: Calculates `next_transaction_date` if missing using recurrence engine
5. **Frontend**: Displays in UI

**Making a Payment:**

1. **Frontend**: User confirms payment from bill or scheduled transaction
2. **Backend**: Creates transaction record
3. **Backend**: Updates recurring transaction statistics (`completed_occurrences`, `total_paid`)
4. **Backend**: Calculates next occurrence using recurrence engine
5. **Frontend**: UI updates to show next due date

---

### How Users Use It

**Typical User Workflow:**

1. **Setup Phase:**
   - User goes to "Recurring" tab
   - Clicks "Add Recurring Transaction"
   - Fills form: Name, Amount, Frequency, Start Date, Account, Category
   - Chooses payment tracking method (bill vs scheduled transaction)
   - Saves

2. **Automatic Generation:**
   - System automatically creates bills/scheduled payments X days before due date
   - User receives notifications (if configured)

3. **Payment Time:**
   - Bill appears in "Bills" tab or scheduled transaction appears
   - User confirms payment
   - Transaction is created
   - Next occurrence is scheduled

4. **Management:**
   - User can view all recurring transactions in one place
   - Can pause, edit, or delete
   - Can see statistics (total paid, average amount)

**Real-World Example:**
- User creates "Netflix Subscription" recurring transaction
- Amount: ₹649, Frequency: Monthly, Due: 11th of each month
- Payment tracking: `bill`
- System creates bill on 8th (3 days before)
- User pays bill on 11th
- System generates next bill for December 11th automatically

---

### How It Interacts with Other Features

**1. Bills System:**
- Recurring transactions can generate bills (if `payment_tracking_method = 'bill'`)
- Bills appear in Bills aggregator view
- Bills have `parent_bill_id` linking to container bills (migrated from recurring transactions concept)

**2. Scheduled Payments:**
- Recurring transactions can create scheduled transactions
- Linked via `recurring_transaction_id` field in `scheduled_transactions` table

**3. Liabilities:**
- Recurring transactions can be linked to liabilities
- For loan EMIs that are also tracked as recurring transactions

**4. Accounts:**
- Recurring transactions specify which account to use
- When payment is made, transaction is created in that account

**5. Categories:**
- Recurring transactions have category_id
- Transactions generated from them inherit the category

**6. Budgets:**
- Transactions from recurring transactions can be linked to budgets (via automatic budget transaction linking trigger)

**7. Bills Aggregator:**
- `utils/billsAggregator.ts` fetches recurring transactions and converts them to `UpcomingPayment` objects for the unified Bills view

---

### Current Gaps or Inconsistencies

**1. Field Name Mismatches:**
- Database uses `type` but interface uses `direction` (mapping exists in code)
- Database uses `name` but interface uses `title` (mapping exists in code)
- Database uses 'daily'/'weekly' but interface uses 'day'/'week' (mapping exists)
- **Status**: Handled in code but creates complexity

**2. Nature Field Storage:**
- `nature` (subscription/bill/payment/income) stored in `custom_pattern` JSONB
- Not a direct column, makes querying harder
- **Impact**: Filtering by nature requires JSONB queries

**3. Missing Database Automation:**
- No triggers to automatically generate bills
- No scheduled jobs (must be called from application)
- **Impact**: Relies on manual/cron job execution

**4. Payment Tracking Method Complexity:**
- Four different methods with different code paths
- Could be simplified
- **Status**: Working but complex

**5. No Automatic Status Updates:**
- Status doesn't automatically change when end_date is reached
- Must be manually updated or checked in application code

**6. Cycle Override System:**
- Exists in `recurringCycleScheduling.ts` but unclear if fully integrated
- Overrides stored in `cycle_notes` table but relationship unclear

**7. Missing MCP Server:**
- No separate MCP server found
- All operations go directly through Supabase client
- **Status**: Not a gap if intentional, but worth noting

**8. Incomplete Statistics:**
- Fields exist (`total_occurrences`, `completed_occurrences`) but unclear if always updated
- May need verification/repair mechanism

**9. Bill Generation Overlap:**
- Migration `028_enhance_bills_for_recurring_transactions.sql` added many recurring transaction fields to `bills` table
- Suggests potential overlap/duplication between systems
- **Status**: Bills can act as both container and payment instance

---

### What Needs to Be Built Next

**Priority 1: Critical Fixes**

1. **Standardize Field Names:**
   - Migrate database to use `direction` instead of `type`, `title` instead of `name`
   - OR standardize interface to match database (less disruptive)
   - Update all code references

2. **Add Nature Column:**
   - Make `nature` a direct column instead of JSONB field
   - Migrate existing data
   - Update queries to use direct column

3. **Automatic Bill Generation:**
   - Create database function to generate bills for due recurring transactions
   - Set up scheduled job (via Supabase Edge Functions or external cron)
   - Test thoroughly

4. **Status Automation:**
   - Trigger or function to mark as 'completed' when end_date reached
   - Mark as 'paused' when paused_until date reached

**Priority 2: Enhancements**

5. **Cycle Override UI:**
   - Complete integration of cycle override system
   - UI for users to skip/modify specific occurrences
   - Clear documentation

6. **Statistics Verification:**
   - Audit/repair function to recalculate statistics
   - Run periodically to ensure accuracy

7. **Payment Tracking Simplification:**
   - Consider consolidating methods or making decision tree clearer
   - Better defaults based on use case

**Priority 3: Nice to Have**

8. **Recurrence Pattern UI:**
   - Better UI for custom recurrence patterns
   - Visual calendar picker for specific dates

9. **Bulk Operations:**
   - Pause/resume multiple at once
   - Bulk edit (e.g., change account for all)

10. **Analytics Dashboard:**
    - Total monthly/yearly cost visualization
    - Subscription cost trends
    - Payment consistency reports

---

## Liabilities

### What the Feature Does (Non-Technical)

**Liabilities** track debts that users owe - loans, credit cards, mortgages, etc. This system helps users:

- Track how much they owe (current balance)
- See payment schedules with interest and principal breakdown
- Generate bills for upcoming payments automatically
- Track payment history and progress toward payoff
- Understand amortization (how payments are split between interest and principal)
- Manage liability funds (money specifically reserved for loan payments)

**Key Use Cases:**
- Home loans, car loans, personal loans
- Credit card debt
- Student loans
- Business loans
- Lines of credit

**What Users See:**
- List of all liabilities with current balance
- Detail view showing payment schedule (cycles)
- Bills for upcoming payments (generated automatically)
- Payment history with principal/interest breakdown
- Amortization schedule (full payment breakdown over loan life)
- Liability funds (if loan money was received and tracked separately)

---

### Code-Level Behavior (Backend + Frontend)

#### Backend (Database Schema)

**Table: `liabilities`** (Migration: `011_create_liabilities_system.sql`)

Core fields:
- `id`, `user_id`, `title`, `description`
- `liability_type` (loan, credit_card, etc.)
- `current_balance`, `original_amount`, `disbursed_amount`
- `interest_rate_apy`, `interest_type` (fixed/variable)
- `periodical_payment`, `periodical_frequency`, `due_day_of_month`
- `loan_term_months`, `start_date`, `targeted_payoff_date`
- `next_due_date`, `last_payment_date`, `paid_off_date`
- `status` ('active', 'paid_off', 'paused', 'overdue')
- `category_id`, `linked_account_id`
- `credit_limit` (for credit cards)
- Currency, color, icon

**Related Tables:**
- `liability_payments` - Payment history with principal/interest breakdown
- `liability_schedules` - Payment schedule templates
- `account_funds` - Tracks liability funds (type='borrowed', reference_id=liability_id)
- `bills` - Can be linked to liabilities via `liability_id`

**Key Observations:**
- No database triggers for automatic bill generation (handled in application)
- No RPCs found specifically for liability CRUD (uses standard Supabase queries)
- RPC `generate_liability_bills` exists (referenced in code but migration not found in audit)
- Settlement RPCs exist: `repay_liability`, `spend_from_account_bucket`

#### Frontend Implementation

**Main Screen:** `app/(tabs)/liabilities.tsx`
- Lists all liabilities
- Shows current balance, status, next payment

**Detail Screen:** `app/liability/[id].tsx`
- Full liability details
- Uses `useLiabilityCycles` hook
- Shows bills linked to liability
- Payment history
- Settlement options

**Components:**
- `components/cycles/LiabilityCycles.tsx` - Displays payment cycles
- `components/liabilities/LiabilityAccountPicker.tsx` - Account selection

**Utilities:**
- `utils/liabilities.ts` - Core CRUD and settlement logic
- `utils/liabilityBills.ts` - Bill generation from liabilities
- `utils/liabilitySchedules.ts` - Schedule management
- `utils/liabilityFunds.ts` - Fund management (likely)
- `utils/liabilityCalculations.ts` - Payment calculations (referenced)
- `utils/liabilityAmortization.ts` - Amortization schedule (referenced)
- `hooks/useLiabilityCycles.ts` - React hook for cycle display

#### Bill Generation

Liability bills are generated using:
- `generateLiabilityBills()` function in `liabilityBills.ts`
- Calls RPC `generate_liability_bills` (if available)
- Falls back to manual generation using amortization calculations
- Creates bills in `bills` table with `liability_id` link
- Each bill includes principal/interest breakdown

---

### Data Flow Explanation

**Creating a Liability:**

1. **Frontend**: User fills form (likely in modal)
2. **Frontend → Backend**: Inserts into `liabilities` table
3. **Backend**: Creates liability record
4. **Optional**: Creates liability fund in `account_funds` if disbursed_amount > 0
5. **Backend → Frontend**: Returns created liability
6. **Frontend**: Optionally generates bills automatically

**Generating Payment Bills:**

1. **Backend**: User creates liability or triggers bill generation
2. **Backend**: Calculates amortization schedule using interest rate, balance, payment amount
3. **Backend**: Creates bills in `bills` table:
   - One bill per payment period
   - Each bill has `liability_id` link
   - Includes `principal_amount` and `interest_amount` breakdown
   - Due dates match payment schedule
4. **Frontend**: Bills appear in Bills view and liability detail screen

**Making a Payment:**

1. **Frontend**: User pays bill (via `pay-bill` modal or liability detail)
2. **Backend**: Creates transaction in account
3. **Backend**: Creates `liability_payment` record with principal/interest breakdown
4. **Backend**: Updates `liability.current_balance` (reduces by principal)
5. **Backend**: Updates liability fund if payment came from liability fund
6. **Backend**: Marks bill as paid
7. **Frontend**: UI updates to show new balance and next payment

**Viewing Cycles:**

1. **Frontend**: Calls `useLiabilityCycles` hook
2. **Hook**: Fetches liability and payment history
3. **Hook**: Calls `generateCycles()` from `utils/cycles.ts`
4. **Hook**: Matches payments to cycles using `matchTransactionsToCycles()`
5. **Hook**: Calculates principal/interest for each cycle
6. **Frontend**: Displays cycles in `LiabilityCycles` component

**Settlement (Payoff):**

1. **Frontend**: User initiates settlement
2. **Backend**: `checkLiabilitySettlementStatus()` checks if balanced
3. **Backend**: User chooses adjustments (repayment, refund, convert to personal)
4. **Backend**: `executeLiabilitySettlement()` processes adjustments
5. **Backend**: Marks liability as 'paid_off'
6. **Backend**: Optionally deletes liability and cleans up funds

---

### How Users Use It

**Typical User Workflow:**

1. **Setup Phase:**
   - User creates liability (e.g., "Home Loan - ₹50,00,000")
   - Enters: Original amount, Interest rate, Monthly payment, Start date
   - Optionally: If loan money was received, creates liability fund
   - System generates bills for all payment periods

2. **Payment Time:**
   - Bill appears in Bills tab (e.g., "Home Loan Payment #1 - ₹35,000")
   - User opens bill, sees breakdown: ₹28,500 principal + ₹6,500 interest
   - User pays from account (optionally from liability fund)
   - System updates balance: ₹50,00,000 → ₹49,71,500
   - Next bill automatically shows new principal/interest split

3. **Tracking Progress:**
   - User views liability detail screen
   - Sees cycles view: Past payments (green), Upcoming (gray)
   - Sees amortization schedule showing all payments until payoff
   - Sees progress bar: "20% paid (₹10,00,000 of ₹50,00,000)"

4. **Payoff:**
   - User makes final payment or pays extra to finish early
   - System checks settlement status
   - If balanced, user can delete liability
   - Liability marked as 'paid_off'

**Real-World Example:**
- User creates "Car Loan" liability: ₹5,00,000 at 8.5% APR, ₹10,247/month
- System generates 49 bills (one per month)
- First bill: ₹10,247 (₹6,705 principal + ₹3,542 interest)
- User pays first bill
- Balance reduces to ₹4,93,295
- Second bill: ₹10,247 (₹6,752 principal + ₹3,495 interest)
- Interest decreases each month as balance reduces

---

### How It Interacts with Other Features

**1. Bills System:**
- Liabilities generate bills automatically
- Bills linked via `liability_id` field
- Bills include principal/interest breakdown
- Bills appear in unified Bills aggregator view
- Bills have status tracking (upcoming, due_today, overdue, paid)

**2. Accounts:**
- Liabilities can be linked to accounts
- Payments create transactions in accounts
- Liability funds tracked in `account_funds` table (type='borrowed')

**3. Categories:**
- Liabilities have category_id
- Payments inherit category from liability

**4. Recurring Transactions:**
- Liabilities can be linked to recurring transactions
- For loan EMIs that are also tracked as recurring transactions
- (Unclear if bidirectional sync exists)

**5. Budgets:**
- Liability payments can be linked to budgets (via automatic budget transaction linking)
- Budgets can track loan payment category

**6. Cycles Engine:**
- Uses `utils/cycles.ts` to generate payment schedules
- Cycles show past/current/upcoming payments
- Cycles matched to actual payment history

---

### Current Gaps or Inconsistencies

**1. Missing RPC Documentation:**
- Code references `generate_liability_bills` RPC but migration not found in audit
- May exist but not in migration files reviewed
- **Impact**: Fallback to manual generation always used

**2. Bill Generation Timing:**
- Bills generated manually when liability created
- No automatic regeneration if liability parameters change
- **Impact**: User must manually regenerate bills if payment schedule changes

**3. Settlement Complexity:**
- Settlement system exists but complex (multiple adjustment types)
- May be confusing for users
- **Status**: Working but needs better UX

**4. Liability Funds:**
- Funds tracked in `account_funds` but relationship unclear
- When funds are created/updated not always clear
- **Status**: Working but documentation needed

**5. No Automatic Status Updates:**
- Status doesn't automatically change to 'paid_off' when balance reaches 0
- Must be manually checked/set
- **Impact**: Status may be outdated

**6. Payment Matching:**
- Payments matched to cycles in frontend
- No database-level matching/verification
- **Impact**: Potential inconsistencies if payments don't match expected schedule

**7. Interest Calculation:**
- Interest calculations done in application layer
- Multiple calculation functions exist (unclear which is canonical)
- **Impact**: Potential inconsistencies

**8. Schedule Management:**
- `liability_schedules` table exists but usage unclear
- Relationship to bills and cycles unclear
- **Status**: May be legacy or partially implemented

**9. Cycle Overrides:**
- Override system exists for recurring transactions
- Unclear if same system works for liabilities
- **Impact**: Can't skip/modify individual payments easily

---

### What Needs to Be Built Next

**Priority 1: Critical Fixes**

1. **Automatic Status Updates:**
   - Trigger/function to set status='paid_off' when current_balance reaches 0
   - Update status based on payment history

2. **Bill Regeneration:**
   - Function to regenerate bills when liability parameters change
   - Handle existing bills (cancel future, regenerate from current date)
   - UI to trigger regeneration

3. **Payment Matching Verification:**
   - Database-level function to verify payments match schedule
   - Flag mismatches for user review
   - Auto-correct obvious issues

**Priority 2: Enhancements**

4. **RPC Verification:**
   - Verify if `generate_liability_bills` RPC exists
   - If missing, create it for better performance
   - If exists, ensure it's used correctly

5. **Schedule Management:**
   - Clarify relationship between schedules, bills, and cycles
   - Complete schedule management UI if needed
   - Or deprecate if not used

6. **Settlement UX:**
   - Simplify settlement flow
   - Better UI for adjustments
   - Clearer explanations for each adjustment type

**Priority 3: Nice to Have**

7. **Interest Calculation Standardization:**
   - Single canonical interest calculation function
   - Use across all liability operations
   - Document calculation method

8. **Cycle Overrides:**
   - Extend override system to liabilities
   - Allow skipping/modifying individual payments
   - Update bills accordingly

9. **Amortization UI:**
   - Better visualization of amortization schedule
   - Show interest vs principal over time
   - What-if scenarios (extra payments, rate changes)

10. **Liability Analytics:**
    - Total debt across all liabilities
    - Monthly debt payment obligations
    - Interest paid tracking (tax purposes)
    - Debt payoff projections

---

## Budgets

### What the Feature Does (Non-Technical)

**Budgets** help users track and limit their spending. Users set a spending limit for a period (e.g., "₹10,000 for groceries this month"), and the system automatically tracks expenses against that budget.

**Key Budget Types:**
- **Monthly**: Overall spending cap for a period (e.g., ₹50,000 total expenses)
- **Category**: Spending limit for a specific category (e.g., ₹10,000 for "Food & Dining")
- **Goal-Based**: Linked to goals (e.g., save ₹5,000/month toward vacation goal)
- **Smart**: (Type exists but implementation unclear)

**What Users See:**
- List of active budgets with progress bars
- Spent vs. remaining amounts
- Daily spending pace (are you on track?)
- Warnings when approaching or exceeding budget
- Budget cycles showing spending over time

**How It Works:**
- User creates a budget (amount, period, accounts to track)
- System automatically links expense transactions to relevant budgets
- Progress tracked in real-time
- Alerts sent when approaching limits

---

### Code-Level Behavior (Backend + Frontend)

#### Backend (Database Schema)

**Table: `budgets`** (Migration: `001_create_budgets_table.sql`)

Core fields:
- `id`, `user_id`, `name`, `amount`, `currency`
- `budget_type` ('monthly', 'category', 'goal_based', 'smart')
- `budget_mode` ('spend_cap' | 'save_target')
- `start_date`, `end_date`, `recurrence_pattern`
- `spent_amount`, `remaining_amount` (generated column)
- `category_id` (for category budgets), `goal_id` (for goal-based)
- `rollover_enabled`, `is_active`, `is_deleted`
- `alert_settings` (JSONB), `metadata` (JSONB)

**Related Tables:**
- `budget_accounts` - Junction table linking budgets to accounts
- `budget_transactions` - Links individual transactions to budgets
- `budget_events` - Event log for budget activities

**Database Functions (RPCs):**
- `create_budget_transactions_for_transaction()` - Trigger function (automatic linking)
- `update_budget_spent_amount(budget_uuid)` - Updates spent amount from transactions
- `is_budget_over_limit(budget_uuid)` - Checks if over limit
- `get_budget_progress_percentage(budget_uuid)` - Returns progress percentage
- `get_budget_daily_pace(budget_uuid)` - Calculates daily spending pace

**Automatic Transaction Linking:**
- **Trigger**: `trigger_create_budget_transactions` on `transactions` table
- **Logic**: When expense transaction created, automatically links to relevant budgets
- **Criteria**:
  - Monthly budgets: All expenses from linked accounts
  - Category budgets: Expenses from linked accounts with matching category
  - Goal-based budgets: Expenses from linked accounts (logic in application)

#### Frontend Implementation

**Main Screen:** `app/(tabs)/budgets.tsx`
- Lists all budgets (active/completed tabs)
- Shows progress bars, spent/remaining amounts
- Budget cards with summary

**Detail Screen:** `app/budget/[id].tsx` (likely exists)
- Full budget details
- Uses `useBudgetCycles` hook
- Shows spending breakdown by category/time

**Create/Edit Modal:** `app/modals/add-budget.tsx`
- Form for creating/editing budgets
- Supports all budget types and modes
- Account selection for tracking

**Utilities:**
- `utils/budgets.ts` - CRUD operations
- `utils/budgetRecurrence.ts` - Budget period calculations
- `hooks/useBudgetCycles.ts` - React hook for cycle display

---

### Data Flow Explanation

**Creating a Budget:**

1. **Frontend**: User fills form in `add-budget.tsx`
2. **Frontend → Backend**: Calls `createBudget()` from `utils/budgets.ts`
3. **Backend**: Inserts into `budgets` table
4. **Backend**: Creates entries in `budget_accounts` table (linking accounts)
5. **Backend**: For goal-based budgets, calculates amount automatically if needed
6. **Backend → Frontend**: Returns created budget
7. **Frontend**: Updates UI

**Automatic Transaction Linking:**

1. **User Creates Expense Transaction**: Via any transaction creation method
2. **Database Trigger Fires**: `trigger_create_budget_transactions` on `transactions` INSERT
3. **Trigger Function Executes**: `create_budget_transactions_for_transaction()`
4. **Logic Checks**: Finds all active budgets that should include this transaction
5. **Creates Links**: Inserts into `budget_transactions` table for each matching budget
6. **No Frontend Action**: Happens automatically in database

**Updating Spent Amount:**

1. **Transaction Added**: Via trigger, `budget_transactions` entry created
2. **Spent Amount Needs Update**: `budget_transactions.amount_counted` field
3. **Manual Call**: Application calls `update_budget_spent_amount()` RPC
4. **RPC Calculates**: Sums all non-excluded `amount_counted` from `budget_transactions`
5. **Updates Budget**: Sets `budget.spent_amount` to calculated value
6. **Remaining Amount**: Automatically recalculated (generated column: `amount - spent_amount`)

**Viewing Budget Progress:**

1. **Frontend**: Calls `useBudgetCycles` hook or fetches budget directly
2. **Backend**: Queries `budgets` table (with `spent_amount`, `remaining_amount`)
3. **Backend**: May call `get_budget_progress_percentage()` for percentage
4. **Backend**: May call `get_budget_daily_pace()` for pace calculation
5. **Frontend**: Displays progress bar, spent/remaining, pace indicator

**Excluding Transactions:**

1. **Frontend**: User marks transaction as excluded from budget
2. **Backend**: Updates `budget_transactions.is_excluded = true`
3. **Backend**: Calls `update_budget_spent_amount()` to recalculate
4. **Frontend**: Budget updates (spent amount decreases)

**Budget Renewal:**

1. **Period Ends**: Budget end_date reached
2. **User Decision**: Renewal decision (rollover excess/deficit or reset)
3. **Backend**: Creates new budget period with rolled-over amount (if enabled)
4. **Backend**: Marks old period as inactive
5. **Frontend**: New period appears in budget cycles

---

### How Users Use It

**Typical User Workflow:**

1. **Setup Phase:**
   - User goes to "Budgets" tab
   - Clicks "Add Budget"
   - Chooses type: Monthly, Category, or Goal-Based
   - Sets amount: ₹10,000
   - Sets period: January 1-31, 2025
   - Selects accounts to track
   - Saves

2. **Automatic Tracking:**
   - User makes expense transactions (via any method)
   - System automatically links to relevant budgets
   - Budget spent amount updates in real-time
   - User sees progress bar fill up

3. **Monitoring:**
   - User views budget list
   - Sees: "Groceries Budget: ₹7,500 / ₹10,000 (75%)"
   - Sees daily pace: "You're spending ₹250/day, on track for ₹7,750"
   - Receives alerts when approaching limit (if configured)

4. **Period End:**
   - Month ends, budget period closes
   - User sees final spending: ₹9,500 / ₹10,000
   - Option to rollover ₹500 to next month or reset
   - New period starts

**Real-World Example:**
- User creates "Food Budget" (Category type)
- Amount: ₹15,000, Period: Monthly, Category: Food & Dining
- User makes grocery purchase: ₹2,000
- System automatically links to Food Budget
- Budget shows: ₹2,000 / ₹15,000 (13%)
- User makes restaurant purchase: ₹1,500
- Budget updates: ₹3,500 / ₹15,000 (23%)
- By month end: ₹14,500 / ₹15,000 (97%)
- User stays within budget!

---

### How It Interacts with Other Features

**1. Transactions:**
- All expense transactions automatically linked via database trigger
- Links stored in `budget_transactions` table
- Users can exclude transactions from budgets

**2. Accounts:**
- Budgets linked to accounts via `budget_accounts` table
- Only transactions from linked accounts count toward budget
- Supports multiple accounts per budget

**3. Categories:**
- Category budgets track specific categories
- Transactions must match category to be included
- Category field stored in `budget.category_id`

**4. Goals:**
- Goal-based budgets linked to goals via `budget.goal_id`
- Can be in "save_target" mode (track contributions) or "spend_cap" mode
- Updates goal progress when budget completed

**5. Recurring Transactions:**
- Transactions from recurring transactions automatically included if they match criteria
- No special handling needed (treated as regular transactions)

**6. Bills:**
- When bills are paid (create transaction), those transactions are linked automatically
- No special handling needed

**7. Cycles Engine:**
- Uses `utils/cycles.ts` to generate budget periods
- Shows spending over multiple periods (cycles)
- Tracks progress across time

**8. Budget Events:**
- Events logged in `budget_events` table (if exists)
- Tracks creation, updates, renewals, etc.

---

### Current Gaps or Inconsistencies

**1. Spent Amount Not Auto-Updated:**
- Trigger creates `budget_transactions` links automatically
- But `budget.spent_amount` not automatically updated
- Must call `update_budget_spent_amount()` RPC manually
- **Impact**: Spent amount may be stale until RPC called

**2. Budget Renewal Process:**
- Renewal logic exists in code (`renewBudget()`)
- Unclear if automatic or manual
- Rollover calculations may be complex
- **Status**: Partially implemented, needs verification

**3. Goal-Based Budget Logic:**
- Goal-based budgets have different modes (save_target vs spend_cap)
- Logic for determining which transactions to include unclear
- Comment says "logic handled in application" but implementation unclear
- **Impact**: May not work correctly for goal-based budgets

**4. Daily Pace Calculation:**
- RPC exists (`get_budget_daily_pace`)
- Unclear if it's called/used in frontend
- May not be displayed to users
- **Impact**: Useful feature may be unused

**5. Budget Exclusion UI:**
- Transactions can be excluded (`is_excluded` field)
- Unclear if UI exists for users to exclude transactions
- **Status**: Backend supports it, UI may be missing

**6. Alert System:**
- `alert_settings` field exists (JSONB)
- Unclear if alerts are actually sent
- No notification system found in audit
- **Impact**: Budget warnings may not be sent

**7. Smart Budget Type:**
- Type exists in schema
- No implementation found
- **Status**: Unclear what "smart" budgets are

**8. Multiple Budget Matching:**
- Transaction can match multiple budgets (e.g., monthly + category)
- Amount counted in all matching budgets
- May double-count spending
- **Status**: By design but may confuse users

**9. Budget Accounts Relationship:**
- `budget_accounts` table links budgets to accounts
- Logic for how accounts affect budget matching unclear
- May not be fully utilized

---

### What Needs to Be Built Next

**Priority 1: Critical Fixes**

1. **Auto-Update Spent Amount:**
   - Trigger to automatically update `budget.spent_amount` when `budget_transactions` changes
   - OR call RPC automatically after transaction creation
   - Ensure spent amount always accurate

2. **Goal-Based Budget Logic:**
   - Clarify and implement transaction matching for goal-based budgets
   - Handle save_target vs spend_cap modes correctly
   - Test thoroughly

3. **Budget Renewal Automation:**
   - Automatic renewal at period end (if enabled)
   - UI for renewal decisions (rollover vs reset)
   - Clear rollover calculations

**Priority 2: Enhancements**

4. **Exclusion UI:**
   - UI for users to exclude transactions from budgets
   - Show excluded transactions separately
   - Allow re-including

5. **Alert System:**
   - Implement budget alert notifications
   - Send alerts when approaching/exceeding limits
   - Use `alert_settings` field

6. **Daily Pace Display:**
   - Display daily pace in budget UI
   - Show if user is on track
   - Visual indicators (green/yellow/red)

**Priority 3: Nice to Have**

7. **Smart Budgets:**
   - Define what "smart" budgets are
   - Implement or remove type
   - Document decision

8. **Budget Analytics:**
   - Historical spending trends
   - Budget adherence over time
   - Category spending patterns

9. **Budget Templates:**
   - Common budget templates (e.g., "Monthly Essentials")
   - Quick setup for standard budgets

10. **Budget Sharing:**
    - Share budgets with family/partners
    - Collaborative budgeting
    - Use `account_role` in `budget_accounts` (if that's the intent)

---

## Bills

### What the Feature Does (Non-Technical)

**Bills** are a unified view of all upcoming payments from different sources. The Bills screen aggregates payments from:

- Recurring transactions (Netflix, rent)
- Liabilities (loan EMIs)
- Scheduled payments (one-time future payments)
- Goal contributions (planned savings)
- Direct bills (created manually or generated)

This gives users one place to see everything they need to pay, when it's due, and how much.

**Bill Status:**
- `upcoming` - Not yet due
- `due_today` - Due today
- `overdue` - Past due date
- `paid` - Payment completed
- `skipped` - Payment skipped
- `cancelled` - Bill cancelled
- `postponed` - Due date moved

**What Users See:**
- Unified list of all upcoming payments
- Sorted by due date
- Filterable by source, status, category
- Quick actions: Pay, Skip, Postpone
- Total amount due summary

---

### Code-Level Behavior (Backend + Frontend)

#### Backend (Database Schema)

**Table: `bills`** (Migration: `010_create_bills_system.sql`)

Core fields:
- `id`, `user_id`, `title`, `description`, `amount`, `currency`
- `bill_type` ('one_time', 'recurring_fixed', 'recurring_variable', 'goal_linked', 'liability_linked')
- `recurrence_pattern`, `recurrence_interval`, `custom_recurrence_config`
- `due_date`, `original_due_date`, `next_due_date`, `last_paid_date`
- `status` ('upcoming', 'due_today', 'overdue', 'paid', 'skipped', 'cancelled', 'postponed')
- Links: `goal_id`, `linked_account_id`, `liability_id`, `parent_bill_id`
- Visual: `color`, `icon`
- Metadata: `reminder_days`, `notes`, `metadata` (JSONB)

**Enhanced Fields** (Migration: `028_enhance_bills_for_recurring_transactions.sql`):
- Many recurring transaction fields added (frequency, custom_pattern, end_type, etc.)
- Suggests bills can act as containers (templates) or payment instances

**Hierarchical Structure:**
- `parent_bill_id` - Links payment bills to container bills
- Container bills (parent_bill_id IS NULL) act as templates
- Payment bills (parent_bill_id SET) are individual occurrences

**Database Functions (RPCs):**
- `calculate_bill_status(due_date, current_status)` - Calculates status based on date
- `generate_next_bill_instance(bill_uuid)` - Generates next occurrence for recurring bills
- `get_bill_statistics(user_uuid, time_range)` - Returns bill statistics
- `update_bill_statuses()` - Updates all bill statuses (run daily)

**Views:**
- `bills_with_status` - View with calculated status

#### Frontend Implementation

**Main Screen:** `app/(tabs)/bills.tsx`
- Uses `fetchAllUpcomingPayments()` from `billsAggregator.ts`
- Shows unified list of all payments
- Filtering and sorting

**Detail/Modal:** Various modals for bill actions
- `app/modals/pay-bill.tsx` - Payment modal
- `app/modals/mark-bill-paid.tsx` - Mark as paid
- `app/modals/add-bill.tsx` - Create new bill

**Utilities:**
- `utils/bills.ts` - CRUD operations for bills table
- `utils/billsAggregator.ts` - Aggregates payments from all sources
- `utils/recurringBillGeneration.ts` - Generates bills from recurring transactions

---

### Data Flow Explanation

**Unified Bills View (Aggregator):**

1. **Frontend**: User opens Bills tab
2. **Frontend**: Calls `fetchAllUpcomingPayments()` from `billsAggregator.ts`
3. **Aggregator**: Fetches from 5 sources:
   - Recurring transactions (via `fetchRecurringTransactionsPayments()`)
   - Liabilities (via `fetchLiabilityPayments()`)
   - Scheduled payments (via `fetchScheduledPaymentsAsUpcoming()`)
   - Goal contributions (via `fetchGoalContributionPayments()`)
   - Bills table (via `fetchBillsTablePayments()`)
4. **Aggregator**: Converts all to `UpcomingPayment` interface
5. **Aggregator**: Deduplicates (if bill appears from multiple sources)
6. **Aggregator**: Applies filters (status, category, account, search)
7. **Aggregator**: Sorts by due date
8. **Frontend**: Displays unified list

**Creating a Bill:**

1. **Frontend**: User creates bill (one-time or recurring)
2. **Backend**: Inserts into `bills` table
3. **Backend**: If recurring, sets up recurrence pattern
4. **Backend**: Calculates next due date
5. **Frontend**: Bill appears in Bills view

**Generating Bills from Recurring Transactions:**

1. **Background Process**: `processRecurringTransactionsForToday()`
2. **Checks**: Finds recurring transactions due in X days
3. **Generates**: Creates bills in `bills` table
4. **Links**: Sets `parent_bill_id` if container bill exists
5. **Updates**: Sets `next_transaction_date` on recurring transaction

**Paying a Bill:**

1. **Frontend**: User clicks "Pay" on bill
2. **Backend**: Creates transaction in account
3. **Backend**: Marks bill status as 'paid'
4. **Backend**: Sets `last_paid_date`
5. **Backend**: If recurring, generates next bill instance
6. **Frontend**: Bill disappears from upcoming list (or shows as paid)

**Status Calculation:**

1. **Manual**: User or application sets status
2. **Automatic**: Database function `calculate_bill_status()` calculates based on due_date
3. **Batch Update**: `update_bill_statuses()` function updates all bills (should run daily)
4. **View**: `bills_with_status` view provides calculated status

---

### How Users Use It

**Typical User Workflow:**

1. **View Bills:**
   - User opens Bills tab
   - Sees unified list: "Netflix - ₹649 (Dec 11)", "Home Loan - ₹35,000 (Dec 1)"
   - Sorted by due date
   - Total shown: "₹45,649 due this month"

2. **Pay Bill:**
   - User clicks on bill
   - Sees details: amount, due date, account
   - Clicks "Pay"
   - Selects account, confirms payment
   - Transaction created, bill marked paid
   - If recurring, next bill generated automatically

3. **Skip/Postpone:**
   - User can skip a bill (won't pay this time)
   - Or postpone (move due date)
   - Bill status updated accordingly

4. **Create One-Time Bill:**
   - User creates bill for upcoming expense
   - E.g., "Doctor Appointment - ₹2,000 (Dec 15)"
   - Appears in Bills list
   - Pay when due

**Real-World Example:**
- Bills screen shows:
  - Dec 1: Rent - ₹20,000 (from recurring transaction)
  - Dec 5: Car Loan - ₹12,000 (from liability)
  - Dec 10: Electricity - ₹2,500 (from recurring transaction, variable)
  - Dec 11: Netflix - ₹649 (from recurring transaction)
  - Dec 15: Doctor - ₹2,000 (one-time bill)
- User pays each as they come due
- System tracks all in one place

---

### How It Interacts with Other Features

**1. Recurring Transactions:**
- Recurring transactions can generate bills
- Bills linked via metadata or parent_bill_id
- Bills appear in aggregator view

**2. Liabilities:**
- Liabilities generate bills for payments
- Bills have `liability_id` link
- Include principal/interest breakdown

**3. Scheduled Payments:**
- Scheduled payments converted to bills in aggregator
- Or created as bills directly

**4. Goals:**
- Goal contributions can appear as bills
- Bills can be goal-linked

**5. Accounts:**
- Bills linked to accounts via `linked_account_id`
- Payments create transactions in accounts

**6. Categories:**
- Bills have category_id
- Payments inherit category

**7. Budgets:**
- Bill payments (transactions) automatically linked to budgets
- No direct relationship between bills and budgets

---

### Current Gaps or Inconsistencies

**1. Status Calculation Not Automatic:**
- Status calculation function exists
- But not automatically called/updated
- Must manually call `update_bill_statuses()` or rely on view
- **Impact**: Status may be outdated

**2. Dual Purpose of Bills Table:**
- Bills act as both containers (templates) and instances (payments)
- Hierarchy via `parent_bill_id` but relationship unclear
- Migration added recurring transaction fields but usage unclear
- **Impact**: Confusion about which bills are templates vs payments

**3. Deduplication Logic:**
- Aggregator deduplicates payments
- Logic may not catch all duplicates
- **Impact**: Same payment may appear multiple times

**4. Bill Generation Timing:**
- Bills generated from recurring transactions but timing unclear
- No scheduled job found
- **Impact**: Bills may not be generated automatically

**5. Status vs Calculated Status:**
- Bills have `status` field (manual)
- View provides `calculated_status` (automatic)
- Two sources of truth
- **Impact**: Which one to use? May be inconsistent

**6. Next Bill Generation:**
- `generate_next_bill_instance()` RPC exists
- Unclear when/if it's called
- **Impact**: Recurring bills may not generate next instance

**7. Bill Payments Table:**
- `bill_payments` table exists (referenced in schema)
- Usage unclear
- May track payment history separately from transactions

**8. Reminder System:**
- `reminder_days` field exists
- No notification system found
- **Impact**: Reminders may not be sent

**9. Bills Aggregator Complexity:**
- Aggregates from 5+ sources
- Complex deduplication and filtering
- Performance may be issue with many sources
- **Status**: Working but complex

---

### What Needs to Be Built Next

**Priority 1: Critical Fixes**

1. **Automatic Status Updates:**
   - Set up scheduled job to call `update_bill_statuses()` daily
   - Or trigger on bill access to ensure fresh status
   - Standardize on one status source (field vs calculated)

2. **Clarify Bills Hierarchy:**
   - Document container vs payment bill relationship
   - Ensure parent_bill_id properly set
   - Simplify if hierarchy not needed

3. **Bill Generation Automation:**
   - Scheduled job to generate bills from recurring transactions
   - Call at start of day to generate bills due in X days
   - Ensure next instances generated after payment

**Priority 2: Enhancements**

4. **Status Consistency:**
   - Choose one: manual status field OR calculated status
   - Update all code to use chosen method
   - Remove redundant status source

5. **Reminder System:**
   - Implement notification system for bill reminders
   - Use `reminder_days` field
   - Send notifications X days before due date

6. **Bill Payments Tracking:**
   - Clarify if `bill_payments` table is used
   - If not, remove or implement
   - Link payments to transactions clearly

**Priority 3: Nice to Have**

7. **Bills Aggregator Performance:**
   - Optimize queries across 5 sources
   - Cache results if appropriate
   - Consider materialized view

8. **Bill Templates:**
   - Better UI for creating recurring bills
   - Templates for common bills
   - Visual recurrence editor

9. **Bulk Actions:**
   - Pay multiple bills at once
   - Skip multiple bills
   - Bulk postpone

10. **Bill Analytics:**
    - Total monthly obligations
    - Spending patterns
    - Payment history trends

---

## Global Roadmap

### Overview

Based on the comprehensive audit of Recurring Transactions, Liabilities, Budgets, and Bills, this roadmap prioritizes fixes, enhancements, and architectural improvements needed to make FinTrack production-ready.

---

### Priority 1: Critical Fixes (Before Launch)

These issues must be fixed for the app to work correctly:

#### 1.1 Status Calculation Automation

**Problem:** Bill and liability statuses are not automatically updated.

**Solution:**
- Set up scheduled job (Supabase Edge Function or external cron) to call:
  - `update_bill_statuses()` daily
  - Check liability statuses (paid_off when balance = 0)
- OR add triggers to update status on relevant changes
- **Files:** Database migrations, Edge Functions
- **Estimate:** 2-3 days

#### 1.2 Budget Spent Amount Auto-Update

**Problem:** Budget spent amounts not automatically updated when transactions linked.

**Solution:**
- Add trigger to call `update_budget_spent_amount()` when `budget_transactions` changes
- OR auto-call RPC after transaction creation
- **Files:** `migrations/005_create_budget_functions.sql`, transaction creation code
- **Estimate:** 1-2 days

#### 1.3 Recurring Transaction Field Standardization

**Problem:** Field name mismatches between database and frontend (type/direction, name/title).

**Solution:**
- Standardize on one set of names (prefer database names for less disruption)
- Update all frontend code to use standard names
- Create mapping layer if needed during transition
- **Files:** `utils/recurringTransactions.ts`, frontend components
- **Estimate:** 2-3 days

#### 1.4 Automatic Bill Generation

**Problem:** Bills not automatically generated from recurring transactions.

**Solution:**
- Create scheduled job to call `processRecurringTransactionsForToday()` daily
- Generate bills X days before due date
- Ensure next instances generated after payment
- **Files:** Edge Functions, `utils/recurringPaymentTracking.ts`
- **Estimate:** 2-3 days

#### 1.5 Liability Status Automation

**Problem:** Liability status doesn't automatically change to 'paid_off' when balance reaches 0.

**Solution:**
- Add trigger or function to update status when `current_balance` changes
- Check on payment creation
- **Files:** Liability migrations, payment creation code
- **Estimate:** 1 day

---

### Priority 2: Data Consistency & Integrity

#### 2.1 Payment Matching Verification

**Problem:** No verification that payments match expected schedules.

**Solution:**
- Database function to verify liability/recurring transaction payments match schedule
- Flag mismatches for user review
- Auto-correct obvious issues
- **Files:** New migration, liability/recurring transaction utilities
- **Estimate:** 3-4 days

#### 2.2 Statistics Verification & Repair

**Problem:** Recurring transaction statistics may be incorrect.

**Solution:**
- Audit/repair function to recalculate statistics
- Run periodically (monthly)
- UI to manually trigger repair
- **Files:** New utility function, UI component
- **Estimate:** 2 days

#### 2.3 Budget Spent Amount Audit

**Problem:** Spent amounts may be out of sync.

**Solution:**
- Batch function to recalculate all budget spent amounts
- Run daily/weekly
- **Files:** Database function, scheduled job
- **Estimate:** 1 day

---

### Priority 3: Architecture Improvements

#### 3.1 Clarify Bills vs Recurring Transactions Overlap

**Problem:** Significant overlap between bills and recurring transactions systems.

**Solution:**
- Document intended relationship
- Decide: Are bills generated FROM recurring transactions, or are they separate?
- Consolidate if possible, or clearly separate responsibilities
- **Files:** Documentation, possibly code refactoring
- **Estimate:** 3-5 days (depends on decision)

#### 3.2 Standardize Cycle Generation

**Problem:** Multiple systems use cycles but implementations may vary.

**Solution:**
- Audit all cycle generation code
- Ensure all use `utils/cycles.ts` consistently
- Document cycle override system
- **Files:** All cycle-related code
- **Estimate:** 2-3 days

#### 3.3 MCP Server Clarification

**Problem:** No MCP server found - all operations go through Supabase directly.

**Solution:**
- Document architecture decision: Direct Supabase vs MCP server
- If MCP server intended, implement
- If not, remove references to MCP
- **Files:** Documentation, possibly new MCP server
- **Estimate:** 1 day (documentation) or 1-2 weeks (MCP server)

---

### Priority 4: User Experience Enhancements

#### 4.1 Missing UI Components

**Items to build:**
- Budget transaction exclusion UI
- Cycle override UI for recurring transactions/liabilities
- Budget alert notifications
- Bill reminder notifications
- **Estimate:** 1-2 weeks total

#### 4.2 Goal-Based Budget Logic

**Problem:** Logic for goal-based budgets unclear.

**Solution:**
- Clarify transaction matching rules
- Implement properly for save_target vs spend_cap modes
- Test thoroughly
- **Files:** `utils/budgets.ts`, budget matching logic
- **Estimate:** 3-4 days

#### 4.3 Settlement UX Improvements

**Problem:** Liability settlement flow is complex.

**Solution:**
- Simplify settlement UI
- Better explanations for each adjustment type
- Wizard-style flow
- **Files:** `app/modals/liability-settlement.tsx`
- **Estimate:** 2-3 days

---

### Priority 5: Performance & Scalability

#### 5.1 Bills Aggregator Optimization

**Problem:** Aggregator queries from 5+ sources may be slow.

**Solution:**
- Optimize queries
- Add indexes where needed
- Consider caching
- Materialized view if appropriate
- **Files:** `utils/billsAggregator.ts`, database indexes
- **Estimate:** 2-3 days

#### 5.2 Database Index Review

**Solution:**
- Audit all queries
- Add indexes for common filters (status, due_date, user_id combinations)
- **Files:** New migration
- **Estimate:** 1-2 days

---

### Priority 6: Documentation & Testing

#### 6.1 Feature Documentation

**Items:**
- User guide for each feature
- API documentation (if applicable)
- Architecture decision records
- **Estimate:** 1 week

#### 6.2 Test Coverage

**Items:**
- Unit tests for critical functions (status calculation, cycle generation)
- Integration tests for payment flows
- E2E tests for key user journeys
- **Estimate:** 2-3 weeks

---

### Immediate Next Steps (This Week)

1. **Day 1-2:** Fix bill status automation (set up scheduled job)
2. **Day 2-3:** Fix budget spent amount auto-update (add trigger)
3. **Day 3-4:** Fix liability status automation
4. **Day 4-5:** Set up automatic bill generation from recurring transactions

---

### Pre-Launch Checklist

**Critical (Must Have):**
- [ ] All Priority 1 fixes completed
- [ ] Status calculations working automatically
- [ ] Bill generation working automatically
- [ ] Budget tracking accurate
- [ ] Payment flows tested end-to-end

**Important (Should Have):**
- [ ] Priority 2 data consistency fixes
- [ ] Basic UI for all features
- [ ] Performance acceptable (no slow queries)
- [ ] Error handling in place

**Nice to Have:**
- [ ] All Priority 4 UX enhancements
- [ ] Comprehensive documentation
- [ ] Full test coverage
- [ ] Analytics dashboard

---

### Long-Term Roadmap (Post-Launch)

**Phase 1: Polish (Weeks 1-2 post-launch)**
- Fix bugs found in production
- Performance optimizations
- UX improvements based on feedback

**Phase 2: Enhancements (Weeks 3-6)**
- Advanced analytics
- Budget templates
- Bulk operations
- Mobile app optimizations

**Phase 3: New Features (Months 2-3)**
- Collaborative features (if applicable)
- Advanced reporting
- Export/import functionality
- Integration with banks/APIs

---

**Document End**
