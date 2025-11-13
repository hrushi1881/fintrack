# Budget System - Complete Analysis

## Overview
The FinTrack budget system is a comprehensive financial tracking feature that supports multiple budget types, account linking, transaction tracking, and goal integration. This document provides a complete analysis of the budget system's architecture, implementation, and current status.

## Database Schema

### Tables

#### 1. `budgets` (Core Budget Table)
**Purpose**: Stores all budget information and metadata

**Key Columns**:
- `id` (UUID, PK)
- `user_id` (UUID, FK → auth.users)
- `name` (TEXT) - Budget name
- `amount` (DECIMAL(12,2)) - Budget limit
- `currency` (TEXT, default: 'USD')
- `created_by` (UUID, FK → auth.users)
- `budget_type` (TEXT) - 'monthly' | 'category' | 'goal_based' | 'smart'
- `start_date` (DATE) - Budget period start
- `end_date` (DATE) - Budget period end
- `recurrence_pattern` (TEXT) - 'monthly' | 'weekly' | 'yearly' | 'custom'
- `rollover_enabled` (BOOLEAN) - Allow budget rollover
- `category_id` (UUID, FK → categories) - For category budgets
- `goal_id` (UUID, FK → goals) - For goal-based budgets
- `is_active` (BOOLEAN, default: true)
- `is_deleted` (BOOLEAN, default: false)
- `spent_amount` (DECIMAL(12,2), default: 0)
- `remaining_amount` (DECIMAL(12,2), GENERATED) - Calculated as (amount - spent_amount)
- `metadata` (JSONB) - Stores goal_subtype, UI settings, templates
- `alert_settings` (JSONB) - Thresholds, channels, snooze settings
- `created_at`, `updated_at` (TIMESTAMP)

**Constraints**:
- `end_date > start_date`
- `spent_amount >= 0`
- `amount > 0`

**Indexes**:
- `idx_budgets_user_id`
- `idx_budgets_budget_type`
- `idx_budgets_category_id`
- `idx_budgets_goal_id`
- `idx_budgets_is_active`
- `idx_budgets_dates`
- `idx_budgets_metadata` (GIN)

**RLS Policies**:
- Users can view/insert/update/delete their own budgets

#### 2. `budget_accounts` (Junction Table)
**Purpose**: Links budgets to accounts with role and sync tracking

**Key Columns**:
- `id` (UUID, PK)
- `budget_id` (UUID, FK → budgets, CASCADE DELETE)
- `account_id` (UUID, FK → accounts, CASCADE DELETE)
- `account_role` (TEXT) - 'owner' | 'shared'
- `last_synced_at` (TIMESTAMP)
- `created_at`, `updated_at` (TIMESTAMP)

**Constraints**:
- UNIQUE(budget_id, account_id)

**Indexes**:
- `idx_budget_accounts_budget_id`
- `idx_budget_accounts_account_id`
- `idx_budget_accounts_role`
- `idx_budget_accounts_last_synced`

**RLS Policies**:
- Users can access budget_accounts for their own budgets

#### 3. `budget_transactions` (Transaction Linking)
**Purpose**: Links transactions to budgets with exclusion tracking

**Key Columns**:
- `id` (UUID, PK)
- `budget_id` (UUID, FK → budgets, CASCADE DELETE)
- `transaction_id` (UUID, FK → transactions, CASCADE DELETE)
- `is_excluded` (BOOLEAN, default: false)
- `excluded_at` (TIMESTAMP)
- `excluded_reason` (TEXT)
- `amount_counted` (DECIMAL(12,2)) - Amount counted toward budget
- `applied_at` (TIMESTAMP)
- `reconciled` (BOOLEAN, default: false)
- `created_at`, `updated_at` (TIMESTAMP)

**Constraints**:
- UNIQUE(budget_id, transaction_id)

**Indexes**:
- `idx_budget_transactions_budget_id`
- `idx_budget_transactions_transaction_id`
- `idx_budget_transactions_is_excluded`
- `idx_budget_transactions_applied_at`
- `idx_budget_transactions_reconciled`

