/**
 * Schedule Visualization Utilities
 * Provides formatting, grouping, and visualization helpers for payment schedules
 */

import { PaymentScheduleItem, ScheduleOverview } from './paymentScheduleDashboard';
import { Cycle } from './cycles';

export interface GroupedSchedules {
  today: PaymentScheduleItem[];
  tomorrow: PaymentScheduleItem[];
  thisWeek: PaymentScheduleItem[];
  nextWeek: PaymentScheduleItem[];
  thisMonth: PaymentScheduleItem[];
  later: PaymentScheduleItem[];
  overdue: PaymentScheduleItem[];
}

export interface ScheduleByDate {
  date: string;
  dateLabel: string;
  schedules: PaymentScheduleItem[];
  totalAmount: number;
}

export interface ScheduleBySource {
  source_type: 'recurring_transaction' | 'liability' | 'goal_schedule';
  source_label: string;
  schedules: PaymentScheduleItem[];
  totalAmount: number;
  count: number;
}

/**
 * Group schedules by time periods
 */
export function groupSchedulesByPeriod(
  schedules: PaymentScheduleItem[]
): GroupedSchedules {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - today.getDay()));

  const nextWeekStart = new Date(endOfWeek);
  nextWeekStart.setDate(nextWeekStart.getDate() + 1);

  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const grouped: GroupedSchedules = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    thisMonth: [],
    later: [],
    overdue: [],
  };

  for (const schedule of schedules) {
    const dueDate = new Date(schedule.due_date);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today) {
      grouped.overdue.push(schedule);
    } else if (dueDate.getTime() === today.getTime()) {
      grouped.today.push(schedule);
    } else if (dueDate.getTime() === tomorrow.getTime()) {
      grouped.tomorrow.push(schedule);
    } else if (dueDate > tomorrow && dueDate <= endOfWeek) {
      grouped.thisWeek.push(schedule);
    } else if (dueDate > endOfWeek && dueDate <= nextWeekEnd) {
      grouped.nextWeek.push(schedule);
    } else if (dueDate > nextWeekEnd && dueDate <= endOfMonth) {
      grouped.thisMonth.push(schedule);
    } else {
      grouped.later.push(schedule);
    }
  }

  return grouped;
}

/**
 * Group schedules by date
 */
export function groupSchedulesByDate(
  schedules: PaymentScheduleItem[]
): ScheduleByDate[] {
  const grouped = new Map<string, PaymentScheduleItem[]>();

  for (const schedule of schedules) {
    const date = schedule.due_date;
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(schedule);
  }

  const result: ScheduleByDate[] = [];
  const sortedDates = Array.from(grouped.keys()).sort();

  for (const date of sortedDates) {
    const schedulesForDate = grouped.get(date)!;
    const totalAmount = schedulesForDate.reduce((sum, s) => sum + s.amount, 0);

    result.push({
      date,
      dateLabel: formatDateLabel(date),
      schedules: schedulesForDate,
      totalAmount: Math.round(totalAmount * 100) / 100,
    });
  }

  return result;
}

/**
 * Group schedules by source type
 */
export function groupSchedulesBySource(
  schedules: PaymentScheduleItem[]
): ScheduleBySource[] {
  const grouped = new Map<string, PaymentScheduleItem[]>();

  for (const schedule of schedules) {
    const sourceType = schedule.source_type;
    if (!grouped.has(sourceType)) {
      grouped.set(sourceType, []);
    }
    grouped.get(sourceType)!.push(schedule);
  }

  const sourceLabels: Record<string, string> = {
    recurring_transaction: 'Recurring Transactions',
    liability: 'Liabilities',
    goal_schedule: 'Goal Contributions',
  };

  const result: ScheduleBySource[] = [];

  for (const [sourceType, schedulesForSource] of grouped.entries()) {
    const totalAmount = schedulesForSource.reduce((sum, s) => sum + s.amount, 0);

    result.push({
      source_type: sourceType as any,
      source_label: sourceLabels[sourceType] || sourceType,
      schedules: schedulesForSource,
      totalAmount: Math.round(totalAmount * 100) / 100,
      count: schedulesForSource.length,
    });
  }

  // Sort by total amount descending
  result.sort((a, b) => b.totalAmount - a.totalAmount);

  return result;
}

