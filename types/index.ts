export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: 'bank' | 'card' | 'wallet' | 'cash' | 'goals_savings';
  balance: number;
  currency: string;
  color: string;
  icon: string;
  description?: string;
  include_in_totals?: boolean;
  is_active: boolean;
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
  bill_type: 'one_time' | 'recurring_fixed' | 'recurring_variable' | 'goal_linked';
  recurrence_pattern?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  recurrence_interval: number;
  custom_recurrence_config?: any;
  due_date: string;
  original_due_date?: string;
  next_due_date?: string;
  last_paid_date?: string;
  recurrence_end_date?: string;
  status: 'upcoming' | 'due_today' | 'overdue' | 'paid' | 'skipped' | 'cancelled' | 'postponed';
  goal_id?: string;
  linked_account_id?: string;
  color: string;
  icon: string;
  reminder_days: number[];
  notes?: string;
  metadata: any;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at?: string;
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

export interface Budget {
  id: string;
  user_id: string;
  category_id?: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date?: string;
  is_active: boolean;
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
  activity_types: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
  total_spent: number;
  total_received: number;
  total_saved: number;
  transaction_count: number;
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
