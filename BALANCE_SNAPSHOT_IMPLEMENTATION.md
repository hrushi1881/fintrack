# Balance Snapshot Implementation

## Problem Statement

The transaction detail page was showing incorrect "Balance Impact" calculations because:
1. The "After" balance was showing the current account balance (after ALL transactions), not the balance immediately after the specific transaction
2. The calculation was trying to reverse subsequent transactions, which was error-prone

**Example of the Issue:**
- Account current balance: ₹8,04,486.02
- Transaction being viewed: -₹4,000 (expense)
- If there were transactions AFTER this one, the "After" balance was incorrectly showing the current balance instead of the balance right after this transaction

## Solution

Store the account balance snapshots (`balance_before` and `balance_after`) directly in the transaction record at the time of creation.

### How It Works

When a transaction is created:
1. **Capture `balance_before`**: Get the current account balance before applying the transaction
2. **Apply the transaction**: Update the account balance
3. **Capture `balance_after`**: Get the new account balance after applying the transaction
4. **Store both values**: Save `balance_before` and `balance_after` in the transaction record

### Example

**Before Transaction:**
- Account Balance: ₹25,000
- Transaction: -₹5,000 (expense)

**After Transaction:**
- Account Balance: ₹20,000

**Transaction Record:**
```json
{
  "id": "transaction-uuid",
  "amount": -5000,
  "type": "expense",
  "balance_before": 25000,
  "balance_after": 20000
}
```

## Implementation

### 1. Database Schema Changes

**Migration: `015_add_transaction_balance_snapshots.sql`**
- Adds `balance_before DECIMAL(14,2)` column to `transactions` table
- Adds `balance_after DECIMAL(14,2)` column to `transactions` table
- Adds indexes for performance
- Adds column comments for documentation

### 2. RPC Function Updates

**Migration: `016_update_rpcs_with_balance_snapshots.sql`**

Updated all transaction-creating RPC functions to capture and store balance snapshots:

1. **`spend_from_account_bucket`** (Expense transactions)
   - Captures balance before deducting amount
   - Captures balance after deducting amount
   - Stores both in transaction record

2. **`receive_to_account_bucket`** (Income transactions)
   - Captures balance before adding amount
   - Captures balance after adding amount
   - Stores both in transaction record

3. **`repay_liability`** (Liability payments)
   - Captures balance before payment
   - Captures balance after payment
   - Stores both in transaction record

4. **`settle_liability_portion`** (Liability portion payments)
   - Captures balance before payment
   - Captures balance after payment
   - Stores both in transaction record

5. **`draw_liability_funds`** (Liability fund draws)
   - For each account receiving funds:
     - Captures balance before adding amount
     - Captures balance after adding amount
     - Stores both in transaction record

6. **`create_transfer_transaction`** (Transfers)
   - For source account (expense):
     - Captures balance before deducting
     - Captures balance after deducting
   - For destination account (income):
     - Captures balance before adding
     - Captures balance after adding
   - Stores both in respective transaction records

### 3. Transaction Detail Page

**File: `app/transaction/[id].tsx`**

The transaction detail page already has logic to:
1. **First**: Check if `balance_before` and `balance_after` are stored in the transaction
2. **If stored**: Use them directly (no calculation needed)
3. **If not stored**: Fall back to calculation from transaction history (for old transactions created before this feature)

## Benefits

1. **Accuracy**: Balance snapshots are captured at transaction time, ensuring 100% accuracy
2. **Performance**: No need to query and calculate from transaction history
3. **Reliability**: Works correctly even if transactions are backdated or edited
4. **Simplicity**: Transaction detail page simply displays stored values

## Migration Steps

1. **Run Migration 015**: Add columns to transactions table
   ```sql
   -- Execute: migrations/015_add_transaction_balance_snapshots.sql
   ```

2. **Run Migration 016**: Update RPC functions
   ```sql
   -- Execute: migrations/016_update_rpcs_with_balance_snapshots.sql
   ```

3. **Verify**: New transactions will automatically have balance snapshots stored

## Backward Compatibility

- **Old Transactions**: Transactions created before this feature will have `NULL` for `balance_before` and `balance_after`
- **Fallback Logic**: The transaction detail page will calculate these values from transaction history for old transactions
- **New Transactions**: All transactions created after running the migrations will have balance snapshots stored

## Testing

To verify the implementation:

1. **Create a new transaction** (Pay, Receive, Transfer, etc.)
2. **View the transaction detail page**
3. **Verify**: "Before" and "After" balances should match:
   - Before: Balance shown should be the account balance before the transaction
   - Transaction: Amount of the transaction
   - After: Balance shown should be Before + Transaction amount

**Example Verification:**
- Account balance before: ₹25,000
- Create expense: -₹5,000
- Account balance after: ₹20,000
- Transaction detail page should show:
  - Before: ₹25,000
  - Transaction: -₹5,000
  - After: ₹20,000

## Notes

- Balance snapshots are captured **atomically** within the RPC function, ensuring consistency
- The balance values stored are the **actual account balances** at the time of transaction, not calculated values
- For transfers, both accounts have their own transaction records with their respective balance snapshots

