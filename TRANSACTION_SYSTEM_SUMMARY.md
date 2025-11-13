# FinTrack Transaction System — Current Implementation Deep Dive

## 1. Role In The Product
Transactions are the canonical log of money movement. Every dashboard widget, budget, goal, and liability report consumes this feed. Transactions also drive account balance snapshots (`balance_before` / `balance_after`), category statistics, and notification history. Understanding today’s implementation is mandatory before simplifying to a “plain +/- ledger”.

---

## 2. Data Model (Supabase)

### 2.1 Core Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `transactions` | `account_id`, `type`, `amount`, `balance_before`, `balance_after`, `metadata` | Created in migration `017_create_core_accounts_transactions.sql`, augmented by migration `015_add_transaction_balance_snapshots.sql`. RLS restricts rows to the owning user. |
| `categories` | `activity_types[]`, `total_spent`, `total_received`, `transaction_count` | Migration `009_create_categories_system.sql`; trigger updates aggregates whenever transactions change. |
| `accounts` | `balance` | Updated by RPCs whenever transactions are created. |
| `goal_contributions` | `goal_id`, `transaction_id`, `amount` | Links goal transactions to their source entries. |
| `bill_payments`, `liability_payments` | `transaction_id` references | Tie specialized flows back to base transactions. |

**Important Columns:**
- `transactions.amount` stores the signed value (negative for expenses, positive for income and incoming transfer legs).
- `transactions.type` is one of `'income' | 'expense' | 'transfer'`.
- `transactions.metadata` captures bucket context (`bucket_type`, `liability_id`, `goal_id`, etc.).
- `transactions.to_account_id` is populated for transfer tracking (even though UI currently creates two rows).
- Snapshots `balance_before/balance_after` are injected by RPCs.

### 2.2 Indexes & RLS (subset)
- `idx_transactions_user_id`, `idx_transactions_account_id`, `idx_transactions_date` support feed queries.
- RLS policies mirror accounts: SELECT/INSERT/UPDATE/DELETE allowed only when `auth.uid() = user_id`.
- `categories` table uses GIN index on `activity_types` for quick filtering (`contains('expense')`, etc.).

---

## 3. RPC Functions Driving Transactions
Defined primarily in migrations `016_update_rpcs_with_balance_snapshots.sql` and `017_fix_balance_calculation.sql`.

### 3.1 `spend_from_account_bucket`
- Validates bucket type (`personal`, `liability`, `goal`).
- Enforces availability by subtracting liability/goal portions from account balance.
- Updates bucket portion tables (`account_liability_portions` / `account_goal_portions`).
- Sets `accounts.balance = balance_after` and verifies persistence.
- Inserts expense transaction with negative amount and snapshots.
- Emits metadata: `bucket_type`, `bucket_id`, extra hints for fund badges.

### 3.2 `receive_to_account_bucket`
- Resolves category by name (creates if missing) and applies default currency.
- Updates account balance (`balance_after = balance_before + amount`).
- For goal buckets: UPSERTS `account_goal_portions` and increments `goals.current_amount`.
- Creates income transaction with positive amount and metadata describing destination bucket.

### 3.3 Transfer Support
- The UI composes transfers via **two RPC calls** (`spend_from_account_bucket` on source, `receive_to_account_bucket` on destination). Migration 016 also defines `create_transfer_transaction`, but UI currently doesn’t use it—mostly retained for future optimization.

### 3.4 Liability & Bill RPCs with Transaction Side Effects
- `repay_liability`, `settle_liability_portion`, and `draw_liability_funds` each adjust account balances and create transactions (expense or income) while also mutating liability tables.
- `generate_next_bill_instance` doesn’t create transactions but is triggered in bill payment flows after the core expense entry.

### 3.5 Balance Repair Helpers
- `recalculate_account_balance(account_id, user_id)` recomputes account balances from latest snapshots, falling back to sum of signed amounts when snapshots absent.
- `recalculate_all_account_balances(user_id)` iterates through accounts; `useRealtimeData` invokes it periodically to guard against drift.

---

## 4. State Management & Data Fetching

### 4.1 `useRealtimeData` Responsibilities
- Fetches transactions first on load to make snapshot data available.
- Invokes `recalculate_all_account_balances(true)` before populating accounts to repair drift.
- Maintains `transactions` array with joined category/account info:
  ```ts
  supabase.from('transactions')
    .select(`*,
      category:categories!transactions_category_id_fkey_new(name, color, icon),
      account:accounts!transactions_account_id_fkey(name, color, icon)
    `)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  ```
