## 1. Feature Overview

### 1.1 Accounts Management
- **Purpose**: Present all user accounts, balances, and fund breakdowns; allow creation and maintenance of accounts. Driven by `app/(tabs)/accounts.tsx`, the `AccountDetailScreen` in `app/account/[id].tsx`, and the wizard in `app/modals/add-account.tsx`.
- **Frontend logic**:  
  - Lists come from `useRealtimeData` (`hooks/useRealtimeData.ts`) which fetches `accounts` with realtime subscriptions and balance reconciliation RPCs.  
  - Account details call `useLiabilities().getAccountBreakdown` to split balances between personal, goal, and liability buckets, and reuse modals for pay/receive/transfer/budget creation.
- **Backend touchpoints**: Tables `accounts`, `account_liability_portions` (from `migrations/012_create_account_liability_portions.sql`), `account_goal_portions` (referenced by RPCs in `migrations/016_update_rpcs_with_balance_snapshots.sql`), and `transactions`. Account creation uses Supabase insert via `supabase.from('accounts')`; balance corrections rely on RPCs `increment_account_balance`, `decrement_account_balance`, and `recalculate_*` helpers in `useRealtimeData`.

### 1.2 Transactions
- **Purpose**: Central ledger for every money movement, with filtering, calendar views, and entry modals. Implemented in `app/(tabs)/transactions.tsx` with supporting components `TransactionCard` and modals `app/modals/pay.tsx`, `receive.tsx`, `transfer.tsx`.
- **Frontend logic**:  
  - `useRealtimeData` streams `transactions`, attaches category and account metadata, and exposes `refreshTransactions`.  
  - Modals orchestrate RPC calls (`spend_from_account_bucket`, `receive_to_account_bucket`, `create_transfer_transaction`) and trigger `refreshAccounts`/`refreshTransactions`.
- **Backend touchpoints**: Core table `transactions` (see `migrations/017_create_core_accounts_transactions.sql` and `015_add_transaction_balance_snapshots.sql`) stores `balance_before`/`balance_after` snapshots. RPC definitions in `migrations/016_update_rpcs_with_balance_snapshots.sql` enforce bucket accounting, integrate with `account_goal_portions`, `account_liability_portions`, and update `goals`/`liabilities`.

### 1.3 Budgets
- **Purpose**: Track planned spend across accounts/categories with alerts and rollover support. Screens live in `app/(tabs)/budgets.tsx`, with cards `components/BudgetCard.tsx` and modal `app/modals/add-budget.tsx`.
- **Frontend logic**:  
  - `useRealtimeData` fetches budgets including joined `budget_accounts`, providing active/completed segmentation and pull-to-refresh.  
  - Detail flows (in `app/budget/[id].tsx`) reuse helpers in `utils/budgets.ts`.
- **Backend touchpoints**: Tables from `migrations/001_create_budgets_table.sql` through `007_create_budget_indexes.sql` (`budgets`, `budget_accounts`, `budget_transactions`, `budget_events`). Utility functions in `utils/budgets.ts` call Supabase RPCs and direct table operations to update progress, manage exclusions, rollover, and log events. References to goals link via `goal_id`.

### 1.4 Goals
- **Purpose**: Manage savings targets, contributions, withdrawals, and progress analytics. Presented in `app/(tabs)/goals.tsx`, `GoalCard`, `GoalCelebrationScreen`, and modals `add-goal`, `add-contribution`, `WithdrawFundsModal`, `ExtendGoalModal`.
- **Frontend logic**:  
  - `useRealtimeData` maintains `goals`. Detail screen `app/goal/[id].tsx` surfaces contributions, progress milestones, and modal actions.  
  - Utilities in `utils/goals.ts` encapsulate workflows for create, contribute, withdraw, extend, archive.
- **Backend touchpoints**: Tables `goals`, `goal_contributions`, `account_goal_portions` (usage inferred from RPCs), and linkage to `accounts`. RPCs `receive_to_account_bucket`/`spend_from_account_bucket` adjust goal portions and account balances while recording transactions; `utils/goals.ts` also queries categories and inserts into `goal_contributions`.

### 1.5 Liabilities
- **Purpose**: Track loans/credit facilities, allocations, payments, and draws. Managed through `app/(tabs)/liabilities.tsx`, detail `app/liability/[id].tsx`, contextual modals (`add-liability`, `draw-liability-funds`, `pay-liability`), and shared state from `contexts/LiabilitiesContext.tsx`.
- **Frontend logic**:  
  - `LiabilitiesContext` handles CRUD, allocations, conversions, and fetch helpers, combining Supabase RPCs and direct table updates.  
  - Screens segment upcoming vs all liabilities, display due dates, and route to payment modals.
- **Backend touchpoints**: Tables from `migrations/011_create_liabilities_system.sql` (liabilities, payments, schedules, activity log) and `012_create_account_liability_portions.sql`. RPCs (`repay_liability`, `settle_liability_portion`, `draw_liability_funds`, `pay_from_liability_funds`) are defined or updated in `migrations/014_add_transaction_rpcs.sql` and `016_update_rpcs_with_balance_snapshots.sql`, coordinating with `transactions` and `accounts`.

### 1.6 Bills
- **Purpose**: Manage recurring/one-time bills, reminders, payment history, and status transitions. Primary screen `app/(tabs)/bills.tsx` (list/selections) with detail page `app/bill/[id].tsx` and modal flows (`add-bill`, `mark-bill-paid`).
- **Frontend logic**:  
  - Bill utilities in `utils/bills.ts` fetch lists with filters, compute statuses, create/update records, process payments via `spend_from_account_bucket`, and generate new occurrences (`generate_next_bill_instance`).  
  - `useRealtimeData` maintains cached `bills` data and subscribes for changes.
- **Backend touchpoints**: Tables defined in `migrations/010_create_bills_system.sql` (bills, bill_payments), plus triggers/RPCs such as `generate_next_bill_instance` and `update_bill_statuses`. Payments integrate with `transactions`, `accounts`, and optionally `categories`.

### 1.7 Transfers
- **Purpose**: Move funds across accounts and convert liability/goal buckets. Handled exclusively via modal `app/modals/transfer.tsx`, which orchestrates combined RPC calls.
- **Frontend logic**:  
  - Modal triggers `spend_from_account_bucket` and `receive_to_account_bucket` back-to-back, supporting special modes (liability-to-personal) flagged by metadata.