**RLS Policies**:
- Users can access budget_transactions for their own budgets

#### 4. `budget_events` (Audit Trail)
**Purpose**: Logs all budget operations and events

**Key Columns**:
- `id` (UUID, PK)
- `budget_id` (UUID, FK → budgets, CASCADE DELETE)
- `event_type` (TEXT) - Event type identifier
- `actor_id` (UUID, FK → auth.users)
- `reason` (TEXT) - Optional reason for event
- `metadata` (JSONB) - Additional event data
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes**:
- `idx_budget_events_budget_id`
- `idx_budget_events_event_type`
- `idx_budget_events_actor_id`
- `idx_budget_events_created_at`
- `idx_budget_events_metadata` (GIN)

**RLS Policies**:
- Users can access budget_events for their own budgets

### Database Functions

#### 1. `create_budget_transactions_for_transaction()`
**Purpose**: Automatically create budget_transactions when transactions are created

**Status**: ⚠️ **NOT FOUND IN DATABASE** - This function doesn't exist, which means transactions are NOT automatically linked to budgets!

**Expected Behavior**:
- Triggered AFTER INSERT on transactions table
- Only processes expense transactions
- Finds all active budgets that should include the transaction:
  - Monthly budgets: All expense transactions from linked accounts
  - Category budgets: Transactions from linked accounts with matching category
  - Goal-based budgets: Transactions from linked accounts (logic handled in application)
- Creates budget_transactions records

**Issue**: This function needs to be created and the trigger needs to be set up.

#### 2. `update_budget_spent_amount(budget_uuid UUID)`
**Purpose**: Update budget spent_amount from budget_transactions

**Implementation**: Updates `budgets.spent_amount` by summing `amount_counted` from non-excluded `budget_transactions`.

#### 3. `is_budget_over_limit(budget_uuid UUID)`
**Purpose**: Check if budget is over limit

**Returns**: BOOLEAN indicating if `spent_amount > amount`

#### 4. `get_budget_progress_percentage(budget_uuid UUID)`
**Purpose**: Calculate budget progress percentage

**Returns**: DECIMAL(5,2) representing `(spent_amount / amount) * 100`

#### 5. `get_budget_daily_pace(budget_uuid UUID)`
**Purpose**: Calculate daily spending pace

**Returns**: TABLE with:
- `ideal_daily_spend` - Ideal daily spend to stay on track
- `current_daily_avg` - Current daily average spending
- `on_track` - BOOLEAN indicating if spending is within 20% tolerance

### Database Views

#### 1. `budget_summary`
**Purpose**: Budget summary with progress calculations

**Columns**: All budget fields plus:
- `progress_percentage` - From `get_budget_progress_percentage()`
- `is_over_limit` - From `is_budget_over_limit()`
- `account_count` - Number of linked accounts
- `transaction_count` - Number of linked transactions

#### 2. `budget_daily_pace`
**Purpose**: Daily pace analysis for all budgets

**Columns**: Budget info plus daily pace calculations

#### 3. `budget_alerts`
**Purpose**: Budget alerts and warnings

**Columns**: Budget info plus:
- `alert_level` - 'over_limit' | 'at_limit' | 'warning' | 'on_track'

#### 4. `budget_transaction_details`
**Purpose**: Budget transactions with transaction details

**Columns**: Budget transaction info plus:
- Transaction details (amount, type, description, date)
- Category info
- Account info

#### 5. `budget_event_details`
**Purpose**: Budget events with user details

**Columns**: Budget event info plus:
- Budget name and type
- Actor email

## Budget Types

### 1. Monthly Budget (`monthly`)
**Description**: Track total spending across all categories for a specific month

**Features**:
- Month-based tracking
- Automatic renewal options
- Category-based or general spending
- Account linking
- Alert thresholds

**Use Cases**:
- Monthly grocery budgets
- Monthly entertainment spending
- Monthly utilities tracking
- General monthly expenses

