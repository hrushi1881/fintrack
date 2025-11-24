import { useCallback, useEffect, useState, useMemo } from 'react';
import { Goal, Transaction } from '@/types';
import {
  generateCycles,
  matchTransactionsToCycles,
  Cycle,
  getCurrentCycle,
  getUpcomingCycles,
  getPastCycles,
  getCycleStatistics,
} from '@/utils/cycles';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface UseGoalCyclesOptions {
  goalId: string;
  maxCycles?: number;
}

export const useGoalCycles = (options: UseGoalCyclesOptions) => {
  const { goalId, maxCycles = 12 } = options;
  const { user } = useAuth();
  
  const [goal, setGoal] = useState<Goal | null>(null);
  const [contributions, setContributions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch goal and related transactions
  const fetchData = useCallback(async () => {
    if (!user || !goalId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch goal
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('id', goalId)
        .eq('user_id', user.id)
        .single();

      if (goalError) throw goalError;
      if (!goalData) throw new Error('Goal not found');

      setGoal(goalData as Goal);

      // Fetch contribution transactions (to goal fund)
      const { data: contributionData, error: contributionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'transfer')
        .contains('metadata', { goal_id: goalId })
        .gte('date', goalData.created_at)
        .order('date', { ascending: true });

      if (contributionError) throw contributionError;

      // Fetch withdrawal transactions (from goal fund)
      const { data: withdrawalData, error: withdrawalError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'transfer')
        .contains('metadata', { from_goal_id: goalId })
        .gte('date', goalData.created_at)
        .order('date', { ascending: true });

      if (withdrawalError) throw withdrawalError;

      setContributions((contributionData || []) as Transaction[]);
      setWithdrawals((withdrawalData || []) as Transaction[]);
    } catch (err: any) {
      console.error('Error fetching goal cycles data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, goalId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate cycles
  const cycles = useMemo(() => {
    if (!goal) return [];

    // Calculate contribution frequency and amount
    // If goal has target_date, calculate monthly contribution needed
    const targetAmount = goal.target_amount;
    const currentAmount = goal.current_amount;
    const remaining = targetAmount - currentAmount;

    let contributionAmount = 0;
    let frequency: any = 'monthly';
    let interval = 1;
    let endDate: string | null = null;

    if (goal.target_date) {
      const startDate = new Date(goal.created_at);
      const targetDate = new Date(goal.target_date);
      const monthsRemaining = Math.max(
        1,
        Math.floor(
          (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
        )
      );
      contributionAmount = remaining / monthsRemaining;
      endDate = goal.target_date;
    } else {
      // Default to monthly contributions of 1/12th of target
      contributionAmount = targetAmount / 12;
    }

    const generatedCycles = generateCycles({
      startDate: goal.created_at.split('T')[0],
      endDate: endDate,
      frequency,
      interval,
      dueDay: 1, // Default to 1st of month
      amount: contributionAmount,
      maxCycles,
    });

    // Match contributions to cycles
    const cyclesWithContributions = matchTransactionsToCycles(
      generatedCycles,
      contributions
    );

    // Calculate net contributions (contributions - withdrawals)
    const cyclesWithNet = cyclesWithContributions.map((cycle) => {
      const cycleWithdrawals = withdrawals.filter((tx) => {
        const txDate = new Date(tx.date);
        const cycleStart = new Date(cycle.startDate);
        const cycleEnd = new Date(cycle.endDate);
        
        txDate.setHours(0, 0, 0, 0);
        cycleStart.setHours(0, 0, 0, 0);
        cycleEnd.setHours(0, 0, 0, 0);

        return txDate >= cycleStart && txDate <= cycleEnd;
      });

      const withdrawalAmount = cycleWithdrawals.reduce(
        (sum, tx) => sum + Math.abs(tx.amount),
        0
      );

      const netContribution = cycle.actualAmount - withdrawalAmount;

      return {
        ...cycle,
        actualAmount: netContribution,
        metadata: {
          contributions: cycle.actualAmount,
          withdrawals: withdrawalAmount,
          net: netContribution,
        },
      };
    });

    // Add notes from database
    const cycleNotes = goal.cycle_notes || {};
    return cyclesWithNet.map((cycle) => ({
      ...cycle,
      notes: cycleNotes[cycle.cycleNumber.toString()] || cycle.notes,
    }));
  }, [goal, contributions, withdrawals, maxCycles]);

  // Get current, upcoming, and past cycles
  const currentCycle = useMemo(() => getCurrentCycle(cycles), [cycles]);
  const upcomingCycles = useMemo(() => getUpcomingCycles(cycles), [cycles]);
  const pastCycles = useMemo(() => getPastCycles(cycles), [cycles]);

  // Get statistics
  const statistics = useMemo(() => getCycleStatistics(cycles), [cycles]);

  // Update cycle note
  const updateCycleNote = useCallback(
    async (cycleNumber: number, note: string) => {
      if (!user || !goalId) return;

      try {
        const { error } = await supabase.rpc('update_goal_cycle_note', {
          p_goal_id: goalId,
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
    [user, goalId, fetchData]
  );

  return {
    goal,
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

