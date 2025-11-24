/**
 * Budget Recurrence Helpers
 * Utilities for managing budget periods using the recurrence engine
 */

import { Budget } from '@/types';
import { 
  RecurrenceDefinition,
  calculateNextOccurrence,
  generateSchedule,
  calculateStatus as calculateRecurrenceStatus,
  getDaysUntil
} from '@/utils/recurrence';

/**
 * Convert budget recurrence_pattern to recurrence definition
 */
export function budgetToRecurrenceDefinition(budget: Budget): RecurrenceDefinition | null {
  if (!budget.recurrence_pattern) {
    return null;
  }

  // Map budget recurrence_pattern to recurrence frequency
  let frequency: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom' = 'month';
  
  switch (budget.recurrence_pattern) {
    case 'weekly':
      frequency = 'week';
      break;
    case 'monthly':
      frequency = 'month';
      break;
    case 'yearly':
      frequency = 'year';
      break;
    case 'custom':
      frequency = 'custom';
      break;
    default:
      frequency = 'month';
  }

  return {
    frequency,
    interval: 1, // Budgets typically repeat every period
    start_date: budget.start_date,
    end_date: budget.end_date,
  };
}

/**
 * Calculate next budget period start date
 */
export function calculateNextBudgetPeriod(budget: Budget, fromDate?: string): string | null {
  const def = budgetToRecurrenceDefinition(budget);
  if (!def) {
    return null;
  }

  const from = fromDate || budget.start_date;
  return calculateNextOccurrence(def, from);
}

/**
 * Generate all budget periods in a date range
 */
export function generateBudgetPeriods(
  budget: Budget,
  startDate: string,
  endDate: string
): Array<{ startDate: string; endDate: string; status: string }> {
  const def = budgetToRecurrenceDefinition(budget);
  if (!def) {
    return [{
      startDate: budget.start_date,
      endDate: budget.end_date,
      status: calculateBudgetPeriodStatus(budget),
    }];
  }

  const occurrences = generateSchedule(def, {
    startDate,
    endDate,
    currentDate: new Date().toISOString().split('T')[0],
  });

  // Convert occurrences to periods
  // Each occurrence is the start of a period
  // Period duration depends on frequency
  const periods: Array<{ startDate: string; endDate: string; status: string }> = [];

  for (let i = 0; i < occurrences.length; i++) {
    const occurrence = occurrences[i];
    const periodStart = occurrence.date;
    
    // Calculate period end date based on frequency
    let periodEnd: string;
    if (i < occurrences.length - 1) {
      // Next occurrence is the end of this period
      periodEnd = new Date(occurrences[i + 1].date);
      periodEnd.setDate(periodEnd.getDate() - 1); // Day before next period starts
      periodEnd = periodEnd.toISOString().split('T')[0];
    } else {
      // Last period - use budget end_date or calculate from frequency
      const periodEndDate = new Date(periodStart);
      switch (def.frequency) {
        case 'week':
          periodEndDate.setDate(periodEndDate.getDate() + 6); // 7-day period
          break;
        case 'month':
          periodEndDate.setMonth(periodEndDate.getMonth() + 1);
          periodEndDate.setDate(periodEndDate.getDate() - 1); // Last day of month
          break;
        case 'quarter':
          periodEndDate.setMonth(periodEndDate.getMonth() + 3);
          periodEndDate.setDate(periodEndDate.getDate() - 1); // Last day of quarter
          break;
        case 'year':
          periodEndDate.setFullYear(periodEndDate.getFullYear() + 1);
          periodEndDate.setDate(periodEndDate.getDate() - 1); // Last day of year
          break;
        default:
          periodEndDate.setMonth(periodEndDate.getMonth() + 1);
          periodEndDate.setDate(periodEndDate.getDate() - 1);
      }
      periodEnd = periodEndDate.toISOString().split('T')[0];
      if (budget.end_date && periodEnd > budget.end_date) {
        periodEnd = budget.end_date;
      }
    }

    periods.push({
      startDate: periodStart,
      endDate: periodEnd,
      status: occurrence.status,
    });
  }

  return periods;
}

/**
 * Calculate budget period status (active, upcoming, expired)
 */
export function calculateBudgetPeriodStatus(budget: Budget): string {
  const today = new Date().toISOString().split('T')[0];
  const startDate = budget.start_date;
  const endDate = budget.end_date;

  // Check if period is active
  if (today >= startDate && today <= endDate) {
    return 'active';
  }

  // Check if period is upcoming
  if (today < startDate) {
    return 'upcoming';
  }

  // Period has expired
  return 'expired';
}

/**
 * Check if budget period is about to end (for notifications)
 */
export function isBudgetPeriodEndingSoon(budget: Budget, daysBefore: number = 3): boolean {
  const today = new Date();
  const endDate = new Date(budget.end_date);
  
  const daysUntilEnd = getDaysUntil(budget.end_date, today.toISOString().split('T')[0]);
  
  return daysUntilEnd >= 0 && daysUntilEnd <= daysBefore;
}

/**
 * Get current budget period
 */
export function getCurrentBudgetPeriod(budget: Budget): { startDate: string; endDate: string; status: string } | null {
  const def = budgetToRecurrenceDefinition(budget);
  if (!def) {
    return {
      startDate: budget.start_date,
      endDate: budget.end_date,
      status: calculateBudgetPeriodStatus(budget),
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const periods = generateBudgetPeriods(budget, budget.start_date, budget.end_date || '2099-12-31');

  // Find current period
  for (const period of periods) {
    if (today >= period.startDate && today <= period.endDate) {
      return period;
    }
  }

  return null;
}

