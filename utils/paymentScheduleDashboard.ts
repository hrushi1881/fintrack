/**
 * Payment Schedule Dashboard
 * Unified view of all payment schedules across recurring transactions, liabilities, and goals
 * Provides comprehensive payment calendar and schedule management
 */

import { supabase } from '@/lib/supabase';
import { 
  fetchRecurringTransactions,
  generateUpcomingPaymentsFromRecurring 
} from '@/utils/recurringTransactions';
import { fetchGoalSchedules, generateUpcomingGoalPayments } from '@/utils/goalSchedules';
import { generateCycles, Cycle, getCycleStatistics } from '@/utils/cycles';
import { getDaysUntil } from '@/utils/recurrence';

export interface PaymentScheduleItem {
  id: string;
  source_type: 'recurring_transaction' | 'liability' | 'goal_schedule';
  source_id: string;
  source_title: string;
  amount: number;
  currency: string;
  due_date: string;
  status: 'upcoming' | 'due_today' | 'overdue' | 'paid_on_time' | 'paid_late' | 'paid_early';
  days_until?: number;
  category_id?: string;
  category_name?: string;
  account_id?: string;
  account_name?: string;
  color?: string;
  icon?: string;
  metadata?: any;
}

export interface ScheduleOverview {
  totalUpcoming: number;
  totalAmount: number;
  dueToday: number;
  dueTodayAmount: number;
  dueThisWeek: number;
  dueThisWeekAmount: number;
  dueThisMonth: number;
  dueThisMonthAmount: number;
  overdue: number;
  overdueAmount: number;
  bySource: {
    recurring_transaction: { count: number; amount: number };
    liability: { count: number; amount: number };
    goal_schedule: { count: number; amount: number };
  };
}

export interface CashFlowSummary {
  incomeTotal: number;
  expenseTotal: number;
  netCashFlow: number;
}

export interface PaymentScheduleFilters {
  start_date?: string;
  end_date?: string;
  source_types?: Array<'recurring_transaction' | 'liability' | 'goal_schedule'>;
  status?: Array<'upcoming' | 'due_today' | 'overdue' | 'paid_on_time' | 'paid_late' | 'paid_early'>;
  account_id?: string;
  category_id?: string;
}

/**
 * Fetch all payment schedules for a user
 */
