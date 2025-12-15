/**
 * Payment Dashboard Utilities
 * Consolidates all financial obligations and activities from:
 * - Recurring Transactions
 * - Liabilities
 * - Bills
 * - Goals (contributions)
 * - Budgets (reflections)
 * 
 * Organizes by date in hierarchical order
 */

import { supabase } from '@/lib/supabase';
import { fetchBills, calculateBillStatus } from './bills';
import { fetchUpcomingSchedules } from './liabilitySchedules';
import { getRecurringTransactions } from './recurringTransactions';
import { generateCyclesForRecurringTransaction } from './recurringTransactionCycles';
import { RecurringTransaction } from './recurringTransactions';
import { Cycle } from './cycles';
import { DEFAULT_CURRENCY } from './currency';

export interface PaymentItem {
  id: string;
  type: 'recurring' | 'liability' | 'bill' | 'goal_contribution' | 'budget_reflection';
  title: string;
  description?: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'upcoming' | 'due_today' | 'overdue' | 'paid' | 'skipped' | 'completed';
  direction?: 'income' | 'expense'; // For recurring transactions
  category?: {
    id: string;
    name: string;
  };
  account?: {
    id: string;
    name: string;
  };
  metadata?: {
    recurring_transaction_id?: string;
    liability_id?: string;
    bill_id?: string;
    goal_id?: string;
    budget_id?: string;
    cycle_number?: number;
    payment_number?: number;
    principal_amount?: number;
    interest_amount?: number;
    is_subscription?: boolean;
    is_auto_pay?: boolean;
    direction?: 'income' | 'expense';
  };
  color?: string;
  icon?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface PaymentDay {
  date: string;
  dayName: string;
  items: PaymentItem[];
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
}

export interface PaymentDashboardData {
  days: PaymentDay[];
  summary: {
    totalUpcoming: number;
    totalDueToday: number;
    totalOverdue: number;
    totalPaid: number;
    totalAmount: number;
    totalPaidAmount: number;
    totalDueAmount: number;
    nextPaymentDate?: string;
    nextPaymentAmount?: number;
  };
  byType: {
    recurring: PaymentItem[];
    liabilities: PaymentItem[];
    bills: PaymentItem[];
    goals: PaymentItem[];
    budgets: PaymentItem[];
  };
}

/**
 * Fetch all payment items from all sources
 */
export async function fetchAllPaymentItems(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<PaymentItem[]> {
  const today = new Date();
  const start = startDate || today.toISOString().split('T')[0];
  const endDateObj = endDate ? new Date(endDate) : new Date();
  endDateObj.setDate(endDateObj.getDate() + 90); // Default: next 90 days
  const end = endDate || endDateObj.toISOString().split('T')[0];

  const items: PaymentItem[] = [];

  try {
    // 1. Fetch Bills (including payment bills)
    const bills = await fetchBills(userId, {
      startDate: start,
      endDate: end,
    }, true); // Include payment bills

    for (const bill of bills) {
      const status = calculateBillStatus(bill);
      
      // Skip paid, cancelled, skipped bills unless they're recent
      if (['paid', 'cancelled', 'skipped'].includes(status)) {
        const billDate = new Date(bill.due_date);
        const daysDiff = Math.floor((today.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 7) continue; // Only show recent paid bills
      }

      // Get category if available
      let category;
      if (bill.category_id) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id, name')
          .eq('id', bill.category_id)
          .single();
        category = cat;
      }

      // Get account if available
      let account;
      if (bill.linked_account_id) {
        const { data: acc } = await supabase
          .from('accounts')
          .select('id, name')
          .eq('id', bill.linked_account_id)
          .single();
        account = acc;
      }

      items.push({
        id: bill.id,
        type: 'bill',
        title: bill.title,
        description: bill.description || undefined,
        amount: bill.amount || 0,
        currency: bill.currency || DEFAULT_CURRENCY,
        dueDate: bill.due_date,
        status: status as PaymentItem['status'],
        category: category ? { id: category.id, name: category.name } : undefined,
        account: account ? { id: account.id, name: account.name } : undefined,
        metadata: {
          bill_id: bill.id,
          is_auto_pay: bill.bill_type === 'recurring_fixed' || bill.bill_type === 'recurring_variable',
        },
        color: bill.color,
        icon: bill.icon,
        priority: status === 'overdue' ? 'high' : status === 'due_today' ? 'high' : 'medium',
      });
    }

    // 2. Fetch Liability Schedules
    const startDateObj = new Date(start);
    const endDateObj = new Date(end);
    const liabilitySchedules = await fetchUpcomingSchedules(startDateObj, endDateObj);

    for (const schedule of liabilitySchedules) {
      // Get liability details
      const { data: liability } = await supabase
        .from('liabilities')
        .select('title, currency, color, icon, category_id')
        .eq('id', schedule.liability_id)
        .single();

      if (!liability) continue;

      // Get category if available
      let category;
      if (liability.category_id) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id, name')
          .eq('id', liability.category_id)
          .single();
        category = cat;
      }

      const status = schedule.status === 'paid' ? 'paid' :
                     schedule.status === 'skipped' ? 'skipped' :
                     new Date(schedule.due_date) < today ? 'overdue' :
                     schedule.due_date === today.toISOString().split('T')[0] ? 'due_today' :
                     'upcoming';

      // Extract payment details from metadata if available
      const metadata = schedule.metadata || {};
      const paymentNumber = metadata.payment_number;
      const principalAmount = metadata.principal_amount;
      const interestAmount = metadata.interest_amount;

      items.push({
        id: schedule.id,
        type: 'liability',
        title: `${liability.title}${paymentNumber ? ` - Payment ${paymentNumber}` : ''}`.trim(),
        description: principalAmount !== undefined && interestAmount !== undefined
          ? `Principal: ${principalAmount}, Interest: ${interestAmount}`
          : undefined,
        amount: schedule.amount || 0,
        currency: liability.currency || DEFAULT_CURRENCY,
        dueDate: schedule.due_date,
        status: status,
        category: category ? { id: category.id, name: category.name } : undefined,
        metadata: {
          liability_id: schedule.liability_id,
          payment_number: paymentNumber,
          principal_amount: principalAmount,
          interest_amount: interestAmount,
        },
        color: liability.color,
        icon: liability.icon || 'card',
        priority: status === 'overdue' ? 'high' : status === 'due_today' ? 'high' : 'medium',
      });
    }

    // 3. Fetch Recurring Transactions and generate cycles
    const recurringTransactions = await getRecurringTransactions(userId, {
      status: 'active',
    });

    for (const recurring of recurringTransactions) {
      if (recurring.status !== 'active' || !recurring.is_active) continue;

      // Generate cycles for this recurring transaction
      const cycles = generateCyclesForRecurringTransaction(recurring as RecurringTransaction);
      
      // Filter cycles within date range
      const relevantCycles = cycles.filter(cycle => {
        const cycleDate = new Date(cycle.expectedDate);
        const startDateObj = new Date(start);
        const endDateObj = new Date(end);
        return cycleDate >= startDateObj && cycleDate <= endDateObj;
      });

      for (const cycle of relevantCycles) {
        // Get category if available
        let category;
        if (recurring.category_id) {
          const { data: cat } = await supabase
            .from('categories')
            .select('id, name')
            .eq('id', recurring.category_id)
            .single();
          category = cat;
        }

        // Get account if available
        let account;
        if (recurring.account_id) {
          const { data: acc } = await supabase
            .from('accounts')
            .select('id, name')
            .eq('id', recurring.account_id)
            .single();
          account = acc;
        }

        const cycleDate = new Date(cycle.expectedDate);
        const todayDate = new Date(today.toISOString().split('T')[0]);
        const status = cycleDate < todayDate ? 'overdue' :
                      cycleDate.toISOString().split('T')[0] === today.toISOString().split('T')[0] ? 'due_today' :
                      'upcoming';

        items.push({
          id: `recurring-${recurring.id}-${cycle.cycleNumber}`,
          type: 'recurring',
          title: recurring.title,
          description: recurring.description || `Cycle ${cycle.cycleNumber}`,
          amount: cycle.expectedAmount || recurring.amount || 0,
          currency: recurring.currency || DEFAULT_CURRENCY,
          dueDate: cycle.expectedDate,
          status: status,
          direction: recurring.direction,
          category: category ? { id: category.id, name: category.name } : undefined,
          account: account ? { id: account.id, name: account.name } : undefined,
          metadata: {
            recurring_transaction_id: recurring.id,
            cycle_number: cycle.cycleNumber,
            is_subscription: recurring.is_subscription,
            is_auto_pay: recurring.auto_create,
            direction: recurring.direction,
          },
          color: recurring.color,
          icon: recurring.icon || 'repeat',
          priority: status === 'overdue' ? 'high' : status === 'due_today' ? 'high' : 'low',
        });
      }
    }

    // 4. Fetch Goals with upcoming target dates
    const { data: goals } = await supabase
      .from('goals')
      .select('id, title, target_amount, current_amount, target_date, currency, color, icon, category_id, is_achieved')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .not('target_date', 'is', null)
      .gte('target_date', start)
      .lte('target_date', end);

    if (goals) {
      for (const goal of goals) {
        if (goal.is_achieved) continue;

        const remaining = goal.target_amount - goal.current_amount;
        if (remaining <= 0) continue;

        // Get category if available
        let category;
        if (goal.category_id) {
          const { data: cat } = await supabase
            .from('categories')
            .select('id, name')
            .eq('id', goal.category_id)
            .single();
          category = cat;
        }

        const goalDate = new Date(goal.target_date!);
        const todayDate = new Date(today.toISOString().split('T')[0]);
        const status = goalDate < todayDate ? 'overdue' :
                      goalDate.toISOString().split('T')[0] === today.toISOString().split('T')[0] ? 'due_today' :
                      'upcoming';

        items.push({
          id: `goal-${goal.id}`,
          type: 'goal_contribution',
          title: `${goal.title} - Target`,
          description: `Remaining: ${remaining.toFixed(2)}`,
          amount: remaining,
          currency: goal.currency || DEFAULT_CURRENCY,
          dueDate: goal.target_date!,
          status: status,
          category: category ? { id: category.id, name: category.name } : undefined,
          metadata: {
            goal_id: goal.id,
          },
          color: goal.color,
          icon: goal.icon || 'flag',
          priority: 'low',
        });
      }
    }

    // 5. Fetch Budgets with upcoming end dates (for reflections)
    const { data: budgets } = await supabase
      .from('budgets')
      .select('id, name, amount, spent_amount, end_date, currency, color, icon, category_id, is_active')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .not('end_date', 'is', null)
      .gte('end_date', start)
      .lte('end_date', end)
      .eq('is_active', true);

    if (budgets) {
      for (const budget of budgets) {
        // Get category if available
        let category;
        if (budget.category_id) {
          const { data: cat } = await supabase
            .from('categories')
            .select('id, name')
            .eq('id', budget.category_id)
            .single();
          category = cat;
        }

        const budgetDate = new Date(budget.end_date!);
        const todayDate = new Date(today.toISOString().split('T')[0]);
        const status = budgetDate < todayDate ? 'overdue' :
                      budgetDate.toISOString().split('T')[0] === today.toISOString().split('T')[0] ? 'due_today' :
                      'upcoming';

        items.push({
          id: `budget-${budget.id}`,
          type: 'budget_reflection',
          title: `${budget.name} - Review`,
          description: `Spent: ${budget.spent_amount || 0} / ${budget.amount}`,
          amount: budget.amount - (budget.spent_amount || 0),
          currency: budget.currency || DEFAULT_CURRENCY,
          dueDate: budget.end_date!,
          status: status,
          category: category ? { id: category.id, name: category.name } : undefined,
          metadata: {
            budget_id: budget.id,
          },
          color: budget.color,
          icon: budget.icon || 'pie-chart',
          priority: 'low',
        });
      }
    }

    return items;
  } catch (error) {
    console.error('Error fetching payment items:', error);
    throw error;
  }
}

/**
 * Organize payment items by date in hierarchical order
 */
export function organizePaymentsByDate(items: PaymentItem[]): PaymentDay[] {
  // Group items by date
  const itemsByDate: Record<string, PaymentItem[]> = {};

  for (const item of items) {
    const dateKey = item.dueDate;
    if (!itemsByDate[dateKey]) {
      itemsByDate[dateKey] = [];
    }
    itemsByDate[dateKey].push(item);
  }

  // Convert to PaymentDay array
  const days: PaymentDay[] = Object.keys(itemsByDate)
    .sort() // Sort dates ascending
    .map(date => {
      const dayItems = itemsByDate[date];
      
      // Sort items by priority and status
      dayItems.sort((a, b) => {
        // First by status (overdue > due_today > upcoming > paid)
        const statusOrder = { overdue: 0, due_today: 1, upcoming: 2, paid: 3, skipped: 4, completed: 5 };
        const statusDiff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
        if (statusDiff !== 0) return statusDiff;

        // Then by priority (high > medium > low)
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = (priorityOrder[a.priority || 'medium'] || 99) - (priorityOrder[b.priority || 'medium'] || 99);
        if (priorityDiff !== 0) return priorityDiff;

        // Then by amount (descending)
        return b.amount - a.amount;
      });

      const dateObj = new Date(date);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

      const totalAmount = dayItems.reduce((sum, item) => sum + item.amount, 0);
      const paidAmount = dayItems
        .filter(item => item.status === 'paid' || item.status === 'completed')
        .reduce((sum, item) => sum + item.amount, 0);
      const dueAmount = dayItems
        .filter(item => ['upcoming', 'due_today', 'overdue'].includes(item.status))
        .reduce((sum, item) => sum + item.amount, 0);

      return {
        date,
        dayName,
        items: dayItems,
        totalAmount,
        paidAmount,
        dueAmount,
        overdueCount: dayItems.filter(item => item.status === 'overdue').length,
        dueTodayCount: dayItems.filter(item => item.status === 'due_today').length,
        upcomingCount: dayItems.filter(item => item.status === 'upcoming').length,
      };
    });

  return days;
}

/**
 * Get complete payment dashboard data
 */
export async function getPaymentDashboard(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<PaymentDashboardData> {
  const items = await fetchAllPaymentItems(userId, startDate, endDate);
  const days = organizePaymentsByDate(items);

  // Calculate summary
  const summary = {
    totalUpcoming: items.filter(item => item.status === 'upcoming').length,
    totalDueToday: items.filter(item => item.status === 'due_today').length,
    totalOverdue: items.filter(item => item.status === 'overdue').length,
    totalPaid: items.filter(item => item.status === 'paid' || item.status === 'completed').length,
    totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
    totalPaidAmount: items
      .filter(item => item.status === 'paid' || item.status === 'completed')
      .reduce((sum, item) => sum + item.amount, 0),
    totalDueAmount: items
      .filter(item => ['upcoming', 'due_today', 'overdue'].includes(item.status))
      .reduce((sum, item) => sum + item.amount, 0),
    nextPaymentDate: days.find(day => day.dueAmount > 0)?.date,
    nextPaymentAmount: days.find(day => day.dueAmount > 0)?.dueAmount,
  };

  // Group by type
  const byType = {
    recurring: items.filter(item => item.type === 'recurring'),
    liabilities: items.filter(item => item.type === 'liability'),
    bills: items.filter(item => item.type === 'bill'),
    goals: items.filter(item => item.type === 'goal_contribution'),
    budgets: items.filter(item => item.type === 'budget_reflection'),
  };

  return {
    days,
    summary,
    byType,
  };
}