- **Backend touchpoints**: Relies on RPCs updated in `migrations/016_update_rpcs_with_balance_snapshots.sql` and helper `create_transfer_transaction` in `migrations/014_add_transaction_rpcs.sql`. A transfer typically creates two transactions (expense+income) unless optimization paths use the dedicated RPC.

### 1.8 Notifications
- **Purpose**: In-app alerts for successful actions and bill reminders. `contexts/NotificationContext.tsx` renders `components/NotificationPopup.tsx`; home screen pulls upcoming/due bills via `utils/bills.getBillsForNotification`.
- **Backend touchpoints**: No dedicated tables; notification data is derived from `bills` and `transactions`.

### 1.9 Settings & Profiles
- **Purpose**: Persist user preferences (currency, dark mode, biometric toggle, etc.) and profile information. UI lives in `app/settings.tsx`, `app/profile.tsx`, with cards like `ProfileCard`.
- **Frontend logic**:  
  - `SettingsContext` stores preferences in AsyncStorage with typed setters and `resetSettings`.  
  - `AuthContext` mediates Supabase auth flows and session state. `UserContext` retrieves and updates `users_profile`.
- **Backend touchpoints**: Table `users_profile` (created in `migrations/018_create_users_profile.sql`). Auth operations rely on Supabase Auth service; settings remain local unless explicitly synced.

### 1.10 Analytics & Reports
- **Purpose**: Provide spending summaries, savings rate, category distribution, and time filters. Implemented in `app/(tabs)/analytics.tsx`.
- **Frontend logic**:  
  - Combines client-side aggregation of `transactions` with Supabase RPC `get_category_stats` (called via `supabase.rpc`) to populate charts.  
  - Period switch recalculates stats; fallback logic aggregates transactions if RPC returns no data.
- **Backend touchpoints**: RPC `get_category_stats` (defined in migrations under categories stack) queries `categories` and `transactions`. Additional helpers in `utils/bills.ts` and `utils/categories.ts` supply analytics for bills/categories.

### 1.11 Categories
- **Purpose**: Maintain tagging system for income, expense, goal, bill, and liability activities. UI handled in `app/(tabs)/categories.tsx` with modal `app/modals/add-category.tsx`.
- **Frontend logic**:  
  - `useRealtimeData` caches categories; creation/update flows call helpers in `utils/categories.ts`, including duplicate checks (`checkCategoryExists`) and connected item lookups.  
  - Category detail page (`app/category/[id].tsx`) shows transactions and linked budgets/bills/goals using utility calls.
- **Backend touchpoints**: Table `categories` (see `migrations/009_create_categories_system.sql`) with JSON `activity_types` column. Utilities call RPCs such as `seed_default_categories`, `update_category_statistics`, and join against `transactions`, `budgets`, `bills`, `goals`.

## 2. Frontend Flow

- **Navigation hierarchy**: File-based routing via Expo Router. Root stack (`app/_layout.tsx`) wraps providers (auth, user, settings, background mode, notifications, liabilities) and exposes stacks for splash, auth, onboarding, profile/settings, dynamic entity detail pages, and modal routes. Tabs are defined in `app/(tabs)/_layout.tsx` with nine tabs (Home, Accounts, Analytics, Bills, Transactions, Goals, Budgets, Liabilities, Categories), each hiding the header and using a custom `HapticTab`.
- **Home journey** (`app/(tabs)/index.tsx`):  
  - Loads accounts and balances via `useRealtimeData`, surfaces quick actions to open Pay/Receive/Transfer modals, shows account list, and bill alerts from `getBillsForNotification`.  
  - Modals call RPCs and trigger `globalRefresh`.
- **Key screens & responsibilities**:  
  - `accounts.tsx` & `account/[id].tsx`: summary vs detail, fund breakdowns, connections to budgets/goals/liabilities via modals.  
  - `transactions.tsx`: segmented toggles (list/calendar) with filters, hooking pay/receive/transfer modals.  
  - `budgets.tsx`, `goals.tsx`, `liabilities.tsx`, `bills.tsx`, `categories.tsx`: each lists active/completed entities, launching modals for creation and linking to detail pages.  
  - Detail routes (`goal/[id].tsx`, `liability/[id].tsx`, `bill/[id].tsx`, etc.) pull supporting data, show history using `TransactionCard`, `GoalCard`, `BudgetCard`, and embed modals for actions.
- **State & data fetching**:  
  - Global data plane is `useRealtimeData` providing accounts/transactions/goals/budgets/categories/bills plus helper methods (refreshes, recalculations).  
  - Liabilities rely on `LiabilitiesContext` for specialized operations; settings and notifications use dedicated contexts; user profile through `UserContext`.  
  - Contexts subscribe to Supabase changes through `supabase.channel(...).on('postgres_changes', ...)` in `useRealtimeData`.
- **Supabase invocation points**:  
  - Direct table queries with `.from(...).select()` for lists (accounts, categories, bills, budgets).  
  - RPCs triggered from modals, utilities (`utils/*`), and contexts: `spend_from_account_bucket`, `receive_to_account_bucket`, `repay_liability`, `settle_liability_portion`, `draw_liability_funds`, `create_transfer_transaction`, analytics RPCs (category stats, update_bill_statuses).  
  - `LiabilitiesContext` executes complex sequences mixing inserts/updates across `accounts`, `account_liability_portions`, `liabilities`, `liability_payments`, `liability_activity_log`.
- **Typical user journeys**:  
  - *Pay*: Home/transactions quick action → `PayModal` selects account + fund bucket + category → RPC `spend_from_account_bucket` updates balances and logs transaction → notifications + refresh.  
  - *Receive*: `ReceiveModal` uses `receive_to_account_bucket` to increase balances, optionally allocate to goals.  
  - *Goal contribution*: `add-contribution` modal chains `spend_from_account_bucket` (source personal funds) + `receive_to_account_bucket` (goal bucket) + insert `goal_contributions`.  
  - *Liability draw*: `draw-liability-funds` modal loops allocations calling RPC `draw_liability_funds`, updating accounts and `account_liability_portions`.  
- *Bill payment*: `mark-bill-paid` modal calls `spend_from_account_bucket`, inserts into `bill_payments`, updates `bills`, optionally triggers `generate_next_bill_instance`.  
- *Liability repayment*: `pay-liability` modal branches to `repay_liability` (personal funds) or `settle_liability_portion` (liability bucket), both adjusting `liabilities`, `account_liability_portions`, and logging transactions.
  - *Transfer*: `TransferModal` handles account-to-account or liability conversions via paired spend/receive RPC calls.  
  - *Goal withdrawal*: `WithdrawFundsModal` spends from goal bucket then receives into destination account, mirroring contributions.

