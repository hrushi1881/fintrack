export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: 'bank' | 'card' | 'wallet' | 'cash' | 'goals_savings' | 'liability';
  balance: number;
  currency: string;
  color: string;
  icon: string;
  description?: string;
  include_in_totals?: boolean;
  is_active: boolean;
  organization_id?: string | null;
  credit_limit?: number | null;
  linked_liability_id?: string; // For liability accounts
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  user_id: string;
  name: string;
  type?: 'bank' | 'wallet' | 'investment' | 'cash' | 'custom';
  country?: string | null;
  currency: string;
  logo_url?: string;
  theme_color?: string;
  description?: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id?: string;
  amount: number;
  currency: string;
  type: 'income' | 'expense' | 'transfer';
  description?: string;
  date: string;
  created_at: string;
  updated_at: string;
  balance_before?: number;
  balance_after?: number;
  metadata?: any;
}

export type FundType =
  | 'personal'
  | 'goal'
  | 'borrowed'
  | 'liability'
  | 'reserved'
  | 'sinking';

export interface AccountFund {
  id: string;
  account_id: string;
  fund_type: FundType;
  /**
   * Legacy field kept for backwards compatibility while migrating.
   * Prefer using `fund_type`.
   */
  type?: string;
  name: string;
  display_name?: string;
  balance: number;
  currency?: string | null;
  spendable: boolean;
  reference_id?: string | null;
  linked_goal_id?: string | null;
  linked_liability_id?: string | null;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date?: string;
  category: string;
  color: string;
  icon: string;
  is_achieved: boolean;
  is_archived: boolean;
  is_deleted: boolean;
  completed_at?: string;
  achievement_date?: string;
  total_contributions: number;
  avg_monthly_saving: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// RECURRENCE ENGINE
// ============================================================================

// Export recurrence engine types
export type {
  RecurrenceDefinition,
  RecurrenceFrequency,
  RecurrenceUnit,
  Occurrence,
  OccurrenceStatus,
  ScheduleOptions,
} from './recurrence';

// ============================================================================
// RECURRING TRANSACTIONS SYSTEM
// ============================================================================

/**
 * Recurring Transaction Nature Types
 * Defines the 4 main types of recurring financial activities
 */
export type RecurringTransactionNature = 
  | 'subscription'    // Fixed amount, regular interval (Netflix, Spotify, Gym)
  | 'bill'            // Variable or fixed, regular interval (Utilities, Rent, Internet)
  | 'payment'         // Fixed amount, regular interval, often liability-linked (EMIs, Insurance)
  | 'income';         // Money coming in (Salary, Freelance retainer, Rent received)

/**
 * Frequency options for recurring transactions
 */
export type RecurringFrequency = 
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'halfyearly'
  | 'yearly'
  | 'custom';

/**
 * Amount type for recurring transactions
 */
export type RecurringAmountType = 
  | 'fixed'      // Same amount every time (Netflix ₹649)
  | 'variable';  // Changes each time (Electricity bill varies)

/**
 * End type for recurring schedule
 */
export type RecurringEndType = 
  | 'never'        // Continues indefinitely
  | 'on_date'      // Ends on specific date
  | 'after_count'; // Ends after N occurrences

/**
 * Status of a recurring transaction template
 */
export type RecurringTransactionStatus = 
  | 'active'     // Currently generating occurrences
  | 'paused'     // Temporarily stopped
  | 'completed'  // Finished (reached end date/count)
  | 'cancelled'; // User cancelled

/**
 * Status of a scheduled transaction (individual occurrence)
 */
export type ScheduledTransactionStatus = 
  | 'scheduled'  // Created, waiting for due date
  | 'confirmed'  // User confirmed, transaction created
  | 'skipped'    // User skipped this occurrence
  | 'overdue'    // Past due date, not confirmed
  | 'cancelled'; // Cancelled by user or system

/**
 * Custom recurrence pattern configuration
 */
export interface CustomRecurrencePattern {
  type: 'specific_days' | 'specific_dates';
  days?: number[];           // [1, 15, 30] for specific days of month
  weekdays?: string[];       // ['mon', 'wed', 'fri'] for specific days of week
}

/**
 * Recurring Transaction (Master Template)
 * Defines the pattern for repeated transactions
 */
export interface RecurringTransaction {
  // Identity
  id: string;
  user_id: string;
  organization_id?: string | null;
  
