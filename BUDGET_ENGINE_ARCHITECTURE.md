# Unified Budget Engine Architecture

## 🎯 Core Philosophy: Intention Tracking

A great budgeting system isn't about *limits*, it's about *intention tracking* — each budget type needs its own mechanism, logic chain, and emotional use-case.

## 🏗️ Architecture Overview

### Unified Budget Engine

Instead of 4-5 different systems, we have **one flexible budget engine** that handles all types through:

1. **Budget Mode** (`budget_mode`): Determines what we're tracking
2. **Budget Type** (`budget_type`): Determines how we match transactions
3. **Budget Subtype** (`budget_subtype`): Determines specific behavior (for goal-based)

### Budget Modes

```typescript
type BudgetMode = 'spend_cap' | 'save_target';

// Spend Cap: Track expenses (traditional budgeting)
// Save Target: Track contributions/savings (goal-oriented)
```

### Budget Types

```typescript
type BudgetType = 'monthly' | 'category' | 'goal_based' | 'smart' | 'custom';

// Monthly: Time-based spending control
// Category: Category-specific spending control
// Goal-Based: Goal-linked with 3 subtypes (A, B, C)
// Smart: AI-driven (future)
// Custom: Project/event-based
```

### Goal-Based Budget Subtypes

```typescript
type GoalBudgetSubtype = 'A' | 'B' | 'C';

// A: Saving Target Mode (auto-calculated monthly targets from goals)
// B: Under Budget Saving Mode (underspend → save to goal)
// C: Category-Linked Goal Mode (cut category spending → save to goal)
```

## 🔄 Unified Transaction Matching Logic

### Core Matching Function

```typescript
function shouldIncludeTransaction(
  transaction: Transaction,
  budget: Budget
): boolean {
  // 1. Basic checks
  if (transaction.date < budget.start_date) return false;
  if (budget.end_date && transaction.date > budget.end_date) return false;
  if (!isAccountLinked(transaction.account_id, budget.id)) return false;
  
  // 2. Mode-specific checks
  if (budget.budget_mode === 'save_target') {
    // Save Target: Only track contributions (income/transfers to goal accounts)
    return transaction.type === 'income' || 
           (transaction.type === 'transfer' && isGoalAccount(transaction.to_account_id));
  } else {
    // Spend Cap: Only track expenses
    if (transaction.type !== 'expense') return false;
  }
  
  // 3. Type-specific checks
  switch (budget.budget_type) {
    case 'monthly':
      return true; // All expenses from linked accounts
      
    case 'category':
      return transaction.category_id === budget.category_id;
      
    case 'goal_based':
      return handleGoalBasedMatching(transaction, budget);
      
    case 'custom':
      return true; // User-defined period
      
    default:
      return false;
  }
}
```

### Goal-Based Matching Logic

```typescript
function handleGoalBasedMatching(
  transaction: Transaction,
  budget: Budget
): boolean {
  const subtype = budget.metadata?.goal_subtype;
  
  switch (subtype) {
    case 'A': // Saving Target Mode
      // Track contributions (income or transfers to goal account)
      return transaction.type === 'income' || 
             (transaction.type === 'transfer' && 
              transaction.to_account_id === getGoalAccount(budget.goal_id));
      
    case 'B': // Under Budget Saving Mode
      // Track expenses (like monthly budget)
      return transaction.type === 'expense';
      
    case 'C': // Category-Linked Goal Mode
      // Track category expenses
      return transaction.type === 'expense' && 
             transaction.category_id === budget.category_id;
      
    default:
      return transaction.type === 'expense';
  }
}
```

## 💰 Unified Calculation Logic

### Budget Progress Calculation

```typescript
function calculateBudgetProgress(budget: Budget): BudgetProgress {
  const transactions = getBudgetTransactions(budget.id);
  
  if (budget.budget_mode === 'save_target') {
    // Save Target: Track contributions (positive amounts)
    const contributed = transactions
      .filter(t => !t.is_excluded)
      .reduce((sum, t) => sum + Math.abs(t.amount_counted), 0);
    
    return {
      spent_amount: contributed, // Actually "contributed amount"
      remaining_amount: Math.max(0, budget.amount - contributed),
      progress_percentage: (contributed / budget.amount) * 100,
      status: contributed >= budget.amount ? 'achieved' : 'in_progress'
    };
  } else {
    // Spend Cap: Track expenses (negative amounts)
    const spent = transactions
      .filter(t => !t.is_excluded)
      .reduce((sum, t) => sum + Math.abs(t.amount_counted), 0);
    
    return {
      spent_amount: spent,
      remaining_amount: Math.max(0, budget.amount - spent),
      progress_percentage: (spent / budget.amount) * 100,
      status: spent > budget.amount ? 'over_budget' : 
              spent === budget.amount ? 'at_limit' : 'under_budget'
    };
  }
}
```

## 🎯 Goal-Based Budget Subtypes

### Subtype A: Saving Target Mode

**Purpose**: Auto-calculate monthly targets from goal and track contributions.

