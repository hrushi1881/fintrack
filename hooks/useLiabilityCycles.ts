import { useCallback, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  generateCycles,
  matchTransactionsToCycles,
  Cycle,
  getCurrentCycle,
  getUpcomingCycles,
  getPastCycles,
  getCycleStatistics,
  DEFAULT_LIABILITY_TOLERANCE_DAYS,
  DEFAULT_LIABILITY_AMOUNT_TOLERANCE,
} from '@/utils/cycles';

interface Liability {
  id: string;
  title: string;
  current_balance: number;
  periodical_payment?: number;
  periodical_frequency?: string;
  start_date: string;
  targeted_payoff_date?: string;
  due_day_of_month?: number;
  next_due_date?: string;
  interest_rate_apy: number;
  cycle_notes?: any;
  linked_account_id?: string;
  metadata?: any;
  custom_frequency_unit?: string;
}

interface LiabilityPayment {
  id: string;
  liability_id: string;
  amount: number;
  payment_date: string;
  principal_component?: number;
  interest_component?: number;
  principal_amount?: number; // Legacy field for backward compatibility
  interest_amount?: number; // Legacy field for backward compatibility
  description?: string;
  metadata?: {
    cycle_number?: number;
    bill_id?: string;
    payment_timing?: 'early' | 'on_time' | 'within_window' | 'late';
    days_from_due?: number;
    tolerance_days?: number;
    is_within_window?: boolean;
    amount_comparison?: 'over' | 'under' | 'exact' | 'partial';
    amount_difference?: number;
    expected_amount?: number;
    actual_amount?: number;
    cycle_status?: string;
    [key: string]: any;
  };
}

interface UseLiabilityCyclesOptions {
  liabilityId: string;
  maxCycles?: number;
  dateTolerance?: number; // Days tolerance for matching payments (default: 7)
  amountTolerance?: number; // Percentage tolerance for amount matching (default: 0.01 = 1%)
}

