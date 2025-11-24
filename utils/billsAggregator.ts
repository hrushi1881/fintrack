/**
 * Bills Aggregator Service
 * Aggregates upcoming payments from multiple sources into a unified Bills view
 * 
 * Sources:
 * 1. Recurring Transactions (Netflix, Rent, etc.)
 * 2. Liabilities (Home Loan EMI, Car Loan, etc.)
 * 3. Scheduled Payments (One-time future payments)
 * 4. Goal Contributions (Planned savings)
 */

import { supabase } from '@/lib/supabase';
import { UpcomingPayment, BillsViewFilters, BillsViewOptions } from '@/types/bills';
import { 
  fetchRecurringTransactions,
  generateUpcomingPaymentsFromRecurring
} from '@/utils/recurringTransactions';
import {
  fetchScheduledPayments
} from '@/utils/scheduledPayments';
import { fetchLiabilitySchedules, LiabilitySchedule } from '@/utils/liabilitySchedules';
import { calculateStatus as calculateRecurrenceStatus, getDaysUntil, generateSchedule } from '@/utils/recurrence';

/**
 * Fetch all upcoming payments (aggregated Bills view)
 */
export async function fetchAllUpcomingPayments(
  userId: string,
  options: BillsViewOptions = { view_type: 'month' },
  filters: BillsViewFilters = {}
): Promise<UpcomingPayment[]> {
  try {
    const payments: UpcomingPayment[] = [];

    // Calculate date range based on view_type
    const today = new Date();
    const { startDate, endDate } = calculateDateRange(today, options.view_type, options.current_date);

    // Apply date filters if provided
    const queryStartDate = filters.start_date || startDate;
    const queryEndDate = filters.end_date || endDate;

    // 1. Get upcoming payments from Recurring Transactions
    if (!filters.source_type || filters.source_type.includes('recurring_transaction')) {
      const recurringPayments = await fetchRecurringTransactionsPayments(
        userId,
        queryStartDate,
        queryEndDate,
        filters
      );
      payments.push(...recurringPayments);
    }

    // 2. Get upcoming payments from Liabilities
    if (!filters.source_type || filters.source_type.includes('liability')) {
      const liabilityPayments = await fetchLiabilityPayments(
        userId,
        queryStartDate,
        queryEndDate,
        filters
      );
      payments.push(...liabilityPayments);
    }

    // 3. Get upcoming payments from Scheduled Payments
    if (!filters.source_type || filters.source_type.includes('scheduled_payment')) {
      const scheduledPayments = await fetchScheduledPaymentsAsUpcoming(
        userId,
        queryStartDate,
        queryEndDate,
        filters
      );
      payments.push(...scheduledPayments);
    }

    // 4. Get upcoming payments from Goal Contributions
    if (!filters.source_type || filters.source_type.includes('goal_contribution')) {
      const goalPayments = await fetchGoalContributionPayments(
        userId,
        queryStartDate,
        queryEndDate,
        filters
      );
      payments.push(...goalPayments);
    }

    // 5. Get upcoming budget periods for tracking
    // Note: fetchBudgetTrackingPayments function not yet implemented
    // if (!filters.source_type || filters.source_type.includes('budget')) {
    //   const budgetPayments = await fetchBudgetTrackingPayments(
    //     userId,
    //     queryStartDate,
    //     queryEndDate,
    //     filters
    //   );
    //   payments.push(...budgetPayments);
    // }

    // Apply additional filters
    let filteredPayments = payments;

    if (filters.status && filters.status.length > 0) {
      filteredPayments = filteredPayments.filter(p => filters.status!.includes(p.status));
    }

    if (filters.category_id) {
      filteredPayments = filteredPayments.filter(p => p.category_id === filters.category_id);
    }

    if (filters.account_id) {
      filteredPayments = filteredPayments.filter(p => p.linked_account_id === filters.account_id);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredPayments = filteredPayments.filter(
        p => p.title.toLowerCase().includes(searchLower) ||
             p.description?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by due date
    filteredPayments.sort((a, b) => {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    // Calculate days_until for each payment
    const todayStr = new Date().toISOString().split('T')[0];
    return filteredPayments.map(payment => ({
      ...payment,
      days_until: getDaysUntil(payment.due_date, todayStr),
    }));
  } catch (error) {
    console.error('Error fetching upcoming payments:', error);
    throw error;
  }
}

/**
 * Fetch upcoming payments from Recurring Transactions
 */
async function fetchRecurringTransactionsPayments(
  userId: string,
  startDate: string,
  endDate: string,
  filters: BillsViewFilters
): Promise<UpcomingPayment[]> {
  try {
    const recurringTransactions = await fetchRecurringTransactions(userId, {
      status: ['active'],
    });

    const payments: UpcomingPayment[] = [];

    for (const tx of recurringTransactions) {
      if (tx.status !== 'active') continue;

      // Generate upcoming occurrences for this transaction
      const occurrences = await generateUpcomingPaymentsFromRecurring(
        tx.id,
        startDate,
        endDate
      );

      for (const occurrence of occurrences) {
        // Get category name if category_id exists
        let categoryName: string | undefined;
        if (tx.category_id) {
          try {
            const { data: category } = await supabase
              .from('categories')
              .select('name')
              .eq('id', tx.category_id)
              .single();
            categoryName = category?.name;
          } catch (err) {
            // Category not found, ignore
          }
        }

        // Get account name if account_id exists
        let accountName: string | undefined;
        if (tx.account_id) {
          try {
            const { data: account } = await supabase
              .from('accounts')
              .select('name')
              .eq('id', tx.account_id)
              .single();
            accountName = account?.name;
          } catch (err) {
            // Account not found, ignore
          }
        }

        payments.push({
          id: `${tx.id}_${occurrence.date}`, // Unique ID for this occurrence
          source_type: 'recurring_transaction',
          source_id: tx.id,
          title: tx.title,
          description: tx.description,
          amount: occurrence.amount,
          currency: tx.currency,
          due_date: occurrence.date,
          status: occurrence.status === 'upcoming' ? 'upcoming' :
                  occurrence.status === 'due_today' ? 'due_today' :
                  occurrence.status === 'overdue' ? 'overdue' : 'upcoming',
          category_id: tx.category_id,
          category_name: categoryName,
          linked_account_id: tx.account_id, // Map account_id to linked_account_id for UpcomingPayment interface
          account_name: accountName,
          fund_type: tx.fund_type,
          specific_fund_id: tx.specific_fund_id,
          color: tx.color,
          icon: tx.icon,
          tags: tx.tags,
          notes: tx.notes,
          metadata: {
            nature: tx.nature,
            amount_type: tx.amount_type,
            estimated_amount: tx.estimated_amount,
            ...tx.metadata,
          },
          created_at: tx.created_at,
        });
      }
    }

    return payments;
  } catch (error) {
    console.error('Error fetching recurring transaction payments:', error);
    return [];
  }
}

/**
 * Fetch upcoming payments from Liabilities
 */
async function fetchLiabilityPayments(
  userId: string,
  startDate: string,
  endDate: string,
  filters: BillsViewFilters
): Promise<UpcomingPayment[]> {
  try {
    // Get all liabilities
    const { data: liabilities, error: liabilitiesError } = await supabase
      .from('liabilities')
      .select('id, title, current_balance, currency, periodical_payment, next_due_date, color, icon')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('is_deleted', false);

    if (liabilitiesError) throw liabilitiesError;

    const payments: UpcomingPayment[] = [];

    for (const liability of liabilities || []) {
      // Get liability schedules (bills) for this liability
      const schedules = await fetchLiabilitySchedules(liability.id);

      // Filter schedules within date range
      const relevantSchedules = schedules.filter(schedule => {
        const dueDate = new Date(schedule.due_date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return dueDate >= start && dueDate <= end;
      });

      for (const schedule of relevantSchedules) {
        // Calculate status
        const today = new Date().toISOString().split('T')[0];
        const status = calculateRecurrenceStatus(schedule.due_date, today, schedule.status as any);

        let categoryName: string | undefined;
        if (schedule.account_id) {
          try {
            const { data: account } = await supabase
              .from('accounts')
              .select('name')
              .eq('id', schedule.account_id)
              .single();
            categoryName = account?.name;
          } catch (err) {
            // Account not found, ignore
          }
        }

        payments.push({
          id: schedule.id,
          source_type: 'liability',
          source_id: liability.id,
          title: `${liability.title} - Payment`,
          description: schedule.metadata?.description,
          amount: schedule.amount,
          currency: liability.currency || 'USD',
          due_date: schedule.due_date,
          status: status === 'upcoming' ? 'upcoming' :
                  status === 'due_today' ? 'due_today' :
                  status === 'overdue' ? 'overdue' : 'scheduled',
          linked_account_id: schedule.account_id,
          account_name: categoryName,
          fund_type: 'liability',
          specific_fund_id: liability.id, // Link to liability fund
          color: liability.color || '#EF4444',
          icon: liability.icon || 'card',
          metadata: {
            nature: 'payment',
            amount_type: 'fixed',
            principal_amount: schedule.metadata?.principal_amount,
            interest_amount: schedule.metadata?.interest_amount,
            payment_number: schedule.metadata?.payment_number,
            ...schedule.metadata,
          },
          created_at: schedule.created_at,
        });
      }
    }

    return payments;
  } catch (error) {
    console.error('Error fetching liability payments:', error);
    return [];
  }
}

/**
 * Fetch scheduled payments as upcoming payments
 */
async function fetchScheduledPaymentsAsUpcoming(
  userId: string,
  startDate: string,
  endDate: string,
  filters: BillsViewFilters
): Promise<UpcomingPayment[]> {
  try {
    const scheduledPayments = await fetchScheduledPayments(userId, {
      start_date: startDate,
      end_date: endDate,
      status: ['scheduled', 'due_today', 'overdue'], // Only get active (non-paid) payments
    });

    const payments: UpcomingPayment[] = [];

    for (const payment of scheduledPayments) {
      if (payment.status === 'paid' || payment.status === 'cancelled') continue;

      // Get category name if category_id exists
      let categoryName: string | undefined;
      if (payment.category_id) {
        try {
          const { data: category } = await supabase
            .from('categories')
            .select('name')
            .eq('id', payment.category_id)
            .single();
          categoryName = category?.name;
        } catch (err) {
          // Category not found, ignore
        }
      }

      // Get account name if linked_account_id exists
      let accountName: string | undefined;
      if (payment.linked_account_id) {
        try {
          const { data: account } = await supabase
            .from('accounts')
            .select('name')
            .eq('id', payment.linked_account_id)
            .single();
          accountName = account?.name;
        } catch (err) {
          // Account not found, ignore
        }
      }

      payments.push({
        id: payment.id,
        source_type: 'scheduled_payment',
        source_id: payment.id,
        title: payment.title,
        description: payment.description,
        amount: payment.amount,
        currency: payment.currency,
        due_date: payment.due_date,
        status: payment.status === 'scheduled' ? 'upcoming' :
                payment.status === 'due_today' ? 'due_today' :
                payment.status === 'overdue' ? 'overdue' : payment.status,
        category_id: payment.category_id,
        category_name: categoryName,
        linked_account_id: payment.linked_account_id,
        account_name: accountName,
        fund_type: payment.fund_type,
        specific_fund_id: payment.specific_fund_id,
        color: payment.color,
        icon: payment.icon,
        tags: payment.tags,
        notes: payment.notes,
        metadata: payment.metadata || {},
        created_at: payment.created_at,
      });
    }

    return payments;
  } catch (error) {
    console.error('Error fetching scheduled payments:', error);
    return [];
  }
}

/**
 * Fetch upcoming payments from Goal Contributions
 * Shows target payments every cycle based on goal contribution schedule
 */
async function fetchGoalContributionPayments(
  userId: string,
  startDate: string,
  endDate: string,
  filters: BillsViewFilters
): Promise<UpcomingPayment[]> {
  try {
    // Get all active goals
    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('id, title, description, currency, color, icon, target_amount, current_amount, target_date')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .eq('is_achieved', false);

    if (goalsError) throw goalsError;

    const payments: UpcomingPayment[] = [];

    for (const goal of goals || []) {
      // Note: goals.metadata column doesn't exist, so contribution schedules are not supported
      // Calculate based on target_date and remaining amount
      if (goal.target_date) {
        const remaining = (goal.target_amount || 0) - (goal.current_amount || 0);
        if (remaining <= 0) continue; // Goal already achieved
        
        const today = new Date();
        const targetDate = new Date(goal.target_date);
        const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysRemaining <= 0) continue; // Target date passed
        
        // Calculate monthly contribution needed
        const monthsRemaining = Math.max(1, daysRemaining / 30);
        const monthlyAmount = remaining / monthsRemaining;
        
        // Generate monthly occurrences from today until target_date
        const occurrences = generateSchedule(
          {
            frequency: 'month',
            interval: 1,
            start_date: today.toISOString().split('T')[0],
            end_date: goal.target_date,
            date_of_occurrence: today.getDate(), // Use current day of month
          },
          {
            startDate,
            endDate,
            currentDate: today.toISOString().split('T')[0],
          }
        );

        for (const occurrence of occurrences) {
          payments.push({
            id: `${goal.id}_${occurrence.date}`,
            source_type: 'goal_contribution',
            source_id: goal.id,
            title: `${goal.title} - Target Payment`,
            description: `Contribution to reach ${goal.title} target`,
            amount: monthlyAmount,
            currency: goal.currency || 'USD',
            due_date: occurrence.date,
            status: occurrence.status === 'upcoming' ? 'upcoming' :
                    occurrence.status === 'due_today' ? 'due_today' :
                    occurrence.status === 'overdue' ? 'overdue' : 'upcoming',
            fund_type: 'goal',
            specific_fund_id: goal.id,
            color: goal.color || '#10B981',
            icon: goal.icon || 'target',
            metadata: {
              nature: 'payment',
              amount_type: 'fixed',
              target_amount: goal.target_amount,
              current_amount: goal.current_amount,
              remaining_amount: remaining,
            },
          });
        }
      }
    }

    return payments;
  } catch (error) {
    console.error('Error fetching goal contribution payments:', error);
    return [];
  }
}

/**
 * Calculate date range based on view type
 */
function calculateDateRange(
  baseDate: Date,
  viewType: 'day' | 'week' | 'month' | 'year',
  currentDate?: string
): { startDate: string; endDate: string } {
  const date = currentDate ? new Date(currentDate) : baseDate;
  
  let startDate: Date;
  let endDate: Date;

  switch (viewType) {
    case 'day':
      // Single day
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'week':
      // Start of week (Monday)
      startDate = new Date(date);
      const dayOfWeek = date.getDay();
      const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      
      // End of week (Sunday)
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'month':
      // Start of month
      startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      
      // End of month
      endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'year':
      // Start of year
      startDate = new Date(date.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);
      
      // End of year
      endDate = new Date(date.getFullYear(), 11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;

    default:
      // Default to month
      startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Get summary statistics for upcoming payments
 */
export async function getUpcomingPaymentsSummary(
  userId: string,
  options: BillsViewOptions = { view_type: 'month' }
): Promise<{
  total: number;
  totalAmount: number;
  upcomingCount: number;
  dueTodayCount: number;
  overdueCount: number;
  bySource: Record<string, { count: number; amount: number }>;
}> {
  try {
    const payments = await fetchAllUpcomingPayments(userId, options, {
      include_paid: false,
      include_cancelled: false,
    } as any);

    const summary = {
      total: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + (p.amount || 0), 0),
      upcomingCount: payments.filter(p => p.status === 'upcoming').length,
      dueTodayCount: payments.filter(p => p.status === 'due_today').length,
      overdueCount: payments.filter(p => p.status === 'overdue').length,
      bySource: {} as Record<string, { count: number; amount: number }>,
    };

    // Group by source type
    for (const payment of payments) {
      if (!summary.bySource[payment.source_type]) {
        summary.bySource[payment.source_type] = { count: 0, amount: 0 };
      }
      summary.bySource[payment.source_type].count++;
      summary.bySource[payment.source_type].amount += payment.amount || 0;
    }

    return summary;
  } catch (error) {
    console.error('Error getting payments summary:', error);
    throw error;
  }
}

