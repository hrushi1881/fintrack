/**
 * Goal Contribution Calculator
 *
 * Calculates recommended monthly contributions for goals with target dates.
 */

import { supabase } from '@/lib/supabase';
import { calculateMonthlyNeed } from './goals';

export interface GoalContributionItem {
  goalId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  monthlyContributionNeeded: number;
  monthsRemaining: number;
  progress: number; // 0-1
  currency: string;
  color?: string | null;
  icon?: string | null;
}

/**
 * Returns contribution overview for goals whose target dates fall within (or near) the period.
 *
 * For now we include:
 * - goals with a non-null target_date
 * - target_date between startDate and endDate (inclusive)
 */
export async function getGoalContributionOverview(
  userId: string,
  startDate: string,
  endDate: string
): Promise<GoalContributionItem[]> {
  const { data, error } = await supabase
    .from('goals')
    .select(
      'id, title, target_amount, current_amount, target_date, currency, color, icon, is_deleted, is_archived'
    )
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .eq('is_archived', false)
    .not('target_date', 'is', null)
    .gte('target_date', startDate)
    .lte('target_date', endDate)
    .order('target_date', { ascending: true });

  if (error) {
    console.error('Error fetching goals for contribution overview:', error);
    return [];
  }

  const goals = data || [];

  return goals.map((goal) => {
    const targetAmount = goal.target_amount || 0;
    const currentAmount = goal.current_amount || 0;
    const targetDate = goal.target_date as string | null;

    const monthlyNeed = calculateMonthlyNeed(
      currentAmount,
      targetAmount,
      targetDate || undefined
    );

    const monthsRemaining = calculateMonthsRemaining(targetDate);

    const progress =
      targetAmount > 0 ? Math.min(1, currentAmount / targetAmount) : 0;

    return {
      goalId: goal.id,
      title: goal.title,
      targetAmount,
      currentAmount,
      targetDate,
      monthlyContributionNeeded: round2(monthlyNeed || 0),
      monthsRemaining,
      progress,
      currency: goal.currency || 'INR',
      color: goal.color,
      icon: goal.icon,
    };
  });
}

function calculateMonthsRemaining(targetDate: string | null): number {
  if (!targetDate) return 0;
  const now = new Date();
  const target = new Date(targetDate);
  if (target <= now) return 0;

  const years = target.getFullYear() - now.getFullYear();
  const months = target.getMonth() - now.getMonth();
  const totalMonths = years * 12 + months + (target.getDate() > now.getDate() ? 1 : 0);

  return Math.max(0, totalMonths);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