  // Basic Info
  name: string;
  description?: string | null;
  category_id?: string | null;
  type: 'income' | 'expense';
  nature?: RecurringTransactionNature; // Added for UI categorization
  
  // Amount
  amount?: number | null;
  amount_type: RecurringAmountType;
  estimated_amount?: number | null;
  currency: string;
  
  // Account & Fund
  account_id?: string | null;
  fund_type: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string | null; // goal_id or liability_id
  
  // Recurrence Pattern
  frequency: RecurringFrequency;
  interval: number;
  start_date: string;
  end_type: RecurringEndType;
  end_date?: string | null;
  occurrence_count?: number | null;
  
  // Custom Recurrence
  custom_pattern?: CustomRecurrencePattern | null;
  
  // Status
  status: RecurringTransactionStatus;
  paused_until?: string | null;
  
  // Auto-Creation Settings
  auto_create: boolean;
  auto_create_days_before: number;
  remind_before: boolean;
  reminder_days: number[];
  
  // Subscription-Specific
  is_subscription: boolean;
  subscription_provider?: string | null;
  subscription_plan?: string | null;
  subscription_start_date?: string | null;
  
  // Linking
  linked_liability_id?: string | null;
  linked_goal_id?: string | null;
  linked_budget_id?: string | null;
  
  // Statistics
  total_occurrences: number;
  completed_occurrences: number;
  skipped_occurrences: number;
  total_paid: number;
  average_amount: number;
  last_transaction_date?: string | null;
  next_transaction_date?: string | null;
  
  // Metadata
  tags?: string[] | null;
  notes?: string | null;
  color: string;
  icon: string;
  
  created_at: string;
  updated_at: string;
}

/**
 * Scheduled Transaction (Individual Occurrence)
 * Represents a single instance of a recurring transaction
 */
export interface ScheduledTransaction {
  // Identity
  id: string;
  recurring_transaction_id: string;
  user_id: string;
  
  // Transaction Details
  name: string;
  category_id?: string | null;
  amount: number;
  type: 'income' | 'expense';
  account_id?: string | null;
  fund_type: string;
  
  // Scheduling
  scheduled_date: string;
  due_date: string;
  created_date: string;
  
  // Status
  status: ScheduledTransactionStatus;
  status_changed_at?: string | null;
  
  // Confirmation
  confirmed: boolean;
  confirmed_date?: string | null;
  actual_amount?: number | null;
  actual_date?: string | null;
  
  // Transaction Link
  transaction_id?: string | null;
  
  // Skip Reason
  skip_reason?: string | null;
  
  // Metadata
  notes?: string | null;
  reminder_sent: boolean;
  reminder_sent_at?: string | null;
  notification_ids?: string[] | null;
}

/**
 * Subscription Analytics
 * Aggregated statistics for subscription tracking
 */
export interface SubscriptionAnalytics {
  id: string;
  user_id: string;
  
  // Totals
  total_subscriptions: number;
  active_subscriptions: number;
  paused_subscriptions: number;
  
  // Cost Analysis
  total_monthly_cost: number;
  total_annual_cost: number;
  average_subscription_cost: number;
  
  // By Category
  by_category: Array<{
    category: string;
    count: number;
    monthly_cost: number;
    percentage: number;
  }>;
  
  // Usage Analysis
  unused_subscriptions: Array<{
    subscription_id: string;
    name: string;
    cost: number;
    days_unused: number;
    suggested_action: 'pause' | 'cancel';
  }>;
  
  // Trends
  spending_trend: Array<{
    month: string;
    amount: number;
    change_percentage: number;
  }>;
  
  // Upcoming Renewals
  upcoming_renewals: Array<{
    subscription_id: string;
    name: string;
    amount: number;
    renewal_date: string;
    days_until: number;
  }>;
  