- Subscribes to Supabase real-time channels for `transactions` and refreshes list on every change.
- Exposes `refreshTransactions` (just fetch), `globalRefresh` (recalc + refetch all domains).

### 4.2 Other Context Hooks
- `SettingsContext` supplies currency for formatting.
- `NotificationContext` dispatches toast overlays when modals succeed (Pay/Receive/Transfer).
- `LiabilitiesContext` provides `getAccountBreakdown` and portion data for FundPicker (used when transactions require bucket info).

---

## 5. UI Layers

### 5.1 Transactions Tab (`app/(tabs)/transactions.tsx`)
- **Views:** List vs Calendar toggle (segmented control). List is default.
- **Filters:** Type filter (All/Income/Expense/Transfer) plus optional date selection when in calendar view.
- **Calendar:** Marks days with transactions; selected date shows counts and filters list.
- **List:** `TransactionCard` for each entry; displays amount badge, fund source badge (liability/goal), and description. Tapping pushes transaction detail modal (`/transaction/[id]`).
- **Quick Actions:** Buttons for Receive / Pay / Transfer open corresponding modals.
- **Empty State:** Encourages user to add or spend money when no transactions exist.
- **Modal callbacks:** On success they `await Promise.all([refreshTransactions(), refreshAccounts()])` to keep UI synchronized.

### 5.2 Transaction Detail (`app/transaction/[id].tsx`)
- Loads transaction with joins to account & category, displays amount, metadata, balance impact, related transactions on same day, daily activity count.
- Attempts to calculate `beforeBalance` / `afterBalance` using stored snapshots; falls back to recalculation when snapshots missing. Documented issues remain (see “Known Complexities”).
- Provides “Edit” action launching `EditTransactionModal`, plus duplicate/delete placeholders.

### 5.3 Pay Modal (`app/modals/pay.tsx`)
- Multi-step form: amount, description, category tiles, source account list, fund picker (auto-open when account chosen), date picker, balance impact preview (account & total balances before/after).
- Validates numeric amount, selected account, bucket, and category.
- Calls `spend_from_account_bucket`; after verifying balance change, refreshes accounts, transactions, and eventually triggers `globalRefresh()`.
- Shows success notification with bucket context (e.g., “(from Liability: Card)” ).

### 5.4 Receive Modal (`app/modals/receive.tsx`)
- Similar structure but for income: amount, description, category chips, destination account, optional “Allocate to Goal” toggle invoking FundPicker filtered to goal buckets.
- Uses `receive_to_account_bucket`; verifies balance increase and refreshes data.
- Balance impact card previews account + total balances after posting.

### 5.5 Transfer Modal (`app/modals/transfer.tsx`)
- Two modes: between accounts, or liability-to-personal conversion.
- Between accounts mode:
  - Select amount, description, from account (with FundPicker), to account (with breakdown tooltip), date.
  - Executes `spend_from_account_bucket` then `receive_to_account_bucket` consecutively, verifying balances and firing multiple refreshes.
  - Shows “Balance Impact Preview” comparing before/after for both accounts.
- Liability-to-personal mode guides through multi-step conversion (select account, select liability bucket, enter amount, confirm) and uses `convertLiabilityToPersonal` helper.

### 5.6 Edit Transaction Modal (`app/modals/edit-transaction.tsx`)
- Pre-populates form with existing transaction data; warns when editing bucket-based entries.
- Allows type switching (income/expense), amount, account, category, optional metadata fields (notes, location, reference).
- For expenses, user can select a new fund bucket via FundPicker; original bucket info displayed when present.
- Update done via direct `supabase.from('transactions').update(...)` (no RPC) — **does not** automatically adjust accounts/buckets, so editing amount for bucket-based transactions may desync balances (reason for warning).
- Delete path soft-deletes transaction (`is_active: false`) pending future archival strategy.

### 5.7 TransactionCard Component
- Formats amounts with currency and sign, shows type badge color-coded (green income, orange expense, blue transfer).
- Displays optional fund-source badge derived from metadata for expenses.
- Uses `expo-router` `onPress` callback to open transaction detail.

---

## 6. UX & Interaction Flows

### 6.1 Adding/Editing Transactions
1. User taps quick action (Pay/Receive/Transfer) → modal slides up (pageSheet on iOS).
2. Required fields highlight missing inputs; errors shown beneath inputs.
3. Submitting shows “Recording…” state; on success, toast notification appears and modal closes after reset.
4. List updates immediately because modals await `refreshTransactions()`.
5. Editing within transaction detail reopens modal with existing data; after save, success alert triggers `globalRefresh()`.

