# Complete Budget System - All Types

## Overview
The FinTrack budget system supports multiple budget types, each designed for different financial tracking needs. This document outlines all budget types and their functionality.

## Budget Types

### 1. Monthly Budget
**Type**: `monthly`  
**Icon**: Calendar outline  
**Color**: Blue (#3B82F6)  
**Description**: Track spending for a specific month

#### Features
- ✅ Month-based tracking
- ✅ Automatic renewal options
- ✅ Category-based or general spending
- ✅ Account linking
- ✅ Alert thresholds

#### Use Cases
- Monthly grocery budgets
- Monthly entertainment spending
- Monthly utilities tracking
- General monthly expenses

#### Configuration
- Start/end dates for month
- Monthly amount limit
- Alert thresholds (50%, 80%, 100%)
- Daily pace tracking
- Rollover options

---

### 2. Category Budget
**Type**: `category`  
**Icon**: Price tag outline  
**Color**: Purple (#8B5CF6)  
**Description**: Track spending for specific categories

#### Features
- ✅ Category-specific tracking
- ✅ Multiple categories supported
- ✅ Transaction categorization
- ✅ Category-based alerts
- ✅ Account filtering

#### Use Cases
- Food & Dining
- Shopping
- Transportation
- Entertainment
- Subscriptions

#### Configuration
- Category selection
- Budget amount per category
- Time period
- Account selection
- Alert configuration

---

### 3. Goal-Based Budget ⭐ **FULLY IMPLEMENTED**
**Type**: `goal_based`  
**Icon**: Flag outline  
**Color**: Orange (#F59E0B)  
**Description**: Link budget to your savings goals

#### Features
- ✅ Goal linking and selection
- ✅ Goal progress display
- ✅ Goal progress synchronization
- ✅ Goal subtypes (A, B, C)
- ✅ "View Goal" navigation
- ✅ Automatic goal updates

#### Use Cases
- Emergency fund savings
- Vacation savings
- Down payment savings
- Car purchase savings
- Education fund savings

#### Subtypes
- **Type A**: Save X% of deposits until date
- **Type B**: Save fixed amount monthly until date
- **Type C**: Reach target by date (system calculates monthly)

#### Configuration
- Goal selection from active goals
- Goal subtype selection
- Budget amount
- Time period
- Account selection
- Progress tracking

#### Display
- Goal info in budget card
- Goal info card in budget detail
- Goal progress bar
- "View Goal" button
- Automatic sync with goal progress

---

### 4. Smart Budget
**Type**: `smart`  
**Icon**: Bulb outline  
**Color**: Green (#10B981)  
**Description**: AI-powered spending recommendations

#### Status: 🚧 Coming Soon

#### Planned Features
- AI-driven budget suggestions
- Learning from spending patterns
- Automatic adjustments
- Predictive analytics
- Personalized recommendations

---

## Budget Features (All Types)

### Core Features
1. **Account Linking**
   - Multiple accounts per budget
   - Account roles (owner, read-only)
   - Sync timestamps
   - Account filtering

2. **Transaction Tracking**
   - Automatic transaction inclusion
   - Transaction exclusion
   - Manual transaction addition
   - Transaction categorization

3. **Progress Tracking**
   - Spent amount calculation
   - Remaining amount calculation
   - Percentage progress
   - Daily pace tracking

4. **Alerts & Notifications**
   - Threshold alerts (50%, 80%, 100%)
   - Daily pace warnings
   - Over-budget notifications
   - In-app notifications

5. **Period Management**
   - Start/end dates
   - Automatic renewal
   - Rollover options
   - Period closing

6. **Visual Indicators**
   - Progress bars
   - Status badges (On Track, Warning, Over Budget)
   - Color-coded indicators
   - Type-specific icons

### Common Operations

#### Creating a Budget
1. Select budget type
2. Enter budget details
3. Configure settings (varies by type)
4. Select accounts
5. Set alert thresholds
6. Create budget

#### Viewing a Budget
- Budget list view with cards
- Budget detail view with tabs
- Overview tab: Progress, stats, alerts
- Transactions tab: Included/excluded transactions
- Accounts tab: Linked accounts
- Settings tab: Configuration and actions

#### Updating Budget Progress
- Automatic calculation from transactions
- Manual adjustment options
- Transaction exclusion/inclusion
- Real-time updates

#### Ending Budget Period
- Options for remaining amount
- Rollover to next period
- Fresh start with zero
- Archive completed periods

## Data Structure

### Budget Model
```typescript
interface Budget {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  created_by: string;
  budget_type: 'monthly' | 'category' | 'goal_based' | 'smart';
  start_date: string;
  end_date: string;
  recurrence_pattern?: 'monthly' | 'weekly' | 'yearly' | 'custom';
  rollover_enabled: boolean;
  category_id?: string;
  goal_id?: string;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at?: string;
  spent_amount: number;
  remaining_amount: number;
  metadata: {
    goal_subtype?: 'A' | 'B' | 'C';
    ui_settings?: any;
    template?: any;
    [key: string]: any;
  };
  alert_settings: {
    thresholds?: number[];
    channels?: string[];
    snooze_until?: string;
    daily_pace_enabled?: boolean;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}
```

### Related Tables
- `budget_accounts`: Links budgets to accounts
- `budget_transactions`: Links transactions to budgets
- `budget_events`: Logs budget-related events

## UI Components

### BudgetCard
- Displays budget information in list view
- Type-specific icon and color
- Progress bar and status
- Spent/remaining amounts
- Period dates
- Goal info (for goal-based budgets)

### BudgetDetail Screen
- Overview tab with progress and stats
- Transactions tab with filtering
- Accounts tab with account details
- Settings tab with configuration
- Goal info card (for goal-based budgets)
- Action buttons for period management

## Usage Examples

### Example 1: Monthly Food Budget
```typescript
const monthlyFoodBudget = {
  budget_type: 'monthly',
  name: 'Monthly Food Budget',
  amount: 500,
  start_date: '2024-01-01',
  end_date: '2024-01-31',
  account_ids: ['account_food_1'],
  alert_thresholds: [50, 80, 100]
};
```

### Example 2: Category Budget for Shopping
```typescript
const shoppingBudget = {
  budget_type: 'category',
  name: 'Shopping Budget',
  amount: 300,
  category_id: 'cat_shopping',
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  account_ids: ['account_main', 'account_credit']
};
```

### Example 3: Goal-Based Emergency Fund
```typescript
const emergencyFundBudget = {
  budget_type: 'goal_based',
  name: 'Emergency Fund Savings',
  amount: 1000,
  goal_id: 'goal_emergency_fund',
  metadata: {
    goal_subtype: 'B'
  },
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  account_ids: ['account_savings']
};
```

## Status Summary

| Budget Type | Status | Features |
|------------|--------|----------|
| Monthly | ✅ Complete | All features working |
| Category | ✅ Complete | All features working |
| Goal-Based | ✅ Complete | All features + goal sync working |
| Smart | 🚧 Coming Soon | Planned for future |

## Conclusion

The FinTrack budget system provides comprehensive financial tracking with multiple budget types. The goal-based budget feature is fully implemented with automatic goal progress synchronization, making it easy for users to track their savings goals within their budget framework.






