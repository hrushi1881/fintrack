/**
 * Income Dashboard Utility
 * 
 * Aggregates all income-related data for a comprehensive dashboard view:
 * - Active income streams
 * - Expected vs actual income for period
 * - Upcoming income
 * - Income reliability and trends
 */

import { supabase } from '@/lib/supabase';
import {
  fetchIncomeStreams,
  generateIncomeCycles,
  getIncomeCycleStatistics,
  IncomeStream,
  IncomeCycle,
} from './incomeCycles';

export interface IncomeDashboardData {
  // Overview metrics
  totalStreams: number;
  activeStreams: number;
  pausedStreams: number;
  
  // Period metrics (current month by default)
  periodStart: string;
  periodEnd: string;
  expectedIncome: number;
  actualIncome: number;
  pendingIncome: number;
  variancePercentage: number;
  
  // Streams
  streams: IncomeDashboardStream[];
  
  // Upcoming income
  upcomingIncome: UpcomingIncome[];
  
  // Recent income
  recentIncome: RecentIncome[];
  
  // Reliability metrics
  overallReliability: number;
  onTimeRate: number;
  
  // Trends (last 6 months)
  monthlyTrend: MonthlyIncomeTrend[];
}

export interface IncomeDashboardStream extends IncomeStream {
  nextDueDate?: string;
  nextExpectedAmount: number;
  status: 'active' | 'paused' | 'upcoming' | 'late';
  daysUntilNext?: number;
  lastCycleStatus?: string;
  statistics: {
    totalExpected: number;
    totalReceived: number;
    receivedCount: number;
    missedCount: number;
    averageAmount: number;
    reliability: number;
    onTimeRate: number;
  };
}

export interface UpcomingIncome {
  id: string;
  streamId: string;
  streamTitle: string;
  expectedDate: string;
  expectedAmount: number;
  daysUntil: number;
  reliability: number;
  color: string;
  icon: string;
}

export interface RecentIncome {
  id: string;
  streamId?: string;
  streamTitle?: string;
  date: string;
  amount: number;
  accountName?: string;
  verified: boolean;
  variance?: number;
  color: string;
  icon: string;
}

export interface MonthlyIncomeTrend {
  month: string; // YYYY-MM
  expected: number;
  actual: number;
  receivedCount: number;
  missedCount: number;
}

/**
 * Fetch complete income dashboard data
 */