**Configuration**:
- Start/end dates for month
- Monthly amount limit
- Alert thresholds (50%, 80%, 100%)
- Daily pace tracking
- Rollover options

### 2. Category Budget (`category`)
**Description**: Set spending limits for specific categories

**Features**:
- Category-specific tracking
- Multiple categories supported
- Transaction categorization
- Category-based alerts
- Account filtering

**Use Cases**:
- Food & Dining
- Shopping
- Transportation
- Entertainment
- Subscriptions

**Configuration**:
- Category selection
- Budget amount per category
- Time period
- Account selection
- Alert configuration

### 3. Goal-Based Budget (`goal_based`) ⭐
**Description**: Link budget to your savings goals

**Features**:
- ✅ Goal linking and selection
- ✅ Goal progress display
- ✅ Goal progress synchronization
- ✅ Goal subtypes (A, B, C)
- ✅ "View Goal" navigation
- ✅ Automatic goal updates

**Subtypes**:
- **Type A**: Save X% of deposits until date
- **Type B**: Save fixed amount monthly until date
- **Type C**: Reach target by date (system calculates monthly)

**Use Cases**:
- Emergency fund savings
- Vacation savings
- Down payment savings
- Car purchase savings
- Education fund savings

**Configuration**:
- Goal selection from active goals
- Goal subtype selection
- Budget amount
- Time period
- Account selection
- Progress tracking

### 4. Smart Budget (`smart`)
**Description**: AI-powered spending recommendations

**Status**: 🚧 Coming Soon

**Planned Features**:
- AI-driven budget suggestions
- Learning from spending patterns
- Automatic adjustments
- Predictive analytics
- Personalized recommendations

## Frontend Implementation

### Components

#### 1. `BudgetCard` (`components/BudgetCard.tsx`)
**Purpose**: Display budget information in list view

**Features**:
- Type-specific icon and color
- Progress bar and status
- Spent/remaining amounts
- Period dates
- Goal info (for goal-based budgets)
- Compact and full display modes

**Props**:
- `budget: Budget`
- `onPress: () => void`
- `compact?: boolean`

#### 2. `AddBudgetModal` (`app/modals/add-budget.tsx`)
**Purpose**: Multi-step budget creation wizard

**Steps**:
1. **Choose Budget Type** - Select from monthly, category, goal_based, smart
2. **Budget Details** - Name, amount, dates, category/goal selection
3. **Account Selection** - Choose which accounts to include
4. **Alert Settings** - Configure thresholds and daily pace warnings
5. **Review & Create** - Review settings and create budget

**Features**:
- Form validation
- Goal selection for goal-based budgets
- Goal subtype selection (A, B, C)
- Category selection for category budgets
- Account multi-selection
- Alert threshold configuration
- Date picker integration

#### 3. `BudgetDetailScreen` (`app/budget/[id].tsx`)
**Purpose**: Display budget details and management

**Tabs**:
1. **Overview** - Progress, stats, alerts, daily pace, goal info
2. **Transactions** - Included and excluded transactions
3. **Accounts** - Linked accounts (placeholder)

**Features**:
- Budget progress visualization
- Daily pace indicator
- Alert banners
- Transaction exclusion/inclusion
- Goal info card (for goal-based budgets)
- "View Goal" navigation
- Period management (end period, rollover)

### Utilities

#### `utils/budgets.ts`
**Purpose**: Budget utility functions

**Functions**:
1. `createBudget()` - Create new budget with account associations
2. `updateBudgetProgress()` - Recalculate spent/remaining amounts
3. `getBudgetTransactions()` - Get budget transactions with exclusion handling
4. `excludeTransactionFromBudget()` - Exclude transaction from budget
5. `includeTransactionInBudget()` - Include transaction in budget (undo exclusion)
6. `getBudgetsByAccount()` - Get budgets for a specific account
7. `snoozeAlert()` - Snooze budget alert
8. `checkBudgetAlerts()` - Check and trigger budget alerts
9. `calculateDailyPace()` - Calculate daily spending pace
10. `closeBudgetPeriod()` - Close budget period and handle rollover
11. `renewBudget()` - Renew a recurring budget for the next period
12. `reconcileRefund()` - Reconcile refunded transactions across budgets
13. `logBudgetEvent()` - Log budget event for audit trail
14. `updateGoalProgressFromBudget()` - Update goal progress from budget (for goal-based budgets)

