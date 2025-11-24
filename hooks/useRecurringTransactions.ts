import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecurringTransaction } from '@/types';
import {
  calculateNatureTotals,
  filterRecurringTransactions,
  getRecurringDashboardData,
  RecurringFilter,
} from '@/utils/recurringTransactions';
import { mockRecurringSummary } from '@/utils/mockRecurringData';

export interface SubscriptionInsight {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  pausedCount: number;
  potentialSavings: number;
}

export const useRecurringTransactions = () => {
  const [transactions, setTransactions] = useState<RecurringTransaction[]>([]);
  const [summary, setSummary] = useState(mockRecurringSummary);
  const [upcoming, setUpcoming] = useState<RecurringTransaction[]>([]);
  const [paused, setPaused] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RecurringFilter>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getRecurringDashboardData();
    setTransactions(data.transactions);
    setSummary(data.summary);
    setUpcoming(data.upcoming);
    setPaused(data.paused);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredTransactions = useMemo(
    () => filterRecurringTransactions(transactions, filter),
    [transactions, filter],
  );

  const totalsByNature = useMemo(
    () => calculateNatureTotals(transactions),
    [transactions],
  );

  const groupedByNature = useMemo(() => {
    const map: Record<string, RecurringTransaction[]> = {
      subscription: [],
      bill: [],
      payment: [],
      income: [],
    };

    transactions.forEach((rt) => {
      map[rt.nature].push(rt);
    });

    return map;
  }, [transactions]);

  const subscriptionInsights = useMemo<SubscriptionInsight>(() => {
    const subs = groupedByNature.subscription;
    const totalMonthly = subs.reduce(
      (sum, rt) => sum + (rt.amount ?? rt.estimated_amount ?? 0),
      0,
    );
    const pausedCount = subs.filter((rt) => rt.status === 'paused').length;

    return {
      totalMonthly,
      totalAnnual: totalMonthly * 12,
      activeCount: subs.length,
      pausedCount,
      potentialSavings: pausedCount > 0 ? pausedCount * 2000 : 0,
    };
  }, [groupedByNature]);

  const netMonthly = useMemo(
    () => summary.monthlyIncome - summary.monthlyExpense,
    [summary],
  );

  return {
    transactions,
    filteredTransactions,
    groupedByNature,
    summary,
    upcoming,
    paused,
    filter,
    setFilter,
    refresh,
    loading,
    totalsByNature,
    subscriptionInsights,
    netMonthly,
  };
};

export const useRecurringTransaction = (id?: string) => {
  const [transaction, setTransaction] = useState<RecurringTransaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const data = await getRecurringDashboardData();
      const found = data.transactions.find((rt) => rt.id === id) || null;
      setTransaction(found);
      setLoading(false);
    };
    load();
  }, [id]);

  return { transaction, loading };
};

