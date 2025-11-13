# FinTrack Account System — Current Implementation Deep Dive

## 1. Role In The Product
The account system is the root for every money movement in FinTrack. All pay/receive/transfer flows start by selecting an account, balances are rolled up into dashboards, and budgets/goals/liabilities read from account data. Understanding the current shape is essential before simplifying away fund buckets.

---

## 2. Data Model (Supabase)

### 2.1 Core Tables
- `accounts` (migration `017_create_core_accounts_transactions.sql`)
  - Balance is **total funds** (personal + goal allocations + liability allocations)
  - `type` enumerates asset/liability flavours (`bank`, `card`, `wallet`, `cash`, `liability`, etc.)
  - RLS policies restrict rows to the owning user
  - `updated_at` maintained by trigger

```8:25:migrations/017_create_core_accounts_transactions.sql
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'bank', 'card', 'wallet', 'cash',
    'checking', 'savings', 'credit_card', 'investment', 'loan', 'liability'
  )),
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  color TEXT,
  icon TEXT,
  include_in_totals BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Supporting tables involved in balance composition:
  - `account_goal_portions` (`goal_id`, `amount`) — how much of the account belongs to each goal
  - `account_liability_portions` (`liability_id`, `amount`) — borrowed money sitting in accounts
  - `transactions` (same migration) store double-entry metadata, `balance_before`/`balance_after` columns added by later migrations

### 2.2 Balance Repair Functions
Migration `017_fix_balance_calculation.sql` adds:
- `recalculate_account_balance(account_id, user_id)` — rebuilds balance from transactions, falling back to sums when snapshots missing
- `recalculate_all_account_balances(user_id)` — iterates through every active account, calling the above, and returns the adjustments that were applied

These functions are executed on every manual refresh and during initial data load (see `useRealtimeData`).

### 2.3 Bucket-Aware RPCs
- `spend_from_account_bucket` — debits account, updates goal/liability portion tables, creates expense transaction
- `receive_to_account_bucket` — credits account, optionally increases goal portions, creates income transaction
- Transfer-related RPCs (`create_transfer_transaction`) still exist but UI now calls spend+receive pair for richer metadata

These functions enforce several invariants (bucket must exist, personal funds cannot go negative). They inject `balance_before` and `balance_after` snapshots for each transaction.

---

## 3. Data Fetching & State
`hooks/useRealtimeData.ts` orchestrates fetching, recalculation, and live updates.

### 3.1 Fetch Cycle
1. On mount, fetches transactions first, then calls `recalculate_all_account_balances` to correct drift.
2. Fetches accounts, goals, budgets, categories, bills in parallel.
3. Sets up Supabase real-time channels for each table; on change, re-fetches the relevant list.
4. Exposes `totalBalance`, `netWorth`, manual `refreshAccounts`, and a `globalRefresh` that re-runs recalculation + all fetches.

```237:289:hooks/useRealtimeData.ts
    const loadData = async () => {
      setLoading(true);

      // 1. Transactions first so snapshot data is ready
      await fetchTransactions();

      // 2. Fix any balance drift before showing UI
      await recalculateAllBalances(true);

      // 3. Fetch everything else in parallel
      await Promise.all([
        fetchAccounts(),
        fetchGoals(),
        fetchBudgets(),
        fetchCategoriesData(),
        fetchBillsData()
      ]);
      setLoading(false);
    };
```

### 3.2 Account Breakdown Helper
`LiabilitiesContext.getAccountBreakdown(accountId)` combines:
- Account balance from `accounts`
- Liability portions + names via join to `liabilities`
- Goal portions from `account_goal_portions`
- Computes `personal = balance - liability - goal`
Used heavily in account detail screens to render the “Fund Breakdown” card.

---

## 4. UI Layers

### 4.1 Accounts Tab (`app/(tabs)/accounts.tsx`)
Responsibilities:
- Show total balance and list of accounts supplied by `useRealtimeData`
- Special casing for the synthetic “Goals Savings Account” (dashed border, different CTA)
- Launch `AddAccountModal` when user taps Add or empty state button
- Navigate to `account/[id]` on card press

```84:123:app/(tabs)/accounts.tsx
<GlassmorphCard style={styles.totalBalanceCard}>
  <Text style={styles.totalBalanceLabel}>Total Balance</Text>
  <Text style={styles.totalBalanceAmount}>{formatCurrency(totalBalance)}</Text>