export const useLiabilityCycles = (options: UseLiabilityCyclesOptions) => {
  const {
    liabilityId,
    maxCycles = 12,
    dateTolerance = DEFAULT_LIABILITY_TOLERANCE_DAYS,
    amountTolerance = DEFAULT_LIABILITY_AMOUNT_TOLERANCE,
  } = options;
  const { user } = useAuth();
  
  const [liability, setLiability] = useState<Liability | null>(null);
  const [payments, setPayments] = useState<LiabilityPayment[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch liability and payment history
  const fetchData = useCallback(async () => {
    if (!user || !liabilityId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch liability
      const { data: liabilityData, error: liabilityError } = await supabase
        .from('liabilities')
        .select('*')
        .eq('id', liabilityId)
        .eq('user_id', user.id)
        .single();

      if (liabilityError) throw liabilityError;
      if (!liabilityData) throw new Error('Liability not found');

      setLiability(liabilityData as Liability);

      // Fetch payment history with principal/interest components and metadata
      const { data: paymentData, error: paymentError } = await supabase
        .from('liability_payments')
        .select('id, liability_id, amount, payment_date, principal_component, interest_component, description, metadata')
        .eq('liability_id', liabilityId)
        .gte('payment_date', liabilityData.start_date)
        .order('payment_date', { ascending: true });

      if (paymentError) throw paymentError;

      setPayments((paymentData || []) as LiabilityPayment[]);

      // Fetch bills linked to this liability (scheduled / upcoming)
      const { data: billData, error: billError } = await supabase
        .from('bills')
        .select('id, due_date, total_amount, amount, status, metadata, liability_id, title')
        .eq('liability_id', liabilityId)
        .eq('user_id', user.id)
        // Include paid/cancelled for history display
        .in('status', ['upcoming', 'due_today', 'overdue', 'postponed', 'paid', 'cancelled', 'skipped'])
        .order('due_date', { ascending: true });

      if (billError) throw billError;
      setBills(billData || []);
    } catch (err: any) {
      console.error('Error fetching liability cycles data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, liabilityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Realtime refresh on payments/bills/transactions touching this liability
  useEffect(() => {
    if (!user || !liabilityId) return;

    const channel = supabase
      .channel(`liability-cycles-${liabilityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'liability_payments', filter: `liability_id=eq.${liabilityId}` },
        (payload) => {
          console.log('[Cycles] liability_payments changed:', payload.eventType);
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bills', filter: `liability_id=eq.${liabilityId}` },
        (payload) => {
          console.log('[Cycles] bills changed:', payload.eventType);
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'liabilities', filter: `id=eq.${liabilityId}` },
        (payload) => {
          console.log('[Cycles] liabilities changed:', payload.eventType);
          fetchData();
        }
      )
      .subscribe((status) => {
        console.log('[Cycles] Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, liabilityId, fetchData]);

  // Generate cycles
  const cycles = useMemo(() => {
    if (!liability) return [];

    const paymentAmount = liability.periodical_payment || 0;
    if (paymentAmount === 0) return [];

    // Map frequency to cycles engine vocabulary
    const mapLiabilityFrequency = (
      freq: string | undefined
    ): { frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'; interval: number; customUnit?: string } => {
      const f = (freq || 'monthly').toLowerCase();
      const customUnit = liability?.metadata?.custom_frequency_unit || liability?.custom_frequency_unit;
      const customInterval = Number(liability?.metadata?.custom_frequency_interval || 1);
      switch (f) {
        case 'daily':
          return { frequency: 'daily', interval: 1 };
        case 'weekly':
          return { frequency: 'weekly', interval: 1 };
        case 'biweekly':
        case 'bi-weekly':
          return { frequency: 'weekly', interval: 2 };
        case 'bimonthly':
        case 'bi-monthly':
          return { frequency: 'monthly', interval: 2 };
        case 'quarterly':
          return { frequency: 'quarterly', interval: 1 };
        case 'halfyearly':
        case 'half-yearly':
          return { frequency: 'monthly', interval: 6 };
        case 'yearly':
          return { frequency: 'yearly', interval: 1 };
        case 'custom':
          return { frequency: 'custom', interval: customInterval > 0 ? customInterval : 1, customUnit };
        default:
          return { frequency: 'monthly', interval: 1 };
      }
    };

    const { frequency, interval, customUnit } = mapLiabilityFrequency(liability.periodical_frequency);

    // Determine due day: use due_day_of_month if set, or extract from next_due_date if available
    let dueDay = liability.due_day_of_month;
    if (!dueDay && liability.next_due_date) {
      // Extract day of month from next_due_date
      const nextDue = new Date(liability.next_due_date);
      dueDay = nextDue.getDate();
    }
    dueDay = dueDay || 1; // Final fallback to 1st of month
    
    const interestRate = Number(liability.interest_rate_apy || 0);
    const currentBalance = Number(liability.current_balance || 0);

    const generatedCycles = generateCycles({
      startDate: liability.start_date,
      endDate: liability.targeted_payoff_date || null,
      frequency,
      interval,
      dueDay,
      amount: paymentAmount,
      maxCycles,
      customUnit,
      // Add interest calculation for liability cycles
      interestRate: interestRate > 0 ? interestRate : undefined,
      startingBalance: currentBalance > 0 ? currentBalance : undefined,
      interestIncluded: true, // For liabilities, interest is typically included in payment
    });

    // Convert liability payments to transaction-like format for matching
    const paymentTransactions = payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      date: payment.payment_date,
      type: 'expense' as const,
      description: payment.description || 'Liability payment',
      account_id: '',
      user_id: user?.id || '',
      created_at: payment.payment_date,
      updated_at: payment.payment_date,
      metadata: {
        // Use principal_component and interest_component from liability_payments table
        principal: payment.principal_component || payment.principal_amount || 0,
        interest: payment.interest_component || payment.interest_amount || 0,
        principal_component: payment.principal_component || payment.principal_amount || 0,
        interest_component: payment.interest_component || payment.interest_amount || 0,
        // Payment matching metadata
        cycle_number: payment.metadata?.cycle_number,
        bill_id: payment.metadata?.bill_id,
        // Payment timing and window metadata
        payment_timing: payment.metadata?.payment_timing,
        days_from_due: payment.metadata?.days_from_due,
        tolerance_days: payment.metadata?.tolerance_days,
        is_within_window: payment.metadata?.is_within_window,
        // Amount comparison metadata
        amount_comparison: payment.metadata?.amount_comparison,
        amount_difference: payment.metadata?.amount_difference,
        expected_amount: payment.metadata?.expected_amount,
        actual_amount: payment.metadata?.actual_amount,
        cycle_status: payment.metadata?.cycle_status,
      },
    }));

    // Match payments to cycles with configurable tolerances
    const cyclesWithPayments = matchTransactionsToCycles(
      generatedCycles,
      paymentTransactions as any,
      {
        tolerance: dateTolerance,
        amountTolerance: amountTolerance,
      }
    );

    // Attach scheduled bill (upcoming/due/overdue) info to each cycle for visualization
    const cyclesWithBills = cyclesWithPayments.map((cycle) => {
      // Match bills to cycles by:
      // 1. Explicit cycle_number in metadata
      // 2. Date-based matching if cycle_number is not set
      const billsForCycle = bills.filter((b) => {
        // First try explicit cycle_number match
        if (typeof b.metadata?.cycle_number === 'number') {
          return b.metadata.cycle_number === cycle.cycleNumber;
        }
        
        // Fallback to date-based matching
        const billDue = new Date(b.due_date);
        billDue.setHours(0, 0, 0, 0);
        const cycleStart = new Date(cycle.startDate);
        cycleStart.setHours(0, 0, 0, 0);
        const cycleEnd = new Date(cycle.endDate);
        cycleEnd.setHours(0, 0, 0, 0);
        
        // Bill due date should be within the cycle window (with some tolerance)
        const windowStart = new Date(cycleStart);
        windowStart.setDate(windowStart.getDate() - dateTolerance);
        const windowEnd = new Date(cycleEnd);
        windowEnd.setDate(windowEnd.getDate() + dateTolerance);
        
        return billDue >= windowStart && billDue <= windowEnd;
      });
      const minimumFromBills = billsForCycle.reduce<number | undefined>((acc, b) => {
        const val = b.metadata?.minimum_amount;
        if (typeof val === 'number') return acc === undefined ? val : Math.min(acc, val);
        return acc;
      }, undefined);

      const scheduledBill = billsForCycle.find(
        (b) =>
          b.status !== 'paid' &&
          b.status !== 'cancelled' &&
          b.status !== 'skipped'
      );
      
      // Find paid bills to extract payment timing metadata
      const paidBills = billsForCycle.filter((b) => b.status === 'paid');
      
      // Extract payment timing, window status, and amount comparison from paid bills
      let paymentTiming: string | undefined;
      let amountComparison: string | undefined;
      let amountDifference: number | undefined;
      let paidDate: string | undefined;
      let isWithinWindow: boolean | undefined;
      let daysFromDue: number | undefined;
      let cycleStatus: string | undefined;
      
      if (paidBills.length > 0) {
        const latestPaidBill = paidBills.sort((a, b) => 
          new Date(b.metadata?.paid_date || b.due_date).getTime() - 
          new Date(a.metadata?.paid_date || a.due_date).getTime()
        )[0];
        
        paymentTiming = latestPaidBill.metadata?.payment_timing;
        amountComparison = latestPaidBill.metadata?.amount_comparison;
        amountDifference = latestPaidBill.metadata?.amount_difference;
        paidDate = latestPaidBill.metadata?.paid_date || latestPaidBill.due_date;
        isWithinWindow = latestPaidBill.metadata?.is_within_window;
        daysFromDue = latestPaidBill.metadata?.days_from_due ?? latestPaidBill.metadata?.days_diff;
        cycleStatus = latestPaidBill.metadata?.cycle_status;
      }

      // Determine the expected date from bills (any bill in the cycle)
      // Prefer paid bill due dates, then unpaid bill due dates
      const paidBillDueDate = paidBills.length > 0 ? paidBills[0].due_date : undefined;
      const anyBillDueDate = billsForCycle.length > 0 ? billsForCycle[0].due_date : undefined;
      const billBasedExpectedDate = paidBillDueDate || anyBillDueDate;

      const cycleWithBills = {
        ...cycle,
        // Use bill due date as expected date if available
        ...(billBasedExpectedDate && { expectedDate: billBasedExpectedDate }),
        bills: billsForCycle.map((b) => ({
          id: b.id,
          title: b.title,
          dueDate: b.due_date,
          status: b.status,
          amount: b.amount ?? 0,
          totalAmount: b.total_amount,
          metadata: b.metadata || {},
        })),
        minimumAmount: minimumFromBills ?? cycle.minimumAmount,
        // Add payment metadata from bills
        ...(paymentTiming && { billPaymentTiming: paymentTiming }),
        ...(amountComparison && { billAmountComparison: amountComparison }),
        ...(amountDifference !== undefined && { billAmountDifference: amountDifference }),
        ...(paidDate && { billPaidDate: paidDate }),
        ...(isWithinWindow !== undefined && { billIsWithinWindow: isWithinWindow }),
        ...(daysFromDue !== undefined && { billDaysFromDue: daysFromDue }),
        ...(cycleStatus && { billCycleStatus: cycleStatus }),
      };

      if (!scheduledBill) return cycleWithBills;

      return {
        ...cycleWithBills,
        // If a scheduled bill exists, use its amount and due date for visualization
        expectedAmount: scheduledBill.total_amount ?? scheduledBill.amount ?? cycle.expectedAmount,
        // Override expectedDate with the bill's due date if available
        expectedDate: scheduledBill.due_date || cycle.expectedDate,
        scheduledBill: {
          id: scheduledBill.id,
          amount: scheduledBill.total_amount ?? scheduledBill.amount ?? cycle.expectedAmount,
          dueDate: scheduledBill.due_date,
          status: scheduledBill.status,
          title: scheduledBill.title,
          metadata: scheduledBill.metadata || {},
        },
      };
    });

    // Apply cycle overrides (targets/dates/minimum) from liability metadata
    const liabilityOverrides = (liability.metadata as any)?.cycle_overrides || {};
    const cyclesWithOverrides = cyclesWithBills.map((cycle) => {
      const override = liabilityOverrides[cycle.cycleNumber];
      if (!override) return cycle;
      return {
        ...cycle,
        expectedAmount: override.expectedAmount ?? cycle.expectedAmount,
        expectedDate: override.expectedDate ?? cycle.expectedDate,
        minimumAmount: override.minimumAmount ?? cycle.minimumAmount,
        notes: override.notes ?? cycle.notes,
      };
    });

    // Add notes from database
    const cycleNotes = liability.cycle_notes || {};
    return cyclesWithOverrides.map((cycle) => ({
      ...cycle,
      notes: cycleNotes[cycle.cycleNumber.toString()] || cycle.notes,
    }));
  }, [liability, payments, bills, maxCycles, user]);

  // Get current, upcoming, and past cycles
  const currentCycle = useMemo(() => getCurrentCycle(cycles), [cycles]);
  const upcomingCycles = useMemo(() => getUpcomingCycles(cycles), [cycles]);
  const pastCycles = useMemo(() => getPastCycles(cycles), [cycles]);

  // Get statistics
  const statistics = useMemo(() => getCycleStatistics(cycles), [cycles]);

  // Update cycle note
  const updateCycleNote = useCallback(
    async (cycleNumber: number, note: string) => {
      if (!user || !liabilityId) return;

      try {
        const { error } = await supabase.rpc('update_liability_cycle_note', {
          p_liability_id: liabilityId,
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
    [user, liabilityId, fetchData]
  );

  // Update cycle target (expected amount, date, and/or minimum) via liability.metadata.cycle_overrides
  const updateCycleTarget = useCallback(
    async (
      cycleNumber: number, 
      expectedAmount?: number, 
      expectedDate?: string, 
      minimumAmount?: number,
      notes?: string
    ) => {
      if (!user || !liabilityId) return;
      const { data: liabilityRow, error } = await supabase
        .from('liabilities')
        .select('metadata')
        .eq('id', liabilityId)
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      const metadata = liabilityRow?.metadata || {};
      const overrides = metadata.cycle_overrides || {};
      overrides[cycleNumber] = {
        ...(overrides[cycleNumber] || {}),
        cycleNumber,
        ...(expectedAmount !== undefined && { expectedAmount }),
        ...(expectedDate !== undefined && { expectedDate }),
        ...(minimumAmount !== undefined && { minimumAmount }),
        ...(notes !== undefined && { notes }),
      };
      const { error: updateError } = await supabase
        .from('liabilities')
        .update({
          metadata: { ...metadata, cycle_overrides: overrides },
          updated_at: new Date().toISOString(),
        })
        .eq('id', liabilityId)
        .eq('user_id', user.id);
      if (updateError) throw updateError;
      setRefreshKey((k) => k + 1);
    },
    [user, liabilityId]
  );

  return {
    liability,
    cycles,
    currentCycle,
    upcomingCycles,
    pastCycles,
    statistics,
    loading,
    error,
    refresh: fetchData,
    updateCycleNote,
    updateCycleTarget,
  };
};