## 3. Backend & Database

- **Schema overview**:  
  - `accounts`, `transactions` (migration 017) with RLS enforcing `auth.uid() = user_id`. `transactions` holds `type`, `amount`, `metadata`, `balance_before/after`.  
  - Budget stack (`budgets`, `budget_accounts`, `budget_transactions`, `budget_events`) from migrations 001–004 with indexes, triggers, and RLS.  
  - Category system (migration `009_create_categories_system.sql`) adds `categories`, linking to transactions, budgets, bills.  
  - Bills system (migration 010) defines `bills`, `bill_payments`.  
  - Liabilities system (migration 011) introduces `liabilities`, `liability_payments`, `liability_activity_log`, schedules, adjustments, calculations.  
  - Relationship tables `account_liability_portions` (migration 012) and referenced `account_goal_portions` (used by RPCs though migration artifact not present—treated as existing).  
  - Support tables include `goal_contributions`, `users_profile`, plus indexes/triggers ensuring `updated_at` maintenance.
- **RPC catalogue** (see migrations 013–016):  
  - Balance helpers: `increment_account_balance`, `decrement_account_balance`, `recalculate_account_balance`, `recalculate_all_account_balances`.  
  - Transaction flows: `spend_from_account_bucket`, `receive_to_account_bucket`, `repay_liability`, `settle_liability_portion`, `draw_liability_funds`, `pay_from_liability_funds`, `create_transfer_transaction`. Each enforces bucket constraints, updates related tables, and captures balance snapshots.  
  - Analytics/utilities: `generate_next_bill_instance`, `update_bill_statuses`, `get_category_stats`, `seed_default_categories`.  
  - Liabilities cleanup: `delete_liability_and_recover_funds`, `delete_liability_entirely`, `update_liability_principal`.
- **Relationships & constraints**:  
  - `transactions.account_id` references `accounts.id`; optional `to_account_id` for transfers.  
  - `budget_accounts` ties budgets to accounts with roles; `budget_transactions` links budgets to transaction IDs.  
  - `account_liability_portions` references both regular accounts and liability accounts, enforcing cascading deletes.  
  - Goals rely on `goal_contributions` + `account_goal_portions` to map funds; `goals.goal_id` referenced by budgets and bills.  
  - Bills link to categories, accounts, goals; payments reference `transactions`.  
  - RLS policies limit access per user across all major tables.
- **Balance maintenance**:  
  - RPCs compute `balance_before/after` to detect drift. `useRealtimeData.recalculateAllBalances` invokes `recalculate_all_account_balances` on load/refresh to correct inconsistencies.  
  - Liabilities and goals adjust proportional tables during spend/receive flows to keep personal vs bucket balances accurate.

## 4. Cross-Feature Dependencies

- **Transactions as central ledger**: Goals, liabilities, budgets, bills, transfers all post to `transactions`, often storing metadata flags (`bucket_type`, `liability_source_id`, `bill_id`) used across detail screens.
- **Shared bucket accounting**: `spend_from_account_bucket` and `receive_to_account_bucket` serve pay, receive, transfers, goal flows, and bill payments; all modals depend on consistent JSON bucket schema.
- **Budgets & goals**: Goal-based budgets rely on `goal_id` and use `utils/budgets.updateGoalProgressFromBudget` to sync `goals.current_amount`.
- **Liabilities & accounts**: `LiabilitiesContext` frequently queries/upserts `account_liability_portions`, which Home/Accounts detail rely upon for fund breakdown displays.
- **Notifications**: Bill alerts on Home depend on `utils/bills.getBillsForNotification`, coupling the dashboard experience to bill data freshness.
- **Analytics**: Category stats depend on consistent category assignment from transactions; fallbacks recompute client-side if RPC fails, potentially diverging from backend calculations.
- **Context coupling**: Many modals import both `useRealtimeData` and `useLiabilities`, leading to dependencies between contexts (e.g., `PayModal` showing fund picker for liability buckets via `getAccountBreakdown`).

## 5. Supporting Systems

- **Notifications**: `NotificationContext` renders `NotificationPopup` overlay and exposes `showNotification` for success/error banners; invoked across modals after RPC success.
- **Theming & background modes**: `BackgroundModeContext` toggles gradient backgrounds stored in AsyncStorage; `theme.ts` and `utils/themeUtils.ts` centralize palette and typography.
- **Local caching**: `SettingsContext` persists toggles using AsyncStorage keys; on load it hydrates state before exposing to consumers.
- **Authentication**: `AuthContext` wraps Supabase Auth for sign-in/up, providing validation and profile bootstrap (`users_profile` insert on signup). `AuthGuard` (component) redirects unauthorized users to auth stack.
- **Realtime synchronization**: `useRealtimeData` subscribes to Supabase channels for six tables (accounts, transactions, goals, budgets, categories, bills) and triggers refreshes on change payloads.
- **Error handling**: Modals show `Alert` on RPC failure and log to console; contexts catch Supabase errors and print warnings but often proceed (e.g., goal contribution metadata errors). Notifications highlight success but errors generally rely on alerts/logs.
- **Synchronization**: `globalRefresh` chains balance recalculation followed by multi-entity refresh to ensure UI consistency after complex flows.

## 6. Technical Stack Summary

- **Frameworks & libraries**: Expo/React Native with Expo Router, React Navigation theme provider, React contexts, Reanimated integration for tabs. UI components use custom glassmorphism cards, Ionicons, LinearGradient. Forms rely on React state and components like `TextInput`, `DateTimePicker`.
- **State management patterns**: Context providers (`Auth`, `User`, `Settings`, `BackgroundMode`, `Notification`, `Liabilities`) combined with the `useRealtimeData` hook for shared data. No Redux/Zustand; relies on provider composition in `app/_layout.tsx`.
- **Data access**: Supabase JS client (`lib/supabase.ts`) for both auth and Postgres queries/RPC calls. Heavy use of `.from().select()` and `.rpc()` in utilities and contexts.
- **Async operations**: Modals perform optimistic UI workflows with additional verification loops (e.g., `PayModal` re-fetches account several times to confirm updated balance). Utilities often chain awaits sequentially for multi-step operations (allocations, payments).
- **Forms & validation**: Manual validation per modal (collecting errors in state). Multi-step modals (e.g., Add Account) use step tracking. Input formatting uses helpers like `formatCurrencyAmount`.
- **Modals**: Stored under `app/modals/`. Each is a React Native `Modal` with gradient backgrounds, using contexts/hooks to fetch data and call Supabase.
- **Charts & analytics**: Basic charting built manually (no third-party chart lib) using styled `View`s in `analytics.tsx`.

