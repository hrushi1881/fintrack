import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Goal, Budget, Category, Bill } from '@/types';
import { fetchCategories } from '@/utils/categories';
import { fetchBills } from '@/utils/bills';
 

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  description?: string;
  color: string;
  icon: string;
  include_in_totals?: boolean;
  is_active: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  account_id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description: string;
  date: string;
  category_id?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  category?: {
    name: string;
  };
  account?: {
    name: string;
    color: string;
    icon: string;
  };
}

export const useRealtimeData = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  
  const [loading, setLoading] = useState(true);

  // Fetch initial data
  const fetchAccounts = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  }, [user]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          category:categories!transactions_category_id_fkey_new(name, color, icon),
          account:accounts!transactions_account_id_fkey(name, color, icon)
        `)
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching transactions:', error);
        return;
      }

      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  }, [user]);

  const fetchGoals = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching goals:', error);
        return;
      }

      setGoals(data || []);
    } catch (error) {
      console.error('Error fetching goals:', error);
    }
  }, [user]);

  const fetchBudgets = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('budgets')
        .select(`
          *,
          budget_accounts!inner(
            account_id,
            account:accounts!inner(name, color, icon)
          )
        `)
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching budgets:', error);
        return;
      }

      setBudgets(data || []);
    } catch (error) {
      console.error('Error fetching budgets:', error);
    }
  }, [user]);

  const fetchCategoriesData = useCallback(async () => {
    if (!user) return;

    try {
      const categoriesData = await fetchCategories(user.id);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, [user]);

  const fetchBillsData = useCallback(async () => {
    if (!user) return;

    try {
      const billsData = await fetchBills(user.id);
      setBills(billsData);
    } catch (error) {
      console.error('Error fetching bills:', error);
    }
  }, [user]);

  


  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    // Fetch initial data
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchAccounts(), 
        fetchTransactions(), 
        fetchGoals(), 
        fetchBudgets(),
        fetchCategoriesData(),
        fetchBillsData()
      ]);
      setLoading(false);
    };

    loadData();

    // Set up real-time subscriptions
    const accountsSubscription = supabase
      .channel('accounts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Account change received:', payload);
          fetchAccounts();
        }
      )
      .subscribe();

    const transactionsSubscription = supabase
      .channel('transactions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Transaction change received:', payload);
          fetchTransactions();
        }
      )
      .subscribe();

    const goalsSubscription = supabase
      .channel('goals_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'goals',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Goal change received:', payload);
          fetchGoals();
        }
      )
      .subscribe();

    const budgetsSubscription = supabase
      .channel('budgets_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budgets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Budget change received:', payload);
          fetchBudgets();
        }
      )
      .subscribe();

    const categoriesSubscription = supabase
      .channel('categories_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Category change received:', payload);
          fetchCategoriesData();
        }
      )
      .subscribe();

    const billsSubscription = supabase
      .channel('bills_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bills',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Bill change received:', payload);
          fetchBillsData();
        }
      )
      .subscribe();

    

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(accountsSubscription);
      supabase.removeChannel(transactionsSubscription);
      supabase.removeChannel(goalsSubscription);
      supabase.removeChannel(budgetsSubscription);
      supabase.removeChannel(categoriesSubscription);
      supabase.removeChannel(billsSubscription);
      
    };
  }, [user, fetchAccounts, fetchTransactions, fetchGoals, fetchBudgets, fetchCategoriesData, fetchBillsData]);

  // Manual refresh functions - return promises so they can be awaited
  const refreshAccounts = useCallback(async () => {
    await fetchAccounts();
  }, [fetchAccounts]);

  const refreshTransactions = useCallback(async () => {
    await fetchTransactions();
  }, [fetchTransactions]);

  const refreshGoals = useCallback(async () => {
    await fetchGoals();
  }, [fetchGoals]);

  const refreshBudgets = useCallback(async () => {
    await fetchBudgets();
  }, [fetchBudgets]);

  const refreshCategories = useCallback(async () => {
    await fetchCategoriesData();
  }, [fetchCategoriesData]);

  const refreshBills = useCallback(async () => {
    await fetchBillsData();
  }, [fetchBillsData]);

  

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchAccounts(),
      fetchTransactions(),
      fetchGoals(),
      fetchBudgets(),
      fetchCategoriesData(),
      fetchBillsData()
    ]);
  }, [fetchAccounts, fetchTransactions, fetchGoals, fetchBudgets, fetchCategoriesData, fetchBillsData]);

  // Global refresh function that ensures all data is up to date
  const globalRefresh = useCallback(async () => {
    if (!user) return;
    
    console.log('🔄 Global refresh triggered');
    await refreshAll();
  }, [user, refreshAll]);

  // Get budgets by account
  const getBudgetsByAccount = useCallback((accountId: string) => {
    return budgets.filter(budget => 
      (budget as any).budget_accounts?.some((ba: any) => ba.account_id === accountId)
    );
  }, [budgets]);

  // Calculate total balance (assets only, excluding liability accounts)
  const totalBalance = accounts
    .filter(account => account.type !== 'liability' && account.include_in_totals)
    .reduce((sum, account) => sum + account.balance, 0);

  // Calculate net worth (assets - liabilities)
  const totalAssets = accounts
    .filter(account => account.type !== 'liability' && account.include_in_totals)
    .reduce((sum, account) => sum + account.balance, 0);

  const totalLiabilities = 0;

  const netWorth = totalAssets - totalLiabilities;

  return {
    accounts,
    transactions,
    goals,
    budgets,
    categories,
    bills,
    totalBalance,
    totalAssets,
    totalLiabilities,
    netWorth,
    loading,
    refreshAccounts,
    refreshTransactions,
    refreshGoals,
    refreshBudgets,
    refreshCategories,
    refreshBills,
    refreshAll,
    globalRefresh,
    getBudgetsByAccount,
  };
};