</GlassmorphCard>

<View style={styles.accountsList}>
  {accounts.length > 0 ? (
    accounts.map((account, index) => {
      if (account.type === 'goals_savings') {
        return (
          <TouchableOpacity
            key={account.id}
            style={styles.goalsAccountCard}
            onPress={() => router.push(`/account/${account.id}`)}
          >
            ...
          </TouchableOpacity>
        );
      }
      return (
        <FinancialCard
          key={account.id}
          data={{
            id: account.id,
            name: account.name,
            amount: Math.abs(account.balance),
            icon: iconType,
            backgroundColor: 'rgba(153, 215, 149, 1)',
            iconBackgroundColor: '#000',
            liabilityFunds: (account as any).liability_funds,
            ownFunds: (account as any).own_funds,
          }}
          onPress={(id) => router.push(`/account/${id}`)}
          ...
        />
      );
    })
  ) : (
    /* empty state */
  )}
</View>
```

Notable behaviours:
- `useFocusEffect` triggers `refreshAccounts` so balances stay fresh when returning to the tab.
- Quick actions strip (Add, Transfer) sits below the list.

### 4.2 Account Detail Screen (`app/account/[id].tsx`)
Key sections:
1. Header with back button + account name.
2. Balance card showing current balance and personal/liability breakdown.
3. Quick action FABs launching Pay / Receive / Transfer modals (pre-selecting the current account).
4. Tabbed content (Transactions, Budgets, Insights, Statements). Goals Savings account swaps this layout for goal lists.

Fund breakdown rendering relies on `getAccountBreakdown` output, showing chips for personal, liability, goal allocations.

```196:223:app/account/[id].tsx
<View style={styles.balanceBox}>
  <Text style={styles.balanceLabel}>Current Balance</Text>
  <Text style={styles.balanceAmount}>
    {formatCurrency(account?.balance || 0)}
  </Text>
  {accountBreakdown && accountBreakdown.totalLiability > 0 && (
    <View style={styles.balanceBreakdown}>
      <View style={styles.balanceRow}>
        <Text style={styles.balanceRowLabel}>💵 Personal Funds:</Text>
        <Text style={styles.balanceRowAmount}>
          {formatCurrency(accountBreakdown.personal)}
        </Text>
      </View>
      {accountBreakdown.liabilityPortions.map((portion: any) => (
        <View key={portion.liabilityId} style={styles.balanceRow}>
          <Text style={styles.balanceRowLabel}>🏦 {portion.liabilityName}:</Text>
          <Text style={[styles.balanceRowAmount, styles.liabilityAmount]}>
            {formatCurrency(portion.amount)}
          </Text>
        </View>
      ))}
    </View>
  )}
