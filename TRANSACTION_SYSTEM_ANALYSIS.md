# FinTrack Transaction System - Complete Analysis

## 📋 Executive Summary

This document provides a comprehensive analysis of how the FinTrack system handles all types of transactions, including how account balances are updated, how transactions are created, and how the system tracks financial activities.

---

## 🔄 Core Transaction Flow

### **1. Transaction Amount Storage**

**Critical Rule**: Transaction amounts in the database are stored with their **actual sign**:
- **Expense transactions**: Negative amounts (e.g., `-700000.00`)
- **Income transactions**: Positive amounts (e.g., `4000.00`)
- **Transfer transactions**: Two separate transactions (one negative, one positive)

This means:
- When you spend ₹700,000, the transaction amount is stored as `-700000.00`
- When you receive ₹4,000, the transaction amount is stored as `4000.00`

---

## 💳 Transaction Types and Their Execution

### **A. Pay (Expense Transaction)**

**Location**: `app/modals/pay.tsx`

**Flow**:
1. User selects account, fund source (personal/liability/goal bucket), amount, category, description
2. Calls `spend_from_account_bucket` RPC function
3. RPC function:
   - Validates fund availability (checks bucket balances)
   - Updates account balance: `balance = balance - amount`
   - Updates bucket portion if applicable (liability/goal)
   - Creates transaction record with `amount = -amount` (negative)
   - Sets `type = 'expense'`

**Example**:
- Account Balance Before: ₹10,00,000
- Pay Amount: ₹7,00,000
- Account Balance After: ₹3,00,000
- Transaction Record: `{amount: -700000, type: 'expense'}`

---

### **B. Receive (Income Transaction)**

**Location**: `app/modals/receive.tsx`

**Flow**:
1. User selects account, category, amount, description, optional goal allocation
2. Calls `receive_to_account_bucket` RPC function
3. RPC function:
   - Finds or creates category by name
   - Updates account balance: `balance = balance + amount`
   - If goal allocation: Updates `account_goal_portions` and `goals.current_amount`
   - Creates transaction record with `amount = +amount` (positive)
   - Sets `type = 'income'`

**Example**:
- Account Balance Before: ₹3,00,000
- Receive Amount: ₹4,000
- Account Balance After: ₹3,04,000
- Transaction Record: `{amount: 4000, type: 'income'}`

---

### **C. Transfer (Between Accounts)**

**Location**: `app/modals/transfer.tsx`

**Flow**:
1. User selects source account, destination account, amount, fund source
2. Calls TWO RPC functions:
   - `spend_from_account_bucket` on source account (creates expense)
   - `receive_to_account_bucket` on destination account (creates income)
3. Both transactions are created separately with same date
4. Source account balance decreases, destination account balance increases

**Example**:
- Source Account Before: ₹10,00,000
- Destination Account Before: ₹5,00,000
- Transfer Amount: ₹2,00,000
- Source Account After: ₹8,00,000
- Destination Account After: ₹7,00,000
- Transaction Records:
  - Source: `{amount: -200000, type: 'expense', account_id: source}`
  - Destination: `{amount: 200000, type: 'income', account_id: destination}`

---

### **D. Goal Contribution**

**Location**: `app/modals/add-contribution.tsx`

**Flow**:
1. User selects source account, goal, amount, description
2. Calls TWO RPC functions:
   - `spend_from_account_bucket` on source account (personal bucket)
   - `receive_to_account_bucket` on Goals Savings account (goal bucket)
3. Updates goal's `current_amount`
4. Creates `goal_contributions` record linking transaction to goal

**Example**:
- Source Account Before: ₹10,00,000
- Goals Savings Account Before: ₹5,00,000
- Goal Current Amount: ₹0
- Contribution Amount: ₹50,000
- Source Account After: ₹9,50,000
- Goals Savings Account After: ₹5,50,000
- Goal Current Amount: ₹50,000
- Transaction Records:
  - Source: `{amount: -50000, type: 'expense'}`
  - Goals: `{amount: 50000, type: 'income'}`

---

### **E. Bill Payment**

**Location**: `app/modals/mark-bill-paid.tsx`

**Flow**:
1. User selects account, fund source, amount, payment date
2. Calls `spend_from_account_bucket` RPC function
3. Creates `bill_payments` record linking transaction to bill
4. Updates bill status to 'paid'

**Example**:
- Account Balance Before: ₹10,00,000
- Bill Amount: ₹5,000
- Account Balance After: ₹9,95,000
- Transaction Record: `{amount: -5000, type: 'expense'}`

---

### **F. Liability Payment**

**Location**: `app/modals/pay-liability.tsx`

**Flow**:
1. User selects account, fund source (personal or liability portion), amount, date
2. Calls either:
   - `repay_liability` (if from personal funds)
   - `settle_liability_portion` (if from liability portion funds)
3. Both functions:
   - Decrease account balance
   - Decrease liability's `current_balance`
   - Create expense transaction
   - Log activity in `liability_activity_log`

