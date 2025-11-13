# Current FinTrack System Structure Analysis

## 📊 Database Structure

### Core Tables
1. **accounts** - Stores all financial accounts
   - `balance` - Total balance (includes personal + goal portions + liability portions)
   - `type` - Account type (bank, card, goals_savings, liability, etc.)

2. **transactions** - All financial transactions
   - `type`: 'income', 'expense', 'transfer'
   - `amount`: Positive for income, negative for expense
   - `balance_before`, `balance_after` - Snapshot of account balance at transaction time
   - `category_id` - Links to categories table
   - `metadata` - JSONB storing bucket info, liability_id, etc.

3. **account_goal_portions** - Tracks goal funds within accounts
   - Links accounts to goals with amounts
   - Used to track how much of an account balance belongs to specific goals

4. **account_liability_portions** - Tracks liability funds within accounts
   - Links accounts to liabilities with amounts
   - Used to track borrowed money in accounts

5. **goals** - Savings goals
   - `current_amount` - Total saved
   - Funds stored in `goals_savings` account type via `account_goal_portions`

6. **liabilities** - Debts/loans
   - `current_balance` - Amount owed
   - `disbursed_amount` - Amount drawn/used
   - `original_amount` - Total limit/principal

7. **bills** - Recurring/one-time bills
   - `status` - pending, paid, overdue
   - `bill_type` - one_time, recurring

8. **bill_payments** - Bill payment history
   - Links bills to transactions

9. **liability_payments** - Liability payment history
   - Links liabilities to transactions

---

## 🔄 Transaction Flow: Frontend + Backend

### **1. PAY (Expense)**
**Frontend**: `app/modals/pay.tsx`
- User selects: Account, Fund Bucket (personal/goal/liability), Amount, Category, Description, Date
- **Backend RPC**: `spend_from_account_bucket`
  - Validates bucket has sufficient funds
  - Decrements account.balance
  - Decrements bucket amount (if goal/liability)
  - Creates expense transaction (amount = -p_amount)
  - Stores balance_before and balance_after

**Result**: Account balance decreases, transaction created

---

### **2. RECEIVE (Income)**
**Frontend**: `app/modals/receive.tsx`
- User selects: Account, Amount, Category, Description, Date, Optional Goal Allocation
- **Backend RPC**: `receive_to_account_bucket`
  - Increments account.balance
  - If goal bucket: increments account_goal_portions and goals.current_amount
  - Creates income transaction (amount = +p_amount)
  - Stores balance_before and balance_after

**Result**: Account balance increases, transaction created

---

### **3. TRANSFER (Between Accounts)**
**Frontend**: `app/modals/transfer.tsx`
- User selects: From Account, From Fund Bucket, To Account, Amount, Description, Date
- **Backend Flow**:
  1. Call `spend_from_account_bucket` (from account, from bucket)
     - Decrements from account balance
     - Decrements from bucket (if goal/liability)
     - Creates expense transaction
  2. Call `receive_to_account_bucket` (to account, personal bucket)
     - Increments to account balance
     - Creates income transaction

**Result**: Money moves from one account to another, 2 transactions created

---

### **4. GOAL PAYMENT (Contribute to Goal)**
**Frontend**: `app/modals/add-contribution.tsx` or `utils/goals.ts`
- User selects: Goal, Source Account, Amount, Description
- **Backend Flow**:
  1. Call `spend_from_account_bucket` (source account, personal bucket)
     - Decrements source account balance
     - Creates expense transaction
  2. Call `receive_to_account_bucket` (Goals Savings Account, goal bucket)
     - Increments Goals Savings account balance
     - Increments account_goal_portions for this goal
     - Increments goals.current_amount
     - Creates income transaction
  3. Insert into `goal_contributions` table

**Result**: Money moves from personal account to goal, goal.current_amount increases

---

### **5. GOAL WITHDRAW**
**Frontend**: `components/WithdrawFundsModal.tsx` → `utils/goals.ts`
- User selects: Goal, Amount, Destination Account
- **Backend Flow**:
  1. Call `spend_from_account_bucket` (Goals Savings Account, goal bucket)
     - Decrements Goals Savings account balance
     - Decrements account_goal_portions for this goal
     - Decrements goals.current_amount
     - Creates expense transaction
  2. Call `receive_to_account_bucket` (destination account, personal bucket)
     - Increments destination account balance
     - Creates income transaction

**Result**: Money moves from goal back to personal account, goal.current_amount decreases

---

### **6. LIABILITY PAYMENT**
**Frontend**: `app/modals/pay-liability.tsx`
- User selects: Liability, Account, Fund Bucket (personal or liability portion), Amount, Date
- **Backend Flow** (2 paths):

  **Path A - Pay from Personal Funds:**
  - Call `repay_liability` RPC
    - Decrements account.balance
    - Decrements liabilities.current_balance
    - Creates expense transaction
    - Inserts into liability_activity_log

  **Path B - Pay from Liability Portion:**
  - Call `settle_liability_portion` RPC
    - Decrements account.balance
    - Decrements account_liability_portions amount
    - Decrements liabilities.current_balance
    - Creates expense transaction

**Result**: Liability debt decreases, account balance decreases

---

### **7. LIABILITY FUNDS DRAW**
**Frontend**: `app/modals/draw-liability-funds.tsx`
- User selects: Liability, Multiple Accounts with amounts, Category, Date
- **Backend RPC**: `draw_liability_funds`
  - For each account:
    - Increments account.balance
    - Upserts account_liability_portions (adds amount)
    - Creates income transaction
  - Increments liabilities.disbursed_amount
  - Inserts into liability_activity_log

