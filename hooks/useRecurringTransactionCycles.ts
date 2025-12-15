import { useCallback, useEffect, useState, useMemo } from 'react';
import { RecurringTransaction, Transaction } from '@/types';
import {
  generateCycles,
  matchTransactionsToCycles,
  getCurrentCycle,
  getUpcomingCycles,
  getPastCycles,
  getCycleStatistics,
} from '@/utils/cycles';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  getCycleOverrides,
  applyCycleOverrides,
  matchScheduledPaymentsToCycles,
  getScheduledPaymentsForRecurring,
  scheduleCyclePayment as scheduleCyclePaymentUtil,
  setCycleOverride as setCycleOverrideUtil,
  removeCycleOverride as removeCycleOverrideUtil,
} from '@/utils/recurringCycleScheduling';
import { ScheduledPayment } from '@/utils/scheduledPayments';

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
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([]);
  const [recurringBills, setRecurringBills] = useState<any[]>([]);
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

      // Fetch scheduled payments for this recurring transaction
      try {
        const scheduled = await getScheduledPaymentsForRecurring(recurringTransactionId);
        setScheduledPayments(scheduled);
      } catch (err) {
        console.error('Error fetching scheduled payments:', err);
        setScheduledPayments([]);
      }

      // Fetch bills linked to this recurring transaction
      try {
        const { data: billsData, error: billsError } = await supabase
          .from('bills')
          .select('id, title, amount, total_amount, due_date, status, metadata')
          .eq('user_id', user.id)
          .eq('metadata->>recurring_transaction_id', recurringTransactionId)
          .in('status', ['upcoming', 'due_today', 'overdue', 'postponed', 'paid', 'skipped', 'cancelled'])
          .order('due_date', { ascending: true });
        if (billsError) throw billsError;
        setRecurringBills(billsData || []);
      } catch (err) {
        console.error('Error fetching recurring bills:', err);
        setRecurringBills([]);
      }
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

    console.log('🔵 Generating cycles for:', recurringTransaction.id, {
      startDate: recurringTransaction.start_date,
      frequency: recurringTransaction.frequency,
      amount: recurringTransaction.amount,
    });

    const baseAmount = recurringTransaction.amount || recurringTransaction.estimated_amount || 0;
    
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
      amount: baseAmount,
      maxCycles,
    });

    // Apply pricing phases (trials/promos -> standard)
    const pricingPhases = (recurringTransaction as any)?.metadata?.pricing_phases || [];
    const cyclesWithPricing = applyPricingPhases(generatedCycles, pricingPhases, baseAmount);

    // Determine tolerance based on nature
    const nature = (recurringTransaction as any)?.custom_pattern?.nature || (recurringTransaction as any)?.nature;
    const amountTolerance = getAmountToleranceForNature(nature);
    const dateTolerance = 7; // allow early/late payments within a week

    // Match transactions to cycles
    let cyclesWithTransactions = matchTransactionsToCycles(
      cyclesWithPricing,
      transactions,
      { tolerance: dateTolerance, amountTolerance }
    );

    // Apply cycle overrides (custom dates/amounts)
    const overrides = getCycleOverrides(recurringTransaction);
    cyclesWithTransactions = applyCycleOverrides(cyclesWithTransactions, overrides);

    // Match scheduled payments to cycles
    cyclesWithTransactions = matchScheduledPaymentsToCycles(
      cyclesWithTransactions,
      scheduledPayments
    );

    // Attach bills from bills table to cycles
    if (recurringBills.length > 0) {
      const billsByCycle: Record<number, any[]> = {};
      recurringBills.forEach((bill) => {
        const cycleNumber = bill.metadata?.cycle_number ? Number(bill.metadata.cycle_number) : undefined;
        if (!cycleNumber) return;
        if (!billsByCycle[cycleNumber]) billsByCycle[cycleNumber] = [];
        billsByCycle[cycleNumber].push(bill);
      });

      cyclesWithTransactions = cyclesWithTransactions.map((cycle) => {
        const billsForCycle = billsByCycle[cycle.cycleNumber] || [];
        if (billsForCycle.length === 0) return cycle;

        const minimumFromBills = billsForCycle.reduce<number | undefined>((acc, b) => {
          const val = b.metadata?.minimum_amount;
          if (typeof val === 'number') return acc === undefined ? val : Math.min(acc, val);
          return acc;
        }, undefined);

        // Pick the first unpaid/active bill as the scheduledBill badge
        const scheduledCandidate =
          billsForCycle.find((b) =>
            ['upcoming', 'due_today', 'overdue', 'postponed'].includes(b.status)
          ) || billsForCycle[0];

        return {
          ...cycle,
          bills: billsForCycle.map((b) => ({
            id: b.id,
            title: b.title,
            dueDate: b.due_date,
            status: b.status,
            amount: b.total_amount ?? b.amount ?? 0,
            totalAmount: b.total_amount,
            metadata: b.metadata || {},
          })),
          minimumAmount: minimumFromBills ?? cycle.minimumAmount,
          scheduledBill: scheduledCandidate
            ? {
                id: scheduledCandidate.id,
                title: scheduledCandidate.title,
                dueDate: scheduledCandidate.due_date,
                status: scheduledCandidate.status,
                amount: scheduledCandidate.total_amount ?? scheduledCandidate.amount ?? 0,
                metadata: scheduledCandidate.metadata || {},
              }
            : cycle.scheduledBill,
        };
      });
    }

    // Add notes from database
    const cycleNotes = recurringTransaction.cycle_notes || {};
    const cyclesWithNotes = cyclesWithTransactions.map((cycle) => ({
      ...cycle,
      notes: cycleNotes[cycle.cycleNumber.toString()] || cycle.notes,
    }));

    // Deduplicate cycles - use a Map for O(1) lookup
    const cycleMap = new Map<string, typeof cyclesWithNotes[0]>();
    
    for (const cycle of cyclesWithNotes) {
      // Create a unique key based on cycle number, start date, and end date
      const key = `${cycle.cycleNumber}-${cycle.startDate}-${cycle.endDate}`;
      
      if (!cycleMap.has(key)) {
        cycleMap.set(key, cycle);
      } else {
        // Log duplicate for debugging
        console.warn('Duplicate cycle detected and removed:', {
          cycleNumber: cycle.cycleNumber,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
          expectedDate: cycle.expectedDate,
        });
      }
    }

    // Convert map values to array and sort by cycleNumber
    const uniqueCycles = Array.from(cycleMap.values()).sort((a, b) => a.cycleNumber - b.cycleNumber);

    // Additional safety check: ensure no duplicate cycleNumbers
    const cycleNumberSet = new Set<number>();
    const finalCycles: typeof cyclesWithNotes = [];
    
    for (const cycle of uniqueCycles) {
      if (!cycleNumberSet.has(cycle.cycleNumber)) {
        cycleNumberSet.add(cycle.cycleNumber);
        finalCycles.push(cycle);
      } else {
        console.error('❌ Duplicate cycleNumber found after deduplication:', cycle.cycleNumber);
      }
    }

    console.log('✅ Final cycles count:', finalCycles.length, 'Unique cycleNumbers:', Array.from(cycleNumberSet));

    return finalCycles;
  }, [recurringTransaction, transactions, scheduledPayments, recurringBills, maxCycles]);

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

  // Schedule payment for a cycle
  const scheduleCyclePayment = useCallback(
    async (
      cycle: Cycle,
      options: {
        amount?: number;
        dueDate?: string;
        accountId?: string;
        notes?: string;
      } = {}
    ) => {
      if (!recurringTransaction) throw new Error('Recurring transaction not loaded');

      await scheduleCyclePaymentUtil(recurringTransaction, cycle, options);
      
      // Refresh data to get updated scheduled payments
      await fetchData();
    },
    [recurringTransaction, fetchData]
  );

  // Set cycle override (custom date/amount/minimum)
  const setCycleOverride = useCallback(
    async (
      cycleNumber: number,
      override: {
        date?: string;
        amount?: number;
        minimumAmount?: number;
        notes?: string;
      }
    ) => {
      if (!recurringTransactionId || !user) return;

      // Convert to expected format (expectedDate/expectedAmount/minimumAmount)
      const overrideData = {
        expectedDate: override.date,
        expectedAmount: override.amount,
        minimumAmount: override.minimumAmount,
        notes: override.notes,
      };

      await setCycleOverrideUtil(recurringTransactionId, cycleNumber, overrideData);
      
      // Update bills if they exist for this cycle
      const { updateBillFromCycleOverride } = await import('@/utils/recurringBillGeneration');
      try {
        await updateBillFromCycleOverride(
          recurringTransactionId,
          cycleNumber,
          user.id,
          {
            amount: override.amount,
            date: override.date,
            minimumAmount: override.minimumAmount,
          }
        );
      } catch (err) {
        console.error('Error updating bills from cycle override:', err);
        // Don't throw - override is saved, bill update is secondary
      }
      
      // Refresh data to get updated overrides
      await fetchData();
    },
    [recurringTransactionId, user, fetchData]
  );

  // Remove cycle override
  const removeCycleOverride = useCallback(
    async (cycleNumber: number) => {
      if (!recurringTransactionId) return;

      await removeCycleOverrideUtil(recurringTransactionId, cycleNumber);
      
      // Refresh data
      await fetchData();
    },
    [recurringTransactionId, fetchData]
  );

  // Set up realtime subscription for recurring transaction updates
  useEffect(() => {
    if (!recurringTransactionId || !user) return;

    const channel = supabase
      .channel(`recurring_transaction_${recurringTransactionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'recurring_transactions',
          filter: `id=eq.${recurringTransactionId}`,
        },
        () => {
          // Auto-refresh when recurring transaction is updated
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_transactions',
          filter: `linked_recurring_transaction_id=eq.${recurringTransactionId}`,
        },
        () => {
          // Auto-refresh when scheduled payments change
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bills',
          filter: `metadata->>recurring_transaction_id=eq.${recurringTransactionId}`,
        },
        () => {
          // Auto-refresh when bills change
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `metadata->>recurring_transaction_id=eq.${recurringTransactionId}`,
        },
        () => {
          // Auto-refresh when payments change
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [recurringTransactionId, user, fetchData]);

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
    scheduleCyclePayment,
    setCycleOverride,
    removeCycleOverride,
    scheduledPayments,
  };
};

/**
 * Apply phased pricing (trial/promo -> standard) to cycles.
 * Expects metadata.pricing_phases: [{ start_date: string, amount: number, label?: string, prorated?: boolean }]
 */
function applyPricingPhases(cycles: Cycle[], phases: any[], baseAmount: number): Cycle[] {
  if (!Array.isArray(phases) || phases.length === 0) return cycles;
  const sorted = [...phases].filter(p => p?.start_date && p?.amount !== undefined)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  return cycles.map((cycle) => {
    const phase = [...sorted].reverse().find(p => new Date(p.start_date) <= new Date(cycle.expectedDate));
    if (!phase) return cycle;
    return {
      ...cycle,
      expectedAmount: typeof phase.amount === 'number' ? phase.amount : baseAmount,
      phaseLabel: phase.label,
      prorated: !!phase.prorated,
    };
  });
}

/**
 * Default variance tolerances by nature.
 * subscriptions: ±5%, utilities/bills: ±30%, income: ±10%, fallback: ±10%
 */
function getAmountToleranceForNature(nature?: string) {
  const n = (nature || '').toLowerCase();
  if (n === 'subscription') return 0.05;
  if (n === 'bill') return 0.30;
  if (n === 'income') return 0.10;
  return 0.10;
}