export async function fetchIncomeDashboardData(
  userId: string,
  options?: {
    periodStart?: string;
    periodEnd?: string;
    includeHistory?: boolean;
  }
): Promise<IncomeDashboardData> {
  try {
    // Default to current month
    const now = new Date();
    const periodStart =
      options?.periodStart ||
      new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd =
      options?.periodEnd ||
      new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    // Fetch all income streams
    const streams = await fetchIncomeStreams(userId);

    // Get stream-specific data in parallel
    const streamDataPromises = streams.map(async (stream) => {
      const statistics = await getIncomeCycleStatistics(stream);
      const cycles = await generateIncomeCycles(stream, {
        startDate: periodStart,
        endDate: periodEnd,
        maxCycles: 3,
      });

      const nextCycle = cycles.find((c) => c.status === 'upcoming' || c.status === 'due_soon');
      const lastCycle = cycles.find((c) => c.status !== 'upcoming');

      return {
        ...stream,
        nextDueDate: nextCycle?.dueDate,
        nextExpectedAmount: nextCycle?.expectedAmount || stream.amount || 0,
        daysUntilNext: nextCycle
          ? Math.ceil(
              (new Date(nextCycle.dueDate).getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : undefined,
        lastCycleStatus: lastCycle?.status,
        statistics,
        status: determineStreamStatus(stream, nextCycle),
      } as IncomeDashboardStream;
    });

    const enhancedStreams = await Promise.all(streamDataPromises);

    // Calculate period metrics
    const allCyclesPromises = streams.map((stream) =>
      generateIncomeCycles(stream, {
        startDate: periodStart,
        endDate: periodEnd,
      })
    );
    const allCycles = (await Promise.all(allCyclesPromises)).flat();

    const expectedIncome = allCycles.reduce((sum, c) => sum + c.expectedAmount, 0);
    const actualIncome = allCycles
      .filter((c) => c.verified)
      .reduce((sum, c) => sum + c.actualAmount, 0);
    const pendingIncome = allCycles
      .filter((c) => !c.verified && c.status === 'upcoming')
      .reduce((sum, c) => sum + c.expectedAmount, 0);
    const variancePercentage =
      expectedIncome > 0 ? ((actualIncome - expectedIncome) / expectedIncome) * 100 : 0;

    // Get upcoming income
    const upcomingIncome = await getUpcomingIncome(userId, enhancedStreams);

    // Get recent income
    const recentIncome = await getRecentIncome(userId, streams);

    // Calculate overall reliability
    const reliabilityScores = enhancedStreams
      .map((s) => s.statistics.reliability)
      .filter((r) => r > 0);
    const overallReliability =
      reliabilityScores.length > 0
        ? reliabilityScores.reduce((sum, r) => sum + r, 0) / reliabilityScores.length
        : 0;

    const onTimeRates = enhancedStreams
      .map((s) => s.statistics.onTimeRate)
      .filter((r) => r > 0);
    const onTimeRate =
      onTimeRates.length > 0
        ? onTimeRates.reduce((sum, r) => sum + r, 0) / onTimeRates.length
        : 0;

    // Get monthly trend
    const monthlyTrend = options?.includeHistory
      ? await getMonthlyIncomeTrend(userId, 6)
      : [];

    // Count streams by status
    const activeStreams = streams.filter((s) => s.status === 'active').length;
    const pausedStreams = streams.filter((s) => s.status === 'paused').length;

    return {
      totalStreams: streams.length,
      activeStreams,
      pausedStreams,
      periodStart,
      periodEnd,
      expectedIncome: round2(expectedIncome),
      actualIncome: round2(actualIncome),
      pendingIncome: round2(pendingIncome),
      variancePercentage: round2(variancePercentage),
      streams: enhancedStreams,
      upcomingIncome,
      recentIncome,
      overallReliability: Math.round(overallReliability),
      onTimeRate: Math.round(onTimeRate),
      monthlyTrend,
    };
  } catch (error) {
    console.error('Error fetching income dashboard data:', error);
    throw error;
  }
}

function determineStreamStatus(
  stream: IncomeStream,
  nextCycle?: IncomeCycle
): 'active' | 'paused' | 'upcoming' | 'late' {
  if (stream.status === 'paused') return 'paused';
  if (!nextCycle) return 'active';

  const daysUntil = Math.ceil(
    (new Date(nextCycle.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil < -7) return 'late';
  if (daysUntil > 3) return 'upcoming';
  return 'active';
}

async function getUpcomingIncome(
  userId: string,
  streams: IncomeDashboardStream[]
): Promise<UpcomingIncome[]> {
  const upcoming: UpcomingIncome[] = [];

  for (const stream of streams) {
    if (stream.nextDueDate && stream.daysUntilNext !== undefined) {
      upcoming.push({
        id: `upcoming_${stream.id}_${stream.nextDueDate}`,
        streamId: stream.id,
        streamTitle: stream.title,
        expectedDate: stream.nextDueDate,
        expectedAmount: stream.nextExpectedAmount,
        daysUntil: stream.daysUntilNext,
        reliability: stream.reliability_score || 0,
        color: stream.color,
        icon: stream.icon,
      });
    }
  }

  // Sort by date (nearest first)
  upcoming.sort(
    (a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime()
  );

  return upcoming.slice(0, 5); // Top 5 upcoming
}

async function getRecentIncome(
  userId: string,
  streams: IncomeStream[]
): Promise<RecentIncome[]> {
  try {
    // Get recent income transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(
        `
        id,
        date,
        amount,
        description,
        metadata,
        account:accounts!transactions_account_id_fkey (
          name,
          color
        )
      `
      )
      .eq('user_id', userId)
      .eq('type', 'income')
      .order('date', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('Error fetching recent income:', error);
      return [];
    }

    const recentIncome: RecentIncome[] = (transactions || []).map((tx) => {
      // Find associated stream
      const streamId = tx.metadata?.recurring_transaction_id;
      const stream = streamId ? streams.find((s) => s.id === streamId) : undefined;

      const verified = tx.metadata?.verified === true || !!streamId;
      const expectedAmount = stream?.amount || stream?.estimated_amount || tx.amount;
      const variance =
        expectedAmount > 0 ? ((tx.amount - expectedAmount) / expectedAmount) * 100 : 0;

      return {
        id: tx.id,
        streamId: stream?.id,
        streamTitle: stream?.title || tx.description || 'Income',
        date: tx.date,
        amount: Math.abs(tx.amount),
        accountName: (tx.account as any)?.name,
        verified,
        variance: Math.round(variance * 100) / 100,
        color: stream?.color || (tx.account as any)?.color || '#22C55E',
        icon: stream?.icon || 'trending-up',
      };
    });

    return recentIncome;
  } catch (error) {
    console.error('Error getting recent income:', error);
    return [];
  }
}

async function getMonthlyIncomeTrend(
  userId: string,
  monthsBack: number
): Promise<MonthlyIncomeTrend[]> {
  try {
    const trends: MonthlyIncomeTrend[] = [];
    const now = new Date();

    for (let i = monthsBack - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.toISOString().slice(0, 7); // YYYY-MM
      const periodStart = new Date(date.getFullYear(), date.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];

      // Get expected income for this period
      const streams = await fetchIncomeStreams(userId);
      const cyclesPromises = streams.map((stream) =>
        generateIncomeCycles(stream, {
          startDate: periodStart,
          endDate: periodEnd,
        })
      );
      const allCycles = (await Promise.all(cyclesPromises)).flat();

      const expected = allCycles.reduce((sum, c) => sum + c.expectedAmount, 0);
      const actual = allCycles
        .filter((c) => c.verified)
        .reduce((sum, c) => sum + c.actualAmount, 0);
      const receivedCount = allCycles.filter((c) => c.verified).length;
      const missedCount = allCycles.filter((c) => c.status === 'not_paid').length;

      trends.push({
        month,
        expected: round2(expected),
        actual: round2(actual),
        receivedCount,
        missedCount,
      });
    }

    return trends;
  } catch (error) {
    console.error('Error getting monthly income trend:', error);
    return [];
  }
}

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * Get income forecast for next N months
 */
export async function forecastIncome(
  userId: string,
  monthsAhead: number = 3
): Promise<{
  month: string;
  expectedIncome: number;
  confidenceScore: number; // 0-100 based on historical reliability
}[]> {
  try {
    const streams = await fetchIncomeStreams(userId);
    const forecast: {
      month: string;
      expectedIncome: number;
      confidenceScore: number;
    }[] = [];

    const now = new Date();

    for (let i = 0; i < monthsAhead; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const month = targetDate.toISOString().slice(0, 7);
      const periodStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      const periodEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];

      // Generate cycles for this period
      const cyclesPromises = streams.map((stream) =>
        generateIncomeCycles(stream, {
          startDate: periodStart,
          endDate: periodEnd,
        })
      );
      const allCycles = (await Promise.all(cyclesPromises)).flat();

      const expectedIncome = allCycles.reduce((sum, c) => sum + c.expectedAmount, 0);

      // Calculate confidence based on stream reliability
      const reliabilityScores = streams
        .map((s) => s.reliability_score || 0)
        .filter((r) => r > 0);
      const confidenceScore =
        reliabilityScores.length > 0
          ? reliabilityScores.reduce((sum, r) => sum + r, 0) / reliabilityScores.length
          : 50;

      forecast.push({
        month,
        expectedIncome: round2(expectedIncome),
        confidenceScore: Math.round(confidenceScore),
      });
    }

    return forecast;
  } catch (error) {
    console.error('Error forecasting income:', error);
    return [];
  }
}