### Data Fetching

#### `hooks/useRealtimeData.ts`
**Purpose**: Provide real-time data from Supabase

**Budget-related functions**:
- `fetchBudgets()` - Fetch budgets with budget_accounts and account details
- `refreshBudgets()` - Refresh budget data
- `budgets` - Budget state
- `getBudgetsByAccount()` - Get budgets filtered by account

**Query**:
```typescript
.from('budgets')
.select(`
  *,
  budget_accounts!inner(
    account_id,
    account:accounts!inner(name, color, icon)
  )
`)
.eq('user_id', user.id)
.eq('is_deleted', false)
.order('created_at', { ascending: false })
```

## Current Status

### ✅ Working Features

1. **Budget Creation**
   - ✅ All budget types (monthly, category, goal_based)
   - ✅ Multi-step wizard
   - ✅ Form validation
   - ✅ Account linking
   - ✅ Alert configuration
   - ✅ Goal selection and subtypes
   - ✅ Category selection

2. **Budget Display**
   - ✅ Budget list view with cards
   - ✅ Budget detail view with tabs
   - ✅ Progress visualization
   - ✅ Goal info display (for goal-based budgets)
   - ✅ Daily pace indicator
   - ✅ Alert banners

3. **Budget Management**
   - ✅ Transaction exclusion/inclusion
   - ✅ Budget progress calculation
   - ✅ Period management
   - ✅ Budget renewal

4. **Goal Integration**
   - ✅ Goal-based budget creation
   - ✅ Goal progress display
   - ✅ Goal navigation
   - ✅ Goal progress synchronization

### ⚠️ Issues Found

1. **Missing Trigger Function**
   - ❌ `create_budget_transactions_for_transaction()` function doesn't exist
   - ❌ No trigger on transactions table to auto-link transactions to budgets
   - **Impact**: Transactions are NOT automatically linked to budgets
   - **Solution**: Create the function and trigger from migration `005_create_budget_functions.sql`

2. **No Budget Transactions**
   - ❌ `budget_transactions` table is empty
   - **Impact**: Budgets show 0 spent because no transactions are linked
   - **Solution**: Fix the trigger function or manually link transactions

3. **Schema Mismatch**
   - ⚠️ Budget interface has `period` field, but database uses `recurrence_pattern`
   - ⚠️ `createBudget()` function references `period` incorrectly
   - **Impact**: Potential issues when creating budgets
   - **Solution**: Fix the `createBudget()` function to use `recurrence_pattern` correctly

4. **Budget Progress Not Updating**
   - ⚠️ `spent_amount` and `remaining_amount` may not update automatically
   - **Impact**: Budget progress may be stale
   - **Solution**: Ensure `updateBudgetProgress()` is called after transactions

### 🔧 Needed Fixes

1. **Create Trigger Function**
   ```sql
   -- Apply migration 005_create_budget_functions.sql
   -- This will create the trigger function and set up the trigger
   ```

2. **Fix createBudget Function**
   ```typescript
   // In utils/budgets.ts, remove the 'period' field reference
   // Use 'recurrence_pattern' instead
   ```

3. **Manual Transaction Linking**
   ```typescript
   // Optionally, create a function to manually link existing transactions
   // to budgets based on account and category matching
   ```

4. **Update Budget Progress**
   ```typescript
   // Ensure updateBudgetProgress() is called after:
   // - Transaction creation
   // - Transaction exclusion/inclusion
   // - Budget creation
   ```

## Data Flow

### Creating a Budget