## 7. System Health Notes

- **Missing migration for `account_goal_portions`**: RPCs and utilities reference this table, but no migration exists in `migrations/`—likely maintained elsewhere; worth verifying schema alignment before refactors.
- **Bucket RPC complexity**: `spend_from_account_bucket`/`receive_to_account_bucket` contain extensive branching (personal vs goal vs liability) and manual verification loops (see `PayModal`). Consolidating flows or introducing shared service wrappers would reduce duplication and error risk.
- **Double-entry transfers**: Transfer flow defaults to two RPC calls, producing paired transactions; `create_transfer_transaction` exists but is not consistently used. Clarify single vs double entry semantics to avoid reporting confusion.
- **Balance drift safeguards**: Frequent recalculation (`recalculate_all_account_balances`) indicates past inconsistency issues. Investigate root causes (race conditions, repeated RPCs) before simplifying transaction system.
- **Duplicate analytics logic**: `analytics.tsx` recalculates category stats client-side even when RPC succeeds, potentially diverging from backend calculations; consider centralizing logic.
- **Liability context size**: `contexts/LiabilitiesContext.tsx` mixes API orchestration, validation, and business rules (>800 lines). Splitting into service modules would improve maintainability.
- **Error handling gaps**: Many Supabase updates log errors but continue (e.g., bill metadata updates, goal progress). Introduce user-facing feedback and rollback strategies.
- **Unused/legacy docs**: Repository includes numerous analysis markdown files (`TRANSACTION_SYSTEM_ANALYSIS.md`, `CURRENT_SYSTEM_ANALYSIS.md`, etc.). Ensure they align with live code or archive/update to prevent onboarding confusion.

## 8. Domain Deep Dives

### 8.1 Goals (Creation, Tracking, Transactions, Deletion, Logic)
- **Creation flow** (`app/modals/add-goal.tsx` → `utils/goals.createGoal`):  
  - Ensures a dedicated “Goals Savings” account exists per user via `getOrCreateGoalsSavingsAccount`.  
  - Inserts into `goals` with initial `current_amount = 0`, color/icon metadata, category, target date, and currency.  
  - Signup ensures at least one default category is available; contributions later reference a `Goal Savings` category (`utils/goals.ts` lines 152–163).
- **Tracking & state**:  
  - `useRealtimeData` subscribes to `goals`, exposing arrays to `GoalCard` (`components/GoalCard.tsx`) and screens (`app/(tabs)/goals.tsx`, `app/goal/[id].tsx`).  
  - Progress helpers (`calculateGoalProgress`, `calculateMonthlyNeed`, `checkMilestoneAchievements`, `getNextMilestone`) provide UI feedback and milestone detection.  
  - Goal-specific attributes like `total_contributions`, `avg_monthly_saving`, `completed_at`, `achievement_date` are maintained by `updateGoalProgress`.
- **Transactions & fund logic**:  
  - **Contributions** (`app/modals/add-contribution.tsx` → `utils/goals.addContributionToGoal`):  
    1. Validates source account balance and bucket availability.  
    2. Calls `spend_from_account_bucket` (personal bucket) to log an expense transaction with `metadata.bucket_type = personal`.  
    3. Calls `receive_to_account_bucket` targeting bucket_type `goal`, incrementing `account_goal_portions` and `goals.current_amount`.  
    4. Inserts `goal_contributions` linking transaction ID and source account.  
  - **Withdrawals** (`components/WithdrawFundsModal.tsx` → `utils/goals.withdrawFromGoal`): mirror process using goal bucket spend followed by personal receive, decrementing `account_goal_portions` and `goals.current_amount`.  
  - **Auto progress sync**: `updateGoalProgress` recalculates totals by summing `goal_contributions`, recalculating averages, and marking achievements.
- **Maintenance operations**:  
  - Extend (`utils/goals.extendGoal`) adjusts target amount/date, resets achievement flags.  
  - Archive (`utils/goals.archiveGoal`) toggles `is_archived`.  
  - Delete (`utils/goals.deleteGoal`) soft deletes via `is_deleted`. There is no cascade removing related contributions; those remain for audit.  
  - `checkGoalCompletion` verifies `current_amount >= target_amount` and flips `is_achieved`, used to trigger goal celebration UI (`components/GoalCelebrationScreen.tsx`).
- **UI logic considerations**:  
  - Contribution modal forces selection of fund bucket (`FundPicker`), ensuring the correct bucket metadata reaches RPCs.  
  - Goal detail screen aggregates transactions via `fetchGoalContributions`, enriching them with account names for display.

### 8.2 Budgets (Creation, Tracking, Transactions, Deletion, Logic)
- **Creation flow** (`app/modals/add-budget.tsx` → `utils/budgets.createBudget`):  
  - Collects metadata (name, amount, type, period, accounts) and inserts into `budgets` with optional idempotency key.  
  - Links associated accounts through `budget_accounts` (role `owner`).  
  - Logs event `budget_created` to `budget_events` for audit.
- **Tracking & state**:  
  - `useRealtimeData` loads budgets with nested `budget_accounts` → `accounts` join for UI context.  
  - `components/BudgetCard.tsx` presents progress percentages, amount remaining, linked accounts.  
  - Utility `updateBudgetProgress` recalculates `spent_amount` from `budget_transactions` (excluding flagged entries) and updates `remaining_amount`.
- **Transactions integration**:  
  - Budget consumption depends on entries in `budget_transactions` referencing `transactions`. Helper functions support timeline management:  
    - `excludeTransactionFromBudget` / `includeTransactionInBudget` toggle `is_excluded`, update progress, and log events.  
    - `reconcileRefund` marks refund transactions, updates progress, and logs `transaction_reconciled`.  
  - There is no automatic budget update during transaction posting in the current codebase; integration likely occurs via server-side triggers or unimplemented UI flows.
