/**
 * Deadlines & Obligations Extractor
 *
 * Extracts important upcoming deadlines and obligations from:
 * - Recurring transactions
 * - Goals with target dates
 * - Liabilities with payoff dates
 * - Budgets with end dates
 */

import { supabase } from '@/lib/supabase';

export type DeadlineType =
  | 'recurring_start'
  | 'goal_target'
  | 'liability_payoff'
  | 'budget_end';

export interface DeadlineItem {
  id: string;
  type: DeadlineType;
  title: string;
  date: string;
  description?: string | null;
  sourceId: string;
  sourceType: 'recurring_transaction' | 'goal' | 'liability' | 'budget';
  metadata?: any;
}

export interface DeadlinePeriod {
  startDate: string;
  endDate: string;
}

export async function extractDeadlines(
  userId: string,
  period: DeadlinePeriod
): Promise<DeadlineItem[]> {
  const { startDate, endDate } = period;

  const [recurring, goals, liabilities, budgets] = await Promise.all([
    fetchRecurringStarts(userId, startDate, endDate),
    fetchGoalTargets(userId, startDate, endDate),
    fetchLiabilityPayoffs(userId, startDate, endDate),
    fetchBudgetEnds(userId, startDate, endDate),
  ]);

  const all: DeadlineItem[] = [...recurring, ...goals, ...liabilities, ...budgets];

  all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return all;
}

async function fetchRecurringStarts(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DeadlineItem[]> {
  const { data, error } = await supabase
    .from('recurring_transactions')
    .select('id, name, description, start_date, status, type')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('start_date', startDate)
    .lte('start_date', endDate);

  if (error) {
    console.error('Error fetching recurring deadlines:', error);
    return [];
  }

  return (data || []).map((r) => ({
    id: `recurring_start_${r.id}`,
    type: 'recurring_start',
    title: r.name || 'Recurring Transaction',
    date: r.start_date,
    description: r.description,
    sourceId: r.id,
    sourceType: 'recurring_transaction',
    metadata: {
      status: r.status,
      type: r.type,
    },
  }));
}

async function fetchGoalTargets(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DeadlineItem[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('id, title, description, target_date, target_amount, current_amount, is_deleted, is_archived')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .eq('is_archived', false)
    .not('target_date', 'is', null)
    .gte('target_date', startDate)
    .lte('target_date', endDate);

  if (error) {
    console.error('Error fetching goal deadlines:', error);
    return [];
  }

  return (data || []).map((g) => ({
    id: `goal_target_${g.id}`,
    type: 'goal_target',
    title: g.title,
    date: g.target_date,
    description: g.description,
    sourceId: g.id,
    sourceType: 'goal',
    metadata: {
      targetAmount: g.target_amount,
      currentAmount: g.current_amount,
    },
  }));
}

async function fetchLiabilityPayoffs(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DeadlineItem[]> {
  const { data, error } = await supabase
    .from('liabilities')
    .select(
      'id, title, description, targeted_payoff_date, current_balance, status, is_deleted'
    )
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .eq('status', 'active')
    .not('targeted_payoff_date', 'is', null)
    .gte('targeted_payoff_date', startDate)
    .lte('targeted_payoff_date', endDate);

  if (error) {
    console.error('Error fetching liability deadlines:', error);
    return [];
  }

  return (data || []).map((l) => ({
    id: `liability_payoff_${l.id}`,
    type: 'liability_payoff',
    title: l.title,
    date: l.targeted_payoff_date,
    description: l.description,
    sourceId: l.id,
    sourceType: 'liability',
    metadata: {
      currentBalance: l.current_balance,
      status: l.status,
    },
  }));
}

async function fetchBudgetEnds(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DeadlineItem[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, name, end_date, amount, spent_amount, is_active, is_deleted')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .not('end_date', 'is', null)
    .gte('end_date', startDate)
    .lte('end_date', endDate);

  if (error) {
    console.error('Error fetching budget deadlines:', error);
    return [];
  }

  return (data || []).map((b) => ({
    id: `budget_end_${b.id}`,
    type: 'budget_end',
    title: b.name,
    date: b.end_date,
    description: null,
    sourceId: b.id,
    sourceType: 'budget',
    metadata: {
      amount: b.amount,
      spentAmount: b.spent_amount,
    },
  }));
}

