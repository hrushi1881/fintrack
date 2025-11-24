import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import { 
  archiveGoal,
  calculateGoalProgress, 
  calculateMonthlyNeed, 
  checkGoalCompletion,
  deleteGoal,
  extendGoal,
  fetchGoalContributions,
  getProgressColor,
  updateGoalProgress,
  withdrawFromGoal,
  getGoalAccounts,
  transferGoalFunds,
  markGoalComplete,
  completeGoalWithWithdraw,
} from '@/utils/goals';
import { GoalContributionWithTransaction, Account } from '@/types';
import AddContributionModal from '../modals/add-contribution';
import EditGoalModal from '../modals/edit-goal';
import GoalCelebrationScreen from '@/components/GoalCelebrationScreen';
import WhatsNextModal from '@/components/WhatsNextModal';
import ExtendGoalModal from '@/components/ExtendGoalModal';
import WithdrawFundsModal from '@/components/WithdrawFundsModal';
import TransferGoalFundsModal from '@/components/TransferGoalFundsModal';
import { BudgetCard } from '@/components/BudgetCard';
import GoalCycles from '@/components/cycles/GoalCycles';

const GoalDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { currency } = useSettings();
  const { goals, budgets, refreshGoals, accounts, globalRefresh, refreshAccountFunds, refreshAccounts } = useRealtimeData();

  const goal = useMemo(() => goals.find((item) => item.id === id), [goals, id]);

  const [contributions, setContributions] = useState<GoalContributionWithTransaction[]>([]);
  const [loadingContributions, setLoadingContributions] = useState(false);
  const [goalAccounts, setGoalAccounts] = useState<Array<{ account: Account; balance: number }>>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'accounts' | 'analytics' | 'cycles'>('transactions');
  
  const [showAddContribution, setShowAddContribution] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showWhatsNext, setShowWhatsNext] = useState(false);
  const [showExtendGoal, setShowExtendGoal] = useState(false);
  const [showWithdrawFunds, setShowWithdrawFunds] = useState(false);
  const [showTransferFunds, setShowTransferFunds] = useState(false);
  const [transferFromAccount, setTransferFromAccount] = useState<string | null>(null);

  const formatCurrency = useCallback(
    (value: number) => formatCurrencyAmount(value, currency),
    [currency]
  );

  const fetchContributions = useCallback(async () => {
    if (!goal?.id) return;

    try {
      setLoadingContributions(true);
      const rows = await fetchGoalContributions(goal.id);
      setContributions(rows);

      // Update goal progress (doesn't auto-complete - manual completion)
      await updateGoalProgress(goal.id);
      // Don't call refreshGoals here to prevent flickering - let parent handle refresh
    } catch (error) {
      console.error('Error fetching goal contributions', error);
    } finally {
      setLoadingContributions(false);
    }
  }, [goal?.id]); // Only depend on goal.id

  const fetchGoalAccounts = useCallback(async (forceRefresh: boolean = true) => {
    if (!goal?.id) return;
    
    try {
      setLoadingAccounts(true);
      console.log(`🔄 Fetching goal accounts for goal ${goal.id} (forceRefresh: ${forceRefresh})`);
      const accounts = await getGoalAccounts(goal.id, forceRefresh);
      console.log(`✅ Fetched ${accounts.length} goal account(s)`, accounts);
      setGoalAccounts(accounts);
    } catch (error) {
      console.error('❌ Error fetching goal accounts', error);
    } finally {
      setLoadingAccounts(false);
    }
  }, [goal?.id]); // Only depend on goal.id

  useEffect(() => {
    if (goal?.id) {
      fetchContributions();
      fetchGoalAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id]); // Only depend on goal.id to prevent infinite loops

  // NOTE: Goal completion is MANUAL - user decides when to complete
  // No auto-completion interval needed

  const progress = useMemo(() => {
    if (!goal) return 0;
    return calculateGoalProgress(goal.current_amount, goal.target_amount);
  }, [goal]);

  const progressColor = getProgressColor(progress);
  const monthlyNeed = useMemo(() => {
    if (!goal) return null;
    return calculateMonthlyNeed(goal.current_amount, goal.target_amount, goal.target_date);
  }, [goal]);

  const linkedBudgets = useMemo(
    () =>
      budgets.filter(
        (budget) => budget.budget_type === 'goal_based' && budget.goal_id === goal?.id
      ),
    [budgets, goal]
  );

  const remainingAmount = goal ? Math.max(0, goal.target_amount - goal.current_amount) : 0;
  const estCompletion = goal?.target_date
    ? new Date(goal.target_date).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
      })
    : monthlyNeed
    ? 'On track'
    : '—';

  // Check if goal can be completed (reached target but not yet marked complete)
  const canComplete = useMemo(() => {
    if (!goal) return false;
    return goal.current_amount >= goal.target_amount && !goal.is_achieved;
  }, [goal]);

  const handleAddContributionSuccess = async () => {
    console.log('🎯 handleAddContributionSuccess called');
    
    // Close modal first
    setShowAddContribution(false);
    
    // Wait a bit for RPC operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Refresh account funds first (this updates account_funds table)
    console.log('🔄 Refreshing account funds...');
    await refreshAccountFunds();
    
    // Wait again to ensure refresh completes
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Then refresh goals and contributions
    console.log('🔄 Refreshing goals and contributions...');
    await refreshGoals();
    await fetchContributions();
    
    // Wait one more time to ensure all data is synced
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Finally fetch goal accounts with fresh data (force refresh)
    console.log('🔄 Fetching goal accounts with force refresh...');
    await fetchGoalAccounts(true);
    
    console.log('✅ handleAddContributionSuccess completed');
  };

  const handleArchiveGoal = async () => {
    if (!goal) return;
    try {
      await archiveGoal(goal.id);
      await refreshGoals();
      setShowWhatsNext(false);
      Alert.alert('Goal archived', 'We tucked this goal away for later.');
      router.back();
    } catch (error) {
      console.error('Error archiving goal', error);
      Alert.alert('Error', 'Failed to archive goal. Try again.');
    }
  };

  const handleExtendGoalConfirm = async (data: { newTarget?: number; newDate?: string }) => {
    if (!goal) return;
    try {
      await extendGoal(goal.id, data.newTarget, data.newDate);
      await refreshGoals();
      setShowExtendGoal(false);
      Alert.alert('Goal extended', 'Your goal timeline has been updated.');
    } catch (error) {
      console.error('Error extending goal', error);
      Alert.alert('Error', 'Could not extend goal.');
    }
  };

  const handleWithdrawConfirm = async (data: {
    amount: number;
    sourceAccountId: string; // Account where goal fund is located
    destinationAccountId: string; // Account where money goes
    date?: string; // Date of withdrawal
    note?: string;
  }) => {
    if (!goal) return;
    try {
      await withdrawFromGoal(goal.id, data.amount, data.sourceAccountId, data.destinationAccountId, data.note, data.date);
      await refreshGoals();
      await fetchContributions();
      await fetchGoalAccounts();
      setShowWithdrawFunds(false);
      Alert.alert('Funds withdrawn', `${formatCurrency(data.amount)} moved to your account.`);
      await globalRefresh();
    } catch (error: any) {
      console.error('Error withdrawing goal funds', error);
      Alert.alert('Error', error.message || 'Withdrawal failed. Try again.');
    }
  };

  const handleMarkComplete = async () => {
    if (!goal) return;
    
    if (goal.is_achieved) {
      Alert.alert('Already Complete', 'This goal is already marked as complete.');
      return;
    }

    // Check if goal has remaining funds
    const hasFunds = goalAccounts.length > 0 && goalAccounts.some(ga => ga.balance > 0);

    if (hasFunds) {
      // Ask user what to do with remaining funds
      Alert.alert(
        'Goal Completed! 🎉',
        `"${goal.title}" is now marked as complete.\n\nYou have ${formatCurrency(goal.current_amount)} in goal funds. What would you like to do?`,
        [
          {
            text: 'Withdraw Funds',
            onPress: () => {
              setShowWhatsNext(false);
              setShowWithdrawFunds(true);
            },
          },
          {
            text: 'Delete Goal',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteGoal(goal.id);
                await refreshGoals();
                await globalRefresh();
                router.back();
              } catch (error) {
                console.error('Error deleting goal', error);
                Alert.alert('Error', 'Failed to delete goal.');
              }
            },
          },
          {
            text: 'Archive Goal',
            onPress: async () => {
              try {
                await archiveGoal(goal.id);
                await refreshGoals();
                await globalRefresh();
                setShowWhatsNext(false);
                setShowCelebration(true);
              } catch (error) {
                console.error('Error archiving goal', error);
                Alert.alert('Error', 'Failed to archive goal.');
              }
            },
          },
          {
            text: 'Keep as Complete',
            style: 'cancel',
            onPress: async () => {
              try {
                await markGoalComplete(goal.id);
                await refreshGoals();
                setShowCelebration(true);
                setShowWhatsNext(false);
              } catch (error: any) {
                console.error('Error marking goal as complete:', error);
                Alert.alert('Error', error.message || 'Failed to mark goal as complete.');
              }
            },
          },
        ]
      );
    } else {
      // No funds, just mark as complete
      try {
        await markGoalComplete(goal.id);
        await refreshGoals();
        await globalRefresh();
        setShowCelebration(true);
        setShowWhatsNext(false);
        Alert.alert('Goal Completed!', `🎉 "${goal.title}" is now marked as complete.`);
      } catch (error: any) {
        console.error('Error marking goal as complete:', error);
        Alert.alert('Error', error.message || 'Failed to mark goal as complete.');
      }
    }
  };

  const handleCompleteWithWithdraw = async (destinationAccountId: string, description?: string) => {
    if (!goal) return;

    if (goal.is_achieved) {
      Alert.alert('Already Complete', 'This goal is already marked as complete.');
      return;
    }

    try {
      const { transactions } = await completeGoalWithWithdraw(goal.id, destinationAccountId, description);
      await refreshGoals();
      await fetchContributions();
      await fetchGoalAccounts();
      setShowWhatsNext(false);
      
      if (transactions.length > 0) {
        const totalWithdrawn = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        Alert.alert(
          'Goal Completed!',
          `🎉 "${goal.title}" is complete!\n\nAll funds (${formatCurrency(totalWithdrawn)}) have been withdrawn to your account.`
        );
      } else {
        Alert.alert('Goal Completed!', `🎉 "${goal.title}" is now marked as complete.`);
      }
      
      setShowCelebration(true);
    } catch (error: any) {
      console.error('Error completing goal with withdraw:', error);
      Alert.alert('Error', error.message || 'Failed to complete goal.');
    }
  };

  const handleDeleteGoal = () => {
    if (!goal) return;
    
    // Check if goal has funds first
    const hasFunds = goalAccounts.length > 0 && goalAccounts.some(ga => ga.balance > 0);
    const totalFunds = goalAccounts.reduce((sum, ga) => sum + ga.balance, 0);
    
    if (hasFunds) {
      // Goal has funds - ask user what to do
      Alert.alert(
        'Goal Has Funds',
        `This goal has ${formatCurrency(totalFunds)} in funds. What would you like to do?`,
        [
          {
            text: 'Withdraw First',
            onPress: () => {
              setShowWithdrawFunds(true);
            },
          },
          {
            text: 'Delete Anyway',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteGoal(goal.id, true); // Force delete
                await refreshGoals();
                await globalRefresh();
                router.back();
              } catch (error: any) {
                console.error('Error deleting goal', error);
                Alert.alert('Error', error.message || 'Failed to delete goal.');
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      // No funds - proceed with normal deletion
      Alert.alert(
        'Delete goal?',
        'This will remove the goal and its history permanently.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteGoal(goal.id);
                await refreshGoals();
                await globalRefresh();
                router.back();
              } catch (error: any) {
                console.error('Error deleting goal', error);
                Alert.alert('Error', error.message || 'Failed to delete goal.');
              }
            },
          },
        ]
      );
    }
  };

  const handleTransferFunds = async (fromAccountId: string, toAccountId: string, amount: number, description?: string) => {
    if (!goal || !user) return;

    try {
      await transferGoalFunds(goal.id, {
        goal_id: goal.id,
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount,
        description,
      }, user.id);
      await fetchGoalAccounts();
      await refreshGoals();
      await globalRefresh();
      setShowTransferFunds(false);
      setTransferFromAccount(null);
      Alert.alert('Success', 'Goal funds transferred successfully.');
    } catch (error: any) {
      console.error('Error transferring goal funds', error);
      Alert.alert('Error', error.message || 'Failed to transfer goal funds.');
    }
  };

  const renderContributionRow = (entry: GoalContributionWithTransaction) => {
    const amount = Number(entry.amount ?? 0);
    const isWithdraw = amount < 0;
    const prefix = isWithdraw ? '−' : '+';
    const title = entry.contribution_type === 'manual'
      ? 'Monthly Contribution'
      : isWithdraw
      ? 'Withdrawal'
      : 'Contribution Boost';
    return (
      <View key={entry.id} style={styles.transactionRow}>
        <View style={[styles.transactionIcon, isWithdraw && styles.transactionIconWithdraw]}>
          <Ionicons
            name={isWithdraw ? 'remove' : 'add'}
            size={18}
            color={isWithdraw ? '#B83228' : '#4F6F3E'}
            />
          </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionTitle}>{title}</Text>
          <Text style={styles.transactionSubtitle}>
            {new Date(entry.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
        <Text style={[styles.transactionAmount, isWithdraw && styles.transactionAmountWithdraw]}>
          {prefix}
          {formatCurrency(Math.abs(amount))}
            </Text>
          </View>
    );
  };

  if (!goal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle" size={48} color="#8BA17B" />
          <Text style={styles.emptyTitle}>Goal not found</Text>
          <Text style={styles.emptyMessage}>
            The goal you’re looking for may have been deleted or moved.
              </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
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
          <View style={styles.headerBar}>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color="#0E401C" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{goal.title}</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.iconButton} onPress={() => setShowEditGoal(true)}>
                <Ionicons name="create-outline" size={20} color="#0E401C" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => setShowWhatsNext(true)}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#0E401C" />
                </TouchableOpacity>
              </View>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.progressRing}>
              <View style={[styles.progressFillRing, { borderColor: progressColor, transform: [{ rotate: `${progress * 1.8}deg` }] }]} />
              <View style={styles.progressInner}>
                <Text style={styles.progressValue}>{formatCurrency(goal.current_amount)}</Text>
                <Text style={styles.progressLabel}>of {formatCurrency(goal.target_amount)}</Text>
    </View>
            </View>

            <View style={styles.metricRow}>
              <MetricCard label="Target Amount" value={formatCurrency(goal.target_amount)} />
              <MetricCard label="Est. Completion" value={estCompletion} />
            </View>

            <View style={styles.actionsRow}>
              {canComplete ? (
                <TouchableOpacity
                  style={[styles.primaryButton, styles.flexOne, { backgroundColor: '#10B981' }]}
                  onPress={handleMarkComplete}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Mark Complete</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, styles.flexOne]}
                  onPress={() => setShowAddContribution(true)}
                >
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Boost Goal</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.secondaryIconButton} onPress={() => setShowWithdrawFunds(true)}>
                <Ionicons name="arrow-down" size={18} color="#4F6F3E" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryIconButton} onPress={handleDeleteGoal}>
                <Ionicons name="trash-outline" size={18} color="#4F6F3E" />
              </TouchableOpacity>
            </View>
      </View>

          {/* Goal Funds Breakdown Section */}
            <View style={styles.fundsBreakdownSection}>
              <Text style={styles.sectionTitle}>Goal Funds Breakdown</Text>
            {loadingAccounts ? (
              <Text style={styles.emptyMessageText}>Loading accounts...</Text>
            ) : goalAccounts.length > 0 ? (
              <View style={styles.accountCardsContainer}>
                {goalAccounts.map(({ account, balance }) => (
                  <TouchableOpacity
                    key={account.id}
                    style={styles.accountCard}
                    onPress={() => router.push(`/account/${account.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.accountCardIcon, { backgroundColor: account.color }]}>
                      <Ionicons name={account.icon as any} size={24} color="white" />
          </View>
                    <View style={styles.accountCardInfo}>
                      <Text style={styles.accountCardName}>{account.name}</Text>
                      <Text style={styles.accountCardBalance}>{formatCurrency(balance)}</Text>
                </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                ))}
                </View>
            ) : (
              <Text style={styles.emptyMessageText}>No accounts with goal funds yet.</Text>
          )}
          </View>

          <View style={styles.tabControl}>
            {[
              { key: 'transactions', label: 'Contributions' },
              { key: 'accounts', label: 'Accounts' },
              { key: 'analytics', label: 'Analytics' },
              { key: 'cycles', label: 'Cycles' },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key as typeof activeTab)}
                style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                  {tab.label}
            </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'transactions' && (
            <View style={styles.sectionCard}>
              {loadingContributions ? (
                <Text style={styles.emptyMessageText}>Loading transactions…</Text>
              ) : contributions.length === 0 ? (
                <Text style={styles.emptyMessageText}>No contributions yet. Add one to start tracking progress.</Text>
              ) : (
                contributions.map(renderContributionRow)
        )}
      </View>
          )}

          {activeTab === 'accounts' && (
            <View style={styles.sectionCard}>
              {loadingAccounts ? (
                <Text style={styles.emptyMessageText}>Loading accounts…</Text>
              ) : goalAccounts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="wallet-outline" size={48} color="#8BA17B" />
                  <Text style={styles.emptyMessageText}>
                    No accounts holding funds for this goal yet.
                  </Text>
                  <Text style={styles.emptyMessageText}>
                    Add a contribution to start saving in an account.
                  </Text>
              </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {goalAccounts.map(({ account, balance }) => (
                    <View key={account.id} style={styles.accountDetailCard}>
                      <TouchableOpacity
                        onPress={() => router.push(`/account/${account.id}`)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.accountDetailHeader}>
                          <View style={[styles.accountDetailIcon, { backgroundColor: account.color }]}>
                            <Ionicons name={account.icon as any} size={24} color="white" />
                  </View>
                          <View style={styles.accountDetailInfo}>
                            <Text style={styles.accountDetailName}>{account.name}</Text>
                            <Text style={styles.accountDetailType}>
                              {account.type === 'bank' ? 'Bank Account' :
                               account.type === 'card' ? 'Card' :
                               account.type === 'wallet' ? 'Wallet' :
                               account.type === 'cash' ? 'Cash' : account.type}
                            </Text>
                </View>
                          <View style={styles.accountDetailAmount}>
                            <Text style={styles.accountDetailBalance}>{formatCurrency(balance)}</Text>
                            <Text style={styles.accountDetailLabel}>Goal Funds</Text>
            </View>
        </View>
                        <View style={styles.accountDetailFooter}>
                          <Text style={styles.accountDetailTotalLabel}>Total Account Balance</Text>
                          <Text style={styles.accountDetailTotal}>{formatCurrency(account.balance)}</Text>
      </View>
            </TouchableOpacity>
                      <View style={styles.accountActions}>
            <TouchableOpacity
                          style={styles.accountActionButton}
                          onPress={() => {
                            setTransferFromAccount(account.id);
                            setShowTransferFunds(true);
                          }}
            >
                          <Ionicons name="swap-horizontal" size={18} color="#10B981" />
                          <Text style={styles.accountActionButtonText}>Transfer</Text>
            </TouchableOpacity>
            <TouchableOpacity
                          style={[styles.accountActionButton, styles.accountActionButtonSecondary]}
                          onPress={() => {
                            setTransferFromAccount(account.id);
                            setShowEditGoal(true);
                          }}
            >
                          <Ionicons name="settings-outline" size={18} color="#3B82F6" />
                          <Text style={[styles.accountActionButtonText, styles.accountActionButtonTextSecondary]}>Manage</Text>
            </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  {linkedBudgets.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.budgetsSectionTitle}>Linked Budgets</Text>
                      {linkedBudgets.map((budget) => (
                        <BudgetCard
                          key={budget.id}
                          budget={budget}
                          onPress={() => router.push(`/budget/${budget.id}`)}
                        />
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {activeTab === 'analytics' && (
            <View style={styles.sectionCard}>
              <Text style={styles.emptyMessageText}>Analytics coming soon.</Text>
              {monthlyNeed && (
                <View style={styles.analyticsCard}>
                  <Text style={styles.analyticsLabel}>Monthly amount needed</Text>
                  <Text style={styles.analyticsValue}>{formatCurrency(monthlyNeed)}</Text>
                  <Text style={styles.analyticsNote}>
                    Keep contributing this amount to stay on track for your goal.
              </Text>
          </View>
              )}
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsLabel}>Remaining</Text>
                <Text style={styles.analyticsValue}>{formatCurrency(remainingAmount)}</Text>
              </View>
            </View>
          )}

          {activeTab === 'cycles' && goal && (
            <View style={styles.cyclesContainer}>
              <GoalCycles goalId={goal.id} maxCycles={12} />
            </View>
          )}

          <View style={{ height: 96 }} />
        </ScrollView>

        <AddContributionModal
          visible={showAddContribution}
          onClose={() => setShowAddContribution(false)}
          onSuccess={handleAddContributionSuccess}
          goal={goal}
        />

        {showCelebration && (
          <GoalCelebrationScreen
            goal={goal}
            onViewSummary={() => setShowCelebration(false)}
            onWhatsNext={() => {
              setShowCelebration(false);
              setShowWhatsNext(true);
            }}
            onClose={() => setShowCelebration(false)}
          />
        )}

        <WhatsNextModal
          visible={showWhatsNext}
          onClose={() => setShowWhatsNext(false)}
          onEditGoal={() => {
            setShowWhatsNext(false);
            setShowEditGoal(true);
          }}
          onExtendGoal={() => {
            setShowWhatsNext(false);
            setShowExtendGoal(true);
          }}
          onArchiveGoal={handleArchiveGoal}
          onWithdrawFunds={() => {
            setShowWhatsNext(false);
            setShowWithdrawFunds(true);
          }}
          onDeleteGoal={handleDeleteGoal}
          onMarkComplete={handleMarkComplete}
          onCompleteWithWithdraw={() => {
            setShowWhatsNext(false);
            // Show modal to select destination account for withdrawal
            Alert.alert(
              'Complete & Withdraw All Funds',
              'Select an account to withdraw all goal funds to.',
              [
                { text: 'Cancel', style: 'cancel' },
                ...(accounts
                  .filter(acc => {
                    // Use currency from settings for filtering (account may not have currency property in useRealtimeData)
                    const accountCurrency = (acc as any).currency || currency;
                    return accountCurrency === (goal?.currency || currency) && acc.is_active !== false;
                  })
                  .map(acc => ({
                    text: acc.name,
                    onPress: () => handleCompleteWithWithdraw(acc.id, `Complete goal: ${goal?.title}`),
                  }))),
              ]
            );
          }}
          goal={goal}
        />

        <ExtendGoalModal
          visible={showExtendGoal}
          onClose={() => setShowExtendGoal(false)}
          onExtend={handleExtendGoalConfirm}
          goal={goal}
        />

        <WithdrawFundsModal
          visible={showWithdrawFunds}
          onClose={() => setShowWithdrawFunds(false)}
          onWithdraw={handleWithdrawConfirm}
          goal={goal}
        />

        <EditGoalModal
          visible={showEditGoal}
          goal={goal}
          onClose={() => {
            setShowEditGoal(false);
            setTransferFromAccount(null);
          }}
          onUpdate={async () => {
            await fetchGoalAccounts();
            await fetchContributions();
            await refreshGoals();
          }}
          initialTab={transferFromAccount ? 'accounts' : 'details'}
        />

        {/* Transfer Funds Modal */}
        {showTransferFunds && transferFromAccount && goal && (
          <TransferGoalFundsModal
            visible={showTransferFunds}
            goal={goal}
            fromAccountId={transferFromAccount}
            goalAccounts={goalAccounts}
            availableAccounts={accounts.filter(
              acc => {
                // Use currency from settings for filtering (account may not have currency property in useRealtimeData)
                const accountCurrency = (acc as any).currency || currency;
                return accountCurrency === (goal.currency || currency) && (acc.is_active || acc.is_active === null) && acc.id !== transferFromAccount;
              }
            ).map(acc => ({
              ...acc,
              currency: (acc as any).currency || currency,
            })) as Account[]}
            onClose={() => {
              setShowTransferFunds(false);
              setTransferFromAccount(null);
            }}
            onTransfer={handleTransferFunds}
          />
        )}
      </View>
      </SafeAreaView>
  );
};

interface MetricCardProps {
  label: string;
  value: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value }) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricCardLabel}>{label}</Text>
    <Text style={styles.metricCardValue}>{value}</Text>
  </View>
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
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
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
  heroCard: {
    backgroundColor: '#F7F9F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 20,
    gap: 16,
  },
  progressRing: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 12,
    borderColor: '#E5ECD6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressFillRing: {
    position: 'absolute',
    top: -12,
    left: -12,
    width: 184,
    height: 184,
    borderRadius: 92,
    borderWidth: 12,
    borderColor: '#4F6F3E',
    opacity: 0.2,
  },
  progressInner: {
    alignItems: 'center',
  },
  progressValue: {
    fontSize: 22,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
  },
  progressLabel: {
    fontSize: 12,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  metricCardLabel: {
    fontSize: 11,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  metricCardValue: {
    fontSize: 15,
    color: '#1F3A24',
    fontFamily: 'Poppins-SemiBold',
    marginTop: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4F6F3E',
    paddingVertical: 14,
    borderRadius: 16,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
  secondaryIconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D7DECC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  flexOne: {
    flex: 1,
  },
  tabControl: {
    marginTop: 24,
    flexDirection: 'row',
    backgroundColor: '#F2F5EC',
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#4F6F3E',
  },
  tabText: {
    fontSize: 13,
    color: '#4F6F3E',
    fontFamily: 'Poppins-SemiBold',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 20,
    marginTop: 16,
    gap: 12,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF3E6',
    paddingVertical: 10,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E7EDDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionIconWithdraw: {
    backgroundColor: '#F5E2DF',
  },
  transactionInfo: {
    flex: 1,
    gap: 2,
  },
  transactionTitle: {
    fontSize: 14,
    color: '#1F3A24',
    fontFamily: 'Poppins-SemiBold',
  },
  transactionSubtitle: {
    fontSize: 12,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  transactionAmount: {
    fontSize: 13,
    color: '#2B8A3E',
    fontFamily: 'Poppins-SemiBold',
  },
  transactionAmountWithdraw: {
    color: '#B83228',
  },
  analyticsCard: {
    backgroundColor: '#F7F9F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    gap: 6,
  },
  analyticsLabel: {
    fontSize: 12,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  analyticsValue: {
    fontSize: 18,
    color: '#0E401C',
    fontFamily: 'Poppins-SemiBold',
  },
  analyticsNote: {
    fontSize: 12,
    color: '#7C8C6B',
    fontFamily: 'InstrumentSerif-Regular',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
  },
  emptyMessage: {
    fontSize: 14,
    color: '#637050',
    textAlign: 'center',
    fontFamily: 'InstrumentSerif-Regular',
  },
  emptyMessageText: {
    fontSize: 13,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  fundsBreakdownSection: {
    marginTop: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#0E401C',
    marginBottom: 12,
  },
  accountCardsContainer: {
    gap: 12,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    gap: 12,
  },
  accountCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountCardInfo: {
    flex: 1,
    gap: 4,
  },
  accountCardName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  accountCardBalance: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#4F6F3E',
  },
  accountDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 16,
    gap: 12,
  },
  accountDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountDetailIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountDetailInfo: {
    flex: 1,
    gap: 4,
  },
  accountDetailName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  accountDetailType: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  accountDetailAmount: {
    alignItems: 'flex-end',
    gap: 4,
  },
  accountDetailBalance: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#4F6F3E',
  },
  accountDetailLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  accountDetailFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5ECD6',
  },
  accountDetailTotalLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  accountDetailTotal: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  accountActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5ECD6',
  },
  accountActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  accountActionButtonSecondary: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  accountActionButtonText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#10B981',
  },
  accountActionButtonTextSecondary: {
    color: '#3B82F6',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5ECD6',
    marginVertical: 16,
  },
  budgetsSectionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#0E401C',
    marginBottom: 8,
  },
  cyclesContainer: {
    marginTop: 12,
    minHeight: 400,
  },
});

export default GoalDetailScreen;