- **Lifecycle management**:  
  - `closeBudgetPeriod` marks budget inactive (`is_active = false`), logs event, and optionally rolls over remaining amount into a renewed budget by calling `renewBudget`.  
  - `renewBudget` duplicates budget metadata for a new period, copies `budget_accounts`, and records `budget_renewed`.  
  - Alerts: `checkBudgetAlerts` evaluates thresholds, daily pace, and snooze settings; `calculateDailyPace` computes ideal vs actual spend rates; `snoozeAlert` writes snooze metadata.  
  - There is no dedicated delete helper; removal is expected via soft-delete fields (`is_deleted`) referenced in fetch queries (`eq('is_deleted', false)`).
- **Supporting logic**:  
  - Utility functions allow retrieving budgets by account (`getBudgetsByAccount`), analytics (`calculateDailyPace`, `checkBudgetAlerts`), and event logging (`logBudgetEvent`).  
  - Budget detail screens leverage these utilities to present account-specific impact and to handle recurrence.  
  - Alerts and renewals rely on consistent metadata (threshold arrays, snooze timestamps) stored within `budgets.alert_settings`.

### 8.3 Liabilities (Creation, Tracking, Transactions, Deletion, Logic)
- **Creation flow** (`app/modals/add-liability.tsx` → `LiabilitiesContext.createLiability`):  
  - Wizard captures liability type (`loan`, `emi`, `one_time`), principal/remaining amounts, dates, and optional metadata (EMI fields, lender information).  
  - Context method (in `contexts/LiabilitiesContext.tsx`) persists the liability row, mapping frontend types to backend `liability_type`, and stores type-specific metadata (EMI flags, installment counts, lender notes).  
  - Optional fund allocations immediately distribute drawn amounts: context upserts `account_liability_portions`, increments destination account balances, tracks total disbursed, and records a `liability_activity_log` entry.  
  - Initial payments array can be supplied to backfill history—creates `liability_payments`, adjusts balances/portions when `mode === 'affect_balance'`, and mirrors activity in `transactions` to preserve ledger continuity.
- **Tracking & state**:  
  - `LiabilitiesContext` maintains in-memory `liabilities` array, with `fetchLiabilities` applying user-specific filters and ordering; the provider exposes helpers to fetch individual liabilities, allocations, breakdowns, and accounts carrying liability portions.  
  - `useRealtimeData` does not subscribe to liabilities directly; components consume context hooks for reactive data, while screens like `app/(tabs)/liabilities.tsx` rely on the provider’s state and derived selectors (e.g., grouping upcoming items by `next_due_date`).  
  - Account-level breakdowns (`getAccountBreakdown`) aggregate personal, goal, and liability buckets for a given account by querying `account_liability_portions` and `account_goal_portions`, enabling detail screens to present fund composition.
- **Transactions & money movement**:  
  - **Drawing funds** (`app/modals/draw-liability-funds.tsx` → RPC `draw_liability_funds`): lifts money from the liability into one or more accounts, updating account balances, upserting portions, increasing `disbursed_amount`, and inserting income transactions per allocation. Overdraw logic optionally raises `original_amount` via follow-on prompts.  
  - **Repayment** (`app/modals/pay-liability.tsx`): branches by fund source. Personal bucket uses `repay_liability` RPC (decrements account balance and liability `current_balance`, records expense transaction, logs activity). Liability bucket uses `settle_liability_portion`, reducing both the portion and liability balance while creating an expense transaction with bucket metadata.  
  - **Allocation adjustments** (`LiabilitiesContext.allocateReceivedFunds` and `recordInitialPayments`): support manual bookkeeping for imported data—updating accounts, portions, and transactions based on historical context.  
  - **Conversion** (`convertLiabilityToPersonal`): reclassifies liability funds within an account back to personal by decrementing the portion without affecting overall balances, used during liability-to-personal transfer flows.  
  - All transactional RPCs wrote in `migrations/014_add_transaction_rpcs.sql` and updated in `016_update_rpcs_with_balance_snapshots.sql`, ensuring balance snapshots are stored and related tables stay synchronized.
- **Deletion & cleanup**:  
  - Soft delete implemented via `LiabilitiesContext.deleteLiability`, setting `is_deleted`/`deleted_at` and toggling `is_active` false; allocations are retained for audit (comment notes optional pruning).  
  - Additional RPCs (`delete_liability_and_recover_funds`, `delete_liability_entirely`) exist to either transfer remaining liability account funds back to a target account before deletion or purge allocations—these are defined in migrations and can be wired into UI for controlled cleanup.
- **Supporting logic & analytics**:  
  - Context augments `liability_activity_log` with draw records, repayment notes, and other events, aiding detail views.  
  - Helper `getAccountsWithLiabilityPortions` aggregates active accounts containing liability funds, allowing UI (Home, account detail) to highlight mixed-fund accounts.  
  - EMI-specific metadata (e.g., `periodical_payment`, schedule projections) is stored in `liabilities.metadata`; further calculations (interest, payoff estimates) are scaffolded via tables like `liability_calculations` (see `migrations/011_create_liabilities_system.sql`).

### 8.4 Bills (Creation, Tracking, Transactions, Deletion, Logic)
- **Creation flow** (`app/modals/add-bill.tsx` → `utils/bills.createBill`):  
  - Modal collects title, amount, currency, recurrence pattern, reminders, linked goal/account/category, metadata, and inserts into `bills` with status defaults (`upcoming`, `is_active = true`).  
  - Supports multiple bill types (`one_time`, `recurring_fixed`, `recurring_variable`, `goal_linked`) and optional recurrence configuration stored in JSON (`recurrence_pattern`, `recurrence_interval`, `custom_recurrence_config`).  
  - On creation, `createBill` resolves current user via Supabase Auth, writes the bill row, and returns enriched status using `calculateBillStatus`.
- **Tracking & state**:  
  - `useRealtimeData` subscribes to `bills`, providing sorted collections to tabs (`app/(tabs)/bills.tsx`) and the Home dashboard’s reminders.  
  - `utils/bills.fetchBills` supplies filtering by status/type/date/category and computes runtime status labels (overdue/due_today/upcoming) per record.  
  - Additional helpers (`getUpcomingBills`, `getBillsForNotification`, `calculateBillStatistics`) deliver aggregate metrics for notifications and analytics surfaces.
