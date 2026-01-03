import { useCallback, useEffect, useState, useMemo } from 'react';
import { Budget, Transaction } from '@/types';
import {
  generateCycles,
  Cycle,
  getCurrentCycle,
  getUpcomingCycles,
  getPastCycles,
  getCycleStatistics,
} from '@/utils/cycles';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface UseBudgetCyclesOptions {
  budgetId: string;
  maxCycles?: number;
}

export const useBudgetCycles = (options: UseBudgetCyclesOptions) => {
  const { budgetId, maxCycles = 12 } = options;
  const { user } = useAuth();
  
  const [budget, setBudget] = useState<Budget | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch budget and related transactions
  const fetchData = useCallback(async () => {
    if (!user || !budgetId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch budget
      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('*')
        .eq('id', budgetId)
        .eq('user_id', user.id)
        .single();

      if (budgetError) throw budgetError;
      if (!budgetData) throw new Error('Budget not found');

      setBudget(budgetData as Budget);

      // Fetch transactions for budget (based on budget type)
      let txQuery = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('date', budgetData.start_date);

      // Filter by category for category budgets
      if (budgetData.budget_type === 'category' && budgetData.category_id) {
        txQuery = txQuery.eq('category_id', budgetData.category_id);
      }

      // Filter by accounts for other budget types
      if (budgetData.account_ids && budgetData.account_ids.length > 0) {
        txQuery = txQuery.in('account_id', budgetData.account_ids);
      }

      const { data: txData, error: txError } = await txQuery
        .order('date', { ascending: true });

      if (txError) throw txError;

      setTransactions((txData || []) as Transaction[]);
    } catch (err: any) {
      console.error('Error fetching budget cycles data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, budgetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate cycles based on budget period
  const cycles = useMemo(() => {
    if (!budget) return [];

    // Map budget recurrence_pattern to cycle frequency
    let frequency: any = 'monthly';
    let interval = 1;

    if (budget.recurrence_pattern) {
      const recurrence = budget.recurrence_pattern.toLowerCase();
      if (recurrence === 'weekly') {
        frequency = 'weekly';
      } else if (recurrence === 'monthly') {
        frequency = 'monthly';
      } else if (recurrence === 'yearly') {
        frequency = 'yearly';
      } else if (recurrence === 'custom') {
        // For custom frequency, we need to check metadata
        const customFreq = budget.metadata?.custom_frequency;
        if (customFreq) {
          frequency = customFreq.unit;
          interval = customFreq.interval;
        } else {
          frequency = 'monthly'; // fallback
        }
      }
    }

    const generatedCycles = generateCycles({
      startDate: budget.start_date,
      endDate: budget.end_date || null,
      frequency,
      interval,
      dueDay: 1, // Budget cycles start on 1st by default
      amount: budget.amount,
      maxCycles,
    });

    // For each cycle, calculate actual spending
    const cyclesWithSpending = generatedCycles.map((cycle) => {
      // Find all transactions within this cycle
      const cycleTransactions = transactions.filter((tx) => {
        const txDate = new Date(tx.date);
        const cycleStart = new Date(cycle.startDate);
        const cycleEnd = new Date(cycle.endDate);
        
        txDate.setHours(0, 0, 0, 0);
        cycleStart.setHours(0, 0, 0, 0);
        cycleEnd.setHours(0, 0, 0, 0);

        return txDate >= cycleStart && txDate <= cycleEnd;
      });

      // Sum up spending
      const totalSpent = cycleTransactions.reduce(
        (sum, tx) => sum + Math.abs(tx.amount),
        0
      );

      // Determine status based on budget vs spending
      const budgetAmount = cycle.expectedAmount;
      const percentUsed = budgetAmount > 0 ? (totalSpent / budgetAmount) * 100 : 0;

      // For save mode, we track progress toward the target
      // For spend_cap mode, we track staying under the cap
      const isSaveTarget = budget?.budget_mode === 'save';
      const isWithinBudget = isSaveTarget ? totalSpent >= budgetAmount : totalSpent <= budgetAmount;

      let status: any = 'upcoming';
      const currentDate = new Date();
      const cycleEndDate = new Date(cycle.endDate);

      currentDate.setHours(0, 0, 0, 0);
      cycleEndDate.setHours(0, 0, 0, 0);

      if (cycleEndDate < currentDate) {
        // Past cycle
        if (isWithinBudget) {
          status = 'paid_on_time'; // Within budget/target
        } else {
          status = isSaveTarget ? 'partial' : 'overpaid'; // Didn't reach target or over budget
        }
      } else if (cycleEndDate.getTime() === currentDate.getTime() || currentDate < cycleEndDate) {
        // Current or future cycle
        if (isSaveTarget) {
          // For save targets, show progress
          if (totalSpent >= budgetAmount) {
            status = 'paid_on_time'; // Target reached
          } else if (percentUsed > 50) {
            status = 'partial'; // Good progress
          } else {
            status = 'upcoming'; // Early stages
          }
        } else {
          // For spend caps, warn when approaching/over limit
          if (totalSpent > budgetAmount) {
            status = 'overpaid'; // Already over budget
          } else if (percentUsed > 90) {
            status = 'partial'; // Warning - close to limit
          } else {
            status = 'upcoming';
          }
        }
      }

      return {
        ...cycle,
        actualAmount: totalSpent,
        status,
        transactions: cycleTransactions,
        metadata: {
          budgetAmount,
          spent: totalSpent,
          remaining: Math.max(0, budgetAmount - totalSpent),
          percentUsed: Math.round(percentUsed),
        },
      };
    });

    // Add notes from database
    const cycleNotes = budget?.cycle_notes || {};
    return cyclesWithSpending.map((cycle) => ({
      ...cycle,
      notes: cycleNotes[cycle.cycleNumber.toString()] || cycle.notes,
    }));
  }, [budget, transactions, maxCycles]);

  // Get current, upcoming, and past cycles
  const currentCycle = useMemo(() => getCurrentCycle(cycles), [cycles]);
  const upcomingCycles = useMemo(() => getUpcomingCycles(cycles), [cycles]);
  const pastCycles = useMemo(() => getPastCycles(cycles), [cycles]);

  // Get statistics
  const statistics = useMemo(() => {
    const stats = getCycleStatistics(cycles);

    if (!budget) {
      return {
        ...stats,
        withinBudget: 0,
        overBudget: 0,
        averageUsage: 0,
      };
    }

    // Calculate budget-specific stats
    const isSaveTarget = budget?.budget_mode === 'save';
    const withinBudget = cycles.filter((c) => {
      const percentUsed = c.metadata?.percentUsed || 0;
      return isSaveTarget ? percentUsed >= 100 : percentUsed <= 100;
    }).length;
    const overBudget = cycles.filter((c) => {
      const percentUsed = c.metadata?.percentUsed || 0;
      return isSaveTarget ? percentUsed < 100 : percentUsed > 100;
    }).length;
    const averageUsage = cycles.reduce(
      (sum, c) => sum + (c.metadata?.percentUsed || 0),
      0
    ) / (cycles.length || 1);

    return {
      ...stats,
      withinBudget,
      overBudget,
      averageUsage: Math.round(averageUsage),
    };
  }, [cycles, budget]);

  // Update cycle note
  const updateCycleNote = useCallback(
    async (cycleNumber: number, note: string) => {
      if (!user || !budgetId) return;

      try {
        const { error } = await supabase.rpc('update_budget_cycle_note', {
          p_budget_id: budgetId,
          p_cycle_number: cycleNumber.toString(),
          p_note: note,
        });

        if (error) throw error;

        // Refresh data
        await fetchData();
      } catch (err: any) {
        console.error('Error updating cycle note:', err);
        throw err;
      }
    },
    [user, budgetId, fetchData]
  );

  return {
    budget,
    cycles,
    currentCycle,
    upcomingCycles,
    pastCycles,
    statistics,
    loading,
    error,
    refresh: fetchData,
    updateCycleNote,
  };
};

