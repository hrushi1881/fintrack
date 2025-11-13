import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Goal, Budget, Category, Bill, AccountFund, Organization, FundType } from '@/types';
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
  const [accountFunds, setAccountFunds] = useState<AccountFund[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  
  const [loading, setLoading] = useState(true);

  const parseNumeric = useCallback((value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }, []);

  const normalizeFundType = useCallback((raw: any): FundType => {
    if (typeof raw === 'string') {
      const value = raw.toLowerCase();
      if (value === 'goal') return 'goal';
      if (value === 'borrowed') return 'borrowed';
      if (value === 'liability') return 'borrowed';
      if (value === 'reserved') return 'reserved';
      if (value === 'sinking') return 'sinking';
    }
    return 'personal';
  }, []);

  const deriveFundName = useCallback(
    (fundType: FundType, raw: any): string => {
      if (raw?.name) return raw.name;
      if (raw?.display_name) return raw.display_name;
      const metadataName = raw?.metadata?.name;
      if (metadataName) return metadataName;
      if (fundType === 'goal') {
        return raw?.metadata?.goal_name || 'Goal Fund';
      }
      if (fundType === 'borrowed') {
        return raw?.metadata?.liability_name || 'Borrowed Funds';
      }
      if (fundType === 'reserved') {
        return 'Reserved';
      }
      if (fundType === 'sinking') {
        return 'Sinking Fund';
      }
      return 'Personal Funds';
    },
    []
  );

  const deriveSpendable = useCallback((fundType: FundType, raw: any): boolean => {
    if (typeof raw?.spendable === 'boolean') {
      return raw.spendable;
    }
    if (raw?.metadata && typeof raw.metadata.spendable === 'boolean') {
      return raw.metadata.spendable;
    }
    if (fundType === 'goal') return false;
    if (fundType === 'reserved' || fundType === 'sinking') return false;
    return true; // personal & borrowed default to spendable
  }, []);

  // Recalculate account balance from transactions
  const recalculateAccountBalance = useCallback(async (accountId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('recalculate_account_balance', {
        p_account_id: accountId,
        p_user_id: user.id,
      });

      if (error) {
        console.error('Error recalculating balance for account:', accountId, error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error recalculating balance:', error);
      return null;
    }
  }, [user]);

  // Recalculate all account balances (without refreshing accounts to avoid circular dependency)
  const recalculateAllBalances = useCallback(async (shouldRefresh: boolean = false) => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('recalculate_all_account_balances', {
        p_user_id: user.id,
      });

      if (error) {
        console.error('Error recalculating all balances:', error);
        return [];
      }

      // If any balances were corrected and refresh is requested, refresh accounts
      if (shouldRefresh && data && data.length > 0) {
        console.log('✅ Corrected balances for accounts:', data);
        // Use a direct fetch to avoid circular dependency
        const { data: accountsData, error: accountsError } = await supabase
          .from('accounts')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name');
        if (!accountsError && accountsData) {
          setAccounts(accountsData);
        }
      }

      return data || [];
    } catch (error) {
      console.error('Error recalculating all balances:', error);
      return [];
    }
  }, [user]);

  // Fetch initial data
  const fetchAccounts = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .or('is_active.eq.true,is_active.is.null')
        .order('name');
      if (error) throw error;
      
      // Force a new array reference to ensure React detects the change
      const accountsData = data ? [...data] : [];
      console.log('✅ Fetched accounts:', accountsData.length, 'accounts');
      if (accountsData.length > 0) {
        console.log('   Account balances:', accountsData.map(a => ({ id: a.id, name: a.name, balance: a.balance })));
      }
      setAccounts(accountsData);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
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

  const fetchAccountFunds = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch account funds with account currency in a single query to avoid circular dependency
      const { data: fundsData, error: fundsError } = await supabase
        .from('account_funds')
        .select(`
          *,
          account:accounts!inner(currency)
        `)
        .order('created_at', { ascending: true });

      if (fundsError) {
        console.error('Error fetching account funds:', fundsError);
        return;
      }

      const normalized = (fundsData || []).map((fund: any) => {
        const fundType = normalizeFundType(fund?.fund_type ?? fund?.type);
        const balance = parseNumeric(fund?.balance);
        const derivedName = deriveFundName(fundType, fund);
        const currency =
          fund?.currency ??
          fund?.metadata?.currency ??
          fund?.account?.currency ??
          null;
        const referenceId = fund?.reference_id ?? null;
        const linkedGoalId =
          fund?.linked_goal_id ??
          (fundType === 'goal' ? referenceId ?? fund?.metadata?.goal_id ?? null : null);
        const linkedLiabilityId =
          fund?.linked_liability_id ??
          (fundType === 'borrowed'
            ? referenceId ?? fund?.metadata?.liability_id ?? null
            : null);

        return {
          id: fund.id,
          account_id: fund.account_id,
          fund_type: fundType,
          type: fund?.type,
          name: derivedName,
          display_name: fund?.display_name ?? derivedName,
          balance,
          currency,
          spendable: deriveSpendable(fundType, fund),
          reference_id: referenceId,
          linked_goal_id: linkedGoalId,
          linked_liability_id: linkedLiabilityId,
          metadata: fund?.metadata ?? null,
          created_at: fund?.created_at,
          updated_at: fund?.updated_at,
        } as AccountFund;
      });

      setAccountFunds(normalized);
    } catch (error) {
      console.error('Error fetching account funds:', error);
    }
  }, [user, normalizeFundType, parseNumeric, deriveFundName, deriveSpendable]);

  const fetchOrganizations = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching organizations:', error);
        return;
      }

      setOrganizations((data ?? []) as Organization[]);
    } catch (error) {
      console.error('Error fetching organizations:', error);
    }
  }, [user]);

  


  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    // Fetch initial data
    const loadData = async () => {
      setLoading(true);
      
      // Fetch all data first
      await Promise.all([
        fetchTransactions(),
        fetchAccounts(), 
        fetchGoals(), 
        fetchBudgets(),
        fetchCategoriesData(),
        fetchBillsData(),
        fetchAccountFunds(),
        fetchOrganizations(),
      ]);
      
      // Recalculate balances to fix any drift from old transactions or data issues
      // The recalculate function now uses balance_after from transactions, so it's safe
      await recalculateAllBalances(true);
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

    const organizationsSubscription = supabase
      .channel('organizations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organizations',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Organization change received:', payload);
          fetchOrganizations();
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
      supabase.removeChannel(organizationsSubscription);
      
    };
    // Dependencies: Only include user and fetch functions
    // Note: recalculateAllBalances is not included as it's only used on initial load
    // The circular dependency with fetchAccountFunds has been fixed (no longer depends on accounts state)
  }, [user, fetchAccounts, fetchTransactions, fetchGoals, fetchBudgets, fetchCategoriesData, fetchBillsData, fetchAccountFunds, fetchOrganizations]);

  // Manual refresh functions - return promises so they can be awaited
  const refreshAccounts = useCallback(async () => {
    console.log('🔄 Refreshing accounts...');
    // Always fetch accounts first to get the latest data
    // The RPC functions update balances correctly, and recalculate_account_balance
    // now uses balance_after from transactions, so we don't need to recalculate here
    // Recalculation would only overwrite correct balances
    await fetchAccounts();
    console.log('✅ Accounts refreshed');
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

  const refreshAccountFunds = useCallback(async () => {
    await fetchAccountFunds();
  }, [fetchAccountFunds]);

  const refreshOrganizations = useCallback(async () => {
    await fetchOrganizations();
  }, [fetchOrganizations]);

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
      fetchBillsData(),
      fetchAccountFunds(),
      fetchOrganizations(),
    ]);
  }, [fetchAccounts, fetchTransactions, fetchGoals, fetchBudgets, fetchCategoriesData, fetchBillsData, fetchAccountFunds, fetchOrganizations]);

  // Global refresh function that ensures all data is up to date
  const globalRefresh = useCallback(async () => {
    if (!user) return;
    
    console.log('🔄 Global refresh triggered');
    
    // Refresh all data to get latest state
    // RPC functions update balances correctly, and recalculate_account_balance
    // now uses balance_after from transactions, so recalculation will use correct values
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

  const fundsByAccount = useMemo(() => {
    const map = new Map<string, AccountFund[]>();
    accountFunds.forEach((fund) => {
      if (!map.has(fund.account_id)) {
        map.set(fund.account_id, []);
      }
      map.get(fund.account_id)!.push(fund);
    });
    return map;
  }, [accountFunds]);

  const getFundsForAccount = useCallback(
    (accountId: string, options?: { includeLocked?: boolean }) => {
      const includeLocked = options?.includeLocked ?? true;
      const funds = fundsByAccount.get(accountId) ?? [];
      if (includeLocked) {
        return funds;
      }
      return funds.filter((fund) => fund.spendable);
    },
    [fundsByAccount]
  );

  const getFundSummary = useCallback(
    (accountId: string) => {
      const funds = fundsByAccount.get(accountId) ?? [];
      return funds.reduce(
        (acc, fund) => {
          const balance = fund.balance ?? 0;
          acc.total += balance;
          if (fund.spendable) {
            acc.spendable += balance;
          } else {
            acc.locked += balance;
          }
          if (fund.fund_type === 'goal') {
            acc.goal += balance;
          }
          if (fund.fund_type === 'borrowed') {
            acc.borrowed += balance;
          }
          return acc;
        },
        {
          total: 0,
          spendable: 0,
          locked: 0,
          goal: 0,
          borrowed: 0,
        }
      );
    },
    [fundsByAccount]
  );

  return {
    accounts,
    transactions,
    goals,
    budgets,
    categories,
    bills,
    accountFunds,
    organizations,
    totalBalance,
    totalAssets,
    totalLiabilities,
    netWorth,
    loading,
    fundsByAccount,
    getFundsForAccount,
    getFundSummary,
    refreshAccounts,
    refreshTransactions,
    refreshGoals,
    refreshBudgets,
    refreshCategories,
    refreshBills,
    refreshAccountFunds,
    refreshOrganizations,
    refreshAll,
    globalRefresh,
    getBudgetsByAccount,
    recalculateAccountBalance,
    recalculateAllBalances,
  };
};