1. User opens `AddBudgetModal`
2. User selects budget type
3. User enters budget details
4. User selects category/goal (if applicable)
5. User selects accounts
6. User configures alerts
7. `createBudget()` is called
8. Budget is created in database
9. `budget_accounts` records are created
10. `budget_events` record is created
11. `globalRefresh()` is called
12. Budget appears in list

### Linking Transactions to Budgets

**Current Flow** (Broken):
1. Transaction is created
2. ❌ Trigger should fire but doesn't exist
3. ❌ `budget_transactions` record should be created but isn't
4. ❌ Budget `spent_amount` doesn't update

**Expected Flow** (After Fix):
1. Transaction is created
2. ✅ Trigger fires `create_budget_transactions_for_transaction()`
3. ✅ Function finds matching budgets:
   - Monthly: All expense transactions from linked accounts
   - Category: Transactions from linked accounts with matching category
   - Goal-based: Transactions from linked accounts
4. ✅ `budget_transactions` records are created
5. ✅ `update_budget_spent_amount()` is called
6. ✅ Budget `spent_amount` and `remaining_amount` are updated

### Updating Budget Progress

1. `updateBudgetProgress()` is called
2. Function fetches all non-excluded `budget_transactions` for budget
3. Function sums `amount_counted` to get `spent_amount`
4. Function calculates `remaining_amount = amount - spent_amount`
5. Budget is updated in database
6. For goal-based budgets, `updateGoalProgressFromBudget()` is called
7. Goal `current_amount` is updated (if applicable)

## Testing Scenarios

### Create Budget
1. ✅ Navigate to Budgets tab
2. ✅ Tap "Create Budget"
3. ✅ Select budget type
4. ✅ Enter budget details
5. ✅ Select category/goal
6. ✅ Select accounts
7. ✅ Configure alerts
8. ✅ Create budget
9. ✅ Verify budget appears in list

### View Budget
1. ✅ View budget list
2. ✅ Tap budget to view detail
3. ✅ See progress and stats
4. ✅ See goal info (if goal-based)
5. ✅ See transactions (if any)
6. ✅ See accounts

### Link Transactions
1. ❌ Create transaction
2. ❌ Verify transaction is linked to budget (currently broken)
3. ❌ Verify budget progress updates (currently broken)

### Exclude Transaction
1. ✅ View budget transactions
2. ✅ Tap exclude on transaction
3. ✅ Enter reason
4. ✅ Verify transaction is excluded
5. ✅ Verify budget progress updates

## Recommendations

### Immediate Actions

1. **Apply Missing Migration**
   - Apply `005_create_budget_functions.sql` to create the trigger function
   - Verify the trigger is set up on the transactions table

2. **Fix createBudget Function**
   - Remove `period` field reference
   - Use `recurrence_pattern` correctly

3. **Manual Transaction Linking**
   - Create a function to link existing transactions to budgets
   - Run it for existing budgets and transactions

4. **Update Budget Progress**
   - Ensure `updateBudgetProgress()` is called after transactions
   - Consider calling it automatically via trigger

### Future Enhancements

1. **Smart Budget Implementation**
   - Implement AI-powered budget suggestions
   - Add learning from spending patterns
   - Add automatic adjustments

2. **Budget Templates**
   - Pre-configured budgets for common scenarios
   - Quick budget creation from templates

3. **Budget Analytics**
   - Spending trends
   - Budget performance over time
   - Comparison across budgets

4. **Budget Sharing**
   - Share budgets with other users
   - Collaborative budget management

5. **Budget Notifications**
   - Push notifications for budget alerts
   - Email notifications
   - SMS notifications

## Conclusion

The budget system is well-architected with a comprehensive database schema, multiple budget types, and goal integration. However, there are critical issues that need to be fixed:

1. **Missing trigger function** - Transactions are not automatically linked to budgets
2. **No budget transactions** - Budgets show 0 spent because no transactions are linked
3. **Schema mismatch** - `period` field reference needs to be fixed

Once these issues are fixed, the budget system should work as intended, automatically tracking spending against budgets and updating progress in real-time.