  last_calculated_at: string;
}

/**
 * Recurring Transaction with related data (for UI display)
 */
export interface RecurringTransactionWithDetails extends RecurringTransaction {
  category?: Category;
  account?: Account;
  linked_liability?: Liability;
  linked_goal?: Goal;
  upcoming_scheduled?: ScheduledTransaction[];
  recent_payments?: ScheduledTransaction[];
}

/**
 * Scheduled Transaction with related data (for UI display)
 */
export interface ScheduledTransactionWithDetails extends ScheduledTransaction {
  recurring_transaction?: RecurringTransaction;
  category?: Category;
  account?: Account;
  transaction?: Transaction;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  transaction_id: string;
  amount: number;
  source_account_id: string;
  contribution_type: 'manual' | 'initial';
  created_at: string;
  updated_at: string;
}

export interface GoalContributionWithTransaction extends GoalContribution {
  transactions?: {
    id: string;
    amount: number;
    description?: string;
    date: string;
    account_id: string;
    account_name?: string;
  };
}

export interface Bill {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  amount?: number;
  currency: string;
  category_id?: string;
  bill_type: 'one_time' | 'recurring_fixed' | 'recurring_variable' | 'goal_linked' | 'liability_linked';
  recurrence_pattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom';
  recurrence_interval: number;
  custom_recurrence_config?: any;
  due_date: string;
  original_due_date?: string;
  next_due_date?: string;
  last_paid_date?: string;
  recurrence_end_date?: string;
  status: 'upcoming' | 'due_today' | 'overdue' | 'paid' | 'skipped' | 'cancelled' | 'postponed' | 'active' | 'paused' | 'completed';
  
  // Bill container support (like liabilities)
  parent_bill_id?: string; // NULL for containers, set for payment bills generated from container
  
  // New recurring transaction fields
  direction?: 'income' | 'expense';
  nature?: 'subscription' | 'bill' | 'payment' | 'income';
  amount_type?: 'fixed' | 'variable';
  estimated_amount?: number;
  fund_type?: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom';
  custom_pattern?: {
    type?: 'specific_days' | 'specific_dates';
    days?: number[];
    weekdays?: string[];
  };
  end_type?: 'never' | 'on_date' | 'after_count';
  occurrence_count?: number;
  auto_create?: boolean;
  auto_create_days_before?: number;
  remind_before?: boolean;
  is_subscription?: boolean;
  subscription_provider?: string;
  subscription_plan?: string;
  subscription_start_date?: string;
  linked_budget_id?: string;
  paused_until?: string;
  total_occurrences?: number;
  completed_occurrences?: number;
  skipped_occurrences?: number;
  total_paid?: number;
  average_amount?: number;
  last_transaction_date?: string;
  next_transaction_date?: string;
  
