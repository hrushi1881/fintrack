# FinTrack Complete User Flow

**Generated:** 2025-01-XX  
**Purpose:** Complete, accurate user flow based solely on real codebase features  
**Scope:** End-to-end user journey through all implemented features

---

## Table of Contents

1. [User Persona](#user-persona)
2. [Initial Setup & Onboarding](#initial-setup--onboarding)
3. [Daily Usage Flows](#daily-usage-flows)
4. [Feature-Specific Flows](#feature-specific-flows)
5. [Interconnections Between Features](#interconnections-between-features)

---

## User Persona

### Meet Priya: Financial Organizer & Future Planner

**Age:** 32  
**Location:** Mumbai, India  
**Profession:** Software Engineer  
**Income:** ₹1,20,000/month  
**Financial Status:** Multiple accounts, one home loan, several subscriptions

**Financial Profile:**
- Has 3 bank accounts across 2 banks (HDFC, ICICI)
- Owns a credit card
- Uses digital wallets (Paytm, PhonePe)
- Has a home loan (₹50,00,000 remaining)
- Multiple subscriptions (Netflix, Spotify, gym)
- Saving for a vacation (goal)
- Tracks monthly budgets for different categories

**Pain Points (Before FinTrack):**
1. **Scattered Financial Data:** Money spread across multiple accounts, hard to see total net worth
2. **Subscription Overload:** Forgetting which subscriptions are active, losing track of monthly costs
3. **Loan Management:** Not understanding principal vs interest breakdown, unsure of payoff timeline
4. **Budget Chaos:** No system to track spending against budgets, overspending in some categories
5. **Goal Tracking:** Saving for vacation but no clear way to track progress or contributions
6. **Bill Management:** Missing bill due dates, not knowing total monthly obligations

**Why Priya Uses FinTrack:**

Priya needs **one place** to see everything:
- **Unified View:** All accounts, bills, subscriptions, loans in one app
- **Automation:** Bills and subscriptions tracked automatically, no manual entry every month
- **Planning:** Budgets help control spending, goals show progress toward dreams
- **Clarity:** Understand loan progress (principal vs interest), see when debt will be paid off
- **Peace of Mind:** Never miss a payment, always know what's due

**How Priya Thinks About Money:**

- **Segregation:** Money isn't just "money" - some is for goals, some for loans, some is free to spend
- **Time-Based:** Bills come monthly, loans have schedules, goals have deadlines
- **Account-Based:** Different accounts for different purposes (salary account, savings, investments)
- **Organization:** Groups accounts by bank/institution for mental clarity

**Priya's Goals:**
1. **Short-term:** Stay within monthly budgets, never miss a bill
2. **Medium-term:** Pay off home loan early, save ₹2,00,000 for vacation in 12 months
3. **Long-term:** Build emergency fund, track net worth growth

**Priya's Financial Behavior:**

- **Proactive:** Checks app daily to see what's due, reviews spending weekly
- **Detail-Oriented:** Categorizes all transactions, tracks every rupee
- **Planning-Focused:** Sets budgets before month starts, reviews progress mid-month
- **Goal-Driven:** Makes regular contributions to goals, celebrates milestones

**Relationship with FinTrack Features:**

- **Organizations:** Groups accounts by bank (HDFC Bank, ICICI Bank) for organization
- **Accounts:** Tracks all accounts in one place, sees total balance across all
- **Transactions:** Records all income/expenses, categorizes everything
- **Budgets:** Sets monthly limits for categories (Food, Entertainment, Shopping)
- **Goals:** Actively saving for vacation, tracks progress with satisfaction
- **Liabilities:** Manages home loan, sees principal/interest breakdown, tracks payoff
- **Recurring Transactions:** All subscriptions tracked, knows monthly cost
- **Bills:** One unified view of everything due (bills, subscriptions, loan payments)

**Technical Comfort Level:**
- Comfortable with mobile apps
- Understands basic financial concepts (interest, principal, budgeting)
- Wants automation but also wants to understand what's happening

---

## Initial Setup & Onboarding

### Phase 1: Account Creation

**Screen:** `app/auth/signup.tsx`

**User Actions:**
1. User enters email and password (min 6 characters)
2. User accepts terms and conditions
3. System validates email format and password length
4. User account created via Supabase Auth
5. User metadata stored (first name, last name from form)

**Code Flow:**
- `signUp()` function in `AuthContext.tsx`
- Calls `supabase.auth.signUp()`
- Navigates to `/onboarding` on success

**Data Created:**
- User record in `auth.users` table
- User profile metadata

---

### Phase 2: Onboarding Process

**Screen:** `app/onboarding.tsx`

Onboarding has 4 steps based on code:

#### Step 1: Profile Information

**User Enters:**
- Name (pre-filled from signup metadata)
- Country (dropdown from `COUNTRIES` data)
- Profession (dropdown from `PROFESSIONS` data)
- Currency (dropdown from `CURRENCY_CONFIGS`, default: USD)

**Code Flow:**
- Updates user metadata via Supabase
- Stores country, profession, currency in user profile

**Data Stored:**
- User metadata updated in `auth.users` table
- Currency preference stored in user settings

---

#### Step 2: Organizations & Accounts

**User Creates Organizations:**
- Adds organization name (e.g., "HDFC Bank")
- Organization type (bank, wallet, investment, cash, custom)
- Currency (locked to profile currency from Step 1)
- Optional: Logo URL, theme color

**User Adds Accounts to Organizations:**
For each organization, user can add accounts:
- Account name (e.g., "HDFC Savings")
- Account type: debit, credit, savings, wallet
- Initial balance (optional, defaults to 0)
- Credit limit (if credit account)

**Code Flow:**
- `createOrganization()` from `utils/organizations.ts`
- Creates organization in `organizations` table
- For each account:
  - `createAccount()` creates account in `accounts` table
  - Links account to organization via `organization_id`
  - If initial balance > 0:
    - Creates personal fund in `account_funds` table
    - Updates account balance

**Data Created:**
- Organizations in `organizations` table
- Accounts in `accounts` table (linked via `organization_id`)
- Personal funds in `account_funds` table (if initial balance > 0)

**Key Implementation Details (from code):**
- Accounts can be created without organization (stored with `organization_id = null`)
- Default "Unassigned" organization shown for accounts without organization
- Account type mapping: 'debit' → 'bank', 'credit' → 'card', 'wallet' → 'wallet' in database

---

#### Step 3: Categories

**User Selects Categories:**
- System shows predefined main categories (Food, Transport, Bills, etc.)
- For each main category, user selects subcategories
- User can add custom subcategories
- User can create custom main categories

**Code Flow:**
- Creates categories in `categories` table (via `createCategory()`)
- Each category has:
  - Name, color, icon
  - Activity types (income, expense, goal, bill, liability, budget)
  - Subcategories (stored in category structure)

**Data Created:**
- Categories in `categories` table
- Activity types determine which transactions can use category

---

#### Step 4: Finalization

**System Actions:**
- Creates default organization if user didn't create any
- Validates all data
- Shows success summary (organizations, accounts, categories created)

**User Actions:**
- Clicks "Complete Setup"
- System navigates to home screen

**Code Flow:**
- Calls `globalRefresh()` to load all data
- Navigates to `/(tabs)/index` (home screen)

---

## Daily Usage Flows

### Flow 1: Viewing Financial Overview

**Entry Point:** Home Screen (`app/(tabs)/index.tsx`)

**What User Sees:**
- **Balance Card:** Total balance across all active accounts
- **Recent Transactions:** Last 5 transactions
- **Quick Actions:** Pay, Receive buttons (via floating nav bar)

**Data Flow:**
- `useRealtimeData()` hook fetches:
  - All accounts (filters: `is_active = true`)
  - Recent transactions (ordered by date, limit 5)
  - Calculates `totalBalance` by summing all account balances

**User Can:**
- Tap balance card → Opens dashboard modal (shows all accounts, transactions)
- Tap "View All" on transactions → Goes to Transactions tab
- Tap Pay/Receive buttons → Opens respective modals

---

### Flow 2: Recording an Expense (Pay)

**Entry Point:** Pay button on home screen or floating nav bar

**Modal:** `app/modals/pay.tsx`

**User Actions:**
1. **Select Account:** Chooses which account to pay from
   - Shows all active accounts (except goals_savings, liability types)
   - Can see account balance

2. **Select Fund Source (if account has multiple funds):**
   - If account has funds in `account_funds` table, FundPicker appears
   - Options: Personal Fund, Goal Fund (if exists), Borrowed Fund (if exists), etc.
   - If only personal fund, auto-selected (no picker shown)

3. **Enter Amount:** Types amount (e.g., "500")

4. **Select Category:**
   - Shows all categories where `activity_types` includes 'expense'
   - Frequently used categories shown at top (based on transaction count)
   - Can select subcategory if category has subcategories

5. **Enter Description:** Optional description

6. **Set Date:** Defaults to today, can change via date picker

7. **Submit Payment**

**Code Flow:**
- Calls `createExpenseTransaction()` from `utils/transactions.ts` (or similar)
- Creates transaction in `transactions` table:
  - Type: 'expense'
  - Account ID, Category ID, Amount, Date
- **Fund Handling:**
  - If personal fund: Reduces personal fund balance, reduces account balance
  - If goal fund: Reduces goal fund balance, reduces account balance
  - If borrowed fund: Reduces borrowed fund balance, reduces account balance
- **Budget Linking (automatic):**
  - Database trigger `trigger_create_budget_transactions` fires
  - Checks all active budgets that should include this transaction:
    - Monthly budgets: If account linked to budget
    - Category budgets: If account linked AND category matches
  - Creates entry in `budget_transactions` table
  - Budget spent_amount should be updated (but currently requires manual RPC call per audit)

**Data Created/Updated:**
- Transaction in `transactions` table
- Account balance reduced
- Fund balance reduced (if fund selected)
- Budget transaction link created (if matches budget criteria)

**After Payment:**
- Modal closes
- Home screen refreshes (via `globalRefresh()`)
- Balance card updates
- Recent transactions list updates
- Budget progress updates (if linked)

---

### Flow 3: Recording Income (Receive)

**Entry Point:** Receive button on home screen or floating nav bar

**Modal:** `app/modals/receive.tsx`

**User Actions:**
1. **Select Account:** Chooses which account to receive money into
2. **Enter Amount:** Types amount (e.g., "120000" for salary)
3. **Select Category:**
   - Shows categories where `activity_types` includes 'income'
   - Frequently used at top
4. **Enter Description:** "Salary" or "Freelance payment"
5. **Fund Destination (if account has multiple funds):**
   - If account has non-personal funds (goal, reserved, sinking):
     - User can allocate income to specific fund
     - Options: Personal Fund, Goal Fund (if exists), Reserved Fund (if exists)
   - If only personal fund, goes to personal automatically
6. **Set Date:** Defaults to today
7. **Submit**

**Code Flow:**
- Creates transaction type: 'income'
- **Fund Handling:**
  - If personal fund: Increases personal fund balance, increases account balance
  - If goal fund selected: Increases goal fund balance, increases account balance
- Account balance increases

**Data Created/Updated:**
- Transaction in `transactions` table (type: 'income')
- Account balance increased
- Fund balance increased (if specific fund selected)

**After Income:**
- Balance card updates
- Recent transactions shows new income
- Goal progress updates if income allocated to goal fund

---

### Flow 4: Transferring Money Between Accounts

**Entry Point:** Transfer button or account detail screen

**Modal:** `app/modals/transfer.tsx`

**User Actions:**
1. **Select Transfer Type:**
   - "Between Accounts" (standard transfer)
   - "Liability to Personal" (special case for loan funds)

2. **Select Source Account:** Account to transfer from
3. **Select Fund Source (if multiple funds):**
   - Choose which fund to transfer from (personal, goal, borrowed)
4. **Select Destination Account:** Account to transfer to
5. **Select Fund Destination (if destination has multiple funds):**
   - Choose which fund to transfer to
6. **Enter Amount**
7. **Enter Description:** Optional
8. **Set Date**
9. **Submit**

**Code Flow:**
- Creates transfer transaction in `transactions` table:
  - Type: 'transfer'
  - Source account ID, destination account ID
- **Fund Movements:**
  - Reduces source fund balance
  - Reduces source account balance
  - Increases destination fund balance
  - Increases destination account balance
- Two transaction records may be created (one for each account) or single transfer record

**Data Created/Updated:**
- Transfer transaction(s) in `transactions` table
- Source account balance reduced
- Source fund balance reduced
- Destination account balance increased
- Destination fund balance increased

**Special Case: Liability to Personal Transfer**
- If transferring from liability fund to personal fund
- Treats as converting borrowed money to personal money
- Updates liability fund balances accordingly

---

## Feature-Specific Flows

### Organizations Management

**Screen:** `app/(tabs)/organizations.tsx`

**Viewing Organizations:**
- User sees list of all organizations
- Each shows:
  - Name, total balance (sum of all accounts in org)
  - Account count
  - Preview of accounts (first 3)
- "Unassigned" organization shown if accounts exist without organization

**Creating Organization:**
1. User taps "+" button
2. Modal opens (`app/modals/add-organization.tsx`)
3. User enters:
   - Name (required)
   - Currency (dropdown, defaults to user currency)
   - Optional: Logo URL, theme color, description
4. System creates organization in `organizations` table

**Editing Organization:**
1. User taps "..." menu on organization card
2. Selects "Edit"
3. Modal opens (`app/modals/edit-organization.tsx`)
4. Can update name, currency, logo, theme color
5. System updates organization in database

**Archiving Organization:**
1. User taps "..." menu
2. Selects "Archive"
3. System sets `is_active = false`
4. Organization hidden from main list (but not deleted)

**Deleting Organization:**
1. User taps "..." menu
2. Selects "Delete"
3. System checks if organization has accounts
4. If accounts exist: Shows error, requires moving/deleting accounts first
5. If no accounts: Deletes organization (soft delete: `is_deleted = true`)

**Adding Account to Organization:**
1. User taps "Add Account" button on organization card
2. Modal opens with organization pre-selected
3. User creates account (see Account Creation flow)
4. Account automatically linked to organization via `organization_id`

**Viewing Organization Details:**
1. User taps organization card
2. Navigates to `app/organization/[id].tsx`
3. Shows:
   - Organization info
   - List of all accounts in organization
   - Can add/edit/delete accounts from here

---

### Account Management

**Screen:** `app/(tabs)/accounts.tsx` or organization detail screen

**Viewing Accounts:**
- Lists all active accounts
- Shows balance, type, organization
- Can filter by organization

**Creating Account:**
1. User taps "+" button or "Add Account" in organization
2. Modal opens (`app/modals/add-account.tsx`)
3. User enters:
   - Name (required)
   - Type: debit (bank), credit (card), wallet
   - Organization (dropdown, can be "Unassigned")
   - Initial balance (optional, defaults to 0)
   - Credit limit (if credit account)
   - Description (optional)
   - Color and icon (optional)
4. System creates account:
   - Inserts into `accounts` table
   - Links to organization (if selected)
   - If initial balance > 0:
     - Creates personal fund in `account_funds` table
     - Sets account balance to initial balance

**Editing Account:**
1. User taps account card → Goes to account detail screen
2. Or taps "..." menu → "Edit"
3. Modal opens (`app/modals/edit-account.tsx`)
4. Can update name, description, color, icon
5. Cannot change type or organization (would require account recreation)

**Account Detail Screen:** `app/account/[id].tsx`
- Shows account balance
- Shows fund breakdown (personal, goal, borrowed, etc.)
- Shows transaction history
- Can transfer funds between accounts
- Can view/edit fund balances

**Deleting Account:**
- Only if account has no transactions or zero balance (implementation may vary)
- Soft delete: sets `is_active = false`

**Linking Account to Liability:**
- In account creation/edit, can link to liability via `linked_liability_id`
- Creates liability account type
- Used for tracking loan accounts

---

### Budget Management

**Screen:** `app/(tabs)/budgets.tsx`

**Viewing Budgets:**
- Lists all active budgets
- Shows progress bars, spent/remaining amounts
- Tabs: Active, Completed

**Creating Budget:**
1. User taps "+" button
2. Modal opens (`app/modals/add-budget.tsx`)
3. User selects budget type:
   - **Monthly:** Overall spending cap
   - **Category:** Spending limit for specific category
   - **Goal-Based:** Linked to goal (track contributions or expenses)
   - **Smart:** (Type exists but implementation unclear)
4. User enters:
   - Name
   - Amount (budget limit)
   - Start date, end date
   - Budget mode: 'spend_cap' (don't exceed) or 'save_target' (save this much)
   - Recurrence pattern (monthly, weekly, yearly)
   - Rollover enabled (carry over excess/deficit to next period)
   - Accounts to track (links budgets to accounts via `budget_accounts` table)
   - Category (if category budget)
   - Goal (if goal-based budget)
5. System creates budget:
   - Inserts into `budgets` table
   - Creates entries in `budget_accounts` table (linking accounts)
   - For goal-based budgets:
     - If subtype A and auto-calculate enabled: Calculates monthly target from goal
     - Sets budget_mode automatically based on goal subtype

**Tracking Budget Progress:**
- When expense transaction created:
  - Database trigger automatically creates entry in `budget_transactions` table
  - Links transaction to relevant budgets:
    - Monthly budgets: All expenses from linked accounts
    - Category budgets: Expenses from linked accounts with matching category
  - Budget spent_amount should update (but currently requires manual RPC call per audit)

**Viewing Budget Detail:**
1. User taps budget card
2. Navigates to `app/budget/[id].tsx`
3. Shows:
   - Progress bar (spent vs amount)
   - Budget cycles (uses `useBudgetCycles` hook)
   - Transactions linked to budget
   - Can exclude transactions from budget

**Budget Cycles:**
- Uses `utils/cycles.ts` to generate periods
- Shows spending for each period (month, week, etc.)
- Matches transactions to cycles
- Shows status: within budget, over budget

**Excluding Transactions:**
- User can mark transaction as excluded from budget
- Sets `budget_transactions.is_excluded = true`
- Budget spent_amount recalculated (excluding that transaction)

**Renewing Budget:**
- When period ends, user can renew budget
- Option to rollover excess/deficit
- Creates new budget period

---

### Goal Management

**Screen:** `app/(tabs)/goals.tsx`

**Viewing Goals:**
- Lists all active goals (non-archived, non-deleted)
- Shows progress bars (current_amount / target_amount)
- Shows target date if set

**Creating Goal:**
1. User taps "+" button
2. Modal opens (`app/modals/add-goal.tsx`)
3. User enters:
   - Title (required)
   - Description (optional)
   - Target amount (required)
   - Target date (optional)
   - Category (dropdown: Vacation, Car, House, etc.)
   - Color and icon (for visual)
   - Linked accounts (optional, accounts where goal funds will be stored)
4. System creates goal:
   - Inserts into `goals` table
   - Creates entries in `goal_accounts` table (if accounts linked)
   - Initial `current_amount = 0`

**Making Contributions:**
1. User taps goal card → Goes to goal detail screen
2. Or from goals list, taps "Add Contribution"
3. Modal opens (`app/modals/add-contribution.tsx`)
4. User selects:
   - Source account (any active account)
   - Destination account (account where goal funds will be stored)
   - Fund source (personal, borrowed, goal - which fund to take money from)
   - Amount
   - Date
   - Description
5. System processes contribution:
   - Calls `addContributionToGoal()` from `utils/goals.ts`
   - Creates goal fund in destination account (if doesn't exist):
     - Fund type: 'goal'
     - Linked to goal via `linked_goal_id`
   - Transfers money:
     - Reduces source account balance
     - Reduces source fund balance
     - Increases destination account balance
     - Increases goal fund balance in destination account
   - Creates goal contribution record
   - Updates goal `current_amount`
   - Creates transaction records (expense from source, income to destination, or transfer)

**Viewing Goal Detail:**
**Screen:** `app/goal/[id].tsx`
- Shows target amount, current amount, progress percentage
- Shows goal fund breakdown (which accounts have goal funds, how much in each)
- Shows contribution history
- Uses `useGoalCycles` hook to show contribution cycles
- Can withdraw funds (if needed)

**Withdrawing from Goal:**
- User can withdraw funds from goal
- Moves money from goal fund back to personal fund
- Reduces goal `current_amount`
- Creates withdrawal record

**Achieving Goal:**
- When `current_amount >= target_amount`, goal marked as achieved
- `is_achieved = true`
- Can archive goal after achieving

**Goal Cycles:**
- Uses `utils/cycles.ts` to generate contribution periods
- Shows contributions over time
- Tracks progress toward target

---

### Liability Management

**Screen:** `app/(tabs)/liabilities.tsx`

**Viewing Liabilities:**
- Lists all active liabilities
- Shows current balance, status, next payment date

**Creating Liability:**
1. User taps "+" button
2. Modal opens (`app/modals/add-liability.tsx`)
3. User enters:
   - Title (e.g., "Home Loan")
   - Liability type (loan, credit_card, etc.)
   - Original amount (total loan amount)
   - Current balance (how much still owed)
   - Interest rate (APY %)
   - Monthly payment amount
   - Payment frequency (monthly, quarterly, etc.)
   - Due day of month (e.g., 1st)
   - Start date (when loan started)
   - Targeted payoff date (optional)
   - Linked account (optional, account for payments)
   - Category
   - Currency
4. System creates liability:
   - Inserts into `liabilities` table
   - **If disbursed_amount > 0:**
     - Creates liability fund in account (type: 'borrowed')
     - Fund linked to liability via `linked_liability_id`
   - Generates payment bills (see Bill Generation below)

**Viewing Liability Detail:**
**Screen:** `app/liability/[id].tsx`
- Shows current balance, original amount, interest rate
- Shows payment schedule (cycles)
- Uses `useLiabilityCycles` hook
- Shows bills linked to liability
- Shows payment history
- Can make payments, edit schedule, settle liability

**Liability Cycles:**
- Uses `utils/cycles.ts` to generate payment schedule
- Shows all payment periods until payoff
- Matches actual payments to cycles
- Shows principal/interest breakdown for each cycle

**Making Liability Payment:**
1. User goes to liability detail screen
2. Sees upcoming bill (or goes to Bills tab)
3. Taps "Pay" on bill
4. Modal opens (`app/modals/pay-bill.tsx` or `unified-payment-modal.tsx`)
5. User selects:
   - Account to pay from
   - Fund source (personal, liability fund)
   - Amount (defaults to bill amount)
   - Date
6. System processes payment:
   - Creates transaction (expense)
   - Creates `liability_payment` record with principal/interest breakdown
   - Updates liability `current_balance` (reduces by principal)
   - Updates liability fund balance (if paying from liability fund)
   - Marks bill as paid
   - Generates next bill (if recurring)

**Drawing Liability Funds:**
- If liability fund exists (loan money received)
- User can draw/withdraw funds from liability fund
- Modal: `app/modals/draw-liability-funds.tsx`
- Moves money from liability fund to personal fund or creates expense

**Editing Liability Schedule:**
- User can edit payment schedule
- Modal: `app/modals/edit-liability-schedule.tsx`
- Can change payment amount, frequency, due dates
- Regenerates bills

**Settling Liability:**
- When balance reaches 0 or user wants to pay off
- Modal: `app/modals/liability-settlement.tsx`
- Checks settlement status
- User can make adjustments:
  - Repayment (reduce liability balance)
  - Refund (remove liability funds)
  - Convert to personal (reclassify funds)
  - Expense writeoff
- Marks liability as 'paid_off'

---

### Recurring Transactions

**Screen:** `app/(tabs)/recurring.tsx`

**Viewing Recurring Transactions:**
- Lists all active recurring transactions
- Shows next due date, amount, status
- Can filter by type (subscription, bill, payment, income)

**Creating Recurring Transaction:**
1. User taps "+" button
2. Modal opens (`app/modals/add-recurring-transaction.tsx`)
3. User enters:
   - Name (e.g., "Netflix Subscription")
   - Direction: income or expense
   - Nature: subscription, bill, payment, income
   - Amount (fixed) or estimated amount (variable)
   - Frequency: daily, weekly, monthly, quarterly, yearly, custom
   - Interval: repeat every X periods
   - Start date
   - End date or occurrence count (optional)
   - Day of month (if monthly)
   - Account (optional, selected when payment made)
   - Category
   - Fund type: personal, liability, goal
   - Payment tracking method:
     - 'bill': Creates bills automatically
     - 'scheduled_transaction': Creates scheduled transactions
     - 'direct': Creates transactions immediately
     - 'manual': User creates manually
   - Auto-create settings (days before due date)
   - Reminder settings
4. System creates recurring transaction:
   - Inserts into `recurring_transactions` table
   - Calculates `next_transaction_date` using recurrence engine
   - If `auto_create = true` and `payment_tracking_method = 'bill'`:
     - System will generate bills X days before due date (background process)

**Viewing Recurring Transaction Detail:**
**Screen:** `app/recurring/[id].tsx`
- Shows all details
- Uses `useRecurringTransactionCycles` hook
- Shows payment cycles with status
- Shows transaction history (actual payments made)
- Shows scheduled payments (if method = 'scheduled_transaction')
- Can pause, edit, delete

**Recurring Transaction Cycles:**
- Uses `utils/cycles.ts` to generate schedule
- Shows past, current, upcoming cycles
- Matches actual transactions to cycles
- Shows cycle overrides (custom dates/amounts for specific occurrences)

**Cycle Overrides:**
- User can override specific occurrences
- Modal: `app/modals/set-cycle-override.tsx`
- Can change date or amount for one occurrence
- Stored in cycle notes/overrides system

**Pausing Recurring Transaction:**
- User can pause (sets status = 'paused')
- No bills/payments generated while paused
- Can resume later

**Payment Tracking Methods:**

**Method: 'bill'**
- System generates bills automatically
- Bills appear in Bills tab
- User pays bills when due
- Next bill generated after payment

**Method: 'scheduled_transaction'**
- System creates scheduled transactions
- User confirms when ready
- Creates actual transaction on confirmation

**Method: 'direct'**
- System creates transactions immediately on due date
- No user confirmation needed

**Method: 'manual'**
- No automatic generation
- User manually creates transactions/bills

---

### Bills & Payment System

**Screen:** `app/(tabs)/bills.tsx`

**Viewing Bills:**
- Shows unified list of all upcoming payments
- Uses `fetchAllUpcomingPayments()` from `utils/billsAggregator.ts`
- Aggregates from multiple sources:
  1. Recurring transactions (converted to payments)
  2. Liabilities (liability bills)
  3. Scheduled payments
  4. Goal contributions (if scheduled)
  5. Bills table (direct bills)

**Bill Sources:**

**1. From Recurring Transactions:**
- If `payment_tracking_method = 'bill'`
- System generates bills X days before due date
- Bills have `parent_bill_id` linking to container (if exists)
- Bills appear in aggregator view

**2. From Liabilities:**
- Liability creates bills automatically
- Bills linked via `liability_id`
- Include principal/interest breakdown
- Each payment period has one bill

**3. From Scheduled Payments:**
- User creates one-time scheduled payment
- Appears as bill in aggregator
- Can be confirmed when due

**4. Direct Bills:**
- User creates bill manually
- Modal: `app/modals/add-bill.tsx`
- Can be one-time or recurring
- If recurring, system generates future bills

**Paying a Bill:**
1. User taps bill in Bills list
2. Sees bill details (amount, due date, source)
3. Taps "Pay"
4. Modal opens (`app/modals/pay-bill.tsx` or `unified-payment-modal.tsx`)
5. User selects account, fund source, confirms amount
6. System:
   - Creates transaction
   - Marks bill as paid
   - If recurring, generates next bill
   - Updates source (liability balance, recurring transaction stats, etc.)

**Bill Status:**
- `upcoming`: Not yet due
- `due_today`: Due today
- `overdue`: Past due date
- `paid`: Payment completed
- `skipped`: User skipped this payment
- `cancelled`: Bill cancelled
- `postponed`: Due date moved

**Status Calculation:**
- Database function `calculate_bill_status()` calculates based on due_date
- View `bills_with_status` provides calculated status
- Can be manually updated or auto-calculated

**Skipping/Postponing Bills:**
- User can skip bill (won't pay this time)
- User can postpone (move due date)
- Updates bill status accordingly

---

## Interconnections Between Features

### Accounts → Funds

**Connection:** Accounts contain funds via `account_funds` table

**How It Works:**
- When account created with initial balance > 0:
  - Personal fund created automatically (or via trigger)
- When money received:
  - Can allocate to personal, goal, or reserved fund
- When money spent:
  - Deducts from selected fund (personal, goal, borrowed)
- Account balance = sum of all fund balances in that account

**Code Evidence:**
- `account_funds` table with `account_id`, `fund_type`, `balance`
- FundPicker component allows selecting fund source/destination
- Fund operations in transaction creation modals

---

### Transactions → Budgets

**Connection:** Transactions automatically linked to budgets via database trigger

**How It Works:**
- When expense transaction created:
  - Trigger `trigger_create_budget_transactions` fires
  - Checks all active budgets:
    - Monthly: If transaction account linked to budget
    - Category: If account linked AND category matches
  - Creates entry in `budget_transactions` table
  - Budget spent_amount should update (currently requires manual RPC)

**Code Evidence:**
- Trigger in `migrations/005_create_budget_functions.sql`
- Function `create_budget_transactions_for_transaction()`
- `budget_transactions` table links transactions to budgets

---

### Recurring Transactions → Bills

**Connection:** Recurring transactions can generate bills automatically

**How It Works:**
- If `payment_tracking_method = 'bill'`:
  - Background process `processRecurringTransactionsForToday()` runs
  - Finds recurring transactions due in X days
  - Creates bills in `bills` table
  - Bills appear in Bills aggregator view
- If `payment_tracking_method = 'scheduled_transaction'`:
  - Creates scheduled transactions instead of bills
- If `payment_tracking_method = 'direct'`:
  - Creates transactions immediately on due date

**Code Evidence:**
- `utils/recurringPaymentTracking.ts` handles different methods
- `utils/recurringBillGeneration.ts` generates bills from recurring transactions
- `utils/billsAggregator.ts` includes recurring transactions in Bills view

---

### Liabilities → Bills

**Connection:** Liabilities generate bills for each payment period

**How It Works:**
- When liability created:
  - System generates bills for all payment periods
  - Uses amortization calculations for principal/interest
  - Bills linked via `liability_id`
- When bill paid:
  - Updates liability balance
  - Marks bill as paid
  - Next bill already exists (pre-generated)

**Code Evidence:**
- `utils/liabilityBills.ts` generates bills from liabilities
- Bills have `liability_id` field
- Bills include `principal_amount` and `interest_amount`

---

### Goals → Contributions

**Connection:** Goals track contributions via goal funds in accounts

**How It Works:**
- When user makes contribution:
  - Money moves from source account/fund to destination account
  - Goal fund created in destination account (if doesn't exist)
  - Goal fund type: 'goal', linked via `linked_goal_id`
  - Goal `current_amount` increases
- Goal fund balance = total saved toward goal
- Can track goal funds across multiple accounts

**Code Evidence:**
- `utils/goals.ts` has `addContributionToGoal()` function
- Creates goal funds in `account_funds` table
- Updates goal `current_amount`

---

### Accounts → Organizations

**Connection:** Accounts belong to organizations via `organization_id`

**How It Works:**
- Accounts created with organization selection
- Organization groups related accounts (same bank, etc.)
- Organization balance = sum of all account balances in that organization
- Accounts can exist without organization (shown in "Unassigned")

**Code Evidence:**
- Accounts table has `organization_id` field
- Organizations context groups accounts by organization
- Organization detail screen shows all accounts

---

### Bills Aggregator → All Sources

**Connection:** Bills aggregator unifies payments from all sources

**How It Works:**
- `fetchAllUpcomingPayments()` fetches from:
  1. Recurring transactions (converted to payments)
  2. Liabilities (bills)
  3. Scheduled payments
  4. Goal contributions
  5. Bills table
- Converts all to `UpcomingPayment` interface
- Deduplicates if same payment appears from multiple sources
- Applies filters (status, category, account)
- Sorts by due date

**Code Evidence:**
- `utils/billsAggregator.ts` contains aggregation logic
- Converts different source types to unified format
- Bills screen uses aggregator for unified view

---

### Cycles Engine → All Recurring Features

**Connection:** Unified cycles engine used by multiple features

**How It Works:**
- `utils/cycles.ts` provides cycle generation
- Used by:
  - Recurring transactions (payment cycles)
  - Liabilities (payment schedule)
  - Budgets (budget periods)
  - Goals (contribution cycles)
- Generates cycles based on:
  - Start date, end date
  - Frequency, interval
  - Due day of month
- Matches actual transactions/payments to cycles

**Code Evidence:**
- `generateCycles()` function in `utils/cycles.ts`
- Used by hooks: `useRecurringTransactionCycles`, `useLiabilityCycles`, `useBudgetCycles`, `useGoalCycles`

---

## Complete End-to-End User Journey

### Priya's First Month with FinTrack

**Week 1: Setup**

**Day 1: Account Creation & Onboarding**
- Signs up with email/password
- Completes onboarding:
  - Sets country: India, currency: INR
  - Creates organizations: "HDFC Bank", "ICICI Bank"
  - Adds accounts:
    - HDFC Savings: ₹50,000
    - HDFC Credit Card: ₹0 (limit: ₹1,00,000)
    - ICICI Savings: ₹30,000
  - Selects categories: Food, Transport, Bills, Entertainment, etc.

**Day 2: Adding Existing Financial Data**
- Creates home loan liability:
  - ₹50,00,000 original, ₹48,00,000 current balance
  - 8.5% interest, ₹35,000/month payment
  - System generates 137 bills (one per month until payoff)
- Creates recurring transactions:
  - Netflix: ₹649/month (bill method)
  - Spotify: ₹119/month (bill method)
  - Gym: ₹2,000/month (bill method)
  - Salary: ₹1,20,000/month (income, direct method)
- Creates goals:
  - Vacation: ₹2,00,000 target, 12 months, linked to HDFC Savings

**Day 3: Setting Up Budgets**
- Creates monthly budget: ₹30,000 total expenses
- Creates category budget: ₹10,000 for Food
- Links budgets to HDFC Savings account

---

**Week 2-4: Daily Usage**

**Daily Routine:**
- Checks home screen: Sees total balance, recent transactions
- Records expenses as they happen:
  - Grocery shopping: ₹2,000 (Pay modal, Food category)
  - Lunch: ₹300 (Pay modal, Food category)
  - Fuel: ₹1,500 (Pay modal, Transport category)
- Sees budget progress: Food budget at ₹7,500/₹10,000 (75%)

**Weekly Review:**
- Checks Bills tab: Sees upcoming payments
  - Netflix due Dec 11
  - Home loan due Dec 1
  - Gym due Dec 1
- Makes goal contribution:
  - Transfers ₹5,000 from HDFC Savings (personal fund) to goal fund
  - Goal progress: ₹5,000/₹2,00,000 (2.5%)

**Monthly Payments:**
- Dec 1: Pays home loan bill (₹35,000)
  - Selects HDFC Savings account
  - Pays from personal fund
  - System updates liability balance: ₹48,00,000 → ₹47,65,000
  - Next bill shows new principal/interest split
- Dec 1: Pays gym bill (₹2,000)
  - System marks bill paid
  - Next bill scheduled for Jan 1
- Dec 11: Pays Netflix bill (₹649)
  - System marks bill paid
  - Next bill scheduled for Jan 11

**Month End:**
- Reviews budget performance:
  - Monthly budget: ₹28,500/₹30,000 (95%) ✓
  - Food budget: ₹9,800/₹10,000 (98%) ⚠️
- Makes final goal contribution: ₹5,000
- Goal progress: ₹10,000/₹2,00,000 (5%)

---

**Month 2: Advanced Usage**

**Week 5:**
- Receives salary (₹1,20,000)
  - Records via Receive modal
  - Allocates to personal fund in HDFC Savings
  - Balance updates: ₹50,000 → ₹1,70,000
- Makes goal contribution: ₹10,000
  - Transfers from personal fund to goal fund
  - Goal progress: ₹20,000/₹2,00,000 (10%)

**Week 6:**
- Creates new recurring transaction:
  - Amazon Prime: ₹1,499/year (yearly)
  - Sets payment tracking: bill
  - System will generate bill in 11 months
- Edits liability schedule:
  - Increases monthly payment to ₹40,000
  - Wants to pay off loan faster
  - System regenerates bills with new payment amount

**Week 7:**
- Checks liability detail:
  - Sees payment cycles view
  - Sees amortization schedule
  - Sees that increasing payment will save ₹2,00,000 in interest
- Pauses gym subscription:
  - Going on vacation, won't use gym
  - Sets recurring transaction status to 'paused'
  - No bills generated while paused

**Week 8:**
- Creates new category budget:
  - Shopping: ₹5,000/month
  - Links to HDFC Credit Card account
  - Will track all credit card expenses in Shopping category
- Makes large purchase: ₹8,000
  - Uses credit card
  - Transaction automatically linked to Shopping budget
  - Budget shows: ₹8,000/₹5,000 (160%) ⚠️ Over budget!

---

## Summary of Feature Connections

| Feature A | Feature B | Connection Type | How It Works |
|-----------|-----------|-----------------|--------------|
| Accounts | Organizations | Ownership | Accounts belong to organizations via `organization_id` |
| Accounts | Funds | Containment | Accounts contain funds via `account_funds` table |
| Transactions | Accounts | Source/Destination | Transactions move money between accounts |
| Transactions | Categories | Classification | Transactions categorized via `category_id` |
| Transactions | Budgets | Automatic Linking | Trigger links expense transactions to budgets |
| Recurring Transactions | Bills | Generation | Recurring transactions generate bills automatically |
| Recurring Transactions | Scheduled Transactions | Alternative Method | Can create scheduled transactions instead of bills |
| Liabilities | Bills | Generation | Liabilities generate payment bills |
| Liabilities | Accounts | Funds | Liability funds tracked in accounts via `account_funds` |
| Goals | Accounts | Funds | Goal funds tracked in accounts via `account_funds` |
| Goals | Contributions | Tracking | Contributions update goal funds and `current_amount` |
| Bills | All Sources | Aggregation | Bills aggregator unifies payments from all sources |
| Cycles | All Recurring | Schedule Generation | Unified cycles engine used by all recurring features |

---

## Known Limitations & Partial Implementations

Based on the codebase audit, the following features are partially implemented or have known gaps:

### Budget Spent Amount Updates
- **Status:** Transaction-budget linking works automatically
- **Gap:** Budget `spent_amount` field not automatically updated when transactions linked
- **Workaround:** Must call `update_budget_spent_amount()` RPC manually (or trigger needs to be added)
- **User Impact:** Budget progress may not update in real-time until manual refresh

### Bill Status Calculation
- **Status:** Status calculation function exists (`calculate_bill_status()`)
- **Gap:** Status not automatically updated daily
- **Workaround:** Status calculated on-demand when viewing bills
- **User Impact:** Bill status may not reflect overdue state until bill is viewed

### Automatic Bill Generation from Recurring Transactions
- **Status:** Code exists to generate bills (`processRecurringTransactionsForToday()`)
- **Gap:** No scheduled job/cron to run automatically
- **Workaround:** Must be triggered manually or via scheduled service (not implemented)
- **User Impact:** Bills from recurring transactions may not be generated automatically

### Recurring Transaction Field Mappings
- **Status:** Code handles field name differences
- **Gap:** Database uses 'type' but frontend uses 'direction', database uses 'name' but frontend uses 'title'
- **Workaround:** Mapping layer in code converts between formats
- **User Impact:** None (transparent to user, but adds code complexity)

### Liability Status Automation
- **Status:** Liability balance tracked
- **Gap:** Status doesn't automatically change to 'paid_off' when balance reaches 0
- **Workaround:** User must manually mark as paid off or system checks on access
- **User Impact:** Liability status may show 'active' even when fully paid

### Goal-Based Budget Logic
- **Status:** Goal-based budgets can be created
- **Gap:** Transaction matching logic for goal-based budgets unclear in code
- **Note:** Comment says "logic handled in application" but implementation details unclear
- **User Impact:** Goal-based budgets may not track correctly

### Budget Alert System
- **Status:** `alert_settings` field exists in budgets table
- **Gap:** No notification system found in codebase
- **User Impact:** Budget warnings/alerts are not sent to users

### Bills Parent-Child Relationship
- **Status:** `parent_bill_id` field exists, hierarchical structure supported
- **Gap:** Relationship between container bills and payment bills not fully documented in usage
- **Note:** Bills can act as templates (containers) or payment instances
- **User Impact:** May cause confusion about which bills are templates vs payments

---

## Implementation Notes

### What's Fully Implemented
- ✅ User authentication and onboarding
- ✅ Organizations and accounts CRUD
- ✅ Transaction recording (pay, receive, transfer)
- ✅ Goal creation and contributions
- ✅ Liability creation and payment tracking
- ✅ Recurring transaction templates
- ✅ Bills aggregation from multiple sources
- ✅ Budget creation and transaction linking
- ✅ Cycles generation for all recurring features
- ✅ Fund segregation in accounts
- ✅ Category management

### What's Partially Implemented
- ⚠️ Budget spent amount auto-updates (linking works, amount update requires manual call)
- ⚠️ Bill status auto-updates (calculation works, but not scheduled)
- ⚠️ Automatic bill generation (code exists, no scheduled job)
- ⚠️ Notification/alert system (fields exist, no implementation)
- ⚠️ Liability status automation (balance tracked, status update manual)

### What's Not Implemented
- ❌ Scheduled jobs/cron for automatic processes
- ❌ Push notifications for reminders/alerts
- ❌ MCP server (all operations go through Supabase directly)
- ❌ Budget renewal automation UI
- ❌ Bill payment reminder notifications

---

**Document End**