export async function fetchAllPaymentSchedules(
  userId: string,
  filters: PaymentScheduleFilters = {}
): Promise<PaymentScheduleItem[]> {
  try {
    const schedules: PaymentScheduleItem[] = [];
    const today = new Date().toISOString().split('T')[0];
    
    // Default date range: today to 3 months ahead
    const defaultStartDate = filters.start_date || today;
    const defaultEndDate = filters.end_date || (() => {
      const date = new Date();
      date.setMonth(date.getMonth() + 3);
      return date.toISOString().split('T')[0];
    })();

    // 1. Fetch from Recurring Transactions
    if (!filters.source_types || filters.source_types.includes('recurring_transaction')) {
      const recurringSchedules = await fetchRecurringTransactionSchedules(
        userId,
        defaultStartDate,
        defaultEndDate,
        filters
      );
      schedules.push(...recurringSchedules);
    }

    // 2. Fetch from Liabilities
    if (!filters.source_types || filters.source_types.includes('liability')) {
      const liabilitySchedules = await fetchLiabilitySchedules(
        userId,
        defaultStartDate,
        defaultEndDate,
        filters
      );
      schedules.push(...liabilitySchedules);
    }

    // 3. Fetch from Goal Contribution Schedules
    if (!filters.source_types || filters.source_types.includes('goal_schedule')) {
      const goalSchedulesData = await fetchGoalSchedulesData(
        userId,
        defaultStartDate,
        defaultEndDate,
        filters
      );
      schedules.push(...goalSchedulesData);
    }

    // Sort by due date
    schedules.sort((a, b) => {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    // Calculate days_until for each
    return schedules.map(schedule => ({
      ...schedule,
      days_until: getDaysUntil(schedule.due_date, today),
    }));
  } catch (error) {
    console.error('Error fetching all payment schedules:', error);
    throw error;
  }
}

/**
 * Fetch recurring transaction schedules
 */
async function fetchRecurringTransactionSchedules(
  userId: string,
  startDate: string,
  endDate: string,
  filters: PaymentScheduleFilters
): Promise<PaymentScheduleItem[]> {
  try {
    const recurring = await fetchRecurringTransactions(userId, {
      status: ['active'],
    });

    if (!recurring || recurring.length === 0) {
      return [];
    }

    const schedules: PaymentScheduleItem[] = [];

    // Preload categories and accounts to avoid N+1 queries
    const categoryIds = Array.from(
      new Set(recurring.map((tx) => tx.category_id).filter(Boolean))
    ) as string[];
    const accountIds = Array.from(
      new Set(recurring.map((tx) => tx.account_id).filter(Boolean))
    ) as string[];

    const [categoriesRes, accountsRes] = await Promise.all([
      categoryIds.length
        ? supabase
            .from('categories')
            .select('id, name')
            .in('id', categoryIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      accountIds.length
        ? supabase
            .from('accounts')
            .select('id, name')
            .in('id', accountIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (categoriesRes.error) {
      console.warn('Error preloading categories for recurring schedules:', categoriesRes.error);
    }
    if (accountsRes.error) {
      console.warn('Error preloading accounts for recurring schedules:', accountsRes.error);
    }

    const categoryMap = new Map<string, string>();
    (categoriesRes.data || []).forEach((c: any) => {
      categoryMap.set(c.id, c.name);
    });

    const accountMap = new Map<string, string>();
    (accountsRes.data || []).forEach((a: any) => {
      accountMap.set(a.id, a.name);
    });

    for (const tx of recurring) {
      // Apply filters at transaction level where possible
      if (filters.account_id && tx.account_id !== filters.account_id) continue;
      if (filters.category_id && tx.category_id !== filters.category_id) continue;

      const payments = await generateUpcomingPaymentsFromRecurring(
        tx.id,
        startDate,
        endDate
      );

      const categoryName =
        tx.category_id && categoryMap.has(tx.category_id)
          ? categoryMap.get(tx.category_id)
          : undefined;
      const accountName =
        tx.account_id && accountMap.has(tx.account_id)
          ? accountMap.get(tx.account_id)
          : undefined;

      for (const payment of payments) {
        const status = mapStatusToPaymentStatus(payment.status);

        if (filters.status && !filters.status.includes(status as any)) continue;

        schedules.push({
          id: `${tx.id}_${payment.date}`,
          source_type: 'recurring_transaction',
          source_id: tx.id,
          source_title: tx.title,
          amount: payment.amount || tx.amount || 0,
          currency: tx.currency,
          due_date: payment.date,
          status: status as any,
          category_id: tx.category_id,
          category_name: categoryName,
          account_id: tx.account_id,
          account_name: accountName,
          color: tx.color,
          icon: tx.icon,
          metadata: {
            direction: tx.direction,
            nature: tx.nature,
            amount_type: tx.amount_type,
          },
        });
      }
    }

    return schedules;
  } catch (error) {
    console.error('Error fetching recurring transaction schedules:', error);
    return [];
  }
}

/**
 * Fetch liability payment schedules
 */
async function fetchLiabilitySchedules(
  userId: string,
  startDate: string,
  endDate: string,
  filters: PaymentScheduleFilters
): Promise<PaymentScheduleItem[]> {
  try {
    // Get all active liabilities
    const { data: liabilities, error: liabilitiesError } = await supabase
      .from('liabilities')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('is_deleted', false);

    if (liabilitiesError) throw liabilitiesError;

    if (!liabilities || liabilities.length === 0) {
      return [];
    }

    const schedules: PaymentScheduleItem[] = [];

    // Preload all relevant accounts in a single query
    const liabilityAccountIds = Array.from(
      new Set((liabilities || []).map((l: any) => l.account_id).filter(Boolean))
    ) as string[];

    let accountMap = new Map<string, string>();
    if (liabilityAccountIds.length) {
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, name')
        .in('id', liabilityAccountIds);

      if (accountsError) {
        console.warn('Error preloading accounts for liabilities:', accountsError);
      } else {
        (accounts || []).forEach((a: any) => {
          accountMap.set(a.id, a.name);
        });
      }
    }

    for (const liability of liabilities || []) {
      // Generate cycles for liability
      const cycles = generateCycles({
        startDate: liability.start_date,
        endDate: liability.targeted_payoff_date || undefined,
        frequency: 'monthly', // Most liabilities are monthly
        interval: 1,
        amount: liability.periodical_payment,
        maxCycles: 36, // Up to 3 years ahead
        currentDate: new Date().toISOString().split('T')[0],
        interestRate: liability.interest_rate_apy,
        startingBalance: liability.current_balance,
        interestIncluded: true,
      });

      // Filter cycles within date range
      const filteredCycles = cycles.filter(cycle => {
        const dueDate = new Date(cycle.expectedDate);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return dueDate >= start && dueDate <= end;
      });

      // Apply filters
      if (filters.account_id && liability.account_id !== filters.account_id) continue;

      for (const cycle of filteredCycles) {
        const status = mapCycleStatusToPaymentStatus(cycle.status);
        
        if (filters.status && !filters.status.includes(status as any)) continue;

        // Get account name from preloaded map
        const accountName =
          liability.account_id && accountMap.has(liability.account_id)
            ? accountMap.get(liability.account_id)
            : undefined;

        schedules.push({
          id: `${liability.id}_cycle_${cycle.cycleNumber}`,
          source_type: 'liability',
          source_id: liability.id,
          source_title: `${liability.title} - Payment #${cycle.cycleNumber}`,
          amount: cycle.expectedAmount,
          currency: liability.currency,
          due_date: cycle.expectedDate,
          status: status as any,
          account_id: liability.account_id,
          account_name: accountName,
          color: liability.color || '#EF4444',
          icon: liability.icon || 'card',
          metadata: {
            cycle_number: cycle.cycleNumber,
            expected_principal: cycle.expectedPrincipal,
            expected_interest: cycle.expectedInterest,
            remaining_balance: cycle.remainingBalance,
            liability_type: liability.liability_type,
          },
        });
      }
    }

    return schedules;
  } catch (error) {
    console.error('Error fetching liability schedules:', error);
    return [];
  }
}

/**
 * Fetch goal contribution schedules
 */
async function fetchGoalSchedulesData(
  userId: string,
  startDate: string,
  endDate: string,
  filters: PaymentScheduleFilters
): Promise<PaymentScheduleItem[]> {
  try {
    const goalSchedules = await fetchGoalSchedules(userId, {
      status: ['active'],
    });

    if (!goalSchedules || goalSchedules.length === 0) {
      return [];
    }

    const schedules: PaymentScheduleItem[] = [];

    // Preload goals and accounts to avoid N+1
    const goalIds = Array.from(
      new Set(goalSchedules.map((g) => g.goal_id).filter(Boolean))
    ) as string[];
    const sourceAccountIds = Array.from(
      new Set(goalSchedules.map((g) => g.source_account_id).filter(Boolean))
    ) as string[];

    const [goalsRes, accountsRes] = await Promise.all([
      goalIds.length
        ? supabase
            .from('goals')
            .select('id, title, color, icon')
            .in('id', goalIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      sourceAccountIds.length
        ? supabase
            .from('accounts')
            .select('id, name')
            .in('id', sourceAccountIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (goalsRes.error) {
      console.warn('Error preloading goals for schedules:', goalsRes.error);
    }
    if (accountsRes.error) {
      console.warn('Error preloading accounts for goal schedules:', accountsRes.error);
    }

    const goalMap = new Map<string, { title?: string; color?: string; icon?: string }>();
    (goalsRes.data || []).forEach((g: any) => {
      goalMap.set(g.id, {
        title: g.title,
        color: g.color,
        icon: g.icon,
      });
    });

    const accountMap = new Map<string, string>();
    (accountsRes.data || []).forEach((a: any) => {
      accountMap.set(a.id, a.name);
    });

    for (const goalSchedule of goalSchedules) {
      const payments = await generateUpcomingGoalPayments(
        goalSchedule.id,
        userId,
        startDate,
        endDate
      );

      // Apply filters
      if (filters.account_id && goalSchedule.source_account_id !== filters.account_id) continue;

      const goalInfo = goalSchedule.goal_id
        ? goalMap.get(goalSchedule.goal_id)
        : undefined;
      const accountName =
        goalSchedule.source_account_id && accountMap.has(goalSchedule.source_account_id)
          ? accountMap.get(goalSchedule.source_account_id)
          : undefined;

      for (const payment of payments) {
        const status = mapStatusToPaymentStatus(payment.status);
        
        if (filters.status && !filters.status.includes(status as any)) continue;

        schedules.push({
          id: `${goalSchedule.id}_${payment.date}`,
          source_type: 'goal_schedule',
          source_id: goalSchedule.id,
          source_title: `${goalInfo?.title || goalSchedule.title} - Contribution`,
          amount: payment.amount,
          currency: goalSchedule.currency,
          due_date: payment.date,
          status: status as any,
          account_id: goalSchedule.source_account_id,
          account_name: accountName,
          color: goalSchedule.color || goalInfo?.color || '#10B981',
          icon: goalSchedule.icon || goalInfo?.icon || 'target',
          metadata: {
            goal_id: goalSchedule.goal_id,
            frequency: goalSchedule.frequency,
            fund_type: goalSchedule.fund_type,
          },
        });
      }
    }

    return schedules;
  } catch (error) {
    console.error('Error fetching goal schedules:', error);
    return [];
  }
}

/**
 * Get schedule overview statistics
 */
export async function getScheduleOverview(
  userId: string,
  filters: PaymentScheduleFilters = {}
): Promise<ScheduleOverview> {
  try {
    const schedules = await fetchAllPaymentSchedules(userId, filters);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overview: ScheduleOverview = {
      totalUpcoming: 0,
      totalAmount: 0,
      dueToday: 0,
      dueTodayAmount: 0,
      dueThisWeek: 0,
      dueThisWeekAmount: 0,
      dueThisMonth: 0,
      dueThisMonthAmount: 0,
      overdue: 0,
      overdueAmount: 0,
      bySource: {
        recurring_transaction: { count: 0, amount: 0 },
        liability: { count: 0, amount: 0 },
        goal_schedule: { count: 0, amount: 0 },
      },
    };

    const oneWeekLater = new Date(today);
    oneWeekLater.setDate(oneWeekLater.getDate() + 7);

    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    for (const schedule of schedules) {
      const dueDate = new Date(schedule.due_date);
      dueDate.setHours(0, 0, 0, 0);

      // Total upcoming (future payments)
      if (dueDate >= today) {
        overview.totalUpcoming++;
        overview.totalAmount += schedule.amount;
      }

      // Due today
      if (dueDate.getTime() === today.getTime()) {
        overview.dueToday++;
        overview.dueTodayAmount += schedule.amount;
      }

      // Due this week
      if (dueDate >= today && dueDate <= oneWeekLater) {
        overview.dueThisWeek++;
        overview.dueThisWeekAmount += schedule.amount;
      }

      // Due this month
      if (dueDate >= today && dueDate <= oneMonthLater) {
        overview.dueThisMonth++;
        overview.dueThisMonthAmount += schedule.amount;
      }

      // Overdue
      if (dueDate < today && schedule.status === 'overdue') {
        overview.overdue++;
        overview.overdueAmount += schedule.amount;
      }

      // By source
      overview.bySource[schedule.source_type].count++;
      overview.bySource[schedule.source_type].amount += schedule.amount;
    }

    // Round amounts
    overview.totalAmount = Math.round(overview.totalAmount * 100) / 100;
    overview.dueTodayAmount = Math.round(overview.dueTodayAmount * 100) / 100;
    overview.dueThisWeekAmount = Math.round(overview.dueThisWeekAmount * 100) / 100;
    overview.dueThisMonthAmount = Math.round(overview.dueThisMonthAmount * 100) / 100;
    overview.overdueAmount = Math.round(overview.overdueAmount * 100) / 100;

    Object.keys(overview.bySource).forEach(key => {
      const sourceKey = key as keyof typeof overview.bySource;
      overview.bySource[sourceKey].amount = 
        Math.round(overview.bySource[sourceKey].amount * 100) / 100;
    });

    return overview;
  } catch (error) {
    console.error('Error getting schedule overview:', error);
    throw error;
  }
}

/**
 * Get payment calendar data for month view
 */
export async function getPaymentCalendar(
  userId: string,
  year: number,
  month: number
): Promise<Record<string, PaymentScheduleItem[]>> {
  try {
    // Get start and end dates for the month
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const schedules = await fetchAllPaymentSchedules(userId, {
      start_date: startDate,
      end_date: endDate,
    });

    // Group by date
    const calendar: Record<string, PaymentScheduleItem[]> = {};
    
    for (const schedule of schedules) {
      if (!calendar[schedule.due_date]) {
        calendar[schedule.due_date] = [];
      }
      calendar[schedule.due_date].push(schedule);
    }

    return calendar;
  } catch (error) {
    console.error('Error getting payment calendar:', error);
    throw error;
  }
}

/**
 * Map recurrence status to payment status
 */
function mapStatusToPaymentStatus(status: string): string {
  switch (status) {
    case 'due_today':
      return 'due_today';
    case 'overdue':
      return 'overdue';
    case 'upcoming':
    default:
      return 'upcoming';
  }
}

/**
 * Map cycle status to payment status
 */
function mapCycleStatusToPaymentStatus(status: string): string {
  switch (status) {
    case 'paid_on_time':
    case 'paid_early':
    case 'paid_within_window':
      return 'paid_on_time';
    case 'paid_late':
      return 'paid_late';
    case 'not_paid':
      return 'overdue';
    case 'upcoming':
    default:
      return 'upcoming';
  }
}

/**
 * Get upcoming payments count by date range
 */
export async function getUpcomingPaymentsCounts(
  userId: string
): Promise<{
  today: number;
  thisWeek: number;
  thisMonth: number;
  next30Days: number;
}> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const overview = await getScheduleOverview(userId, {
      start_date: today,
    });

    return {
      today: overview.dueToday,
      thisWeek: overview.dueThisWeek,
      thisMonth: overview.dueThisMonth,
      next30Days: overview.totalUpcoming,
    };
  } catch (error) {
    console.error('Error getting upcoming payments counts:', error);
    return {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      next30Days: 0,
    };
  }
}

/**
 * Get income, expenses, and net cash flow for a given period
 * based on payment schedules.
 *
 * Rules:
 * - Recurring transactions with metadata.direction === 'income' → income
 * - Recurring transactions with metadata.direction === 'expense' → expense
 * - Liabilities & goal schedules are always treated as expenses
 */
export async function getCashFlowForPeriod(
  userId: string,
  startDate: string,
  endDate: string
): Promise<CashFlowSummary> {
  try {
    const schedules = await fetchAllPaymentSchedules(userId, {
      start_date: startDate,
      end_date: endDate,
    });

    let incomeTotal = 0;
    let expenseTotal = 0;

    for (const s of schedules) {
      const direction = s.metadata?.direction as 'income' | 'expense' | undefined;
      const isLiability = s.source_type === 'liability';
      const isGoal = s.source_type === 'goal_schedule';

      if (direction === 'income') {
        incomeTotal += s.amount || 0;
      } else if (isLiability || isGoal || direction === 'expense') {
        expenseTotal += s.amount || 0;
      }
    }

    return {
      incomeTotal: Math.round(incomeTotal * 100) / 100,
      expenseTotal: Math.round(expenseTotal * 100) / 100,
      netCashFlow: Math.round((incomeTotal - expenseTotal) * 100) / 100,
    };
  } catch (error) {
    console.error('Error getting cash flow for period:', error);
    return {
      incomeTotal: 0,
      expenseTotal: 0,
      netCashFlow: 0,
    };
  }
}