</View>
```

Modal callbacks trigger `globalRefresh` and then reload the breakdown to reflect fund movements.

### 4.3 Add Account Modal (`app/modals/add-account.tsx`)
- Four wizard steps: type → details → visual → settings.
- Uses local state for step, form data, validation errors.
- On submit:
  1. Inserts the account row via Supabase `insert`.
  2. If starting balance > 0, calls `receive_to_account_bucket` with `bucket_type='personal'` to create the opening transaction (so snapshots stay consistent).
  3. Calls `globalRefresh()` and resets internal state.

```114:177:app/modals/add-account.tsx
const handleCreateAccount = async () => {
  if (!validateForm()) return;
  ...
  const { data: accountData } = await supabase
    .from('accounts')
    .insert({...})
    .select()
    .single();

  if (balance > 0) {
    await supabase.rpc('receive_to_account_bucket', {
      p_user_id: user?.id,
      p_account_id: accountData.id,
      p_bucket_type: 'personal',
      p_bucket_id: null,
      p_amount: balance,
      p_category: initialBalanceCategoryId || 'Initial Balance',
      p_description: 'Initial Balance',
      p_date: new Date().toISOString().split('T')[0],
      p_notes: 'Account opening balance',
      p_currency: accountData.currency || 'INR'
    });
  }
  await globalRefresh();
  ...
};
```

UX details:
- Type selection pre-selects icon.
- Visual step offers curated palettes and icon options.
- Settings step toggles `include_in_totals` and shows a summary card.

---

## 5. Supporting Components & Context
- `FinancialCard`: renders the shimmering account card, accepts own/liability funds for future use.
- `GlassmorphCard`: shared glass effect container used throughout accounts UI.
- `LiabilitiesContext`: besides breakdown helpers it also exposes `convertLiabilityToPersonal`, `getAccountsWithLiabilityPortions`, etc.; these operations mutate both account balances and portion tables.
- `SettingsContext`: provides currency symbol used when formatting balances across screens.
- `NotificationContext`: toast feedback after transfers/payments, triggered by modals launched from account detail.

---

## 6. Behaviour Summary
1. **Data load** — transactions → balance recalculation → accounts/goals/budgets/categories/bills.
2. **Accounts tab** — renders live list, fetches on focus, supports quick entry to add/transfer.
3. **Account detail** — merges live account state with breakdown data; modals re-run `globalRefresh` after success.
4. **Account creation** — ensures opening balance is represented as a real transaction to maintain audit trail.
5. **Real-time events** — Supabase channels trigger re-fetches so balances/cards update without manual refresh.

---

## 7. Known Complexity & Simplification Targets
- Balances represent aggregate of personal + goal + liability funds. Any simplification must redefine how these portions are stored or displayed.
- Multiple RPCs (`spend_from_account_bucket`, `receive_to_account_bucket`, `repay_liability`, etc.) are required to keep buckets and balances in sync, increasing coupling between accounts and other domains.
- Transfers currently result in two transactions (expense + income) rather than a single logical transfer entry, complicating reporting.
- `useRealtimeData` recalculates every account on most refreshes which is protective but costly.
- Documentation such as `BALANCE_SNAPSHOT_IMPLEMENTATION.md` and `GLOBAL_REFRESH_IMPLEMENTATION.md` rely on the existing bucket architecture.

Understanding these pieces allows us to plan a simpler “just asset vs liability (+/-)” model without accidentally breaking downstream features.

---

## 8. Table Definitions & Constraints

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `accounts` | `type`, `balance`, `include_in_totals` | Balance is authoritative total; trigger keeps `updated_at` in sync. |
| `transactions` | `amount`, `type`, `balance_before`, `balance_after` | `amount` is signed; balance snapshots enforced by RPCs. |
| `account_liability_portions` | `account_id`, `liability_id`, `amount` | Created in migration 012; RLS ties rows to owning account’s user. |
| `account_goal_portions` | *(expected `account_id`, `goal_id`, `amount`)* | Table referenced throughout RPCs and UI. Creation migration is not present in-repo—worth noting before schema changes. |
| `liabilities` | `current_balance`, `disbursed_amount`, `status` | Drives liability breakdown inside accounts. |
| `goals` | `current_amount`, `is_achieved` | Goal portions contribute to account breakdown. |

> ⚠️ **Gap:** the repository references `account_goal_portions` heavily (RPCs, fund picker, goal flows), but the migration that creates it is absent. Any clean-up must either recreate that migration or adjust references if buckets go away.

### 8.1 Indices & RLS Highlights
- `accounts`: indexed by `user_id`, `is_active`; RLS restricts all CRUD.
- `transactions`: indexes on `user_id`, `account_id`, `date`; RLS identical to accounts.
- `account_liability_portions`: indices on `account_id`, `liability_id`, `liability_account_id`; RLS uses a scalar subquery to enforce user ownership.
- Supabase real-time broadcasts rely on these tables being RLS-enabled; channel filters (`filter: user_id=eq.<uid>`) assume RLS allows the change payload through.

---

## 9. RPC Internals (Selected Walkthroughs)

### 9.1 `spend_from_account_bucket`
1. Validates amount > 0, bucket type ∈ {personal, liability, goal}.
2. Computes `personal_available = balance_before - Σ(liability_portions) - Σ(goal_portions)`.
3. For liability buckets: decrements `account_liability_portions`, deleting row when depleted.
4. For goal buckets: decrements `account_goal_portions`, deleting row when depleted (hence mandatory table).
5. Updates `accounts.balance` to `balance_after = balance_before - amount`, then cross-verifies the persisted value.
6. Inserts an expense transaction carrying balance snapshots + bucket metadata.

Errors bubble up to the UI (pay / transfer modals) and are surfaced via native alerts.

### 9.2 `receive_to_account_bucket`
1. Resolves category either by name or explicit UUID.
2. Updates account balance to `balance_after = balance_before + amount`, verifies result.
3. When `bucket_type='goal'`, performs an UPSERT into `account_goal_portions` and increments `goals.current_amount`.
4. Inserts an income transaction with snapshots and metadata.

### 9.3 Balance Repair Functions
- `recalculate_account_balance(account_id, user_id)`
  - Prefers latest `transactions.balance_after` when available.
  - Fallback: sums signed `amount` grouped by type, recalculates initial balance, updates `accounts.balance` if drift exceeds 0.01.
- `recalculate_all_account_balances(user_id)`
  - Iterates through active accounts, calling the single-account function.
  - Returns table `{account_id, account_name, old_balance, new_balance}` for diagnostics. `useRealtimeData` discards return value but logs when drift corrected.

---

## 10. Real-time & Refresh Pipeline

1. **Supabase Channels** (`useRealtimeData`):
   - `accounts_changes`, `transactions_changes`, `goals_changes`, `budgets_changes`, `categories_changes`, `bills_changes`.
   - Each subscribes to `event: '*'` with row-level filters (`filter: user_id=eq.<uid>`).
   - On payload receipt, trigger re-fetch of the corresponding dataset.

2. **Manual Refreshes:**
   - `refreshAccounts` ⇒ `recalculate_all_account_balances(true)` ⇒ `fetchAccounts()`.
   - `globalRefresh` ⇒ recalculates + `refreshAll()` (accounts, transactions, goals, budgets, categories, bills) in parallel.

3. **Modal Hooks:** pay/receive/transfer/add-account call `globalRefresh` after success, then re-query account breakdown to ensure UI shows updated personal/liability splits.

4. **Focus Synchronisation:** Accounts tab uses `useFocusEffect` to call `refreshAccounts` when revisited, preventing stale balances when navigating back from deep modals.

---

## 11. Supporting Components & Contexts

| Component / Context | Purpose | Account Touchpoints |
|---------------------|---------|---------------------|
| `FinancialCard` | Glassmorphic account card UI | Displays balance, optional liability badge; invoked by accounts tab. |
| `FundPicker` | Bucket selector modal | Calls `getAccountBreakdown`, queries `account_goal_portions` directly, exposes personal/liability/goal options. |
| `LiabilitiesContext` | Liability CRUD + breakdown helpers | Supplies `getAccountBreakdown`, `convertLiabilityToPersonal`, fetches liability allocations. |
| `SettingsContext` | Currency preference | All balance formatting uses `currency` from this context. |
| `NotificationContext` | Snack/alert feedback | Transfer/pay/receive modals display success via notification overlays. |
| `AuthContext` | Current user | Required for every Supabase RPC/REST call; guards data fetches. |

---

## 12. Cross-Domain Interactions Impacting Accounts

1. **Goals:**
   - Goal contributions withdraw personal funds (expense transaction) and credit `goal` bucket (income transaction into Goals Savings account).
   - Withdrawals reverse the process. Both rely on `account_goal_portions`, affecting account breakdown visuals.

2. **Liabilities:**
   - Liability draws credit regular accounts and append liability portions; repayments via personal funds or liability funds reduce corresponding portions/balances.
   - Account detail screen uses `LiabilitiesContext` to show per-liability amounts.

3. **Budgets:**
   - Budget creation links accounts via `budget_accounts`. Account detail page shows budgets involving the current account.

4. **Transactions Tab:**
   - Every pay/receive/transfer originates from accounts. Editing transactions (via `EditTransactionModal`) may impact stored `balance_before/after`, hence the frequent recalculation safety net.

---

## 13. Observed Edge Cases & Caveats

- **Missing Migration:** Without the `account_goal_portions` table, any goal-related RPC call will fail. Before simplifying, ensure we either introduce the missing migration or remove references.
- **Double Transaction Transfers:** Current transfer flow records both an expense (source) and income (destination). Reports and budgets count these separately; removing buckets must address how transfers will be represented to avoid duplicated totals.
- **Balance Drift:** Despite recalculation, concurrent updates could still cause momentary drift until `globalRefresh` completes. Simplifying the model could reduce reliance on heavy RPC verification.
- **FundPicker Availability Checks:** The picker only blocks selections when `amount > bucket.amount`; for zero-amount previews (e.g., user has not typed amount yet) all buckets remain selectable—UI expectation to revisit when simplifying flows.

---

Understanding these additional layers—and the implicit dependencies they introduce—makes it clear how tightly accounts are coupled to goals, liabilities, and transaction RPCs. Any move toward a “simple +/- ledger” must plan for:

1. Replacing bucket-aware RPCs with single-entry procedures.
2. Redefining UI components (e.g., FundPicker, balance breakdown) that currently expect portion metadata.
3. Migrating existing data away from `account_liability_portions` / `account_goal_portions` while keeping historical transactions coherent.

These details should guide the simplification roadmap and prevent regressions across the app.

---

## 14. UX & Interaction Flows

### 14.1 Add Account Wizard (Mobile)

1. **Entry Points**
   - `Accounts` tab floating “+” button.
   - Empty state CTA when user has zero accounts.
2. **Modal Presentation**
   - iOS page-sheet style; backdrop blur to maintain context.
   - Header shows title + close icon; progress bar communicates step progression (1–4).
3. **Step Details**
   - **Step 1 – Type:** Four large cards (Bank/Card/Wallet/Cash). Selection highlights with border + icon color. Choosing type pre-sets icon for subsequent steps.
   - **Step 2 – Details:** Text inputs use brand background (#99D795) with dark border. Validation on blur + on Next; error message in red under field. Numeric keypad for balance.
   - **Step 3 – Visual:** Grid of eight swatches; selection shows check overlay. Icon grid uses circular toggles. All components obey 12px spacing, 10–12px radius.
   - **Step 4 – Settings:** Toggle for “Include in Net Worth” (custom tinted switch). Summary card restates name/type/balance for review.
4. **Submission**
   - Button label changes from “Next” to “Create Account”. Loading state is “Creating…” with disabled styling.
   - On success: modal shows `Alert.alert` with success message, auto resets to step 1, and calls `globalRefresh()`.
5. **Edge UX Considerations**
   - If starting balance RPC fails, account remains but toast error is logged; user stays on modal (requires follow-up improvement).
   - Closing modal mid-process discards form state (no draft persistence yet).

### 14.2 Accounts Tab Experience

1. **Header Section**
   - Hero title (“Your Accounts”), background gradient (#99D795). Add button uses translucent white square with icon.
2. **Total Balance Card**
   - `GlassmorphCard` with serif typography for amount. Updates in real time via context.
3. **Account Cards**
   - `FinancialCard` provides layered glass effect: drop shadow + inner shadow for depth. Icon container uses synthetic shapes (card/wallet/bank/cash) to avoid external assets.
   - Liability badge appears when card receives `liabilityFunds`. Tapping card triggers ripple via `TouchableOpacity` and navigates to detail screen.
4. **Goals Savings Card**
   - Distinct dashed border + trophy icon. Secondary text “Tap to view your goals and progress” with arrow.
5. **Quick Actions Strip**
   - Two tiles (“Add Account”, “Transfer”). Layout ensures consistent spacing even when list short.
6. **Empty State**
   - Wallet outline icon, supportive text, and CTA button; uses brand green background to keep optimism.

### 14.3 Account Detail Screen Flow

1. **Page Composition**
   - Gradient background continues from tab. ScrollView wraps entire page, ensuring modals overlay without layout shift.
2. **Balance & Fund Breakdown**
   - Central balance card with black-on-white aesthetic for contrast. Fund breakdown chips show personal/liability/goal contributions with small icons. When all funds are personal, card displays “All funds are personal” italic note.
3. **Quick Action Bubbles**
   - Circular buttons (Pay/Receive/Transfer) with haptic feedback (via `TouchableOpacity`). Each opens corresponding modal with account preselected.
4. **Tabbed Content**
   - Pill-shaped segmented control toggles between Transactions / Budgets / Insights / Statements (or Goals for goals account). Active tab uses light-green fill, others remain dark.
5. **Transactions List UX**
   - `TransactionCard` for each entry; clicking navigates to transaction detail modal. Empty state encourages first transaction.
6. **Budgets Section**
   - Shows budgets tied to account via context helper; includes inline “Create Budget” CTA if none found.
7. **Goals Savings Special Case**
   - Tabs adapt to “Goals vs Transactions”. Goal cards show progress bars and direct link to goal detail.
8. **Modal Success Flow**
   - On successful pay/receive/transfer: notification toast (via `NotificationContext`), global refresh, short delay (100ms) to allow state propagation, then re-fetch of breakdown to update UI.

### 14.4 Fund Picker Interaction

1. **Trigger Points**
   - Used inside Pay and Transfer modals to choose fund source.
2. **Modal Styling**
   - Dark frosted panel, close icon top-right, scrollable list of buckets.
3. **Bucket Listing**
   - Personal funds listed first, followed by liability allocations and goal allocations (fetched via Supabase + goals context). Amount formatting uses locale currency.
4. **Availability Feedback**
   - If user has entered an amount, buckets with insufficient balance show “Insufficient funds” in red and disable selection.

### 14.5 Error & Load States

- **Loading:** Accounts tab shows “Loading accounts…” inside glass card when `useRealtimeData.loading` true.
- **Supabase Errors:** When fetch fails, errors logged to console; UI currently remains stale (no inline error messaging yet).
- **RPC Failures:** Surfaced through `Alert.alert` in modals; account detail relies on global refresh to recover.

### 14.6 Responsive / Platform Considerations

- Design primarily targets Expo mobile; fonts rely on bundled assets (IBM Plex). Desktop/tablet not optimized yet.
- Light/dark backgrounds toggled via `BackgroundModeContext`; accounts screens support iOS gradient background alternative.
- Scroll performance optimized by avoiding large on-screen lists (accounts list typically small); still, `BlurView` overlays can be expensive on older devices.

---

This UX outline preserves the current user journey. When simplifying the financial model we should revisit each interaction to ensure the replacement flows (e.g., no fund picker, single-entry transfers) maintain the visual polish and feedback patterns described above.

---

## 15. Navigation Flow & Routing Topology

### 15.1 Expo Router Structure
- Root layout (`app/_layout.tsx`) defines a stack with tabs.
- Accounts entry point resides in `app/(tabs)/accounts.tsx` (bottom tab “Accounts”).
- Account detail lives at `app/account/[id].tsx` (stack screen pushed on top of tabs).
- Transaction detail: `app/transaction/[id].tsx` (modal sheet presented from anywhere).
- Modals under `app/modals/*.tsx` are registered as stack screens with `presentation="modal"` or `pageSheet` for iOS.

### 15.2 Primary Flow Paths

```
Tabs (Accounts) ──► Account Detail (stack push)
    │                    │
    │                    ├─► Pay Modal (present)
    │                    │     └─► Fund Picker (nested modal)
    │                    ├─► Receive Modal (present)
    │                    └─► Transfer Modal (present) ──► Fund Picker
    │
    ├─► Add Account Modal (present)
    └─► Transfer Quick Action (push to /transactions tab or open modal depending on CTA)

Account Detail ─► Transaction Detail (`/transaction/[id]`) (page-sheet modal)
```

### 15.3 Navigation Characteristics
- **Tab Bar:** Persistent; account detail screens hide tab icons automatically due to stack push.
- **Back Behavior:** Account detail includes explicit back button calling `router.back()`. Native back gesture/pop works too.
- **Modal Closure:** All modals accept either close icon or swipe-down (iOS). On Android, hardware back dismisses modal first, then underlying screen.
- **Deep Linking:** `/account/<uuid>` opens the account detail directly. If launched from push notification, the app hydrates `useRealtimeData` before rendering content.
- **State Preservation:** Returning to accounts tab (`router.back()` or tapping tab) triggers `useFocusEffect` refresh but keeps scroll position thanks to React Navigation’s default behavior.

### 15.4 Edge Cases
- Opening multiple modals sequentially (e.g., Transfer → Fund Picker) stacks them; closures reverse order. Ensure simplification maintains this stack discipline.
- `router.push('/(tabs)/transactions')` from accounts quick action changes tab; the user can tab back to accounts without losing context.
- If Supabase session expires, contexts redirect to auth screens; returning restarts navigation flow from sign-in.

Mapping this topology will help redesign navigation when restructuring the transaction system so that routing contracts remain intact while the underlying flows are simplified.