- **Transactions & payment handling**:  
  - Payment modal (`app/modals/mark-bill-paid.tsx`) captures amount, fund bucket (personal/goal/liability), and date, then `utils/bills.markBillAsPaid` orchestrates:  
    1. Calls `spend_from_account_bucket` with unified bucket schema, creating an expense transaction and decreasing the appropriate account/bucket balances.  
    2. Updates the resulting transaction metadata to reference the bill.  
    3. Inserts into `bill_payments`, linking to the transaction and storing payment status/notes.  
    4. Marks the bill `paid`, updates timestamps, and—if recurring—invokes `generate_next_bill_instance` RPC to schedule the next occurrence.  
  - Postpone/skip/cancel flows (`postponeBill`, `skipBill`, `cancelBill`) update status and key dates without touching transactions, enabling manual schedule adjustments.  
  - `updateBillStatuses` RPC can be run periodically to refresh status fields server-side, while notification utilities provide user-facing alerts based on due dates.
- **Deletion & archival**:  
  - Soft delete via `utils/bills.deleteBill` sets `is_deleted` and timestamps; queries in the app filter on `eq('is_deleted', false)` to hide removed bills while retaining history. There is no hard delete path wired in UI.
- **Supporting logic**:  
  - Category linkage is central for analytics; `utils/bills.generateBillNotificationMessage` creates human-readable summaries for notifications, and `calculateBillStatus` underpins UI badges.  
  - Goal-linked bills (`goal_id`) allow coordination with savings goals, while `linked_account_id` pre-selects funding sources in UIs.  
  - `bill_payments` records feed transaction detail screens, enabling audit trails for each payment cycle.

### 8.5 Categories (Creation, Tracking, Transactions, Deletion, Logic)
- **Creation & management** (`app/modals/add-category.tsx` → `utils/categories`):  
  - Utilities ensure category uniqueness per user via `checkCategoryExists`, nudging users to extend activity types on existing categories rather than duplicating names.  
  - `createCategory` uses Supabase Auth to stamp the user ID, stores name/color/icon plus allowed activity types (income/expense/goal/bill/liability/budget).  
  - `updateCategory` allows renaming, recoloring, and adjusting activity types; enforced uniqueness constraints guard against duplicate names.
- **Tracking & usage**:  
  - `useRealtimeData` maintains a live list of categories for global consumption (transaction modals, budgets, bills).  
  - Category detail page (`app/category/[id].tsx`) calls `utils/categories.getCategoryTransactions` and `getCategoryConnectedItems` to display related budgets, bills, goals, and liabilities.  
  - Analytics rely on aggregated stats from `getCategoryStats`, which surfaces totals, transaction counts, and percentage contributions across categories for the analytics tab.
- **Transactions & integrations**:  
  - Transaction modals (pay/receive/transfer) store selected category IDs, ensuring ledger entries join back to categories (see `hooks/useRealtimeData.ts` join on `categories!transactions_category_id_fkey_new`).  
  - Budgets, bills, goals, and liabilities optionally reference category IDs, enabling cross-cutting reporting and filtering. Category statistics can be refreshed via RPC `update_category_statistics`.
- **Deletion**:  
  - `deleteCategory` performs a soft delete (`is_deleted = true`) but first checks whether any transactions use the category, blocking deletion if in use. This preserves integrity while allowing cleanup of unused categories.  
  - Seeded defaults are created via `seedDefaultCategories` RPC during onboarding or as needed.
- **Supporting logic**:  
  - Search/filter helpers (`fetchCategories`, `getCategoriesByActivityType`, `searchCategories`) underpin selectors throughout the app.  
  - Stats functions (`getCategoryStats`) aggregate spent/received/saved amounts and expose category-level performance for dashboards.

### 8.6 Settings (Creation, Tracking, Deletion, Logic)
- **State management** (`contexts/SettingsContext.tsx`):  
  - Provides toggles for notifications, biometrics, dark mode, currency, language, default account, data sharing, and analytics tracking.  
  - Initial load pulls values from AsyncStorage keys (e.g., `@fintrack_notifications`, `@fintrack_currency`), falling back to defaults defined in `DEFAULT_SETTINGS`.  
  - Setter functions update in-memory state and persist to AsyncStorage, ensuring React consumers receive updated values immediately.
- **UI integration**:  
  - `app/settings.tsx` (and components using `useSettings`) consume context to present switches/selectors. Settings fall back to `isLoading` flag until storage fetch completes.  
  - Background mode toggle is handled separately in `BackgroundModeContext`, but the toggle can be exposed alongside settings UI for theme control.
- **Persistence & reset**:  
  - Each setter writes JSON-serialized value to AsyncStorage. `resetSettings` removes all tracked keys and restores defaults, useful during user logout or troubleshooting.  
  - No direct Supabase persistence; settings are device-scoped unless additional syncing logic is added.
- **Interplay with other systems**:  
  - Currency choice feeds into formatting helpers (`formatCurrencyAmount`) across modals and analytics.  
  - Notification toggle can gate local notifications or remote websockets (pending deeper integration).  
  - Default account preference can prepopulate Pay/Receive modals; analytics/biometric toggles provide hooks for future enhancements.

### 8.7 Transactions (Creation, Tracking, Balancing, Logic)
- **Schema & storage**:  
  - `transactions` table (migration `017_create_core_accounts_transactions.sql`) captures account linkage, amount (positive income / negative expense), optional `to_account_id`, `type` (`income`, `expense`, `transfer`), category, description, date, JSON metadata, and balance snapshots (`balance_before`, `balance_after`) added via migration `015_add_transaction_balance_snapshots.sql`.  
  - RLS enforces user-level access; indexes on `user_id`, `account_id`, and date support list views.
- **Creation flows**:  
  - Modals orchestrate RPCs that enforce atomic updates:  
    - `spend_from_account_bucket` (pay, portions of transfers, goal withdrawals) validates bucket availability, updates account/portion tables, and inserts an expense.  
    - `receive_to_account_bucket` (receive income, goal contributions, transfers) increments balances, manages goal portions, and inserts income transactions.  
    - `repay_liability`, `settle_liability_portion`, `draw_liability_funds` generate expense/income entries tied to liabilities.  
    - `create_transfer_transaction` exists for single-row transfers, though the current UI primarily uses paired spend/receive calls producing two entries.  
  - Manual inserts via Supabase client are used in utilities (`utils/budgets.recordInitialPayments` when creating historical liability payments) to mirror historical data.