**Example (Personal Funds)**:
- Account Balance Before: ₹10,00,000
- Liability Balance Before: ₹5,00,000
- Payment Amount: ₹50,000
- Account Balance After: ₹9,50,000
- Liability Balance After: ₹4,50,000
- Transaction Record: `{amount: -50000, type: 'expense'}`

---

### **G. Draw Liability Funds**

**Location**: `app/modals/draw-liability-funds.tsx`

**Flow**:
1. User selects liability, distributes funds to multiple accounts
2. Calls `draw_liability_funds` RPC function
3. RPC function:
   - For each account in distribution:
     - Increases account balance
     - Creates/updates `account_liability_portions`
     - Creates income transaction with positive amount
   - Updates liability's `disbursed_amount`

**Example**:
- Account Balance Before: ₹5,00,000
- Liability Original Amount: ₹10,00,000
- Liability Disbursed Before: ₹2,00,000
- Draw Amount: ₹1,00,000
- Account Balance After: ₹6,00,000
- Liability Disbursed After: ₹3,00,000
- Transaction Record: `{amount: 100000, type: 'income'}`

---

## 🗄️ Database RPC Functions

### **1. `spend_from_account_bucket`**

**Purpose**: Deduct money from an account bucket (expense)

**Parameters**:
- `p_user_id`: User ID
- `p_account_id`: Account ID
- `p_bucket`: JSONB `{type: 'personal'|'liability'|'goal', id: UUID|null}`
- `p_amount`: Amount to spend (positive number)
- `p_category`: Category ID (UUID as TEXT)
- `p_description`: Transaction description
- `p_date`: Transaction date
- `p_currency`: Currency code

**What it does**:
1. Validates bucket type and availability
2. Checks fund availability:
   - Personal: `balance - liability_portions - goal_portions >= amount`
   - Liability/Goal: Checks specific bucket portion
3. Updates bucket portion if applicable
4. **Decrements account balance**: `UPDATE accounts SET balance = balance - p_amount`
5. **Creates transaction**: `INSERT INTO transactions (amount, type) VALUES (-p_amount, 'expense')`

**Key Point**: Transaction amount is stored as **negative** (`-p_amount`)

---

### **2. `receive_to_account_bucket`**

**Purpose**: Add money to an account bucket (income)

**Parameters**:
- `p_user_id`: User ID
- `p_account_id`: Account ID
- `p_bucket_type`: 'personal'|'goal'|'liability'
- `p_bucket_id`: UUID (null for personal)
- `p_amount`: Amount to receive (positive number)
- `p_category`: Category name (TEXT, not UUID)
- `p_description`: Transaction description
- `p_date`: Transaction date
- `p_notes`: Optional notes
- `p_currency`: Currency code

**What it does**:
1. Finds or creates category by name
2. **Increments account balance**: `UPDATE accounts SET balance = balance + p_amount`
3. If goal bucket: Updates `account_goal_portions` and `goals.current_amount`
4. **Creates transaction**: `INSERT INTO transactions (amount, type) VALUES (p_amount, 'income')`

**Key Point**: Transaction amount is stored as **positive** (`p_amount`)

---

### **3. `repay_liability`**

**Purpose**: Pay liability from personal funds

**Parameters**:
- `p_user_id`: User ID
- `p_account_id`: Account ID
- `p_liability_id`: Liability ID
- `p_amount`: Payment amount
- `p_date`: Payment date
- `p_notes`: Optional notes

**What it does**:
1. Validates account balance
2. **Decrements account balance**: `UPDATE accounts SET balance = balance - p_amount`
3. **Decrements liability balance**: `UPDATE liabilities SET current_balance = GREATEST(current_balance - p_amount, 0)`
4. **Creates expense transaction**: `INSERT INTO transactions (amount, type) VALUES (-p_amount, 'expense')`
5. Logs activity in `liability_activity_log`

---

### **4. `settle_liability_portion`**

**Purpose**: Pay liability using liability portion funds (paying from liability funds back to liability)

**What it does**:
1. Validates liability portion availability
2. Decrements account balance
3. Decrements liability portion amount
4. Decrements liability balance
5. Creates expense transaction

---

### **5. `draw_liability_funds`**

**Purpose**: Draw funds from a liability and distribute to accounts

**Parameters**:
- `p_user_id`: User ID
- `p_liability_id`: Liability ID
- `p_distributions`: JSONB array of `{account_id, amount}`
- `p_date`: Transaction date
- `p_notes`: Optional notes
- `p_category_id`: Optional category ID

**What it does**:
1. Calculates available draw amount
2. If overdraw: Increases liability's `original_amount` and `current_balance`
3. For each account in distribution:
   - **Increments account balance**: `UPDATE accounts SET balance = balance + v_amount`
   - Updates `account_liability_portions`
   - **Creates income transaction**: `INSERT INTO transactions (amount, type) VALUES (v_amount, 'income')`
4. Updates liability's `disbursed_amount`

---

## 📊 Account Balance Calculation

### **How Account Balance is Maintained**

