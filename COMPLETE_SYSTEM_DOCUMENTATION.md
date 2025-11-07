# FinTrack Complete System Documentation

## Overview
This document provides complete functionality, database schema, and operations for all components in the FinTrack application.

---

## Database Schema Summary

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `accounts` | Financial accounts | id, user_id, name, type, balance, currency, linked_liability_id |
| `transactions` | All financial transactions | id, user_id, account_id, type, amount, category_id, date |
| `goals` | Savings goals | id, user_id, title, target_amount, current_amount, target_date |
| `goal_contributions` | Goal contributions | id, goal_id, transaction_id, amount, source_account_id |
| `account_goal_portions` | Goal funds in accounts | id, account_id, goal_id, amount |
| `bills` | Bills and recurring payments | id, user_id, title, amount, due_date, bill_type, status |
| `bill_payments` | Bill payment history | id, bill_id, amount, payment_date, transaction_id |
| `liabilities` | Debts and loans | id, user_id, title, current_balance, interest_rate_apy, liability_type |
| `liability_payments` | Liability payment history | id, liability_id, amount, payment_date, transaction_id |
| `account_liability_portions` | Liability funds in accounts | id, account_id, liability_id, amount |
| `budgets` | Spending budgets | id, user_id, name, amount, budget_type, spent_amount |
| `budget_accounts` | Budget-account links | budget_id, account_id, account_role |
| `budget_transactions` | Budget-transaction links | id, budget_id, transaction_id, is_excluded |
| `categories` | Transaction categories | id, user_id, name, activity_types, color, icon |

---

## Tab Screens

### 1. Accounts Tab (`app/(tabs)/accounts.tsx`)
**Functionality**: Display all user accounts
- **Query**: `SELECT * FROM accounts WHERE user_id = ? AND is_active = true`
- **Features**: Account cards, total balance, navigate to detail, add account

### 2. Goals Tab (`app/(tabs)/goals.tsx`)
**Functionality**: Display all savings goals
- **Query**: `SELECT * FROM goals WHERE user_id = ? AND is_deleted = false`
- **Features**: Progress bars, filter by status, add goal

### 3. Bills Tab (`app/(tabs)/bills.tsx`)
**Functionality**: Display all bills
- **Query**: `SELECT * FROM bills WHERE user_id = ? AND is_deleted = false ORDER BY due_date`
- **Features**: Group by status, due dates, mark as paid

### 4. Liabilities Tab (`app/(tabs)/liabilities.tsx`)
**Functionality**: Display all liabilities
- **Query**: `SELECT * FROM liabilities WHERE user_id = ? AND is_deleted = false`
- **Features**: Balance, interest rate, payment info, add liability

### 5. Budgets Tab (`app/(tabs)/budgets.tsx`)
**Functionality**: Display all budgets
- **Query**: `SELECT budgets.*, budget_accounts.* FROM budgets LEFT JOIN budget_accounts WHERE user_id = ?`
- **Features**: Budget types, spent/remaining, progress bars

### 6. Transactions Tab (`app/(tabs)/transactions.tsx`)
**Functionality**: Display all transactions
- **Query**: `SELECT transactions.*, categories.*, accounts.* FROM transactions LEFT JOIN categories, accounts WHERE user_id = ? ORDER BY date DESC`
- **Features**: Filter by type/date, category info, account info

---

## Detail Pages

### Account Detail (`app/account/[id].tsx`)
- Account info, transaction history, quick actions (pay/receive/transfer)
- Queries: Account by id, transactions by account_id

### Goal Detail (`app/goal/[id].tsx`)
- Goal info, contributions list, add/withdraw funds
- Queries: Goal by id, goal_contributions with transactions

### Bill Detail (`app/bill/[id].tsx`)
- Bill info, payment history, mark as paid, postpone
- Queries: Bill by id, bill_payments by bill_id

### Liability Detail (`app/liability/[id].tsx`)
- Liability info, payment history, pay/draw funds, strategies
- Queries: Liability by id, liability_payments, liability_calculations

### Budget Detail (`app/budget/[id].tsx`)
- Budget info, linked accounts, transaction list, exclude/include
- Queries: Budget by id, budget_accounts, budget_transactions

### Transaction Detail (`app/transaction/[id].tsx`)
- Full transaction details, edit/delete
- Query: Transaction by id with category and account joins

---

## Payment Modals

### 1. Pay Modal (`app/modals/pay.tsx`)
**Purpose**: Record expense
- Select account, fund bucket (personal/goal/liability), amount, category, date
- **RPC**: `spend_from_account_bucket`
- Creates expense transaction, decreases account balance and bucket balance

### 2. Goal Contribution (`app/modals/add-contribution.tsx`)
**Purpose**: Add money to goal
- Select goal, source account, amount
- **RPC**: `spend_from_account_bucket` (personal) → `receive_to_account_bucket` (goal bucket)
- Updates goal.current_amount, creates goal_contribution

### 3. Bill Payment (`app/modals/mark-bill-paid.tsx`)
**Purpose**: Mark bill as paid
- Select account, fund bucket, amount, date
- **RPC**: `spend_from_account_bucket`, `generate_next_bill_instance` (if recurring)
- Creates bill_payment, updates bill status

### 4. Liability Payment (`app/modals/pay-liability.tsx`)
**Purpose**: Pay liability
- Select account, fund bucket (personal/liability portion), amount
- **RPC**: `repay_liability` or `settle_liability_portion`
- Creates liability_payment, decreases liability.current_balance