- **Tracking & presentation**:  
  - `useRealtimeData` fetches transactions with joined category and account details, orders by date/created_at, and exposes filtered lists to screens (`app/(tabs)/transactions.tsx`, account detail pages).  
  - Transactions can be viewed as list or calendar, filtered by type/date; detail screens (`app/transaction/[id].tsx`) surface metadata, linked bill/liability info, and allow edits via `app/modals/edit-transaction.tsx`.
- **Balance reconciliation**:  
  - `useRealtimeData.recalculateAccountBalance` and `recalculateAllBalances` invoke RPCs to recompute balances from transaction history, correcting drift caused by prior inconsistencies. RPCs adjust account balances when discrepancies are detected, and `globalRefresh` reruns these checks after major operations.  
  - Metadata fields store bucket/source context (e.g., `{ bucket_type: 'goal', bucket_id: ... }`, `{ liability_source_id: ... }`), enabling post-hoc analysis even when accounts carry mixed funds.
- **Editing & deletion**:  
  - `app/modals/edit-transaction.tsx` allows modifying amount, category, description, date; updates the row directly via Supabase and triggers refreshes.  
  - Deletion flows are guarded—some features (budgets, liability history) rely on transaction presence, so removal is typically avoided in favor of adjustments or exclusion flags.
- **Integrations**:  
  - Budgets: `budget_transactions` reference transactions to compute spend; exclusion helpers adjust totals without deleting ledger entries.  
  - Bills/Goals/Liabilities: metadata embeds IDs so detail pages can query related payments/contributions.  
  - Analytics: category stats and net income/expense calculations use aggregated transaction data; fallback logic in `analytics.tsx` re-computes totals client-side if RPCs are unavailable.
- **Refactor considerations**:  
  - Dual-transaction transfers complicate reporting; the dedicated `create_transfer_transaction` could standardize single-entry transfers with explicit `from_account_id`/`to_account_id`.  
  - Bucket RPC complexity increases maintenance overhead; abstracting shared validation/updates could simplify introduction of new transaction types.  
  - Balance recalculation reliance indicates the need for idempotent, atomic transaction writes—ensuring every business flow uses the same primitives will be key during refactor.

## 9. Backend Architecture Breakdown

### 9.1 Transactions Backend
- **Schema definition**: `migrations/017_create_core_accounts_transactions.sql` creates the `transactions` table with foreign keys to `accounts`, optional `to_account_id`, and JSONB `metadata`. RLS policies restrict read/write/delete to the owning user (`auth.uid() = user_id`). Balance snapshot columns (`balance_before`, `balance_after`) are added in `migrations/015_add_transaction_balance_snapshots.sql` to capture ledger state at write time.
- **Core RPCs** (see `migrations/016_update_rpcs_with_balance_snapshots.sql`):  
  - `spend_from_account_bucket` and `receive_to_account_bucket` encapsulate all personal/goal/liability fund movements, dynamically adjusting `account_goal_portions` / `account_liability_portions` and writing transactions with bucket metadata.  
  - `repay_liability`, `settle_liability_portion`, and `draw_liability_funds` wrap liability-specific flows while still inserting rows into `transactions`, ensuring every liability event hits the ledger.  
  - `create_transfer_transaction` enables single-entry transfers with both `from_account_id` and `to_account_id` populated, although current UI often composes transfers via the bucket RPC pair.  
  - Balance recalculation utilities (`recalculate_account_balance`, `recalculate_all_account_balances`) recompute balances from transaction history, returning correction reports consumed by the frontend hook.
- **Triggers & helpers**: `set_updated_at` function (defined earlier) is reused to keep `updated_at` fresh on updates; `increment_account_balance` / `decrement_account_balance` RPCs (migration `013_add_balance_rpcs.sql`) allow controlled adjustments without direct SQL in clients.

### 9.2 Accounts Backend
- **Schema**: `accounts` table (migration `017_create_core_accounts_transactions.sql`) stores base account metadata including `type`, `include_in_totals`, and `balance`. RLS ensures user isolation.  
- **Bucket tracking**:  
  - `account_liability_portions` (migration `012_create_account_liability_portions.sql`) links accounts to liabilities with amounts and notes. Triggers reuse the global `update_updated_at_column` to maintain timestamps; RLS policies map permissions through owning accounts.  
  - `account_goal_portions` is referenced throughout RPCs; while the migration isn’t in repo, RPC definitions assume the table mirrors liability portions (account_id, goal_id, amount).  
- **Balance maintenance**: RPCs always operate inside database-level transactions—updating balances before inserting transactions to guarantee snapshots reflect final values. Reconciliation RPCs leverage transaction history to correct drift.

### 9.3 Goals Backend
- **Schema**: `goals` table (migration included earlier in repo history) captures target/current amounts, metadata, status flags, and timing fields. `goal_contributions` records each contribution with transaction linkage.  
- **RPC interplay**: Goals piggyback on `spend_from_account_bucket` / `receive_to_account_bucket`, which manipulate `account_goal_portions` and update `goals.current_amount`. Additional RPCs aren’t required; plain updates adjust goal progress.  
- **Helpers**: Utility functions in `utils/goals.ts` rely on Supabase inserts/updates, plus direct selects to ensure source account balances and category lookups are valid.

### 9.4 Budgets Backend
- **Schema stack** (`migrations/001`–`007`):  
  - `budgets` core table with recurrence metadata, RLS policies, computed columns (`remaining_amount` as stored generated column).  
  - `budget_accounts` (migration `002`) for account associations, `budget_transactions` (migration `003`) linking transactions with inclusion flags, `budget_events` (migration `004`) for audit logs, indexes (`007`) supporting lookups.  
- **Database logic**: Update trigger (`update_budgets_updated_at`) keeps `updated_at` fresh; budget progress is recalculated client-side via `updateBudgetProgress` but writes changes back to `budgets`.  
- **RPCs & functions**: While budgets rely heavily on client-side logic, RPC `update_budget_statistics` could be added; currently `checkBudgetAlerts` and `calculateDailyPace` are JS-only computations. Renewals and rollovers are implemented by inserting new rows and copying associations.

### 9.5 Liabilities Backend
- **Schema** (`migrations/011_create_liabilities_system.sql`):  
  - `liabilities` master table with rich metadata (interest, schedules, status), supported by `liability_payments`, `liability_activity_log`, `liability_schedule`, `liability_adjustments`, and `liability_calculations`.  
  - RLS policies restrict access per user; indexes cover `status`, `next_due_date`, and relationships.  