The `accounts.balance` field is **incrementally updated** by each transaction:

1. **Initial Balance**: Set when account is created (or can be set via initial balance transaction)
2. **After Each Transaction**:
   - Expense: `balance = balance - amount` (amount is positive in RPC, but stored negative in transaction)
   - Income: `balance = balance + amount` (amount is positive in both)

### **Current Balance Formula**

```
Current Balance = Initial Balance + Sum of All Transaction Amounts
```

Since transactions store:
- Expenses as negative amounts
- Income as positive amounts

The formula works correctly:
- Initial: ₹10,00,000
- Expense ₹7,00,000: Transaction stored as -₹7,00,000 → Balance = ₹10,00,000 + (-₹7,00,000) = ₹3,00,000
- Income ₹4,000: Transaction stored as +₹4,000 → Balance = ₹3,00,000 + ₹4,000 = ₹3,04,000

---

## 🔍 Balance Impact Calculation (Transaction Detail Page)

### **Current Implementation** (`app/transaction/[id].tsx`)

**Problem Identified**: The calculation is incorrectly showing the balance impact.

**Current Logic**:
1. Gets current account balance (after ALL transactions)
2. Finds all transactions that happened AFTER this transaction
3. Calculates: `afterBalance = currentBalance - sumOfTransactionsAfter`
4. Calculates: `beforeBalance = afterBalance - transaction.amount`

**Issue**: This approach has a fundamental flaw:
- It assumes the current balance is the "after" balance
- But if there were transactions after this one, the calculation is wrong
- The calculation doesn't properly reverse the transaction effect

### **Correct Calculation Should Be**:

For a transaction with amount `transaction.amount` (which is already signed):
- **After Balance**: `currentBalance - sumOfTransactionsAfterThis`
- **Before Balance**: `afterBalance - transaction.amount`

**Example**:
- Current Balance (after all transactions): ₹8,04,486.02
- Transaction Amount: -₹7,00,000 (expense)
- Transactions After: +₹4,000 (income)
- Sum After: ₹4,000
- After Balance: ₹8,04,486.02 - ₹4,000 = ₹8,00,486.02
- Before Balance: ₹8,00,486.02 - (-₹7,00,000) = ₹8,00,486.02 + ₹7,00,000 = ₹15,00,486.02

**But this is WRONG!** The user is seeing:
- Before: ₹8,00,486.02 - (-₹7,00,000) = ₹15,00,486.02
- Transaction: -₹7,00,000
- After: ₹8,04,486.02 (current balance, not accounting for subsequent transactions)

---

## ⚠️ Issues Identified

### **1. Balance Impact Calculation Error**

The transaction detail page shows incorrect balance impact because:
- It uses the current account balance (which includes all subsequent transactions)
- It tries to reverse subsequent transactions, but the calculation is flawed
- The "After" balance shown is the current balance, not the balance right after this transaction

### **2. Transaction Amount Sign Convention**

The system correctly stores:
- Expenses as negative
- Income as positive

But the balance impact calculation doesn't properly account for this when reversing.

---

## 🎯 Recommended Fix

### **For Balance Impact Calculation**

The correct approach should be:

1. **Get all transactions for the account, ordered by date and created_at**
2. **Calculate running balance**:
   - Start with initial balance (or 0 if not tracked)
   - For each transaction in chronological order:
     - `runningBalance = runningBalance + transaction.amount`
   - When we reach our target transaction:
     - `beforeBalance = runningBalance - transaction.amount`
     - `afterBalance = runningBalance`

**Alternative (Simpler) Approach**:
1. Get current account balance
2. Get all transactions after this one (by date and created_at)
3. Sum those transactions: `sumAfter`
4. Calculate:
   - `afterBalance = currentBalance - sumAfter`
   - `beforeBalance = afterBalance - transaction.amount`

**But this requires**:
- Proper ordering by date AND created_at
- Handling transactions on the same date correctly
- Accounting for initial balance if account was created with one

---

## 📝 Summary

### **Transaction Creation Flow**:
1. User action (Pay/Receive/Transfer/etc.)
2. RPC function called
3. RPC validates and updates account balance atomically
4. RPC creates transaction record with signed amount
5. UI refreshes to show updated balance

### **Balance Update Flow**:
1. Account balance is stored in `accounts.balance`
2. Each transaction modifies this balance:
   - Expense: `balance = balance - amount` (amount passed as positive to RPC)
   - Income: `balance = balance + amount`
3. Transaction record stores the signed amount:
   - Expense: `-amount` in transaction table
   - Income: `+amount` in transaction table

### **Balance Impact Calculation**:
- **Current**: Incorrectly calculates by trying to reverse subsequent transactions
- **Should**: Calculate running balance up to the transaction, or properly reverse all subsequent transactions

---

## 🔧 Next Steps

1. Fix balance impact calculation in `app/transaction/[id].tsx`
2. Ensure proper transaction ordering (date + created_at)
3. Consider storing initial balance separately or tracking it
4. Test with various transaction sequences to ensure correctness

