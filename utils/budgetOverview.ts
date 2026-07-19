/**
 * Budget Overview Utility
 *
 * Calculates budget status and spending pace for a given period.
 */

import { supabase } from '@/lib/supabase';
import type { OverviewPeriod, BudgetOverviewItem as MonthlyBudgetOverviewItem } from './monthlyOverview';

export interface BudgetRecord {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  spent_amount: number;
  start_date: string;
  end_date: string | null;
  period_type: string | null;
  is_active: boolean;
  is_deleted?: boolean;
  color?: string | null;
  icon?: string | null;
  metadata?: any;
}

export interface BudgetOverviewItem {
  id: string;
  name: string;
  amount: number;
  spentAmount: number;
  remainingAmount: number;
  progress: number; // 0-1
  statusColor: 'green' | 'yellow' | 'red';
  startDate: string;
  endDate: string | null;
  periodType: string | null;
  color?: string | null;
  icon?: string | null;
  metadata?: any;
}

/**
 * Fetch budgets that overlap with the given period.
 */
export async function getActiveBudgetsForPeriod(
  userId: string,
  startDate: string,
  endDate: string
): Promise<BudgetRecord[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    // Overlap condition: NOT (budget_end < period_start OR budget_start > period_end)
    .or(
      `and(end_date.gte.${startDate},start_date.lte.${endDate}),and(end_date.is.null,start_date.lte.${endDate})`
    )
    .order('start_date', { ascending: true });

  if (error) {
    console.error('Error fetching budgets for period:', error);
    return [];
  }

  return (data || []) as BudgetRecord[];
}

/**
 * Calculate status color based on utilization.
 *
 * - < 80% used → green
 * - 80%-100% used → yellow
 * - > 100% used → red
 */
export function getBudgetStatusColor(budget: {
  amount: number;
  spent_amount: number;
}): 'green' | 'yellow' | 'red' {
  if (!budget.amount || budget.amount <= 0) return 'green';
  const utilization = budget.spent_amount / budget.amount;

  if (utilization < 0.8) return 'green';
  if (utilization <= 1.0) return 'yellow';
  return 'red';
}

/**
 * Build overview items from raw budget records.
 */
export async function getBudgetOverviewItems(
  budgets: BudgetRecord[]
): Promise<BudgetOverviewItem[]> {
  return budgets.map((budget) => {
    const amount = budget.amount || 0;
    const spentAmount = budget.spent_amount || 0;
    const remainingAmount = Math.max(0, amount - spentAmount);
    const progress = amount > 0 ? spentAmount / amount : 0;
    const statusColor = getBudgetStatusColor(budget);

    return {
      id: budget.id,
      name: budget.name,
      amount,
      spentAmount,
      remainingAmount,
      progress,
      statusColor,
      startDate: budget.start_date,
      endDate: budget.end_date,
      periodType: budget.period_type,
      color: budget.color,
      icon: budget.icon,
      metadata: budget.metadata,
    };
  });
}

export type { BudgetOverviewItem as BudgetOverviewItemForMonthly };

