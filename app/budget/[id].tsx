import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { 
  updateBudgetProgress, 
  getBudgetTransactions, 
  excludeTransactionFromBudget, 
  includeTransactionInBudget,
  calculateDailyPace,
  checkBudgetAlerts,
  closeBudgetPeriod
} from '@/utils/budgets';
import { Budget, BudgetTransaction } from '@/types';

export default function BudgetDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [showExcludeModal, setShowExcludeModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<BudgetTransaction | null>(null);
  const [excludeReason, setExcludeReason] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { budgets, accounts, transactions, goals, refreshBudgets } = useRealtimeData();
  const { currency } = useSettings();
  const { showNotification } = useNotification();

  // Find the current budget and linked goal
  const budget = budgets.find(b => b.id === id);
  const linkedGoal = budget?.budget_type === 'goal_based' && budget.goal_id 
    ? goals.find(g => g.id === budget.goal_id)
    : null;
  
  const [budgetTransactions, setBudgetTransactions] = useState<BudgetTransaction[]>([]);
  const [dailyPace, setDailyPace] = useState({ ideal: 0, actual: 0, onTrack: true });
  const [alerts, setAlerts] = useState<string[]>([]);

  useEffect(() => {
    if (budget) {
      loadBudgetData();
    }
  }, [budget]);

  const loadBudgetData = async () => {
    if (!budget) return;
    
    setLoading(true);
    try {
      // Update budget progress
      await updateBudgetProgress(budget.id);
      
      // Get budget transactions
      const transactions = await getBudgetTransactions(budget.id);
      setBudgetTransactions(transactions);
      
      // Calculate daily pace
      const pace = await calculateDailyPace(budget.id);
      setDailyPace({
        ideal: pace.idealDailySpend,
        actual: pace.currentDailyAvg,
        onTrack: pace.onTrack
      });
      
      // Check alerts
      const alertResult = await checkBudgetAlerts(budget.id);
      setAlerts(alertResult.alerts);
      
    } catch (error) {
      console.error('Error loading budget data:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: 'Failed to load budget data',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getBudgetStatus = (percentage: number) => {
    if (percentage >= 100) return { status: 'Over Budget', color: '#EF4444' };
    if (percentage >= 80) return { status: 'Warning', color: '#F59E0B' };
    return { status: 'On Track', color: '#10B981' };
  };

  const getBudgetTypeInfo = (budgetType: string) => {
    switch (budgetType) {
      case 'monthly':
        return { icon: 'calendar-outline', color: '#3B82F6', label: 'Monthly' };
      case 'category':
        return { icon: 'pricetag-outline', color: '#8B5CF6', label: 'Category' };
      case 'goal_based':
        return { icon: 'flag-outline', color: '#F59E0B', label: 'Goal-Based' };
      case 'smart':
        return { icon: 'bulb-outline', color: '#10B981', label: 'Smart' };
      default:
        return { icon: 'wallet-outline', color: '#6B7280', label: 'Budget' };
    }
  };

  const handleExcludeTransaction = async () => {
    if (!selectedTransaction) return;
    
    try {
      await excludeTransactionFromBudget(
        budget!.id,
        selectedTransaction.transaction_id,
        excludeReason,
        'user' // TODO: Get actual user ID
      );
      
      showNotification({
        type: 'success',
        title: 'Transaction Excluded',
        description: 'Transaction has been excluded from this budget',
      });
      
      setShowExcludeModal(false);
      setSelectedTransaction(null);
      setExcludeReason('');
      await loadBudgetData();
    } catch (error) {
      console.error('Error excluding transaction:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: 'Failed to exclude transaction',
      });
    }
  };

  const handleIncludeTransaction = async (transaction: BudgetTransaction) => {
    try {
      await includeTransactionInBudget(
        budget!.id,
        transaction.transaction_id,
        'user' // TODO: Get actual user ID
      );
      
      showNotification({
        type: 'success',
        title: 'Transaction Included',
        description: 'Transaction has been included in this budget',
      });
      
      await loadBudgetData();
    } catch (error) {
      console.error('Error including transaction:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: 'Failed to include transaction',
      });
    }
  };

  const handleEndPeriod = async () => {
    Alert.alert(
      'End Budget Period',
      'What should we do with the remaining amount?',
      [
        { text: 'Roll Over', onPress: () => endPeriodWithRollover(true) },
        { text: 'Start Fresh', onPress: () => endPeriodWithRollover(false) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const endPeriodWithRollover = async (rollover: boolean) => {
    try {
      await closeBudgetPeriod(budget!.id, rollover, 'user'); // TODO: Get actual user ID
      
      showNotification({
        type: 'success',
        title: 'Period Ended',
        description: rollover ? 'Budget period ended and rolled over' : 'Budget period ended',
      });
      
      await refreshBudgets();
      router.back();
    } catch (error) {
      console.error('Error ending period:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: 'Failed to end budget period',
      });
    }
  };


  if (!budget) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Budget Not Found</Text>
            <Text style={styles.errorDescription}>
              The budget you're looking for doesn't exist or has been deleted.
            </Text>
            <TouchableOpacity style={styles.errorBackButton} onPress={() => router.back()}>
              <Text style={styles.errorBackButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const renderOverview = () => {
    const percentage = budget.amount > 0 ? (budget.spent_amount / budget.amount) * 100 : 0;
    const status = getBudgetStatus(percentage);
    const typeInfo = getBudgetTypeInfo(budget.budget_type);
    
    return (
      <View style={styles.tabContent}>
        {/* Budget Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View style={[styles.budgetIcon, { backgroundColor: typeInfo.color }]}>
              <Ionicons name={typeInfo.icon as any} size={32} color="white" />
            </View>
            <View style={styles.budgetInfo}>
              <Text style={styles.budgetTitle}>{budget.name}</Text>
              <Text style={styles.budgetPeriod}>
                {budget.start_date ? new Date(budget.start_date).toLocaleDateString() : 'N/A'} - {budget.end_date ? new Date(budget.end_date).toLocaleDateString() : 'N/A'}
              </Text>
              <View style={styles.budgetTypeBadge}>
                <Text style={styles.budgetTypeText}>{typeInfo.label}</Text>
              </View>
            </View>
            <View style={styles.budgetStatus}>
              <Text style={[styles.statusText, { color: status.color }]}>
                {status.status}
              </Text>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(percentage, 100)}%`,
                    backgroundColor: status.color,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{Math.round(percentage)}%</Text>
          </View>

          <View style={styles.budgetStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Budget</Text>
              <Text style={styles.statValue}>{formatCurrency(budget.amount)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Spent</Text>
              <Text style={styles.statValue}>{formatCurrency(budget.spent_amount)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Remaining</Text>
              <Text style={[styles.statValue, { color: budget.remaining_amount < 0 ? '#EF4444' : '#10B981' }]}>
                {formatCurrency(budget.remaining_amount)}
              </Text>
            </View>
          </View>
        </View>

        {/* Linked Goal Info for Goal-Based Budgets */}
        {linkedGoal && budget.budget_type === 'goal_based' && (
          <View style={styles.goalInfoCard}>
            <View style={styles.goalInfoHeader}>
              <View style={[styles.goalIconContainer, { backgroundColor: linkedGoal.color }]}>
                <Ionicons name="flag" size={24} color="white" />
              </View>
              <View style={styles.goalInfo}>
                <Text style={styles.goalInfoTitle}>{linkedGoal.title}</Text>
                <Text style={styles.goalInfoSubtitle}>Linked Goal</Text>
              </View>
              <TouchableOpacity 
                style={styles.viewGoalButton}
                onPress={() => router.push(`/goal/${linkedGoal.id}`)}
              >
                <Text style={styles.viewGoalText}>View Goal</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.goalProgressInfo}>
              <Text style={styles.goalProgressLabel}>Goal Progress</Text>
              <Text style={styles.goalProgressValue}>
                {formatCurrency(linkedGoal.current_amount)} / {formatCurrency(linkedGoal.target_amount)}
              </Text>
              <View style={styles.goalProgressBar}>
                <View 
                  style={[
                    styles.goalProgressFill, 
                    { 
                      width: `${Math.min((linkedGoal.current_amount / linkedGoal.target_amount) * 100, 100)}%`,
                      backgroundColor: linkedGoal.color
                    }
                  ]} 
                />
              </View>
            </View>
          </View>
        )}

        {/* Alert Banner */}
        {alerts.length > 0 && (
          <View style={styles.alertBanner}>
            <Ionicons name="warning" size={20} color="#F59E0B" />
            <Text style={styles.alertText}>{alerts[0]}</Text>
          </View>
        )}

        {/* Daily Pace Indicator */}
        <View style={styles.paceCard}>
          <Text style={styles.sectionTitle}>Daily Pace</Text>
          <View style={styles.paceContent}>
            <View style={styles.paceItem}>
              <Text style={styles.paceLabel}>Ideal Daily</Text>
              <Text style={styles.paceValue}>{formatCurrency(dailyPace.ideal)}</Text>
            </View>
            <View style={styles.paceItem}>
              <Text style={styles.paceLabel}>Actual Daily</Text>
              <Text style={styles.paceValue}>{formatCurrency(dailyPace.actual)}</Text>
            </View>
            <View style={styles.paceItem}>
              <Text style={styles.paceLabel}>Status</Text>
              <Text style={[styles.paceValue, { color: dailyPace.onTrack ? '#10B981' : '#EF4444' }]}>
                {dailyPace.onTrack ? 'On Track' : 'Too Fast'}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleEndPeriod}>
            <Ionicons name="stop-circle-outline" size={20} color="#F59E0B" />
            <Text style={styles.actionButtonText}>End Period</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTransactions = () => {
    const includedTransactions = budgetTransactions.filter(t => !t.is_excluded);
    const excludedTransactions = budgetTransactions.filter(t => t.is_excluded);
    
    return (
      <View style={styles.tabContent}>
        <View style={styles.transactionsList}>
          {includedTransactions.length > 0 ? (
            includedTransactions.map((budgetTransaction) => {
              const transaction = transactions.find(t => t.id === budgetTransaction.transaction_id);
              if (!transaction) return null;
              
              return (
                <View key={budgetTransaction.id} style={styles.transactionCard}>
                  <View style={styles.transactionHeader}>
                    <View style={styles.transactionIcon}>
                      <Ionicons name="restaurant" size={20} color="#F59E0B" />
                    </View>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionDescription}>
                        {transaction.description}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {formatDate(transaction.date)}
                      </Text>
                    </View>
                    <View style={styles.transactionActions}>
                      <Text style={styles.transactionAmount}>
                        -{formatCurrency(transaction.amount)}
                      </Text>
                      <TouchableOpacity
                        style={styles.excludeButton}
                        onPress={() => {
                          setSelectedTransaction(budgetTransaction);
                          setShowExcludeModal(true);
                        }}
                      >
                        <Ionicons name="eye-off" size={16} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={64} color="rgba(255, 255, 255, 0.5)" />
              <Text style={styles.emptyTitle}>No Transactions</Text>
              <Text style={styles.emptyDescription}>
                Transactions will appear here when they're added to this budget
              </Text>
            </View>
          )}
        </View>

        {excludedTransactions.length > 0 && (
          <View style={styles.excludedSection}>
            <Text style={styles.excludedTitle}>Excluded Transactions</Text>
            {excludedTransactions.map((budgetTransaction) => {
              const transaction = transactions.find(t => t.id === budgetTransaction.transaction_id);
              if (!transaction) return null;
              
              return (
                <View key={budgetTransaction.id} style={[styles.transactionCard, styles.excludedCard]}>
                  <View style={styles.transactionHeader}>
                    <View style={styles.transactionIcon}>
                      <Ionicons name="eye-off" size={20} color="#6B7280" />
                    </View>
                    <View style={styles.transactionInfo}>
                      <Text style={[styles.transactionDescription, styles.excludedText]}>
                        {transaction.description}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {formatDate(transaction.date)}
                      </Text>
                      {budgetTransaction.excluded_reason && (
                        <Text style={styles.excludedReason}>
                          Reason: {budgetTransaction.excluded_reason}
                        </Text>
                      )}
                    </View>
                    <View style={styles.transactionActions}>
                      <Text style={[styles.transactionAmount, styles.excludedText]}>
                        -{formatCurrency(transaction.amount)}
                      </Text>
                      <TouchableOpacity
                        style={styles.includeButton}
                        onPress={() => handleIncludeTransaction(budgetTransaction)}
                      >
                        <Ionicons name="eye" size={16} color="#10B981" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderAccounts = () => {
    // For now, show a placeholder since budget_accounts is not implemented yet
    return (
      <View style={styles.tabContent}>
        <View style={styles.emptyContainer}>
          <Ionicons name="card-outline" size={64} color="rgba(255, 255, 255, 0.5)" />
          <Text style={styles.emptyTitle}>No Accounts</Text>
          <Text style={styles.emptyDescription}>
            Account linking will be implemented soon
          </Text>
        </View>
      </View>
    );
  };


  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Budget Details</Text>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="create" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'overview' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('overview')}
            >
              <Ionicons 
                name={activeTab === 'overview' ? 'home' : 'home-outline'} 
                size={18} 
                color={activeTab === 'overview' ? '#F59E0B' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'overview' && styles.activeTabText,
                ]}
              >
                Overview
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'transactions' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('transactions')}
            >
              <Ionicons 
                name={activeTab === 'transactions' ? 'list' : 'list-outline'} 
                size={18} 
                color={activeTab === 'transactions' ? '#F59E0B' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'transactions' && styles.activeTabText,
                ]}
              >
                Transactions
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'accounts' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('accounts')}
            >
              <Ionicons 
                name={activeTab === 'accounts' ? 'card' : 'card-outline'} 
                size={18} 
                color={activeTab === 'accounts' ? '#F59E0B' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'accounts' && styles.activeTabText,
                ]}
              >
                Accounts
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'transactions' && renderTransactions()}
          {activeTab === 'accounts' && renderAccounts()}
        </ScrollView>

        {/* Exclude Transaction Modal */}
        <Modal
          visible={showExcludeModal}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Exclude Transaction</Text>
                <TouchableOpacity
                  onPress={() => setShowExcludeModal(false)}
                >
                  <Ionicons name="close" size={24} color="white" />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.modalDescription}>
                  This transaction will be excluded from budget calculations. You can include it again later.
                </Text>
                <Text style={styles.inputLabel}>Reason (Optional)</Text>
                <TextInput
                  style={styles.descriptionInput}
                  value={excludeReason}
                  onChangeText={setExcludeReason}
                  placeholder="Enter reason for exclusion"
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowExcludeModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.excludeButton}
                    onPress={handleExcludeTransaction}
                  >
                    <Text style={styles.excludeButtonText}>Exclude</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 30,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginLeft: 4,
  },
  activeTabText: {
    color: 'white',
  },
  tabContent: {
    marginBottom: 20,
  },
  progressCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  budgetIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  budgetInfo: {
    flex: 1,
  },
  budgetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  budgetPeriod: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  budgetStatus: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressBar: {
    flex: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    marginRight: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    minWidth: 50,
    textAlign: 'right',
  },
  budgetStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  insightsCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  insightValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  addExpenseButton: {
    marginBottom: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    padding: 16,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  transactionsList: {
    marginBottom: 20,
  },
  transactionCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  alertsList: {
    marginBottom: 20,
  },
  alertCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertMessage: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  alertThreshold: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  historyList: {
    marginBottom: 20,
  },
  historyCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyMonth: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  historyPercentage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  historyProgress: {
    marginBottom: 12,
  },
  historyProgressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
  },
  historyProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  historyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyStat: {
    alignItems: 'center',
  },
  historyStatLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  historyStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  modalBody: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    marginBottom: 16,
  },
  descriptionInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    marginBottom: 20,
  },
  addExpenseText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  errorBackButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  errorBackButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  budgetTypeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  budgetTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  alertBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  alertText: {
    fontSize: 14,
    color: '#F59E0B',
    marginLeft: 8,
    flex: 1,
  },
  paceCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  paceContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paceItem: {
    alignItems: 'center',
    flex: 1,
  },
  paceLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  paceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
    marginLeft: 8,
  },
  transactionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  excludeButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
  },
  includeButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  excludedSection: {
    marginTop: 20,
  },
  excludedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
  },
  excludedCard: {
    opacity: 0.7,
    borderWidth: 1,
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  excludedText: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  excludedReason: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  accountsList: {
    gap: 12,
  },
  accountCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  accountType: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  accountBalance: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  accountRole: {
    alignItems: 'flex-end',
  },
  roleText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  accountFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 8,
  },
  syncText: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  excludeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
  goalInfoCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  goalInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  goalIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  goalInfo: {
    flex: 1,
  },
  goalInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  goalInfoSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  viewGoalButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewGoalText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  goalProgressInfo: {
    marginTop: 8,
  },
  goalProgressLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  goalProgressValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  goalProgressBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
});
