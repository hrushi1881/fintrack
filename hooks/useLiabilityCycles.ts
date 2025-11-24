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
  interest_rate_apy: number;
  cycle_notes?: any;
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
}

interface UseLiabilityCyclesOptions {
  liabilityId: string;
  maxCycles?: number;
}

export const useLiabilityCycles = (options: UseLiabilityCyclesOptions) => {
  const { liabilityId, maxCycles = 12 } = options;
  const { user } = useAuth();
  
  const [liability, setLiability] = useState<Liability | null>(null);
  const [payments, setPayments] = useState<LiabilityPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      // Fetch payment history with principal and interest components
      const { data: paymentData, error: paymentError } = await supabase
        .from('liability_payments')
        .select('id, liability_id, amount, payment_date, principal_component, interest_component, description')
        .eq('liability_id', liabilityId)
        .gte('payment_date', liabilityData.start_date)
        .order('payment_date', { ascending: true });

      if (paymentError) throw paymentError;

      setPayments((paymentData || []) as LiabilityPayment[]);
    } catch (err: any) {
      console.error('Error fetching liability cycles data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, liabilityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate cycles
  const cycles = useMemo(() => {
    if (!liability) return [];

    const paymentAmount = liability.periodical_payment || 0;
    if (paymentAmount === 0) return [];

    // Map frequency
    let frequency: any = 'monthly';
    let interval = 1;
    
    if (liability.periodical_frequency) {
      const freq = liability.periodical_frequency.toLowerCase();
      if (freq === 'weekly') {
        frequency = 'weekly';
      } else if (freq === 'biweekly' || freq === 'bi-weekly') {
        frequency = 'weekly';
        interval = 2;
      } else if (freq === 'monthly') {
        frequency = 'monthly';
      } else if (freq === 'quarterly') {
        frequency = 'quarterly';
      } else if (freq === 'yearly') {
        frequency = 'yearly';
      }
    }

    const dueDay = liability.due_day_of_month || 1;
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
      },
    }));

    // Match payments to cycles
    const cyclesWithPayments = matchTransactionsToCycles(
      generatedCycles,
      paymentTransactions as any
    );

    // Add notes from database
    const cycleNotes = liability.cycle_notes || {};
    return cyclesWithPayments.map((cycle) => ({
      ...cycle,
      notes: cycleNotes[cycle.cycleNumber.toString()] || cycle.notes,
    }));
  }, [liability, payments, maxCycles, user]);

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
  };
};