### 6.2 Calendar Filtering Flow
1. User toggles to Calendar view → monthly calendar displayed.
2. Days with transactions show colored dots based on dominant type.
3. Selecting a day sets `selectedDate` -> info banner displays count, list filters to that date.
4. Clearing selection (tap selected day again or switch to list) returns to full feed.

### 6.3 Empty State Guidance
- Both tab and detail modals maintain friendly messaging (e.g., “Start by adding money”), with CTA buttons hooking back into modals.
- FundPicker indicates insufficient funds with disabled cards and tooltips.

### 6.4 Notifications & Feedback
- `useNotification` displays success banners containing amount, account, date, bucket info.
- Error states use native `Alert.alert` with generic fallback message.
- Long operations (verifying balance) show console logs but not yet surfaced in UI.

---

## 7. Navigation & Routing Topology

```
Tabs (Transactions) ──► Transaction Detail (`/transaction/[id]`)
    │                              │
    │                              ├─► Edit Transaction Modal (pageSheet)
    │                              └─► (Future) Duplicate / Delete flows
    │
    ├─► Pay Modal (present)
    │     └─► Fund Picker (nested modal)
    ├─► Receive Modal (present)
    │     └─► Fund Picker (goal allocation)
    └─► Transfer Modal (present)
          └─► Fund Picker (source) / Fund Picker (liability conversion)
```

- Expo Router stack: `app/(tabs)/transactions.tsx` sits in tab navigator; modals live in `app/modals/.tsx` and are presented with `presentation="modal"` or `pageSheet`.
- `TransactionCard` uses `router.push('/transaction/<id>')` to open detail modal (pageSheet) on top of current screen.
- Modals close via explicit “Record/Cancel” buttons or swipe-down gestures; Android back dismisses modals before returning to tab.
- Quick action buttons within the tab simply toggle modal visibility (no navigation push).
- Global refresh or context updates do not reset navigation stack; state persists when returning to tab from other sections.

---

## 8. Cross-Domain Interactions

| Domain | Interaction With Transactions |
|--------|--------------------------------|
| **Accounts** | Every transaction adjusts `accounts.balance`; modals refresh accounts after posting. Balance repair functions rely on transaction data. |
| **Goals** | Goal contributions & withdrawals create paired transactions and update portions; `TransactionCard` uses metadata to show “Goal” badge. |
| **Liabilities** | Liability draws/payments create transactions with metadata `liability_id`; Transfer modal has specialized liability-to-personal flow. |
| **Budgets** | Trigger `create_budget_transactions_for_transaction` (migration `005_create_budget_functions.sql`) via AFTER INSERT trigger on transactions. |
| **Bills** | Bill payments attach `metadata` with `bill_id`; detail screen uses metadata to contextualize. |
| **Categories** | Category statistics update automatically via trigger; modals filter category lists by `activity_types`. |

---

## 9. Known Complexities & Caveats

1. **Double-Entry Transfers:** Current UI emits two separate transactions (expense and income). Reports must deduplicate manually; simplification might switch to single signed entry or dedicated transfer record.
2. **Bucket Dependencies:** FundPicker and metadata rely on `account_goal_portions` / `account_liability_portions`; any move to plain ledger must remove or replace these references.
3. **Edit Modal Limitations:** Updating amount/account for bucket-based transactions can desync account balances because RPC recalculation isn’t invoked. Warning dialogue mitigates but doesn’t prevent inconsistencies.
4. **Balance Impact Calculation Issues:** Transaction detail fallback logic can display incorrect before/after balances when history is complex (documented in `TRANSACTION_SYSTEM_ANALYSIS.md`). Snapshots help, but older transactions without snapshots remain tricky.
5. **Missing Migrations:** As noted in account analysis, `account_goal_portions` creation migration isn’t present in repo; transactions referencing goal buckets assume its existence.
6. **Calendar Performance:** Marking all dates iterates over entire transaction list every render; acceptable for current volumes but should be optimized for very large histories.

---

## 10. Summary of Current Flow
1. User initiates Pay/Receive/Transfer → modal collects inputs → RPC creates transaction with snapshots → accounts & transactions refreshed → notification shown.
2. Transactions tab surfaces updated feed instantly; filters and calendar adapt to new entries.
3. Transaction detail modal aggregates metadata, balance impact, and provides edit/delete pathways.
4. Supporting contexts (Settings, Notification, Liabilities) orchestrate currency formatting, toasts, and fund breakdowns.

Documenting this ecosystem establishes a baseline before redesigning towards a simplified transaction model. Any overhaul must consider RPC adjustments, removal or transformation of bucket metadata, UI changes (FundPicker, badges), and navigation contracts described above.