**Mechanism**:
1. User links goal with `target_amount` and `target_date`
2. System calculates: `monthly_target = remaining_goal_amount / remaining_months`
3. Budget `amount = monthly_target`
4. Track **contributions** (income/transfers to goal account), not expenses
5. Sync goal progress as contributions are made

**Calculation**:
```typescript
function calculateMonthlyTarget(goal: Goal): number {
  const now = new Date();
  const targetDate = new Date(goal.target_date);
  const remainingMonths = Math.max(1, 
    (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  const remainingAmount = goal.target_amount - goal.current_amount;
  return remainingAmount / remainingMonths;
}
```

**Transaction Matching**:
- Include: Income transactions, transfers to goal account
- Exclude: Expenses, transfers from goal account

**Goal Sync**:
- When contribution is made → update `goal.current_amount`
- When budget period ends → check if monthly target met

### Subtype B: Under Budget Saving Mode

**Purpose**: Track spending, transfer leftover to goal at period end.

**Mechanism**:
1. User sets spending budget (e.g., ₹10,000/month)
2. System tracks expenses like a monthly budget
3. At period end, calculate: `leftover = amount - spent_amount`
4. If `leftover > 0`: Transfer to goal as contribution

**Calculation**:
```typescript
function handlePeriodEnd(budget: Budget): void {
  if (budget.budget_mode !== 'spend_cap') return;
  if (budget.metadata?.goal_subtype !== 'B') return;
  
  const leftover = budget.amount - budget.spent_amount;
  
  if (leftover > 0 && budget.goal_id) {
    // Transfer leftover to goal
    addContributionToGoal({
      goal_id: budget.goal_id,
      amount: leftover,
      source_account_id: getBudgetAccount(budget.id),
      destination_account_id: getGoalAccount(budget.goal_id),
      description: `Saved from ${budget.name} budget`
    });
  }
}
```

**Transaction Matching**:
- Include: All expenses from linked accounts
- Exclude: Income, transfers

**Goal Sync**:
- During period: No sync (just track spending)
- At period end: Transfer leftover to goal

### Subtype C: Category-Linked Goal Mode

**Purpose**: Track category spending reduction and save difference to goal.

**Mechanism**:
1. User sets category spending budget (e.g., ₹5,000/month for dining)
2. System tracks category expenses
3. Calculate: `saved = baseline_avg - current_spent`
4. If `saved > 0`: Add to goal as contribution

**Calculation**:
```typescript
function calculateCategorySavings(budget: Budget): number {
  const baselineAvg = budget.metadata?.baseline_category_avg || 0;
  const currentSpent = budget.spent_amount;
  const saved = Math.max(0, baselineAvg - currentSpent);
  return saved;
}

function syncCategorySavingsToGoal(budget: Budget): void {
  if (budget.metadata?.goal_subtype !== 'C') return;
  
  const saved = calculateCategorySavings(budget);
  
  if (saved > 0 && budget.goal_id) {
    // Add savings to goal
    addContributionToGoal({
      goal_id: budget.goal_id,
      amount: saved,
      source_account_id: getBudgetAccount(budget.id),
      destination_account_id: getGoalAccount(budget.goal_id),
      description: `Saved from ${budget.name} by reducing ${budget.category.name} spending`
    });
  }
}
```

**Transaction Matching**:
- Include: Category expenses from linked accounts
- Exclude: Other categories, income, transfers

**Goal Sync**:
- During period: Track category spending
- At period end: Calculate savings and add to goal

## 🔧 Database Schema Updates

### Budget Table Additions

```sql
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS budget_mode TEXT 
  CHECK (budget_mode IN ('spend_cap', 'save_target')) 
  DEFAULT 'spend_cap';

-- Update metadata to include:
-- - goal_subtype: 'A' | 'B' | 'C'
-- - baseline_category_avg: number (for subtype C)
-- - auto_calculate_amount: boolean (for subtype A)
```

### Budget Transactions Table

```sql
-- Already supports:
-- - amount_counted: Can be positive (contributions) or negative (expenses)
-- - is_excluded: For manual exclusions
-- - transaction_id: Links to transaction
```

## 🎨 UI Updates

### Budget Creation Flow

1. **Step 1: Choose Budget Type**
   - Monthly, Category, Goal-Based, Custom

2. **Step 2: Choose Budget Mode** (NEW)
   - **Spend Cap**: "Limit your spending"
   - **Save Target**: "Save toward a goal"

3. **Step 3: Configure Budget**
   - If Save Target + Goal-Based:
     - Show goal selection
     - Show subtype selection (A, B, C)
     - Auto-calculate amount for subtype A
   - If Spend Cap:
     - Manual amount entry
     - Category selection (if category budget)

4. **Step 4: Set Period & Accounts**
   - Start/end dates
   - Account selection
   - Recurrence settings

5. **Step 5: Configure Alerts**
   - Progress alerts
   - Pace alerts
   - End-of-period alerts

### Budget Display

