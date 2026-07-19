/**
 * Monthly / Period Overview Utility
 *
 * Aggregates all scheduled financial activity for a selected period:
 * - Recurring transaction payments
 * - Liability payments
 * - Goal contributions
 * - Budget overview
 * - Deadlines & new obligations
 */

import { PaymentScheduleItem, fetchAllPaymentSchedules } from './paymentScheduleDashboard';
import { getActiveBudgetsForPeriod, getBudgetOverviewItems, BudgetOverviewItem } from './budgetOverview';
import { getGoalContributionOverview, GoalContributionItem } from './goalContributionCalculator';
import { extractDeadlines, DeadlineItem } from './deadlinesExtractor';

export interface OverviewPeriod {
  startDate: string; // inclusive, YYYY-MM-DD
  endDate: string; // inclusive, YYYY-MM-DD
  label?: string;
}

export interface MonthlyOverviewSummary {
  totalScheduledOutflows: number;
  totalBudgetRemaining: number;
  goalContributionNeeded: number;
  netCashFlow: number; // incomeTotal - expenseTotal
  incomeTotal: number;
  expenseTotal: number;
}

export interface MonthlyOverviewData {
  period: { start: string; end: string; label?: string };
  summary: MonthlyOverviewSummary;
  // Unified list of ALL payments sorted chronologically
  allPayments: PaymentScheduleItem[]; // Sorted by due_date ascending
  // Convenience subsets
  scheduledPayments: PaymentScheduleItem[]; // Recurring transactions only
  liabilityPayments: PaymentScheduleItem[]; // Liabilities only
  goalContributions: GoalContributionItem[]; // Goals only (aggregated view)
  budgets: BudgetOverviewItem[];
  deadlines: DeadlineItem[];
}

/**
 * Main aggregation function for the Monthly / Period Overview.
 *
 * NOTE:
 * - Does NOT filter out any payments by default within the period
 * - Ensures allPayments is chronologically sorted by due_date
 */
export async function fetchMonthlyOverviewData(
  userId: string,
  period: OverviewPeriod
): Promise<MonthlyOverviewData> {
  const { startDate, endDate, label } = period;

  // Load major slices in parallel for speed
  const [allPaymentsRaw, activeBudgets, goalOverviewItems, deadlines] =
    await Promise.all([
      fetchAllPaymentSchedules(userId, {
        start_date: startDate,
        end_date: endDate,
      }),
      getActiveBudgetsForPeriod(userId, startDate, endDate),
      getGoalContributionOverview(userId, startDate, endDate),
      extractDeadlines(userId, { startDate, endDate }),
    ]);

  const allPayments = [...allPaymentsRaw];

  // allPayments from fetchAllPaymentSchedules are already sorted by due_date,
  // but we defensively sort again to guarantee ordering.
  allPayments.sort((a, b) => {
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  // Split by source type for convenience
  const scheduledPayments = allPayments.filter(
    (p) => p.source_type === 'recurring_transaction'
  );
  const liabilityPayments = allPayments.filter((p) => p.source_type === 'liability');

  // Budgets overview for period (pure in-memory on already-fetched budgets)
  const budgetOverviewItems = await getBudgetOverviewItems(activeBudgets);

  // 6. Summary calculations
  const { incomeTotal, expenseTotal } = calculateIncomeAndExpenses(allPayments, liabilityPayments);
  const netCashFlow = incomeTotal - expenseTotal;

  const totalBudgetRemaining = budgetOverviewItems.reduce(
    (sum, b) => sum + (b.remainingAmount ?? 0),
    0
  );

  const goalContributionNeeded = goalOverviewItems.reduce(
    (sum, g) => sum + (g.monthlyContributionNeeded ?? 0),
    0
  );

  const totalScheduledOutflows = expenseTotal;

  const summary: MonthlyOverviewSummary = {
    totalScheduledOutflows: round2(totalScheduledOutflows),
    totalBudgetRemaining: round2(totalBudgetRemaining),
    goalContributionNeeded: round2(goalContributionNeeded),
    netCashFlow: round2(netCashFlow),
    incomeTotal: round2(incomeTotal),
    expenseTotal: round2(expenseTotal),
  };

  return {
    period: { start: startDate, end: endDate, label },
    summary,
    allPayments,
    scheduledPayments,
    liabilityPayments,
    goalContributions: goalOverviewItems,
    budgets: budgetOverviewItems,
    deadlines,
  };
}

/**
 * Calculate income and expense totals for the period.
 *
 * Rules:
 * - Recurring transactions with metadata.direction === 'income' → income
 * - Recurring transactions with metadata.direction === 'expense' → expense
 * - Liabilities are always expenses (outflows)
 * - Goal schedules are always expenses (contributions out of cash)
 */
function calculateIncomeAndExpenses(
  allPayments: PaymentScheduleItem[],
  liabilityPayments: PaymentScheduleItem[]
): { incomeTotal: number; expenseTotal: number } {
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const payment of allPayments) {
    const isLiability = payment.source_type === 'liability';
    const isGoal = payment.source_type === 'goal_schedule';
    const direction = payment.metadata?.direction as 'income' | 'expense' | undefined;

    if (direction === 'income') {
      incomeTotal += payment.amount || 0;
    } else if (isLiability || isGoal || direction === 'expense') {
      expenseTotal += payment.amount || 0;
    }
  }

  // Ensure liability payments are fully counted as expenses even if metadata is missing
  if (liabilityPayments.length > 0) {
    const liabilityTotal = liabilityPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    // Liability payments are likely already in allPayments loop,
    // so do not double-count here; this block is only defensive.
    // If needed in the future, we could reconcile, but for now we assume
    // allPayments contains the correct amounts for liabilities.
  }

  return { incomeTotal, expenseTotal };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type { BudgetOverviewItem, GoalContributionItem, DeadlineItem };

