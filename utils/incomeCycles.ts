/**
 * Income Cycles Engine
 * 
 * Specialized cycles engine for income-type recurring transactions.
 * Tracks expected vs actual income, reliability scoring, and income verification.
 */

import { supabase } from '@/lib/supabase';
import { generateCycles, Cycle, matchTransactionsToCycles } from './cycles';
import { fetchRecurringTransactions, RecurringTransaction } from './recurringTransactions';

export interface IncomeStream extends RecurringTransaction {
  // Additional income-specific fields
  reliability_score?: number; // 0-100
  average_received?: number;
  variance?: number;
  last_received_date?: string;
  last_received_amount?: number;
  missed_count?: number;
}

export interface IncomeCycle extends Cycle {
  stream_id: string;
  stream_title: string;
  verified: boolean; // Whether income was actually received
  variance_percentage?: number; // Difference from expected amount
  late_by_days?: number;
}

/**
 * Fetch all active income recurring transactions
 */
export async function fetchIncomeStreams(userId: string): Promise<IncomeStream[]> {
  try {
    const recurring = await fetchRecurringTransactions(userId, {
      status: ['active'],
    });

    // Filter to income only
    const incomeTransactions = recurring.filter((t) => t.direction === 'income');

    // Enhance with income-specific metrics
    const streams = await Promise.all(
      incomeTransactions.map(async (tx) => {
        const metrics = await calculateIncomeMetrics(tx);
        return {
          ...tx,
          ...metrics,
        } as IncomeStream;
      })
    );

    return streams;
  } catch (error) {
    console.error('Error fetching income streams:', error);
    return [];
  }
}

/**
 * Calculate income-specific metrics for a recurring transaction
 */
async function calculateIncomeMetrics(tx: RecurringTransaction): Promise<{
  reliability_score: number;
  average_received: number;
  variance: number;
  last_received_date?: string;
  last_received_amount?: number;
  missed_count: number;
}> {
  try {
    // Fetch actual income transactions for this recurring transaction
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, amount, date, metadata')
      .eq('user_id', tx.user_id)
      .eq('type', 'income')
      .or(
        `metadata->recurring_transaction_id.eq.${tx.id},metadata->>source.eq.recurring_${tx.id}`
      )
      .order('date', { ascending: false })
      .limit(12); // Last 12 occurrences

    if (error) {
      console.warn('Error fetching income transactions for metrics:', error);
      return {
        reliability_score: 0,
        average_received: 0,
        variance: 0,
        missed_count: 0,
      };
    }

    const actualTransactions = transactions || [];

    if (actualTransactions.length === 0) {
      return {
        reliability_score: 0,
        average_received: 0,
        variance: 0,
        missed_count: 0,
      };
    }

    // Calculate metrics
    const amounts = actualTransactions.map((t) => Math.abs(t.amount || 0));
    const average_received = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

    const expectedAmount = tx.amount || tx.estimated_amount || 0;
    const variance = expectedAmount > 0 ? Math.abs(average_received - expectedAmount) / expectedAmount : 0;

    // Calculate reliability: based on consistency and frequency
    const expectedCount = Math.min(12, tx.total_occurrences || 12);
    const actualCount = actualTransactions.length;
    const receivedRate = expectedCount > 0 ? actualCount / expectedCount : 0;
    
    // Reliability score (0-100): weighted by received rate and variance
    const reliabilityFromRate = receivedRate * 100;
    const reliabilityFromVariance = Math.max(0, (1 - variance) * 100);
    const reliability_score = Math.round(reliabilityFromRate * 0.7 + reliabilityFromVariance * 0.3);

    const last_received_date = actualTransactions[0]?.date;
    const last_received_amount = Math.abs(actualTransactions[0]?.amount || 0);
    const missed_count = Math.max(0, expectedCount - actualCount);

    return {
      reliability_score,
      average_received: Math.round(average_received * 100) / 100,
      variance: Math.round(variance * 10000) / 100, // As percentage
      last_received_date,
      last_received_amount,
      missed_count,
    };
  } catch (error) {
    console.error('Error calculating income metrics:', error);
    return {
      reliability_score: 0,
      average_received: 0,
      variance: 0,
      missed_count: 0,
    };
  }
}

/**
 * Generate income cycles for a stream
 */