/**
 * Format date label (Today, Tomorrow, or formatted date)
 */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  date.setHours(0, 0, 0, 0);

  if (date.getTime() === today.getTime()) {
    return 'Today';
  } else if (date.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  } else if (date < today) {
    const daysAgo = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo === 1) return 'Yesterday';
    if (daysAgo < 7) return `${daysAgo} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } else {
    const daysUntil = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'paid_on_time':
    case 'paid_early':
      return '#10B981'; // Green
    case 'paid_late':
      return '#F59E0B'; // Amber
    case 'due_today':
      return '#3B82F6'; // Blue
    case 'overdue':
      return '#EF4444'; // Red
    case 'upcoming':
    default:
      return '#6B7280'; // Gray
  }
}

/**
 * Get status icon for UI
 */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'paid_on_time':
    case 'paid_early':
      return 'checkmark-circle';
    case 'paid_late':
      return 'time';
    case 'due_today':
      return 'alert-circle';
    case 'overdue':
      return 'warning';
    case 'upcoming':
    default:
      return 'calendar';
  }
}

/**
 * Get status label for UI
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'paid_on_time':
      return 'Paid on time';
    case 'paid_early':
      return 'Paid early';
    case 'paid_late':
      return 'Paid late';
    case 'due_today':
      return 'Due today';
    case 'overdue':
      return 'Overdue';
    case 'upcoming':
      return 'Upcoming';
    default:
      return status;
  }
}

/**
 * Get source type icon
 */
export function getSourceTypeIcon(sourceType: string): string {
  switch (sourceType) {
    case 'recurring_transaction':
      return 'repeat';
    case 'liability':
      return 'card';
    case 'goal_schedule':
      return 'target';
    default:
      return 'calendar';
  }
}

/**
 * Get source type label
 */
export function getSourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case 'recurring_transaction':
      return 'Recurring Transaction';
    case 'liability':
      return 'Liability Payment';
    case 'goal_schedule':
      return 'Goal Contribution';
    default:
      return sourceType;
  }
}

/**
 * Format cycle information for display
 */
export function formatCycleInfo(cycle: Cycle): {
  title: string;
  subtitle: string;
  status: string;
  color: string;
  icon: string;
} {
  const statusLabel = getStatusLabel(cycle.status);
  const statusColor = getStatusColor(cycle.status);
  const statusIcon = getStatusIcon(cycle.status);

  let subtitle = '';

  if (cycle.daysEarly) {
    subtitle = `${cycle.daysEarly} day${cycle.daysEarly > 1 ? 's' : ''} early`;
  } else if (cycle.daysLate) {
    subtitle = `${cycle.daysLate} day${cycle.daysLate > 1 ? 's' : ''} late`;
  } else if (cycle.status === 'upcoming') {
    const daysUntil = cycle.daysFromDue || 0;
    if (daysUntil === 0) {
      subtitle = 'Due today';
    } else if (daysUntil === 1) {
      subtitle = 'Due tomorrow';
    } else if (daysUntil > 0) {
      subtitle = `Due in ${daysUntil} days`;
    }
  } else {
    subtitle = statusLabel;
  }

  return {
    title: statusLabel,
    subtitle,
    status: cycle.status,
    color: statusColor,
    icon: statusIcon,
  };
}

/**
 * Calculate payment streak (consecutive on-time payments)
 */
export function calculatePaymentStreak(cycles: Cycle[]): {
  currentStreak: number;
  longestStreak: number;
  lastPaymentDate?: string;
} {
  // Sort cycles by cycle number
  const sortedCycles = [...cycles].sort((a, b) => a.cycleNumber - b.cycleNumber);

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastPaymentDate: string | undefined;

  // Calculate current streak (from most recent backwards)
  for (let i = sortedCycles.length - 1; i >= 0; i--) {
    const cycle = sortedCycles[i];
    if (
      cycle.status === 'paid_on_time' ||
      cycle.status === 'paid_early' ||
      cycle.status === 'paid_within_window'
    ) {
      currentStreak++;
      if (!lastPaymentDate) {
        lastPaymentDate = cycle.actualDate;
      }
    } else if (cycle.status !== 'upcoming') {
      break;
    }
  }

  // Calculate longest streak
  for (const cycle of sortedCycles) {
    if (
      cycle.status === 'paid_on_time' ||
      cycle.status === 'paid_early' ||
      cycle.status === 'paid_within_window'
    ) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else if (cycle.status !== 'upcoming') {
      tempStreak = 0;
    }
  }

  return {
    currentStreak,
    longestStreak,
    lastPaymentDate,
  };
}

/**
 * Get payment health score (0-100)
 */
export function getPaymentHealthScore(cycles: Cycle[]): {
  score: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  factors: {
    onTimeRate: number;
    consistency: number;
    streak: number;
  };
} {
  if (cycles.length === 0) {
    return {
      score: 0,
      rating: 'poor',
      factors: {
        onTimeRate: 0,
        consistency: 0,
        streak: 0,
      },
    };
  }

  const totalCycles = cycles.filter(c => c.status !== 'upcoming').length;
  if (totalCycles === 0) {
    return {
      score: 100,
      rating: 'excellent',
      factors: {
        onTimeRate: 100,
        consistency: 100,
        streak: 100,
      },
    };
  }

  // On-time rate (weight: 50%)
  const onTimeCycles = cycles.filter(
    c =>
      c.status === 'paid_on_time' ||
      c.status === 'paid_early' ||
      c.status === 'paid_within_window'
  ).length;
  const onTimeRate = (onTimeCycles / totalCycles) * 100;

  // Consistency rate (weight: 30%)
  const lateCycles = cycles.filter(c => c.status === 'paid_late').length;
  const missedCycles = cycles.filter(c => c.status === 'not_paid').length;
  const consistencyPenalty = (lateCycles * 5 + missedCycles * 10) / totalCycles;
  const consistency = Math.max(0, 100 - consistencyPenalty);

  // Streak bonus (weight: 20%)
  const { currentStreak } = calculatePaymentStreak(cycles);
  const streakBonus = Math.min(100, (currentStreak / totalCycles) * 100);

  // Calculate weighted score
  const score = Math.round(
    onTimeRate * 0.5 + consistency * 0.3 + streakBonus * 0.2
  );

  let rating: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 90) rating = 'excellent';
  else if (score >= 75) rating = 'good';
  else if (score >= 60) rating = 'fair';
  else rating = 'poor';

  return {
    score,
    rating,
    factors: {
      onTimeRate: Math.round(onTimeRate),
      consistency: Math.round(consistency),
      streak: Math.round(streakBonus),
    },
  };
}

/**
 * Get upcoming payment summary text
 */
export function getUpcomingPaymentSummary(overview: ScheduleOverview): string {
  if (overview.overdue > 0) {
    return `${overview.overdue} overdue payment${overview.overdue > 1 ? 's' : ''}`;
  }
  if (overview.dueToday > 0) {
    return `${overview.dueToday} payment${overview.dueToday > 1 ? 's' : ''} due today`;
  }
  if (overview.dueThisWeek > 0) {
    return `${overview.dueThisWeek} payment${overview.dueThisWeek > 1 ? 's' : ''} due this week`;
  }
  if (overview.dueThisMonth > 0) {
    return `${overview.dueThisMonth} payment${overview.dueThisMonth > 1 ? 's' : ''} due this month`;
  }
  if (overview.totalUpcoming > 0) {
    return `${overview.totalUpcoming} upcoming payment${overview.totalUpcoming > 1 ? 's' : ''}`;
  }
  return 'No upcoming payments';
}

/**
 * Get schedule insights
 */
export function getScheduleInsights(schedules: PaymentScheduleItem[]): {
  insight: string;
  type: 'warning' | 'info' | 'success';
  icon: string;
}[] {
  const insights: {
    insight: string;
    type: 'warning' | 'info' | 'success';
    icon: string;
  }[] = [];

  const overdue = schedules.filter(s => s.status === 'overdue').length;
  const dueToday = schedules.filter(s => s.status === 'due_today').length;
  const dueThisWeek = schedules.filter(s => {
    const daysUntil = s.days_until || 0;
    return daysUntil > 0 && daysUntil <= 7;
  }).length;

  if (overdue > 0) {
    insights.push({
      insight: `You have ${overdue} overdue payment${overdue > 1 ? 's' : ''}`,
      type: 'warning',
      icon: 'alert-circle',
    });
  }

  if (dueToday > 0) {
    insights.push({
      insight: `${dueToday} payment${dueToday > 1 ? 's are' : ' is'} due today`,
      type: 'warning',
      icon: 'time',
    });
  }

  if (dueThisWeek > 0) {
    insights.push({
      insight: `${dueThisWeek} payment${dueThisWeek > 1 ? 's' : ''} due this week`,
      type: 'info',
      icon: 'calendar',
    });
  }

  // Calculate total amount due this month
  const thisMonth = schedules.filter(s => {
    const daysUntil = s.days_until || 0;
    return daysUntil >= 0 && daysUntil <= 30;
  });

  if (thisMonth.length > 0) {
    const totalAmount = thisMonth.reduce((sum, s) => sum + s.amount, 0);
    insights.push({
      insight: `Total of ${formatCurrency(totalAmount)} due this month`,
      type: 'info',
      icon: 'cash',
    });
  }

  if (insights.length === 0) {
    insights.push({
      insight: 'All payments are up to date!',
      type: 'success',
      icon: 'checkmark-circle',
    });
  }

  return insights;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number, currency: string = 'INR'): string {
  if (currency === 'INR') {
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  // Add other currency formats as needed
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
