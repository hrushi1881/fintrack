import { useCallback, useEffect, useState, useMemo } from 'react';
import { RecurringTransaction, Transaction } from '@/types';
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

interface UseRecurringTransactionCyclesOptions {
  recurringTransactionId: string;
  maxCycles?: number;
}

export const useRecurringTransactionCycles = (
  options: UseRecurringTransactionCyclesOptions
) => {
  const { recurringTransactionId, maxCycles = 12 } = options;
  const { user } = useAuth();
  
  const [recurringTransaction, setRecurringTransaction] = useState<RecurringTransaction | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch recurring transaction and related transactions
  const fetchData = useCallback(async () => {
    if (!user || !recurringTransactionId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch recurring transaction
      const { data: rtData, error: rtError } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('id', recurringTransactionId)
        .eq('user_id', user.id)
        .single();

      if (rtError) throw rtError;
      if (!rtData) throw new Error('Recurring transaction not found');

      setRecurringTransaction(rtData as RecurringTransaction);

      // Fetch related transactions
      // Match by category and/or linked_recurring_transaction_id
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', rtData.start_date)
        .or(`category_id.eq.${rtData.category_id},description.ilike.%${rtData.title}%`)
        .order('date', { ascending: true });

      if (txError) throw txError;

      setTransactions((txData || []) as Transaction[]);
    } catch (err: any) {
      console.error('Error fetching recurring transaction cycles data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, recurringTransactionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate cycles
  const cycles = useMemo(() => {
    if (!recurringTransaction) return [];

    const amount = recurringTransaction.amount || recurringTransaction.estimated_amount || 0;
    
    // Map database frequency to cycles format
    // Database stores: 'day', 'week', 'month', 'quarter', 'year', 'custom'
    // Cycles expects: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'
    const frequencyMap: Record<string, 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'> = {
      'day': 'daily',
      'week': 'weekly',
      'month': 'monthly',
      'quarter': 'quarterly',
      'year': 'yearly',
      'custom': 'custom',
      // Also handle if already in cycles format (backward compatibility)
      'daily': 'daily',
      'weekly': 'weekly',
      'monthly': 'monthly',
      'quarterly': 'quarterly',
      'yearly': 'yearly',
    };
    
    const dbFrequency = String(recurringTransaction.frequency || 'month').toLowerCase();
    const frequency = frequencyMap[dbFrequency] || 'monthly';
    const interval = recurringTransaction.interval || 1;
    
    // Extract custom fields from custom_pattern JSONB
    const customPattern = recurringTransaction.custom_pattern || {};
    const customUnit = recurringTransaction.custom_unit || customPattern.custom_unit;
    const dueDay = recurringTransaction.date_of_occurrence 
      ? parseInt(recurringTransaction.date_of_occurrence.toString()) 
      : customPattern.date_of_occurrence 
        ? parseInt(customPattern.date_of_occurrence.toString())
        : undefined;

    const generatedCycles = generateCycles({
      startDate: recurringTransaction.start_date,
      endDate: recurringTransaction.end_date,
      frequency,
      interval,
      customUnit,
      dueDay,
      amount,
      maxCycles,
    });

    // Match transactions to cycles
    const cyclesWithTransactions = matchTransactionsToCycles(
      generatedCycles,
      transactions
    );

    // Add notes from database
    const cycleNotes = recurringTransaction.cycle_notes || {};
    return cyclesWithTransactions.map((cycle) => ({
      ...cycle,
      notes: cycleNotes[cycle.cycleNumber.toString()] || cycle.notes,
    }));
  }, [recurringTransaction, transactions, maxCycles]);

  // Get current, upcoming, and past cycles
  const currentCycle = useMemo(() => getCurrentCycle(cycles), [cycles]);
  const upcomingCycles = useMemo(() => getUpcomingCycles(cycles), [cycles]);
  const pastCycles = useMemo(() => getPastCycles(cycles), [cycles]);

  // Get statistics
  const statistics = useMemo(() => getCycleStatistics(cycles), [cycles]);

  // Update cycle note
  const updateCycleNote = useCallback(
    async (cycleNumber: number, note: string) => {
      if (!user || !recurringTransactionId) return;

      try {
        const { error } = await supabase.rpc('update_recurring_transaction_cycle_note', {
          p_recurring_transaction_id: recurringTransactionId,
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
    [user, recurringTransactionId, fetchData]
  );

  return {
    recurringTransaction,
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

