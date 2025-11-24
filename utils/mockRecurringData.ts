import { RecurringTransaction } from '@/types';

const today = new Date();

const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
};

const nextDate = (day: number): string => {
  const candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate < today) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return candidate.toISOString().split('T')[0];
};

const buildHistory = (amount: number, months: number) => {
  return Array.from({ length: months }).map((_, idx) => {
    const date = new Date();
    date.setMonth(date.getMonth() - idx - 1);
    date.setDate(10);
    return {
      id: `hist-${idx}`,
      recurring_transaction_id: '',
      date: date.toISOString().split('T')[0],
      amount,
      type: 'confirmed' as const,
    };
  });
};

export const mockRecurringTransactions: RecurringTransaction[] = [
  {
    id: 'rt-netflix',
    user_id: 'demo-user',
    name: 'Netflix Premium',
    description: '4 screen UHD plan',
    category_id: 'cat-entertainment',
    category_name: 'Entertainment',
    type: 'expense',
    nature: 'subscription',
    amount: 649,
    amount_type: 'fixed',
    currency: 'INR',
    account_id: 'acc-hdfc-card',
    account_name: 'HDFC Credit Card',
    fund_type: 'personal',
    frequency: 'monthly',
    interval: 1,
    start_date: '2023-03-15',
    end_type: 'never',
    status: 'active',
    auto_create: true,
    auto_create_days_before: 3,
    reminders: [3, 1],
    reminder_time: '09:00',
    tags: ['entertainment', 'subscription'],
    color: '#EC4899',
    icon: 'videocam',
    is_subscription: true,
    subscription_details: {
      provider: 'Netflix',
      plan: 'Premium (4 screens)',
      renewal_date: addMonths(today, 1),
    },
    linked_liability_id: undefined,
    linked_goal_id: undefined,
    next_transaction_date: nextDate(11),
    totals: {
      total_occurrences: 21,
      completed_occurrences: 20,
      skipped_occurrences: 1,
      total_paid: 13629,
      average_amount: 649,
      duration_months: 21,
      consistency_rate: 0.95,
    },
    upcoming_occurrences: [
      {
        id: 'up-1',
        recurring_transaction_id: 'rt-netflix',
        scheduled_date: nextDate(11),
        status: 'scheduled',
        auto_created: true,
      },
      {
        id: 'up-2',
        recurring_transaction_id: 'rt-netflix',
        scheduled_date: addMonths(new Date(nextDate(11)), 1),
        status: 'scheduled',
        auto_created: true,
      },
    ],
    history: buildHistory(649, 6).map((entry) => ({
      ...entry,
      recurring_transaction_id: 'rt-netflix',
    })),
    metadata: {
      subscription_stack: true,
    },
    created_at: '2023-03-01T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'rt-spotify',
    user_id: 'demo-user',
    name: 'Spotify Premium',
    category_id: 'cat-entertainment',
    category_name: 'Entertainment',
    type: 'expense',
    nature: 'subscription',
    amount: 119,
    amount_type: 'fixed',
    currency: 'INR',
    account_id: 'acc-icici-card',
    account_name: 'ICICI Credit Card',
    fund_type: 'personal',
    frequency: 'monthly',
    interval: 1,
    start_date: '2024-08-05',
    end_type: 'never',
    status: 'active',
    auto_create: true,
    auto_create_days_before: 2,
    reminders: [1],
    tags: ['music', 'subscription'],
    color: '#22D3EE',
    icon: 'musical-notes',
    is_subscription: true,
    subscription_details: {
      provider: 'Spotify',
      plan: 'Individual',
      renewal_date: addMonths(today, 1),
    },
    next_transaction_date: nextDate(5),
    totals: {
      total_occurrences: 4,
      completed_occurrences: 4,
      skipped_occurrences: 0,
      total_paid: 476,
      average_amount: 119,
      duration_months: 4,
      consistency_rate: 1,
    },
    upcoming_occurrences: [
      {
        id: 'up-spotify-1',
        recurring_transaction_id: 'rt-spotify',
        scheduled_date: nextDate(5),
        status: 'scheduled',
        auto_created: true,
      },
    ],
    history: buildHistory(119, 4).map((entry) => ({
      ...entry,
      recurring_transaction_id: 'rt-spotify',
    })),
    metadata: {},
    created_at: '2024-08-01T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'rt-electricity',
    user_id: 'demo-user',
    name: 'Electricity Bill',
    description: 'Variable amount utility bill',
    category_id: 'cat-utilities',
    category_name: 'Utilities',
    type: 'expense',
    nature: 'bill',
    amount_type: 'variable',
    estimated_amount: 2500,
    currency: 'INR',
    account_id: 'acc-hdfc-checking',
    account_name: 'HDFC Checking',
    fund_type: 'personal',
    frequency: 'monthly',
    interval: 1,
    start_date: '2022-01-10',
    end_type: 'never',
    status: 'active',
    auto_create: true,
    auto_create_days_before: 3,
    reminders: [7, 3, 1],
    tags: ['utilities', 'home'],
    color: '#F59E0B',
    icon: 'flash',
    is_subscription: false,
    next_transaction_date: nextDate(10),
    totals: {
      total_occurrences: 34,
      completed_occurrences: 34,
      skipped_occurrences: 0,
      total_paid: 85500,
      average_amount: 2514,
      duration_months: 34,
      consistency_rate: 1,
    },
    upcoming_occurrences: [
      {
        id: 'up-elec-1',
        recurring_transaction_id: 'rt-electricity',
        scheduled_date: nextDate(10),
        status: 'scheduled',
        auto_created: true,
      },
    ],
    history: buildHistory(2450, 6).map((entry, idx) => ({
      ...entry,
      amount: 2300 + idx * 50,
      recurring_transaction_id: 'rt-electricity',
    })),
    metadata: {
      requires_actual_amount: true,
    },
    created_at: '2021-12-25T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'rt-rent',
    user_id: 'demo-user',
    name: 'Apartment Rent',
    category_id: 'cat-housing',
    category_name: 'Housing',
    type: 'expense',
    nature: 'payment',
    amount: 20000,
    amount_type: 'fixed',
    currency: 'INR',
    account_id: 'acc-hdfc-checking',
    account_name: 'HDFC Checking',
    fund_type: 'personal',
    frequency: 'monthly',
    interval: 1,
    start_date: '2021-01-01',
    end_type: 'never',
    status: 'active',
    auto_create: false,
    auto_create_days_before: 0,
    reminders: [5, 2, 1],
    tags: ['home', 'critical'],
    color: '#6366F1',
    icon: 'home',
    is_subscription: false,
    next_transaction_date: nextDate(1),
    totals: {
      total_occurrences: 47,
      completed_occurrences: 47,
      skipped_occurrences: 0,
      total_paid: 940000,
      average_amount: 20000,
      duration_months: 47,
      consistency_rate: 1,
    },
    upcoming_occurrences: [
      {
        id: 'up-rent-1',
        recurring_transaction_id: 'rt-rent',
        scheduled_date: nextDate(1),
        status: 'scheduled',
        auto_created: false,
      },
    ],
    history: buildHistory(20000, 6).map((entry) => ({
      ...entry,
      recurring_transaction_id: 'rt-rent',
    })),
    metadata: {
      priority: 'high',
    },
    created_at: '2020-12-15T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'rt-home-loan',
    user_id: 'demo-user',
    name: 'Home Loan EMI',
    category_id: 'cat-loan',
    category_name: 'Loan Payments',
    type: 'expense',
    nature: 'payment',
    amount: 35000,
    amount_type: 'fixed',
    currency: 'INR',
    account_id: 'acc-hdfc-checking',
    account_name: 'HDFC Checking',
    fund_type: 'liability',
    specific_fund_id: 'fund-home-loan',
    frequency: 'monthly',
    interval: 1,
    start_date: '2020-01-01',
    end_type: 'on_date',
    end_date: '2029-11-01',
    status: 'active',
    auto_create: true,
    auto_create_days_before: 3,
    reminders: [7, 3],
    tags: ['loan', 'emi'],
    color: '#0EA5E9',
    icon: 'business',
    is_subscription: false,
    linked_liability_id: 'liab-home-loan',
    next_transaction_date: nextDate(1),
    totals: {
      total_occurrences: 122,
      completed_occurrences: 122,
      skipped_occurrences: 0,
      total_paid: 4270000,
      average_amount: 35000,
      duration_months: 122,
      consistency_rate: 1,
    },
    upcoming_occurrences: [
      {
        id: 'up-emi-1',
        recurring_transaction_id: 'rt-home-loan',
        scheduled_date: nextDate(1),
        status: 'scheduled',
        auto_created: true,
        amount: 35000,
      },
    ],
    history: buildHistory(35000, 6).map((entry) => ({
      ...entry,
      recurring_transaction_id: 'rt-home-loan',
    })),
    metadata: {
      liability_name: 'Home Loan',
    },
    created_at: '2019-12-01T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'rt-salary',
    user_id: 'demo-user',
    name: 'Monthly Salary',
    type: 'income',
    nature: 'income',
    amount: 100000,
    amount_type: 'fixed',
    currency: 'INR',
    account_id: 'acc-hdfc-checking',
    account_name: 'HDFC Checking',
    fund_type: 'personal',
    frequency: 'monthly',
    interval: 1,
    start_date: '2022-06-30',
    end_type: 'never',
    status: 'active',
    auto_create: true,
    auto_create_days_before: 0,
    reminders: [0],
    tags: ['income'],
    color: '#22C55E',
    icon: 'briefcase',
    is_subscription: false,
    next_transaction_date: nextDate(30),
    totals: {
      total_occurrences: 28,
      completed_occurrences: 28,
      skipped_occurrences: 0,
      total_paid: 2800000,
      average_amount: 100000,
      duration_months: 28,
      consistency_rate: 1,
    },
    upcoming_occurrences: [
      {
        id: 'up-salary-1',
        recurring_transaction_id: 'rt-salary',
        scheduled_date: nextDate(30),
        status: 'scheduled',
        auto_created: true,
        amount: 100000,
      },
    ],
    history: buildHistory(100000, 6).map((entry) => ({
      ...entry,
      recurring_transaction_id: 'rt-salary',
      type: 'confirmed' as const,
    })),
    metadata: {
      employer: 'Acme Corp',
    },
    created_at: '2022-06-01T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
];

export interface RecurringSummarySnapshot {
  totalActive: number;
  totalPaused: number;
  monthlyExpense: number;
  monthlyIncome: number;
  subscriptionMonthly: number;
  upcomingThisWeek: number;
}

export const mockRecurringSummary: RecurringSummarySnapshot = {
  totalActive: mockRecurringTransactions.filter((rt) => rt.status === 'active').length,
  totalPaused: mockRecurringTransactions.filter((rt) => rt.status === 'paused').length,
  monthlyExpense: mockRecurringTransactions
    .filter((rt) => rt.type === 'expense')
    .reduce((sum, rt) => sum + (rt.amount ?? rt.estimated_amount ?? 0), 0),
  monthlyIncome: mockRecurringTransactions
    .filter((rt) => rt.type === 'income')
    .reduce((sum, rt) => sum + (rt.amount ?? rt.estimated_amount ?? 0), 0),
  subscriptionMonthly: mockRecurringTransactions
    .filter((rt) => rt.nature === 'subscription')
    .reduce((sum, rt) => sum + (rt.amount ?? rt.estimated_amount ?? 0), 0),
  upcomingThisWeek: mockRecurringTransactions.filter((rt) => {
    const next = new Date(rt.next_transaction_date);
    const diff = (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length,
};