- **RPCs** (migrations `014` and `016`): `draw_liability_funds`, `pay_from_liability_funds`, `repay_liability`, `settle_liability_portion`, `delete_liability_and_recover_funds`, `delete_liability_entirely`, `update_liability_principal`. Each ensures transactional integrity when moving money between liability funds and regular accounts, updating both `accounts` and `account_liability_portions`.  
- **Triggers**: Standard `update_updated_at_column` keeps `liabilities.updated_at` current; any complex schedule recalculations can leverage `liability_calculations` table for precomputed metrics.

### 9.6 Bills Backend
- **Schema** (`migrations/010_create_bills_system.sql`): `bills` table with recurrence metadata, `bill_payments` for history, plus indexes for due date/status queries. RLS restricts access per user; `update_bills_updated_at` trigger maintains timestamps.  
- **Stored procedures**:  
  - `generate_next_bill_instance` creates future bill occurrences when recurring items are paid.  
  - `update_bill_statuses` recalculates status values (overdue/due today/upcoming) in bulk.  
  - Payment handling is primarily via client-side `markBillAsPaid`, which chains `spend_from_account_bucket` and direct updates/inserts.  
- **Notifications**: While computed client-side, the database provides the necessary data through `bills` table fields (due dates, reminder days).

### 9.7 Categories Backend
- **Schema** (`migrations/009_create_categories_system.sql`): `categories` table with JSONB `activity_types`, counters (`total_spent`, etc.), and RLS.  
- **RPCs**:  
  - `seed_default_categories` populates starter categories when onboarding a user.  
  - `update_category_statistics` recalculates aggregate fields, allowing scheduled maintenance jobs.  
  - `get_category_stats` returns analytics data consumed by the frontend.  
- **Constraints**: Unique constraints and soft delete fields (`is_deleted`) ensure data integrity without physically removing rows.

### 9.8 Settings & Profiles Backend
- **User profiles**: `migrations/018_create_users_profile.sql` creates `users_profile` table storing full name, base currency, and metadata. Sign-up flow manually inserts a profile row after auth user creation.  
- **Settings**: Local-only via AsyncStorage; no dedicated Supabase settings table yet. If future syncing is required, a new table could mirror local settings.
- **Auth**: Native Supabase Auth handles session storage; `AuthContext` simply calls Supabase client methods (`signInWithPassword`, `signUp`, `signOut`, `resetPasswordForEmail`). Backend ensures JWT/refresh tokens.

### 9.9 Cross-Cutting Infrastructure
- **Migration orchestration**: `migrations/apply_all_migrations.sql` and `apply_liability_migrations.sql` provide scripts to execute full or scoped migration sets.  
- **Testing scaffolds**: `migrations/test_database_setup.sql` seeds sample data for isolated checks.  
- **Supabase client**: `lib/supabase.ts` centralizes connection configuration; all backend interactions funnel through it, keeping env keys consistent.  
- **Documentation**: Markdown summaries (`TRANSACTION_SYSTEM_SUMMARY.md`, `ACCOUNT_SYSTEM_SUMMARY.md`) capture historical context and should be cross-referenced when altering backend logic.

### 9.10 Transactional Data Flow Walkthroughs
The migrations in `/migrations/016_update_rpcs_with_balance_snapshots.sql` define the definitive business logic for every money movement. Key routines:

- **`spend_from_account_bucket`**  
  1. Validates `p_bucket` JSON (type ∈ {personal, liability, goal}, optionally `id`).  
  2. Retrieves current account balance (`v_balance_before`).  
  3. Aggregates existing liability and goal allocations to calculate personal availability.  
  4. For liability/goal buckets, decrements the respective portion row (`account_liability_portions`, `account_goal_portions`) and prunes empty rows.  
  5. Updates `accounts.balance = balance - p_amount`, then re-queries to obtain `v_balance_after`.  
  6. Inserts a `transactions` row with negative `amount`, bucket metadata, and captured snapshots.

- **`receive_to_account_bucket`**  
  1. Loads account currency and `balance_before`.  
  2. Optionally looks up/creates category; absence allowed (NULL).  
  3. Updates `accounts.balance = balance + p_amount`.  
  4. Reads `balance_after`.  
  5. When `p_bucket_type = 'goal'`, performs an UPSERT into `account_goal_portions` and adjusts `goals.current_amount`.  
  6. Inserts an income transaction with metadata showing bucket type and optional notes.

- **`repay_liability`**  
  1. Verifies source account balance sufficiency.  
  2. Computes `balance_after` in-memory and updates the account row directly (ensuring exact subtraction).  
  3. Verifies the written balance matches expectation (`v_verified_balance`).  
  4. Decrements `liabilities.current_balance` (bounded at zero) and records event in `liability_activity_log`.  
  5. Inserts an expense transaction referencing the liability in metadata.

- **`settle_liability_portion`**  
  Similar to `repay_liability`, but first ensures the selected liability bucket has enough funds (`account_liability_portions.amount`). Updates the portion table (deleting empty rows), reduces liability balance, and inserts a transaction flagged with `spent_from_liability_portion`.

- **`draw_liability_funds`** (defined in migration `014_add_transaction_rpcs.sql` and updated later): loops through provided account distributions, increasing each account balance, upserting portions, creating income transactions, and raising `liabilities.disbursed_amount`. An activity log entry summarizes the draw.

- **Transfer helpers**  
  - `create_transfer_transaction` writes a single `transactions` row with `type = 'transfer'`, `from_account_id`, `to_account_id`, accompanied by direct balance updates on both accounts.  
  - Current UI uses paired `spend_from_account_bucket` + `receive_to_account_bucket`, effectively generating two entries (expense + income) while relying on metadata to correlate the transfer.

- **Balance reconciliation**  
  - `recalculate_account_balance` aggregates all `transactions.amount` for a given account (including metadata adjustments), compares against stored `accounts.balance`, updates discrepancies, and returns diagnostic info.  
  - `recalculate_all_account_balances` loops over all user accounts, reporting corrections as an array; frontend logs these corrections to aid troubleshooting.

These routines are all marked `SECURITY DEFINER`, executing with elevated privileges while still respecting explicit WHERE clauses on `user_id` to maintain tenant isolation. Every RPC writes consistent metadata so downstream systems (budgets, analytics, auditing) can reconstruct context without relying on client assumptions.