```typescript
function getBudgetDisplayData(budget: Budget): BudgetDisplay {
  if (budget.budget_mode === 'save_target') {
    return {
      label: 'Contributed',
      amount: budget.spent_amount, // Actually contributed
      target: budget.amount,
      remaining: budget.amount - budget.spent_amount,
      status: budget.spent_amount >= budget.amount ? 'achieved' : 'in_progress',
      message: `₹${budget.spent_amount} saved toward goal`
    };
  } else {
    return {
      label: 'Spent',
      amount: budget.spent_amount,
      target: budget.amount,
      remaining: budget.amount - budget.spent_amount,
      status: budget.spent_amount > budget.amount ? 'over_budget' : 'under_budget',
      message: `₹${budget.spent_amount} spent of ₹${budget.amount}`
    };
  }
}
```

## 🔄 Transaction Flow

### When Transaction is Created

1. **Trigger Fires**: `create_budget_transactions_for_transaction()`
2. **Match Check**: `shouldIncludeTransaction(transaction, budget)`
3. **Insert**: Create `budget_transactions` record
4. **Update Budget**: Call `update_budget_spent_amount(budget.id)`
5. **Sync Goal** (if goal-based):
   - Subtype A: Update goal progress immediately
   - Subtype B: No sync (wait for period end)
   - Subtype C: Track category spending (sync at period end)

### When Budget Period Ends

1. **Check Budget Status**: `isPeriodEnded(budget)`
2. **Calculate Progress**: `calculateBudgetProgress(budget)`
3. **Handle Subtype-Specific Logic**:
   - Subtype A: Check if monthly target met, update goal
   - Subtype B: Transfer leftover to goal
   - Subtype C: Calculate savings and add to goal
4. **Renew Budget** (if recurring): `renewBudget(budget.id)`

## 📊 Budget Progress Display

### Spend Cap Mode

```
Budget: ₹20,000
Spent: ₹15,000 (75%)
Remaining: ₹5,000
Status: On Track
```

### Save Target Mode

```
Target: ₹10,000
Contributed: ₹7,500 (75%)
Remaining: ₹2,500
Status: On Track
```

### Goal-Based Budget (Subtype A)

```
Monthly Target: ₹10,000
Contributed: ₹7,500 (75%)
Remaining: ₹2,500
Goal Progress: ₹52,500 / ₹100,000 (52.5%)
Status: On Track
```

### Goal-Based Budget (Subtype B)

```
Spending Budget: ₹10,000
Spent: ₹7,500 (75%)
Leftover: ₹2,500
→ Will transfer ₹2,500 to goal at period end
```

### Goal-Based Budget (Subtype C)

```
Dining Budget: ₹5,000
Spent: ₹3,000 (60%)
Baseline Avg: ₹6,000
Saved: ₹3,000
→ Will add ₹3,000 to goal at period end
```

## 🎯 Implementation Plan

### Phase 1: Core Engine
1. Add `budget_mode` field to database
2. Update transaction matching logic
3. Update budget calculation logic
4. Update trigger function

### Phase 2: Goal-Based Subtypes
1. Implement Subtype A (Saving Target Mode)
2. Implement Subtype B (Under Budget Saving Mode)
3. Implement Subtype C (Category-Linked Goal Mode)
4. Implement period-end logic

### Phase 3: UI Updates
1. Update budget creation flow
2. Add mode selection (Spend Cap vs Save Target)
3. Update budget display for different modes
4. Add subtype-specific UI elements

### Phase 4: Testing & Refinement
1. Test all budget types and modes
2. Test goal synchronization
3. Test period-end logic
4. Refine UI/UX based on feedback

## 🔍 Key Differences

### Spend Cap vs Save Target

| Aspect | Spend Cap | Save Target |
|--------|-----------|-------------|
| **What we track** | Expenses | Contributions |
| **Transaction type** | `expense` | `income` or `transfer` to goal |
| **Progress meaning** | % spent | % contributed |
| **Goal** | Stay under limit | Reach target |
| **Emotional driver** | Restraint | Achievement |

### Goal-Based Subtypes

| Subtype | Mode | What We Track | When Goal Updates | Use Case |
|---------|------|---------------|-------------------|----------|
| **A** | Save Target | Contributions | Immediately | Monthly savings target |
| **B** | Spend Cap | Expenses | Period end (leftover) | Underspend → save |
| **C** | Spend Cap | Category expenses | Period end (savings) | Cut spending → save |

## 🚀 Next Steps

1. **Update Database Schema**: Add `budget_mode` field
2. **Update Trigger Function**: Handle different modes and subtypes
3. **Update Budget Calculation**: Support contributions vs expenses
4. **Update UI**: Add mode selection and subtype-specific flows
5. **Implement Period-End Logic**: Handle subtype B and C goal transfers
6. **Test End-to-End**: Verify all budget types work correctly

---

This unified budget engine provides a flexible, intention-tracking system that supports all budget types while maintaining clear, distinct behaviors for each use case.