**Result**: Borrowed money added to accounts, liability portions tracked

---

### **8. BILL PAYMENT**
**Frontend**: `app/modals/mark-bill-paid.tsx` → `utils/bills.ts`
- User selects: Account, Fund Bucket, Amount, Date
- **Backend Flow**:
  1. Call `spend_from_account_bucket` (account, bucket)
     - Decrements account balance
     - Creates expense transaction
  2. Insert into `bill_payments` (links bill to transaction)
  3. Update `bills.status` = 'paid'
  4. If recurring: Call `generate_next_bill_instance` RPC

**Result**: Bill marked as paid, next occurrence generated if recurring

---

### **9. LIABILITY TO PERSONAL CONVERSION**
**Frontend**: `app/modals/transfer.tsx` (liability_to_personal mode)
- User selects: Account with liability funds, Liability portion, Amount
- **Backend Flow** (via `convertLiabilityToPersonal`):
  1. Call `spend_from_account_bucket` (account, liability bucket)
     - Decrements account.balance
     - Decrements account_liability_portions
     - Creates expense transaction
  2. Call `receive_to_account_bucket` (same account, personal bucket)
     - Increments account.balance
     - Creates income transaction

**Result**: Liability portion converted to personal funds (account balance unchanged, but tracking changes)

---

## ⚠️ Current System Complexity Issues

### **1. Multiple Fund Buckets System**
- **Personal funds**: Stored as `account.balance - SUM(goal_portions) - SUM(liability_portions)`
- **Goal funds**: Stored in `account_goal_portions` table
- **Liability funds**: Stored in `account_liability_portions` table
- **Problem**: Complex calculations, hard to track, balance can be inconsistent

### **2. Multiple RPC Functions**
- `spend_from_account_bucket` - Handles personal/goal/liability buckets
- `receive_to_account_bucket` - Handles personal/goal buckets
- `repay_liability` - Special case for liability payments
- `settle_liability_portion` - Special case for paying from liability portion
- `draw_liability_funds` - Special case for drawing liability funds
- **Problem**: Too many functions, inconsistent patterns

### **3. Transfer Creates 2 Transactions**
- Transfer between accounts creates 2 separate transactions (expense + income)
- **Problem**: Harder to track, can be confusing

### **4. Balance Calculation Complexity**
- Account balance = personal + goals + liabilities
- Must calculate personal funds = balance - goal portions - liability portions
- **Problem**: Prone to errors, hard to verify

### **5. Multiple Transaction Types**
- `type`: 'income', 'expense', 'transfer'
- But transfers are actually 2 transactions (one expense, one income)
- **Problem**: Inconsistent representation

### **6. Goal System Complexity**
- Goals stored in special "Goals Savings Account"
- Funds tracked via `account_goal_portions`
- Contributions require 2 RPC calls (spend + receive)
- **Problem**: Overcomplicated for simple savings goals

### **7. Liability System Complexity**
- Liability portions tracked separately
- Can pay from personal OR liability portion
- Can draw funds (creates liability portions)
- Can convert liability to personal
- **Problem**: Too many states and operations

---

## 💡 Simplification Opportunities

### **Proposed Simple Model: + and -**

**Core Principle**: Every transaction is either:
- **+ (Income)**: Money coming in → Account balance increases
- **- (Expense)**: Money going out → Account balance decreases

**Simplified Structure**:
1. **Single transaction type**: Just `amount` (positive = income, negative = expense)
2. **Simple transfers**: One transaction with `from_account_id` and `to_account_id`
3. **No fund buckets**: Just account balances
4. **Goals**: Separate tracking, not mixed with account balances
5. **Liabilities**: Separate tracking, not mixed with account balances

**Benefits**:
- Easier to understand
- Easier to debug
- Easier to maintain
- Less prone to errors
- Clearer transaction history

---

## 📋 Current Transaction Types Summary

| Transaction Type | Frontend | Backend RPC | Transactions Created | Balance Change |
|-----------------|----------|-------------|---------------------|----------------|
| Pay | `pay.tsx` | `spend_from_account_bucket` | 1 expense | Account - |
| Receive | `receive.tsx` | `receive_to_account_bucket` | 1 income | Account + |
| Transfer | `transfer.tsx` | `spend_from_account_bucket` + `receive_to_account_bucket` | 2 (expense + income) | From - / To + |
| Goal Payment | `add-contribution.tsx` | `spend_from_account_bucket` + `receive_to_account_bucket` | 2 (expense + income) | Source - / Goal + |
| Goal Withdraw | `WithdrawFundsModal.tsx` | `spend_from_account_bucket` + `receive_to_account_bucket` | 2 (expense + income) | Goal - / Dest + |
| Liability Payment (Personal) | `pay-liability.tsx` | `repay_liability` | 1 expense | Account - / Liability - |
| Liability Payment (Portion) | `pay-liability.tsx` | `settle_liability_portion` | 1 expense | Account - / Liability - |
| Liability Draw | `draw-liability-funds.tsx` | `draw_liability_funds` | N income (one per account) | Accounts + / Liability + |
| Bill Payment | `mark-bill-paid.tsx` | `spend_from_account_bucket` | 1 expense | Account - |
| Liability→Personal | `transfer.tsx` | `spend_from_account_bucket` + `receive_to_account_bucket` | 2 (expense + income) | Account unchanged |

---

**Last Updated**: 2025-01-29
**Status**: Current System Analysis - Ready for Simplification