  // Existing fields
  goal_id?: string;
  linked_account_id?: string;
  liability_id?: string;
  interest_amount?: number;
  principal_amount?: number;
  payment_number?: number;
  interest_included?: boolean;
  color: string;
  icon: string;
  reminder_days: number[];
  notes?: string;
  metadata?: {
    source_type?: 'liability' | 'general' | 'subscription' | 'utility';
    fund_type?: 'personal' | 'liability';
    interest_included?: boolean;
    nature?: 'subscription' | 'bill' | 'payment' | 'income';
    direction?: 'income' | 'expense';
    [key: string]: any;
  };
  is_active: boolean;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export type RecurringNature = 'subscription' | 'bill' | 'payment' | 'income';

export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'halfyearly'
  | 'yearly'
  | 'custom';

export interface RecurringTransactionOccurrence {
  id: string;
  recurring_transaction_id: string;
  scheduled_date: string;
  status: 'scheduled' | 'due' | 'overdue' | 'confirmed' | 'skipped' | 'cancelled';
  amount?: number;
  actual_amount?: number;
  auto_created: boolean;
  reminder_sent?: boolean;
}

export interface RecurringTransactionHistoryEntry {
  id: string;
  recurring_transaction_id: string;
  date: string;
  amount: number;
  type: 'confirmed' | 'skipped' | 'edited';
  note?: string;
}

export interface RecurringTransactionStats {
  total_occurrences: number;
  completed_occurrences: number;
  skipped_occurrences: number;
  total_paid: number;
  average_amount: number;
  duration_months: number;
  consistency_rate: number;
}

export interface SubscriptionDetailMetadata {
  provider?: string;
  plan?: string;
  renewal_date?: string;
  usage_note?: string;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  organization_id?: string;
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  type: 'income' | 'expense';
  nature: RecurringNature;
  amount?: number;
  amount_type: 'fixed' | 'variable';
  estimated_amount?: number;
  currency: string;
  account_id?: string;
  account_name?: string;
  fund_type: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  frequency: RecurringFrequency;
  interval: number;
  custom_pattern?: {
    type: 'specific_days' | 'specific_dates';
    days?: number[];
    weekdays?: string[];
  };
  start_date: string;
  end_type: 'never' | 'on_date' | 'after_count';
  end_date?: string;
  occurrence_count?: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  paused_until?: string;
  auto_create: boolean;
  auto_create_days_before: number;
  reminders: number[];
  reminder_time?: string;
  tags: string[];
  notes?: string;
  color: string;
  icon: string;
  is_subscription: boolean;
  subscription_details?: SubscriptionDetailMetadata;
  linked_liability_id?: string;
  linked_goal_id?: string;
  next_transaction_date: string;
  totals: RecurringTransactionStats;
  upcoming_occurrences: RecurringTransactionOccurrence[];
  history: RecurringTransactionHistoryEntry[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface BillPayment {
  id: string;
  bill_id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  actual_due_date: string;
  transaction_id?: string;
  account_id?: string;
  payment_status: 'completed' | 'partial' | 'failed';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  is_default: boolean;
  parent_id?: string | null;
  activity_types: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
  total_spent: number;
  total_received: number;
  total_saved: number;
  transaction_count: number;
  is_deleted: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryStats {
  category_id: string;
  category_name: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
  color: string;
  icon: string;
  activity_type: string;
}

export interface Budget {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  created_by: string;
  budget_type: 'monthly' | 'category' | 'goal_based' | 'smart' | 'custom';
  budget_mode?: 'spend_cap' | 'save_target'; // NEW: Determines what we're tracking
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
    goal_subtype?: 'A' | 'B' | 'C'; // A: Saving Target, B: Under Budget Saving, C: Category-Linked Goal
    baseline_category_avg?: number; // For subtype C
    auto_calculate_amount?: boolean; // For subtype A
    ui_settings?: any;
    template?: any;
    reflection_ready?: boolean; // For end-of-period ritual
    period_summary?: BudgetPeriodSummary; // Stored insights for completed period
    renewed_from_budget_id?: string; // Link to previous budget if repeated/extended
    rollover_amount?: number; // Amount rolled over from previous period
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

export interface BudgetAccount {
  budget_id: string;
  account_id: string;
  account_role: 'owner' | 'shared';
  last_synced_at: string;
  created_at: string;
}

export interface BudgetTransaction {
  id: string;
  budget_id: string;
  transaction_id: string;
  is_excluded: boolean;
  excluded_at?: string;
  excluded_reason?: string;
  amount_counted: number;
  applied_at: string;
  reconciled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetEvent {
  id: string;
  budget_id: string;
  event_type: string;
  actor_id: string;
  reason?: string;
  metadata: {
    [key: string]: any;
  };
  created_at: string;
}

/**
 * Budget Period Summary - Insights generated when a budget period ends
 */
export interface BudgetPeriodSummary {
  budget_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  spent_amount: number;
  remaining_amount: number;
  percentage_used: number;
  category_breakdown: {
    category_id: string;
    category_name: string;
    amount: number;
    percentage: number;
  }[];
  previous_period_comparison?: {
    previous_budget_id: string;
    total_change_percentage: number;
    category_changes: {
      category_id: string;
      category_name: string;
      change_percentage: number;
    }[];
  };
  daily_pace: {
    average_daily_spend: number;
    ideal_daily_pace: number;
    days_ahead_behind: number;
    on_track: boolean;
  };
  achievements: {
    streak_count: number;
    improvement_percentage?: number;
    savings_achieved: number;
    consistency_score: number;
  };
  generated_at: string;
}

/**
 * Renewal Decision - User's choice for how to handle period end
 */
export interface RenewalDecision {
  renewal_type: 'continue' | 'repeat' | 'extend';
  budget_id: string;
  new_end_date?: string; // For continue
  reset_spent?: boolean; // For continue
  new_amount?: number; // For repeat/extend
  new_start_date?: string; // For repeat/extend
  new_end_date?: string; // For repeat/extend
  recurrence_pattern?: 'monthly' | 'weekly' | 'yearly' | 'custom'; // For extend
  rollover_enabled?: boolean; // For repeat/extend
  rollover_amount?: number; // For repeat/extend
  account_ids?: string[]; // For repeat/extend (if user wants to change accounts)
}

export interface Liability {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  liability_type: 'credit_card' | 'personal_loan' | 'auto_loan' | 'student_loan' | 'medical' | 'mortgage' | 'other';
  currency: string;

  // Financial Details
  disbursed_amount?: number;
  original_amount?: number;
  current_balance: number;
  interest_rate_apy: number;
  interest_type: 'reducing' | 'fixed' | 'none';
  minimum_payment?: number;
  periodical_payment?: number;
  periodical_frequency?: 'daily' | 'weekly' | 'monthly' | 'custom';

  // Credit Card specific
  credit_limit?: number;
  due_day_of_month?: number;

  // Loan specific
  loan_term_months?: number;
  loan_term_years?: number;

  // Dates
  start_date: string;
  targeted_payoff_date?: string;
  next_due_date?: string;
  last_payment_date?: string;
  paid_off_date?: string;

  // Links
  linked_account_id?: string;
  category_id?: string;

  // Import tracking
  is_imported: boolean;
  import_snapshot_date?: string;
  import_snapshot_balance?: number;

  // Status & Visual
  status: 'active' | 'paid_off' | 'paused' | 'overdue';
  color: string;
  icon: string;

  notes?: string;
  metadata: any;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface LiabilityPayment {
  id: string;
  user_id: string;
  liability_id: string;
  account_id?: string;
  category_id?: string;
  payment_type: 'scheduled' | 'manual' | 'prepayment' | 'mock' | 'historical';
  amount: number;
  interest_component: number;
  principal_component: number;
  payment_date: string;
  description?: string;
  reference_number?: string;
  is_mock: boolean;
  method?: 'import_snapshot' | 'historical_import' | 'manual' | 'auto_pay';
  transaction_id?: string;
  created_at: string;
  updated_at: string;
}

export interface LiabilitySchedule {
  id: string;
  user_id: string;
  liability_id: string;
  account_id?: string;
  due_date: string;
  amount: number;
  auto_pay: boolean;
  reminder_days: number[];
  status: 'pending' | 'completed' | 'cancelled' | 'overdue';
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface LiabilityAdjustment {
  id: string;
  user_id: string;
  liability_id: string;
  adjustment_type: 'extend' | 'reduce' | 'restructure' | 'top_up' | 'interest_capitalization' | 'fee';
  amount: number;
  reason?: string;
  effective_date: string;
  schedule_impact?: 'recalculate' | 'keep_emi_extend_term' | 'keep_term_increase_emi';
  old_values?: any;
  new_values?: any;
  created_at: string;
}

export interface LiabilityCalculations {
  id: string;
  liability_id: string;
  monthly_interest: number;
  total_interest_paid: number;
  total_principal_paid: number;
  payoff_months?: number;
  payoff_date?: string;
  days_until_due?: number;
  calculated_at: string;
}

export interface AccountLiabilityPortion {
  id: string;
  account_id: string;
  liability_id: string;
  liability_account_id: string;
  amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountWithLiabilityBreakdown extends Account {
  liability_portions?: AccountLiabilityPortion[];
  own_funds?: number;
  liability_funds?: number;
}