export async function generateIncomeCycles(
  stream: IncomeStream,
  options?: {
    maxCycles?: number;
    startDate?: string;
    endDate?: string;
  }
): Promise<IncomeCycle[]> {
  try {
    const cycles = generateCycles({
      startDate: options?.startDate || stream.start_date,
      endDate: options?.endDate || stream.end_date || undefined,
      frequency: stream.frequency,
      interval: stream.interval,
      customUnit: stream.custom_unit,
      dueDay: stream.date_of_occurrence,
      amount: stream.amount || stream.estimated_amount || 0,
      maxCycles: options?.maxCycles || 12,
      currentDate: new Date().toISOString().split('T')[0],
    });

    // Fetch actual income transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, amount, date, description, metadata')
      .eq('user_id', stream.user_id)
      .eq('type', 'income')
      .or(
        `metadata->recurring_transaction_id.eq.${stream.id},metadata->>source.eq.recurring_${stream.id}`
      )
      .gte('date', stream.start_date)
      .order('date', { ascending: true });

    if (error) {
      console.warn('Error fetching income transactions for cycles:', error);
      return cycles.map((c) => enhanceCycleForIncome(c, stream, false));
    }

    // Match transactions to cycles
    const matchedCycles = matchTransactionsToCycles(cycles, transactions || [], {
      tolerance: 7, // Income can be ±7 days
      amountTolerance: 0.05, // ±5% for income variance
    });

    return matchedCycles.map((c) => {
      const verified = c.actualAmount > 0;
      const variancePercentage = c.expectedAmount > 0
        ? ((c.actualAmount - c.expectedAmount) / c.expectedAmount) * 100
        : 0;

      return {
        ...c,
        stream_id: stream.id,
        stream_title: stream.title,
        verified,
        variance_percentage: Math.round(variancePercentage * 100) / 100,
        late_by_days: c.daysLate,
      } as IncomeCycle;
    });
  } catch (error) {
    console.error('Error generating income cycles:', error);
    throw error;
  }
}

function enhanceCycleForIncome(
  cycle: Cycle,
  stream: IncomeStream,
  verified: boolean
): IncomeCycle {
  return {
    ...cycle,
    stream_id: stream.id,
    stream_title: stream.title,
    verified,
  };
}

/**
 * Get income cycle statistics
 */
export async function getIncomeCycleStatistics(
  stream: IncomeStream
): Promise<{
  totalExpected: number;
  totalReceived: number;
  receivedCount: number;
  missedCount: number;
  averageAmount: number;
  reliability: number;
  onTimeRate: number;
  variancePercentage: number;
}> {
  try {
    const cycles = await generateIncomeCycles(stream, { maxCycles: 12 });

    const totalCycles = cycles.filter((c) => c.status !== 'upcoming').length;
    const receivedCycles = cycles.filter((c) => c.verified);

    const totalExpected = cycles.reduce((sum, c) => sum + c.expectedAmount, 0);
    const totalReceived = cycles.reduce((sum, c) => sum + c.actualAmount, 0);
    const receivedCount = receivedCycles.length;
    const missedCount = cycles.filter((c) => c.status === 'not_paid').length;
    const averageAmount = receivedCount > 0 ? totalReceived / receivedCount : 0;

    const onTimeCycles = cycles.filter(
      (c) =>
        c.status === 'paid_on_time' ||
        c.status === 'paid_early' ||
        c.status === 'paid_within_window'
    );
    const onTimeRate = totalCycles > 0 ? (onTimeCycles.length / totalCycles) * 100 : 0;

    const variance = totalExpected > 0 ? ((totalReceived - totalExpected) / totalExpected) * 100 : 0;

    const reliability = totalCycles > 0 ? (receivedCount / totalCycles) * 100 : 0;

    return {
      totalExpected: Math.round(totalExpected * 100) / 100,
      totalReceived: Math.round(totalReceived * 100) / 100,
      receivedCount,
      missedCount,
      averageAmount: Math.round(averageAmount * 100) / 100,
      reliability: Math.round(reliability),
      onTimeRate: Math.round(onTimeRate),
      variancePercentage: Math.round(variance * 100) / 100,
    };
  } catch (error) {
    console.error('Error getting income cycle statistics:', error);
    return {
      totalExpected: 0,
      totalReceived: 0,
      receivedCount: 0,
      missedCount: 0,
      averageAmount: 0,
      reliability: 0,
      onTimeRate: 0,
      variancePercentage: 0,
    };
  }
}

/**
 * Verify income - mark a cycle as received
 */
export async function verifyIncomeReceived(
  streamId: string,
  cycleDate: string,
  amount: number,
  accountId: string,
  notes?: string
): Promise<{ success: boolean; transactionId?: string }> {
  try {
    const stream = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('id', streamId)
      .single();

    if (!stream.data) {
      throw new Error('Income stream not found');
    }

    // Create income transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: stream.data.user_id,
        account_id: accountId,
        type: 'income',
        amount: amount,
        date: cycleDate,
        description: `${stream.data.name || stream.data.title} - Income received`,
        notes: notes,
        category_id: stream.data.category_id,
        metadata: {
          recurring_transaction_id: streamId,
          cycle_date: cycleDate,
          verified: true,
          source: `recurring_${streamId}`,
        },
      })
      .select()
      .single();

    if (txError) {
      throw new Error(`Failed to create income transaction: ${txError.message}`);
    }

    return {
      success: true,
      transactionId: transaction?.id,
    };
  } catch (error) {
    console.error('Error verifying income:', error);
    return { success: false };
  }
}
