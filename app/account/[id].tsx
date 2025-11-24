import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import PayModal from '../modals/pay';
import TransferModal from '../modals/transfer';
import TransferFundsModal from '../modals/transfer-funds';
import { AddBudgetModal } from '../modals/add-budget';
import type { AccountFund } from '@/types';

const MAX_RECENT_TRANSACTIONS = 4;

const toNumber = (value: any) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return parseFloat(value);
  return Number(value);
  };

export default function AccountDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const accountId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const {
    accounts,
    transactions,
    goals,
    budgets,
    refreshAccounts,
    refreshAccountFunds,
    globalRefresh,
    getFundsForAccount,
    getFundSummary,
  } = useRealtimeData();
  const { currency } = useSettings();
  
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferFundsModalVisible, setTransferFundsModalVisible] = useState(false);
  const [addBudgetModalVisible, setAddBudgetModalVisible] = useState(false);
  const [selectedFundFilter, setSelectedFundFilter] = useState<'all' | 'personal' | 'goal' | 'borrowed'>('all');
  
  const account = useMemo(
    () => accounts.find((item) => item.id === accountId),
    [accounts, accountId]
  );

  // Helper function to get fund type from transaction metadata
  const getTransactionFundType = useCallback((tx: any): 'personal' | 'goal' | 'borrowed' | null => {
    const metadata = tx.metadata || {};
    const bucketType = metadata.bucket_type || metadata.bucket;
    
    if (!bucketType || bucketType === 'personal') {
      return 'personal';
    }
    
    // Map 'liability' to 'borrowed' for consistency
    if (bucketType === 'liability' || bucketType === 'borrowed') {
      return 'borrowed';
    }
    
    if (bucketType === 'goal') {
      return 'goal';
    }
    
    return null; // Unknown type, default to personal
  }, []);

  const accountTransactions = useMemo(() => {
    if (!accountId) return [];
    let filtered = transactions
      .filter((tx) => tx.account_id === accountId);
    
    // Filter by fund type if not 'all'
    if (selectedFundFilter !== 'all') {
      filtered = filtered.filter((tx) => {
        const fundType = getTransactionFundType(tx);
        return fundType === selectedFundFilter;
      });
    }
    
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, accountId, selectedFundFilter, getTransactionFundType]);

  // Get transaction counts by fund type for tabs
  const transactionCounts = useMemo(() => {
    if (!accountId) return { all: 0, personal: 0, goal: 0, borrowed: 0 };
    
    const accountTxs = transactions.filter((tx) => tx.account_id === accountId);
    
    const counts = {
      all: accountTxs.length,
      personal: 0,
      goal: 0,
      borrowed: 0,
    };
    
    accountTxs.forEach((tx) => {
      const fundType = getTransactionFundType(tx);
      if (fundType === 'personal') counts.personal++;
      else if (fundType === 'goal') counts.goal++;
      else if (fundType === 'borrowed') counts.borrowed++;
    });
    
    return counts;
  }, [transactions, accountId, getTransactionFundType]);

  const fundsForAccount = useMemo<AccountFund[]>(() => {
    if (!accountId) return [];
    const list = getFundsForAccount(accountId, { includeLocked: true });
    return [...list].sort((a, b) => Number(b.spendable) - Number(a.spendable));
  }, [accountId, getFundsForAccount]);

  const fundSummary = useMemo(() => {
    if (!accountId) {
      return { total: 0, spendable: 0, locked: 0, goal: 0, borrowed: 0 };
    }
    return getFundSummary(accountId);
  }, [accountId, getFundSummary]);

  // Check if account has multiple fund types (to determine if Personal Fund label should be shown)
  // Per documentation: Only show Personal Fund label when OTHER funds exist alongside it
  const hasMultipleFundTypes = useMemo(() => {
    if (!accountId) return false;
    const funds = fundsForAccount.filter((f) => (f.balance ?? 0) > 0);
    const fundTypes = new Set(funds.map((f) => f.fund_type));
    
    // Only show Personal Fund label if there are other fund types (borrowed or goal)
    // If only personal fund exists, don't show breakdown
    const hasNonPersonalFunds = funds.some((f) => f.fund_type !== 'personal' && (f.balance ?? 0) > 0);
    return hasNonPersonalFunds && fundTypes.size > 0;
  }, [fundsForAccount, accountId]);

  // Get Personal Fund balance (available to spend)
  // Personal Fund = Account Balance - (Sum of Liability Funds) - (Sum of Goal Funds)
  // Personal Fund is NOT stored in account_funds - it's implicit
  const personalFundBalance = useMemo(() => {
    if (!accountId || !account) return 0;
    const accountBalance = toNumber(account.balance);
    const totalLiability = fundSummary.borrowed || 0;
    const totalGoal = fundSummary.goal || 0;
    // Personal Fund is what's left after subtracting liability and goal funds
    const personalFund = Math.max(0, accountBalance - totalLiability - totalGoal);
    return personalFund;
  }, [accountId, account, fundSummary.borrowed, fundSummary.goal]);

  // Get Liability Funds (only show if balance > 0)
  const liabilityFunds = useMemo(() => {
    return fundsForAccount.filter(
      (f) => f.fund_type === 'borrowed' && (f.balance ?? 0) > 0
    );
  }, [fundsForAccount]);

  // Get Goal Funds (only show if balance > 0)
  const goalFunds = useMemo(() => {
    return fundsForAccount.filter(
      (f) => f.fund_type === 'goal' && (f.balance ?? 0) > 0
    );
  }, [fundsForAccount]);

  const linkedGoals = useMemo(
    () => {
      // For Goals Savings account, show all goals
      if (account?.type === 'goals_savings') {
        return [];
      }
      // For regular accounts, find goals that have funds in this account
      return goals.filter((goal) => {
        // This would require checking account_funds, but for now return empty
        // as goals are no longer linked to specific accounts
        return false;
      });
    },
    [goals, accountId, account?.type]
  );

  const linkedBudgets = useMemo(() => {
    return budgets.filter((budget: any) =>
      accountId && budget?.budget_accounts?.some((link: any) => link.account_id === accountId)
    );
  }, [budgets, accountId]);

  // Helper function to get fund name from transaction (goal or liability name)
  const getTransactionFundName = useCallback((tx: any, fundType: 'personal' | 'goal' | 'borrowed' | null): string | null => {
    if (!fundType || fundType === 'personal') return null;
    
    const metadata = tx.metadata || {};
    const bucketId = metadata.bucket_id;
    
    if (!bucketId) return null;
    
    if (fundType === 'goal') {
      const goal = goals.find((g) => g.id === bucketId);
      return goal ? goal.title : null;
    }
    
    if (fundType === 'borrowed') {
      // Note: liabilities are not in the useRealtimeData hook, so we'd need to fetch them
      // For now, return null and show "Borrowed Fund" in the UI
      return null;
    }
    
    return null;
  }, [goals]);

  const formatCurrency = (value: number) => formatCurrencyAmount(value, currency);

  // Calculate aggregate goal statistics for Goals Savings account
  const goalStatistics = useMemo(() => {
    if (account?.type !== 'goals_savings') {
      return null;
    }

    const active = goals.filter((goal) => !goal.is_achieved && !goal.is_archived);
    const completed = goals.filter((goal) => goal.is_achieved && !goal.is_archived);
    const archived = goals.filter((goal) => goal.is_archived);

    const totals = goals.reduce(
      (acc, goal) => {
        const saved = Number(goal.current_amount ?? 0);
        const target = Number(goal.target_amount ?? 0);
        return {
          saved: acc.saved + saved,
          target: acc.target + target,
        };
      },
      { saved: 0, target: 0 }
    );

    return {
      activeGoals: active,
      completedGoals: completed,
      archivedGoals: archived,
      totalSaved: totals.saved,
      totalTarget: totals.target,
      totalGoals: goals.length,
    };
  }, [goals, account?.type]);

  const handleFundAction = useCallback(
    (fund: AccountFund) => {
      if (fund.fund_type === 'goal' && fund.linked_goal_id) {
        router.push(`/goal/${fund.linked_goal_id}`);
        return;
      }
      if (fund.fund_type === 'borrowed' && fund.linked_liability_id) {
        router.push(`/liability/${fund.linked_liability_id}`);
      }
    },
    []
  );

  const handleSync = async () => {
    await globalRefresh();
    await refreshAccountFunds();
    await refreshAccounts();
  };

  if (!account) {
    return (
      <SafeAreaView style={styles.safeArea}> 
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Account not found.</Text>
            </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color="#0E401C" />
      </TouchableOpacity>
            <Text style={styles.headerTitle}>{account.name}</Text>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleSync}
              accessibilityLabel="Refresh account"
            >
              <Ionicons name="refresh" size={20} color="#0E401C" />
            </TouchableOpacity>
    </View>

          <View style={styles.balanceCard}>
            {goalStatistics ? (
              <>
                <Text style={styles.balanceLabel}>Total Goal Savings</Text>
                <Text style={styles.balanceValue}>
                  {formatCurrency(goalStatistics.totalSaved)}
                </Text>
                <Text style={styles.balanceSubtext}>
                  {goalStatistics.totalGoals} {goalStatistics.totalGoals === 1 ? 'goal' : 'goals'} · {formatCurrency(goalStatistics.totalTarget)} target
                </Text>
                <TouchableOpacity 
                  style={[styles.primaryPill, styles.addTransactionButton]}
                  onPress={() => router.push('/(tabs)/goals')}
                >
                  <Text style={styles.primaryPillText}>View All Goals</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.balanceLabel}>Total Balance</Text>
                <Text style={styles.balanceValue}>
                  {formatCurrency(toNumber(account.balance))}
                </Text>
                {/* Only show Personal Fund breakdown if multiple fund types exist */}
                {hasMultipleFundTypes && (
                  <View style={styles.availableBalanceSection}>
                    <Text style={styles.availableBalanceLabel}>Available to Spend</Text>
                    <Text style={styles.availableBalanceValue}>
                      {formatCurrency(personalFundBalance + (fundSummary.spendable || 0))}
                    </Text>
                    <Text style={styles.availableBalanceSubtext}>
                      Personal Fund - Your true available balance
                    </Text>
                  </View>
                )}
                <View style={styles.balanceActions}>
                  <TouchableOpacity 
                    style={[styles.primaryPill, styles.addTransactionButton]}
                    onPress={() => setPayModalVisible(true)}
                  >
                    <Text style={styles.primaryPillText}>Add Transaction</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.secondaryPill, styles.transferButton]}
                    onPress={() => setTransferModalVisible(true)}
                  >
                    <Text style={styles.secondaryPillText}>Transfer</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {goalStatistics ? (
            <>
              {/* Goals Savings Account - Show Aggregate Statistics */}
              <View style={styles.goalsSummaryCard}>
                <View style={styles.goalsSummaryHeader}>
                  <Text style={styles.sectionTitle}>Goals Overview</Text>
                </View>
                <View style={styles.goalsStatsRow}>
                  <View style={styles.goalsStatItem}>
                    <Text style={styles.goalsStatLabel}>Active Goals</Text>
                    <Text style={styles.goalsStatValue}>{goalStatistics.activeGoals.length}</Text>
                    <Text style={styles.goalsStatAmount}>
                      {formatCurrency(
                        goalStatistics.activeGoals.reduce((sum, g) => sum + (Number(g.current_amount) || 0), 0)
                      )}
        </Text>
                  </View>
                  <View style={styles.goalsStatItem}>
                    <Text style={styles.goalsStatLabel}>Completed</Text>
                    <Text style={styles.goalsStatValue}>{goalStatistics.completedGoals.length}</Text>
                    <Text style={styles.goalsStatAmount}>
                      {formatCurrency(
                        goalStatistics.completedGoals.reduce((sum, g) => sum + (Number(g.current_amount) || 0), 0)
                      )}
                    </Text>
                  </View>
                </View>
                <View style={styles.goalsProgressBar}>
                  <View
                    style={[
                      styles.goalsProgressFill,
                      {
                        width: `${goalStatistics.totalTarget > 0 ? (goalStatistics.totalSaved / goalStatistics.totalTarget) * 100 : 0}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.goalsProgressText}>
                  {formatCurrency(goalStatistics.totalSaved)} of {formatCurrency(goalStatistics.totalTarget)} saved
                </Text>
              </View>

              <View style={styles.goalsListCard}>
                <Text style={styles.sectionTitle}>Your Goals</Text>
                {goalStatistics.activeGoals.length === 0 && goalStatistics.completedGoals.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="flag-outline" size={36} color="#8BA17B" />
                    <Text style={styles.emptyStateText}>No goals yet. Create one to start saving!</Text>
                  </View>
                ) : (
                  <>
                    {goalStatistics.activeGoals.map((goal) => (
      <TouchableOpacity 
                        key={goal.id}
                        style={styles.goalItem}
                        onPress={() => router.push(`/goal/${goal.id}`)}
                      >
                        <View style={[styles.goalItemIcon, { backgroundColor: goal.color || '#4F6F3E' }]}>
                          <Ionicons name={(goal.icon as any) || 'flag'} size={20} color="white" />
                        </View>
                        <View style={styles.goalItemInfo}>
                          <Text style={styles.goalItemTitle}>{goal.title}</Text>
                          <Text style={styles.goalItemProgress}>
                            {formatCurrency(Number(goal.current_amount) || 0)} of {formatCurrency(Number(goal.target_amount) || 0)}
        </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </TouchableOpacity>
                    ))}
                    {goalStatistics.completedGoals.length > 0 && (
                      <>
                        <Text style={styles.completedSectionTitle}>Completed Goals</Text>
                        {goalStatistics.completedGoals.map((goal) => (
      <TouchableOpacity 
                            key={goal.id}
                            style={styles.goalItem}
                            onPress={() => router.push(`/goal/${goal.id}`)}
                          >
                            <View style={[styles.goalItemIcon, { backgroundColor: goal.color || '#4F6F3E' }]}>
                              <Ionicons name={(goal.icon as any) || 'flag'} size={20} color="white" />
                            </View>
                            <View style={styles.goalItemInfo}>
                              <Text style={styles.goalItemTitle}>{goal.title}</Text>
                              <Text style={styles.goalItemProgress}>
                                {formatCurrency(Number(goal.current_amount) || 0)} saved
        </Text>
                            </View>
                            <Ionicons name="checkmark-circle" size={20} color="#4F6F3E" />
      </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </>
                )}
      <TouchableOpacity 
                  style={styles.addGoalButton}
                  onPress={() => router.push('/(tabs)/goals')}
      >
                  <Ionicons name="add" size={18} color="#4F6F3E" />
                  <Text style={styles.addGoalText}>View All Goals</Text>
      </TouchableOpacity>
    </View>
            </>
          ) : (
            <>
              {/* Regular Account - Show Funds and Transactions */}
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Text style={styles.sectionTitle}>Spending This Month</Text>
                  <Text style={styles.chartAmount}>{formatCurrencyAmount(0, currency)}</Text>
                </View>
                <Text style={styles.chartCaption}>Week 1   Week 2   Week 3   Week 4</Text>
                <View style={styles.chartPlaceholder}>
                  <Ionicons name="pulse-outline" size={64} color="#D3DFC7" />
                </View>
              </View>

              {/* Only show Funds Breakdown section if multiple fund types exist */}
              {hasMultipleFundTypes && (
                <View style={styles.fundBreakdownCard}>
                  <View style={styles.fundSummaryHeader}>
                    <Text style={styles.sectionTitle}>Funds Breakdown</Text>
                    <TouchableOpacity
                      style={styles.transferFundsButton}
                      onPress={() => setTransferFundsModalVisible(true)}
                    >
                      <Ionicons name="swap-horizontal" size={16} color="#000000" />
                      <Text style={styles.transferFundsButtonText}>Transfer</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Tree-structured fund display */}
                  <View style={styles.fundsTreeContainer}>
                    {/* Account name and total */}
                    <Text style={styles.accountTotalText}>
                      {account?.name}: {formatCurrency(toNumber(account?.balance))}
                    </Text>
                    
                    {/* All funds with tree structure */}
                    {personalFundBalance > 0 && (
                      <View style={styles.fundTreeRow}>
                        <Text style={styles.treeLine}>
                          {liabilityFunds.length > 0 || goalFunds.length > 0 ? '├─' : '└─'}
                        </Text>
                        <View style={styles.fundTreeContent}>
                          <View style={[styles.fundTreeIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                            <Ionicons name="wallet-outline" size={18} color="#10B981" />
                          </View>
                          <View style={styles.fundTreeInfo}>
                            <Text style={styles.fundTreeLabel}>Personal Fund</Text>
                            <Text style={[styles.fundTreeAmount, { color: '#10B981' }]}>
                              {formatCurrency(personalFundBalance)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Liability Funds - Multiple shown separately */}
                    {liabilityFunds.map((fund, index) => {
                      const isLastLiability = index === liabilityFunds.length - 1;
                      const hasGoals = goalFunds.length > 0;
                      const treeChar = isLastLiability && !hasGoals ? '└─' : '├─';
                      
                      return (
                        <View key={fund.id} style={styles.fundTreeRow}>
                          <Text style={styles.treeLine}>{treeChar}</Text>
                          <TouchableOpacity
                            style={styles.fundTreeContent}
                            onPress={() => handleFundAction(fund)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.fundTreeIcon, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                              <Ionicons name="card-outline" size={18} color="#EF4444" />
                            </View>
                            <View style={styles.fundTreeInfo}>
                              <Text style={styles.fundTreeLabel}>{fund.name}</Text>
                              <Text style={[styles.fundTreeAmount, { color: '#EF4444' }]}>
                                {formatCurrency(fund.balance ?? 0)}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    })}

                    {/* Goal Funds - Multiple shown separately */}
                    {goalFunds.map((fund, index) => {
                      const isLastGoal = index === goalFunds.length - 1;
                      const treeChar = '└─';
                      
                      return (
                        <View key={fund.id} style={styles.fundTreeRow}>
                          <Text style={styles.treeLine}>{treeChar}</Text>
                          <TouchableOpacity
                            style={styles.fundTreeContent}
                            onPress={() => handleFundAction(fund)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.fundTreeIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                              <Ionicons name="flag-outline" size={18} color="#3B82F6" />
                            </View>
                            <View style={styles.fundTreeInfo}>
                              <Text style={styles.fundTreeLabel}>{fund.name}</Text>
                              <Text style={[styles.fundTreeAmount, { color: '#3B82F6' }]}>
                                {formatCurrency(fund.balance ?? 0)}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.transactionsCard}>
                <View style={styles.transactionsHeader}>
                  <Text style={styles.sectionTitle}>Transactions</Text>
                </View>
                
                {/* Fund Type Filter Tabs */}
                {hasMultipleFundTypes && (
                  <View style={styles.fundFilterTabs}>
                    <TouchableOpacity
                      style={[
                        styles.fundFilterTab,
                        selectedFundFilter === 'all' && styles.fundFilterTabActive,
                      ]}
                      onPress={() => setSelectedFundFilter('all')}
                    >
                      <Text
                        style={[
                          styles.fundFilterTabText,
                          selectedFundFilter === 'all' && styles.fundFilterTabTextActive,
                        ]}
                      >
                        All
                      </Text>
                      {transactionCounts.all > 0 && (
                        <Text
                          style={[
                            styles.fundFilterTabCount,
                            selectedFundFilter === 'all' && styles.fundFilterTabCountActive,
                          ]}
                        >
                          {transactionCounts.all}
                        </Text>
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[
                        styles.fundFilterTab,
                        selectedFundFilter === 'personal' && styles.fundFilterTabActive,
                      ]}
                      onPress={() => setSelectedFundFilter('personal')}
                    >
                      <Text
                        style={[
                          styles.fundFilterTabText,
                          selectedFundFilter === 'personal' && styles.fundFilterTabTextActive,
                        ]}
                      >
                        Personal
                      </Text>
                      {transactionCounts.personal > 0 && (
                        <Text
                          style={[
                            styles.fundFilterTabCount,
                            selectedFundFilter === 'personal' && styles.fundFilterTabCountActive,
                          ]}
                        >
                          {transactionCounts.personal}
                        </Text>
                      )}
                    </TouchableOpacity>
                    
                    {transactionCounts.goal > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.fundFilterTab,
                          selectedFundFilter === 'goal' && styles.fundFilterTabActive,
                        ]}
                        onPress={() => setSelectedFundFilter('goal')}
                      >
                        <Text
                          style={[
                            styles.fundFilterTabText,
                            selectedFundFilter === 'goal' && styles.fundFilterTabTextActive,
                          ]}
                        >
                          Goal
                        </Text>
                        <Text
                          style={[
                            styles.fundFilterTabCount,
                            selectedFundFilter === 'goal' && styles.fundFilterTabCountActive,
                          ]}
                        >
                          {transactionCounts.goal}
                        </Text>
                      </TouchableOpacity>
                    )}
                    
                    {transactionCounts.borrowed > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.fundFilterTab,
                          selectedFundFilter === 'borrowed' && styles.fundFilterTabActive,
                        ]}
                        onPress={() => setSelectedFundFilter('borrowed')}
                      >
                        <Text
                          style={[
                            styles.fundFilterTabText,
                            selectedFundFilter === 'borrowed' && styles.fundFilterTabTextActive,
                          ]}
                        >
                          Borrowed
                        </Text>
                        <Text
                          style={[
                            styles.fundFilterTabCount,
                            selectedFundFilter === 'borrowed' && styles.fundFilterTabCountActive,
                          ]}
                        >
                          {transactionCounts.borrowed}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                
                {accountTransactions.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="receipt-outline" size={36} color="#8BA17B" />
                    <Text style={styles.emptyStateText}>
                      {selectedFundFilter === 'all'
                        ? 'No transactions yet. Start by adding one.'
                        : `No ${selectedFundFilter} transactions found.`}
                    </Text>
                  </View>
                ) : (
                  accountTransactions.slice(0, MAX_RECENT_TRANSACTIONS).map((tx) => {
                    const fundType = getTransactionFundType(tx);
                    const fundName = getTransactionFundName(tx, fundType);
                    return (
                      <RecentTransactionRow
                        key={tx.id}
                        name={tx.description || tx.category?.name || 'Transaction'}
                        amount={tx.amount}
                        type={tx.type}
                        date={tx.date}
                        fundType={fundType}
                        fundName={fundName}
                        onPress={() => router.push(`/transaction/${tx.id}`)}
                        formatter={formatCurrency}
                      />
                    );
                  })
                )}
                {accountTransactions.length > MAX_RECENT_TRANSACTIONS && (
          <TouchableOpacity 
                    style={styles.viewAllButton}
                    onPress={() => router.push('/(tabs)/transactions')}
          >
                    <Text style={styles.viewAllText}>View all</Text>
                    <Ionicons name="chevron-forward" size={18} color="#4F6F3E" />
          </TouchableOpacity>
                )}
        </View>

              <View style={styles.linkedSection}>
                <Text style={styles.sectionTitle}>Linked Goals / Budgets</Text>
                {linkedGoals.map((goal) => (
                  <LinkedItemRow
                    key={`goal-${goal.id}`}
                    icon="airplane-outline"
                    title={goal.title}
                    subtitle={`${formatCurrencyAmount(goal.current_amount ?? 0, currency)} saved`}
                    onPress={() => router.push(`/goal/${goal.id}`)}
                  />
                ))}
                {linkedBudgets.map((budget) => (
                  <LinkedItemRow
                    key={`budget-${budget.id}`}
                    icon="cart-outline"
                    title={budget.name}
                    subtitle="Budget"
                onPress={() => router.push(`/budget/${budget.id}`)}
              />
            ))}
                {linkedGoals.length === 0 && linkedBudgets.length === 0 && (
          <View style={styles.emptyState}>
                    <Ionicons name="bookmark-outline" size={32} color="#8BA17B" />
                    <Text style={styles.emptyStateText}>No goals or budgets linked yet.</Text>
                  </View>
                )}
            <TouchableOpacity 
                  style={styles.addLinkedButton}
              onPress={() => setAddBudgetModalVisible(true)}
            >
                  <Ionicons name="add" size={18} color="#4F6F3E" />
                  <Text style={styles.addLinkedText}>Add Budget</Text>
            </TouchableOpacity>
          </View>
            </>
        )}
        </ScrollView>

        <PayModal
          visible={payModalVisible}
          onClose={() => setPayModalVisible(false)}
          onSuccess={handleSync}
          preselectedAccountId={account.id}
        />
        <TransferModal
          visible={transferModalVisible}
          onClose={() => setTransferModalVisible(false)}
          onSuccess={handleSync}
          preselectedAccountId={account.id}
        />
        <TransferFundsModal
          visible={transferFundsModalVisible}
          onClose={() => setTransferFundsModalVisible(false)}
          onSuccess={handleSync}
          preselectedAccountId={account.id}
        />
        <AddBudgetModal
          visible={addBudgetModalVisible}
          onClose={() => setAddBudgetModalVisible(false)}
        />
      </View>
    </SafeAreaView>
  );
}

interface FundChipProps {
  label: string;
  amount: number;
  tone: 'primary' | 'warning' | 'muted';
  formatter: (value: number) => string;
}

const FundChip: React.FC<FundChipProps> = ({ label, amount, tone, formatter }) => {
  const palette = {
    primary: { bg: '#E5F0D9', text: '#1F3A24' },
    warning: { bg: '#F9E8D0', text: '#7C4A0B' },
    muted: { bg: '#F0F4EB', text: '#3B4F2F' },
  }[tone];

  return (
    <View style={[styles.fundChip, { backgroundColor: palette.bg }]}> 
      <Text style={[styles.fundChipLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.fundChipValue, { color: palette.text }]}>{formatter(amount)}</Text>
    </View>
  );
};

interface FundDetailRowProps {
  fund: AccountFund;
  formatter: (value: number) => string;
  onPressAction?: (fund: AccountFund) => void;
}

const FundDetailRow: React.FC<FundDetailRowProps> = ({ fund, formatter, onPressAction }) => {
  const isLocked = !fund.spendable;
  const displayName = fund.display_name || fund.name;

  const palette = useMemo(() => {
    switch (fund.fund_type) {
      case 'goal':
        return {
          iconName: 'lock-closed-outline' as const,
          bg: '#F5EEE5',
          icon: '#B4690E',
          caption: 'Goal fund · locked',
        };
      case 'borrowed':
        return {
          iconName: 'card-outline' as const,
          bg: '#FDECEC',
          icon: '#B83228',
          caption: 'Borrowed money',
        };
      case 'reserved':
        return {
          iconName: 'shield-outline' as const,
          bg: '#E8F0F5',
          icon: '#1C4B6C',
          caption: 'Reserved',
        };
      case 'sinking':
        return {
          iconName: 'calendar-outline' as const,
          bg: '#EAF3E8',
          icon: '#4F6F3E',
          caption: 'Sinking fund',
        };
      default:
        return {
          iconName: 'wallet-outline' as const,
          bg: '#E4F5EB',
          icon: '#1F3A24',
          caption: fund.spendable ? 'Available to spend' : 'Restricted',
        };
    }
  }, [fund.fund_type, fund.spendable]);

  const showAction =
    isLocked &&
    onPressAction &&
    (fund.fund_type === 'goal' || fund.fund_type === 'borrowed') &&
    (fund.linked_goal_id || fund.linked_liability_id);

  return (
    <View style={styles.fundDetailRow}>
      <View style={styles.fundDetailLeft}>
        <View style={[styles.fundDetailIcon, { backgroundColor: palette.bg }]}>
          <Ionicons name={palette.iconName} size={16} color={palette.icon} />
        </View>
        <View style={styles.fundDetailCopy}>
          <Text style={styles.fundDetailName}>{displayName}</Text>
          <Text style={styles.fundDetailMeta}>
            {isLocked ? 'Locked' : 'Spendable'} · {palette.caption}
                  </Text>
        </View>
      </View>
      <View style={styles.fundDetailRight}>
        <Text style={styles.fundDetailAmount}>{formatter(fund.balance ?? 0)}</Text>
        {showAction ? (
                  <TouchableOpacity 
            style={styles.fundDetailAction}
            onPress={() => onPressAction?.(fund)}
            accessibilityRole="button"
                  >
            <Text style={styles.fundDetailActionText}>
              {fund.fund_type === 'goal' ? 'Withdraw' : 'Review'}
            </Text>
                  </TouchableOpacity>
        ) : null}
                </View>
      </View>
    );
  };

interface RecentTransactionRowProps {
  name: string;
  amount: number;
  type: string;
  date: string;
  fundType?: 'personal' | 'goal' | 'borrowed' | null;
  fundName?: string | null;
  onPress: () => void;
  formatter: (value: number) => string;
}

const RecentTransactionRow: React.FC<RecentTransactionRowProps> = ({
  name,
  amount,
  type,
  date,
  fundType,
  fundName,
  onPress,
  formatter,
}) => {
  const isExpense = type === 'expense';
  const isIncome = type === 'income';
  const amountColor = isIncome ? '#2B8A3E' : isExpense ? '#B83228' : '#1F3A24';

  // Fund type badge colors
  const getFundBadgeStyle = () => {
    if (!fundType || fundType === 'personal') return null;
    
    if (fundType === 'goal') {
      return { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' };
    }
    
    if (fundType === 'borrowed') {
      return { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' };
    }
    
    return null;
  };

  const fundBadgeStyle = getFundBadgeStyle();

  return (
    <TouchableOpacity style={styles.transactionRow} onPress={onPress}>
      <View style={styles.transactionIcon}>
        <Ionicons name="receipt-outline" size={20} color="#4F6F3E" />
      </View>
      <View style={styles.transactionInfo}>
        <View style={styles.transactionNameRow}>
          <Text style={styles.transactionName}>{name}</Text>
          {fundBadgeStyle && (
            <View style={[styles.fundBadge, { backgroundColor: fundBadgeStyle.backgroundColor }]}>
              <Ionicons
                name={fundType === 'goal' ? 'flag-outline' : 'card-outline'}
                size={10}
                color={fundBadgeStyle.color}
              />
              <Text style={[styles.fundBadgeText, { color: fundBadgeStyle.color }]}>
                {fundName || (fundType === 'goal' ? 'Goal' : 'Borrowed')}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.transactionDate}>
          {new Date(date).toLocaleDateString()}
        </Text>
      </View>
      <Text style={[styles.transactionAmount, { color: amountColor }]}> 
        {isExpense ? '-' : isIncome ? '+' : ''}
        {formatter(Math.abs(amount))}
      </Text>
    </TouchableOpacity>
  );
};

interface LinkedItemRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}

const LinkedItemRow: React.FC<LinkedItemRowProps> = ({ icon, title, subtitle, onPress }) => (
  <TouchableOpacity style={styles.linkedRow} onPress={onPress}>
    <View style={styles.linkedIcon}>
      <Ionicons name={icon} size={18} color="#0E401C" />
    </View>
    <View style={styles.linkedInfo}>
      <Text style={styles.linkedTitle}>{title}</Text>
      <Text style={styles.linkedSubtitle}>{subtitle}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color="#4F6F3E" />
  </TouchableOpacity>
  );

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7DECC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Archivo Black',
    color: '#1F3A24',
  },
  balanceCard: {
    marginHorizontal: 20,
    marginTop: 4,
    backgroundColor: '#F2F6EA',
    borderRadius: 24,
    padding: 20,
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#5A6A4A',
  },
  balanceValue: {
    marginTop: 6,
    fontSize: 36,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
  },
  balanceSubtext: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6F8060',
  },
  balanceActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  primaryPill: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    paddingVertical: 12,
  },
  addTransactionButton: {
    backgroundColor: '#4F6F3E',
  },
  primaryPillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
  },
  secondaryPill: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    paddingVertical: 12,
  },
  transferButton: {
    backgroundColor: '#E6ECD9',
  },
  secondaryPillText: {
    color: '#4F6F3E',
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
  },
  chartCard: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EDF1E7',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  chartAmount: {
    fontSize: 18,
    color: '#1F3A24',
    fontFamily: 'InstrumentSerif-Regular',
  },
  chartCaption: {
    marginTop: 14,
    fontSize: 12,
    color: '#7C8C6B',
    fontFamily: 'InstrumentSerif-Regular',
  },
  chartPlaceholder: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: '#F5F8F0',
  },
  fundBreakdownCard: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EDF1E7',
  },
  fundRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  fundSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  fundSummaryTotal: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  transferFundsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  transferFundsButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  availableBalanceSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  availableBalanceLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  availableBalanceValue: {
    fontSize: 24,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 4,
  },
  availableBalanceSubtext: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  personalFundCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  personalFundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personalFundIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalFundInfo: {
    flex: 1,
  },
  personalFundLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  personalFundAmount: {
    fontSize: 22,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 2,
  },
  personalFundSubtext: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  fundTypeSection: {
    marginBottom: 20,
  },
  fundTypeTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  fundTypeSubtitle: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 12,
  },
  fundItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  fundItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  fundItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fundItemInfo: {
    flex: 1,
  },
  fundItemName: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  fundItemAmount: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  fundItemAction: {
    padding: 4,
  },
  fundsTreeContainer: {
    marginTop: 8,
  },
  accountTotalText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  fundTreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 0,
  },
  treeLine: {
    fontSize: 16,
    fontFamily: 'Courier New',
    color: 'rgba(0, 0, 0, 0.4)',
    width: 24,
    textAlign: 'left',
  },
  fundTreeContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAF7',
  },
  fundTreeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fundTreeInfo: {
    flex: 1,
  },
  fundTreeLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  fundTreeAmount: {
    fontSize: 15,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '600',
  },
  lockedHelperText: {
    marginTop: 12,
    fontSize: 12,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
    lineHeight: 18,
  },
  fundDetailList: {
    marginTop: 16,
    gap: 12,
  },
  fundDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#F7F9F2',
    borderWidth: 1,
    borderColor: '#E5ECD6',
  },
  fundDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  fundDetailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fundDetailCopy: {
    flexShrink: 1,
  },
  fundDetailName: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
  },
  fundDetailMeta: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  fundDetailRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  fundDetailAmount: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
  },
  fundDetailAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EDE4FF',
  },
  fundDetailActionText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#5F3DC4',
  },
  fundChip: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  fundChipLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    marginBottom: 6,
  },
  fundChipValue: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
  },
  transactionsCard: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EDF1E7',
  },
  transactionsHeader: {
    marginBottom: 16,
  },
  fundFilterTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  fundFilterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F5F8F0',
    borderWidth: 1,
    borderColor: '#E5ECD6',
    gap: 6,
  },
  fundFilterTabActive: {
    backgroundColor: '#4F6F3E',
    borderColor: '#4F6F3E',
  },
  fundFilterTabText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  fundFilterTabTextActive: {
    color: '#FFFFFF',
    fontFamily: 'InstrumentSerif-Regular',
  },
  fundFilterTabCount: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    textAlign: 'center',
  },
  fundFilterTabCountActive: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2E4',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F0DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  transactionName: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    flexShrink: 1,
  },
  fundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fundBadgeText: {
    fontSize: 10,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '600',
  },
  transactionDate: {
    marginTop: 2,
    fontSize: 12,
    color: '#7C8C6B',
    fontFamily: 'InstrumentSerif-Regular',
  },
  transactionAmount: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
  },
  viewAllButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
  },
  viewAllText: {
    fontSize: 13,
    color: '#4F6F3E',
    fontFamily: 'InstrumentSerif-Regular',
  },
  linkedSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EDF1E7',
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2E4',
  },
  linkedIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E8F0DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  linkedInfo: {
    flex: 1,
  },
  linkedTitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
  },
  linkedSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#7C8C6B',
    fontFamily: 'InstrumentSerif-Regular',
  },
  addLinkedButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  addLinkedText: {
    fontSize: 13,
    color: '#4F6F3E',
    fontFamily: 'InstrumentSerif-Regular',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyStateText: {
    fontSize: 13,
    color: '#7C8C6B',
    fontFamily: 'InstrumentSerif-Regular',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    fontSize: 14,
    color: '#6F8060',
    fontFamily: 'InstrumentSerif-Regular',
  },
  goalsSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 20,
    marginTop: 16,
    marginBottom: 16,
    marginHorizontal: 20,
  },
  goalsSummaryHeader: {
    marginBottom: 16,
  },
  goalsStatsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  goalsStatItem: {
    flex: 1,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  goalsStatLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
    marginBottom: 8,
  },
  goalsStatValue: {
    fontSize: 24,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  goalsStatAmount: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4F6F3E',
  },
  goalsProgressBar: {
    height: 8,
    backgroundColor: '#E5ECD6',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  goalsProgressFill: {
    height: '100%',
    backgroundColor: '#4F6F3E',
    borderRadius: 4,
  },
  goalsProgressText: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
    textAlign: 'center',
  },
  goalsListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 20,
    marginBottom: 16,
    marginHorizontal: 20,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  goalItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalItemInfo: {
    flex: 1,
    gap: 4,
  },
  goalItemTitle: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
  },
  goalItemProgress: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  completedSectionTitle: {
    fontSize: 14,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    gap: 8,
  },
  addGoalText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4F6F3E',
  },
});