---

## Draw Modals

### 1. Goal Withdrawal (`components/WithdrawFundsModal.tsx`)
**Purpose**: Withdraw from goal
- Select goal, amount, destination account
- **RPC**: `spend_from_account_bucket` (goal bucket) → `receive_to_account_bucket` (personal)
- Decreases goal.current_amount

### 2. Liability Funds Draw (`app/modals/draw-liability-funds.tsx`)
**Purpose**: Draw from liability (e.g., credit card cash advance)
- Select liability, distribute to accounts with amounts, category
- **RPC**: `receive_to_account_bucket` (liability bucket) for each account
- Updates liability.disbursed_amount, creates liability_activity_log

---

## Transfer & Receive Modals

### Transfer (`app/modals/transfer.tsx`)
**Modes**:
1. **Between Accounts**: Transfer between accounts
   - **RPC**: `spend_from_account_bucket` → `receive_to_account_bucket`
2. **Liability to Personal**: Convert liability portion to personal
   - **RPC**: `spend_from_account_bucket` (liability) → `receive_to_account_bucket` (personal)

### Receive (`app/modals/receive.tsx`)
**Purpose**: Record income
- Select account, amount, category, optional goal allocation
- **RPC**: `receive_to_account_bucket`
- Creates income transaction, increases account balance

---

## Creation Modals

### Add Account (`app/modals/add-account.tsx`)
- 4-step: Type → Details → Visual → Settings
- **Operation**: `INSERT INTO accounts`, creates initial balance transaction if balance > 0

### Add Goal (`app/modals/add-goal.tsx`)
- Title, target, date, category, color, icon
- **Operation**: Gets/creates Goals Savings Account, `INSERT INTO goals`

### Add Bill (`app/modals/add-bill.tsx`)
- Title, amount, due date, type (one_time/recurring), recurrence config
- **Operation**: `INSERT INTO bills`, calculates status

### Add Budget (`app/modals/add-budget.tsx`)
- Type (monthly/category/goal_based/smart), amount, dates, accounts, alerts
- **Operation**: `INSERT INTO budgets`, `INSERT INTO budget_accounts`

### Add Liability (`app/modals/add-liability.tsx`)
- Type, balance, interest rate, payment, term, dates
- **Operation**: `INSERT INTO liabilities`, `INSERT INTO liability_calculations`

### Add Category (`app/modals/add-category.tsx`)
- Name, activity_types (expense/income/goal/liability), color, icon
- **Operation**: `INSERT INTO categories`

---

## RPC Functions

### `spend_from_account_bucket`
**Parameters**: user_id, account_id, bucket (type, id), amount, category, description, date, currency
**Operations**: Creates expense transaction, decreases account.balance and bucket balance

### `receive_to_account_bucket`
**Parameters**: user_id, account_id, bucket_type, bucket_id, amount, category, description, date, currency
**Operations**: Creates income transaction, increases account.balance and bucket balance

### `repay_liability`
**Parameters**: user_id, account_id, liability_id, amount, date, notes
**Operations**: Creates expense transaction, decreases account balance and liability.current_balance

### `settle_liability_portion`
**Parameters**: user_id, account_id, liability_id, amount, date
**Operations**: Uses liability portion funds to pay liability, decreases account_liability_portions

### `generate_next_bill_instance`
**Parameters**: bill_uuid
**Operations**: Creates next occurrence for recurring bills based on recurrence_pattern

---

## Account Bucket System

### Bucket Types
1. **Personal**: Default funds (stored in account.balance directly)
2. **Goal**: Funds allocated to goals (stored in `account_goal_portions`)
3. **Liability**: Funds drawn from liabilities (stored in `account_liability_portions`)

### Balance Calculation
```
account.balance = personal_funds + SUM(goal_portions) + SUM(liability_portions)
```

### Operations
- **Add to bucket**: `receive_to_account_bucket` with appropriate bucket_type/id
- **Spend from bucket**: `spend_from_account_bucket` with bucket parameter
- **Transfer between buckets**: Combine spend + receive operations

---

## Key Data Flows

### Goal Contribution Flow
1. User selects goal, account, amount
2. `spend_from_account_bucket` (source account, personal)
3. `receive_to_account_bucket` (Goals Savings Account, goal bucket)
4. `INSERT INTO goal_contributions`
5. `UPDATE goals SET current_amount = current_amount + amount`

### Bill Payment Flow
1. User marks bill as paid
2. `spend_from_account_bucket` (selected account, selected bucket)
3. `INSERT INTO bill_payments`
4. `UPDATE bills SET status = 'paid', last_paid_date = ?`
5. If recurring: `generate_next_bill_instance`

### Liability Payment Flow
1. User pays liability
2. If personal funds: `repay_liability`
3. If liability portion: `settle_liability_portion`
4. `INSERT INTO liability_payments`
5. `UPDATE liabilities SET current_balance = current_balance - amount`

---

## Relationships

- **Accounts** → Transactions (1:many)
- **Goals** → Goal Contributions (1:many)
- **Bills** → Bill Payments (1:many)
- **Liabilities** → Liability Payments (1:many)
- **Budgets** → Budget Accounts (many:many)
- **Budgets** → Budget Transactions (many:many)
- **Accounts** → Account Goal Portions (1:many)
- **Accounts** → Account Liability Portions (1:many)

---

**Last Updated**: 2024-11-05
**Status**: Complete System Documentation
