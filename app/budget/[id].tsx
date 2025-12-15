import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { useBackNavigation, useAndroidBackButton } from '@/hooks/useBackNavigation';
import { 
  updateBudgetProgress, 
  getBudgetTransactions, 
  excludeTransactionFromBudget, 
  includeTransactionInBudget,
  calculateDailyPace,
  checkBudgetAlerts,
  getBudgetAccountIds
} from '@/utils/budgets';
import { BudgetTransaction } from '@/types';
import EditBudgetModal from '@/app/modals/edit-budget';
import BudgetReflectionModal from '@/app/modals/budget-reflection';

export default function BudgetDetailScreen() {
  const { id } = useLocalSearchParams();
  const handleBack = useBackNavigation();
  useAndroidBackButton();
  const [activeTab, setActiveTab] = useState('overview');
  const [showExcludeModal, setShowExcludeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReflectionModal, setShowReflectionModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<BudgetTransaction | null>(null);
  const [excludeReason, setExcludeReason] = useState('');
  const [, setLoading] = useState(false);
  
  const { budgets, accounts, transactions, goals, categories, refreshBudgets } = useRealtimeData();
  const { currency } = useSettings();
  const { showNotification } = useNotification();
  // const { user } = useAuth();

  // Find the current budget and linked goal
  const budget = budgets.find(b => b.id === id);
  const linkedGoal = budget?.budget_type === 'goal_based' && budget.goal_id 
    ? goals.find(g => g.id === budget.goal_id)
    : null;
  
  // Find the linked category if this is a category budget
  const linkedCategory = budget?.category_id 
    ? categories.find(c => c.id === budget.category_id)
    : null;
  
  const [budgetTransactions, setBudgetTransactions] = useState<BudgetTransaction[]>([]);
  const [dailyPace, setDailyPace] = useState({ ideal: 0, actual: 0, onTrack: true });
  const [alerts, setAlerts] = useState<string[]>([]);
  const [budgetAccountIds, setBudgetAccountIds] = useState<string[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    if (budget) {
      loadBudgetData();
      
      // Auto-detect if period has ended and show reflection modal
      const endDate = new Date(budget.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
      
      // Check if period has ended and budget is active but not already marked as reflection_ready
      if (endDate < today && budget.is_active && !budget.metadata?.reflection_ready) {
        // Auto-show reflection modal after a short delay
        const timer = setTimeout(() => {
          setShowReflectionModal(true);
        }, 500);
        return () => clearTimeout(timer);
      }
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

      // Load budget accounts
      await loadBudgetAccounts();
      
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

  const loadBudgetAccounts = async () => {
    if (!budget) return;
    
    setLoadingAccounts(true);
    try {
      const accountIds = await getBudgetAccountIds(budget.id);
      setBudgetAccountIds(accountIds);
    } catch (error) {
      console.error('Error loading budget accounts:', error);
    } finally {
      setLoadingAccounts(false);
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

  // Helper function to add alpha to hex color
  const addAlphaToHex = (hex: string, alpha: number): string => {
    // Remove # if present
    const cleanHex = hex.replace('#', '');
    // Convert alpha to hex (0-255)
    const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `#${cleanHex}${alphaHex}`;
  };

  const getBudgetTypeInfo = () => {
    if (!budget) return { 
      name: '', 
      icon: 'wallet-outline', 
      color: '#6B7280',
      focus: '',
      timeFrame: '',
      trigger: '',
      output: '',
      description: ''
    };
    
    switch (budget.budget_type) {
      case 'monthly':
        return { 
          name: 'Monthly Budget', 
          icon: 'calendar-outline', 
          color: '#3B82F6',
          focus: 'General control',
          timeFrame: 'Month-based',
          trigger: 'Expenses',
          output: '% of total spent',
          description: 'General control over total spending in a fixed month'
        };
      case 'category':
        return { 
          name: 'Category Budget', 
          icon: 'pricetag-outline', 
          color: '#8B5CF6',
          focus: 'Spending habits',
          timeFrame: 'Configurable',
          trigger: 'Category expenses',
          output: '% of category cap',
          description: 'Control spending habits for specific categories'
        };
      case 'goal_based':
        return { 
          name: 'Goal-Based Budget', 
          icon: 'flag-outline', 
          color: '#F59E0B',
          focus: 'Saving toward target',
          timeFrame: 'Configurable',
          trigger: 'Expenses or savings',
          output: 'Goal progress + budget',
          description: 'Save toward a target by linking to your goals'
        };
      case 'smart':
        return { 
          name: 'Smart Budget', 
          icon: 'bulb-outline', 
          color: '#10B981',
          focus: 'Prediction & automation',
          timeFrame: 'Dynamic',
          trigger: 'Spending patterns',
          output: 'AI-generated caps',
          description: 'Prediction & automation based on spending patterns'
        };
      case 'custom':
        return { 
          name: 'Custom Budget', 
          icon: 'settings-outline', 
          color: '#6B7280',
          focus: 'Events & projects',
          timeFrame: 'Manual',
          trigger: 'Selected period',
          output: 'Event expense tracking',
          description: 'Events & projects with manual time periods'
        };
      default:
        return { 
          name: 'Budget', 
          icon: 'wallet-outline', 
          color: '#6B7280',
          focus: '',
          timeFrame: '',
          trigger: '',
          output: '',
          description: ''
        };
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

  // const handleEndPeriod = async () => {
  //   // Check if period has ended (end_date is in the past)
  //   if (budget && new Date(budget.end_date) <= new Date()) {
  //     // Show reflection modal
  //     setShowReflectionModal(true);
  //   } else {
  //     // Period hasn't ended yet, show alert
  //     Alert.alert(
  //       'End Budget Period',
  //       'Are you sure you want to end this budget period early?',
  //       [
  //         { text: 'Cancel', style: 'cancel' },
  //         { text: 'End Period', onPress: () => setShowReflectionModal(true) },
  //       ]
  //     );
  //   }
  // };

  const handleReflectionComplete = async () => {
    await refreshBudgets();
    // Optionally navigate back or refresh the current view
    handleBack();
  };


  if (!budget) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Budget Not Found</Text>
            <Text style={styles.errorDescription}>
              The budget you&apos;re looking for doesn&apos;t exist or has been deleted.
            </Text>
            <TouchableOpacity style={styles.errorBackButton} onPress={handleBack}>
              <Text style={styles.errorBackButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const renderOverview = () => {
    const percentage = budget.amount > 0 ? (budget.spent_amount / budget.amount) * 100 : 0;
    // const status = getBudgetStatus(percentage);
    const isSaveTarget = (budget.budget_mode || 'spend_cap') === 'save_target'; // Default to spend_cap if not set
    
    return (
      <View style={styles.tabContent}>
        {/* Budget Summary Cards */}
        <View style={styles.summaryCards}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Budgeted</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(budget.amount)}</Text>
          </View>
          <View style={[styles.summaryCard, styles.spentCard]}>
            <Text style={styles.summaryLabel}>{isSaveTarget ? 'Contributed' : 'Amount Spent'}</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(budget.spent_amount)}</Text>
          </View>
          <View style={[styles.summaryCard, styles.remainingCard]}>
            <Text style={styles.summaryLabel}>Remaining</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(budget.remaining_amount)}</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: percentage >= 100 ? '#EF4444' : percentage >= 80 ? '#F59E0B' : '#10B981',
                },
              ]}
            />
          </View>
          <View style={styles.progressTextContainer}>
            <Text style={styles.progressPercentage}>{Math.round(percentage)}% {isSaveTarget ? 'contributed' : 'spent'}</Text>
            <Text style={styles.progressRemaining}>{formatCurrency(Math.abs(budget.remaining_amount))} {budget.remaining_amount < 0 ? 'over' : 'left'}</Text>
          </View>
        </View>

        {/* Budget Type Info Card */}
        <View style={styles.budgetTypeInfoCard}>
          <Text style={styles.budgetTypeInfoTitle}>Budget Type Information</Text>
          <Text style={styles.budgetTypeInfoDescription}>
            {getBudgetTypeInfo().description}
          </Text>
          <View style={styles.budgetTypeInfoDetails}>
            <View style={styles.budgetTypeInfoRow}>
              <Text style={styles.budgetTypeInfoLabel}>Focus:</Text>
              <Text style={styles.budgetTypeInfoValue}>{getBudgetTypeInfo().focus}</Text>
            </View>
            <View style={styles.budgetTypeInfoRow}>
              <Text style={styles.budgetTypeInfoLabel}>Time Frame:</Text>
              <Text style={styles.budgetTypeInfoValue}>{getBudgetTypeInfo().timeFrame}</Text>
            </View>
            <View style={styles.budgetTypeInfoRow}>
              <Text style={styles.budgetTypeInfoLabel}>Trigger:</Text>
              <Text style={styles.budgetTypeInfoValue}>{getBudgetTypeInfo().trigger}</Text>
            </View>
            <View style={[styles.budgetTypeInfoRow, styles.budgetTypeInfoRowLast]}>
              <Text style={styles.budgetTypeInfoLabel}>Output:</Text>
              <Text style={styles.budgetTypeInfoValue}>{getBudgetTypeInfo().output}</Text>
            </View>
          </View>
        </View>

        {/* Pace Guidance */}
        {dailyPace.ideal > 0 && (
          <View style={styles.paceCard}>
            <Text style={styles.paceTitle}>Pace Guidance</Text>
            <Text style={styles.paceText}>
              You&apos;re spending {formatCurrency(dailyPace.actual)}/day - you need {formatCurrency(dailyPace.ideal)}/day to stay on track.
            </Text>
          </View>
        )}

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
            <Text style={styles.alertTime}>3d ago</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="create-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Adjust Budget</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Add Transaction</Text>
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
                    <Ionicons name="eye-off-outline" size={18} color="#6B7280" />
                  </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No Transactions</Text>
              <Text style={styles.emptyDescription}>
                Transactions will appear here when they&apos;re added to this budget
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
                      <Ionicons name="eye-off-outline" size={20} color="#6B7280" />
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
                    <Ionicons name="eye-outline" size={18} color="#10B981" />
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
    if (!budget) return null;

    const budgetAccounts = accounts.filter(account => 
      budgetAccountIds.includes(account.id) &&
      account.currency === budget.currency
    );

    return (
      <View style={styles.tabContent}>
        <View style={styles.accountsSection}>
          <Text style={styles.sectionDescription}>
            These accounts are being tracked for this budget. Only transactions from these accounts will count toward your budget.
          </Text>
          
          {loadingAccounts ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyDescription}>Loading accounts...</Text>
            </View>
          ) : budgetAccounts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="wallet-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No Accounts Linked</Text>
              <Text style={styles.emptyDescription}>
                No accounts are currently linked to this budget. Edit the budget to add accounts.
              </Text>
              <TouchableOpacity
                style={styles.addAccountButton}
                onPress={() => setShowEditModal(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color="#10B981" />
                <Text style={styles.addAccountButtonText}>Add Accounts</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.accountsList}>
              {budgetAccounts.map((account) => (
                <View key={account.id} style={styles.accountCard}>
                  <TouchableOpacity
                    onPress={() => router.push(`/account/${account.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.accountCardHeader}>
                      <View style={[styles.accountCardIcon, { backgroundColor: account.color }]}>
                        <Ionicons name={account.icon as any} size={24} color="white" />
                      </View>
                      <View style={styles.accountCardInfo}>
                        <Text style={styles.accountCardName}>{account.name}</Text>
                        <Text style={styles.accountCardType}>
                          {account.type === 'bank' ? 'Bank Account' :
                           account.type === 'card' ? 'Card' :
                           account.type === 'wallet' ? 'Wallet' :
                           account.type === 'cash' ? 'Cash' : account.type}
                        </Text>
                      </View>
                      <View style={styles.accountCardBalance}>
                        <Text style={styles.accountCardBalanceText}>
                          {formatCurrencyAmount(account.balance, account.currency)}
                        </Text>
                        <Text style={styles.accountCardBalanceLabel}>Balance</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.accountCardActions}>
                    <TouchableOpacity
                      style={styles.accountCardActionButton}
                      onPress={() => router.push(`/account/${account.id}`)}
                    >
                      <Ionicons name="eye-outline" size={18} color="#3B82F6" />
                      <Text style={styles.accountCardActionButtonText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.accountCardActionButton, styles.accountCardActionButtonSecondary]}
                      onPress={() => setShowEditModal(true)}
                    >
                      <Ionicons name="settings-outline" size={18} color="#10B981" />
                      <Text style={[styles.accountCardActionButtonText, styles.accountCardActionButtonTextSecondary]}>Manage</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={styles.editAccountsButton}
                onPress={() => setShowEditModal(true)}
              >
                <Ionicons name="create-outline" size={20} color="#10B981" />
                <Text style={styles.editAccountsButtonText}>Edit Accounts</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };


  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#000000" />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>{budget.name}</Text>
              <View style={styles.badgeContainer}>
                {budget && (
                  <View style={styles.budgetTypeBadge}>
                    <Ionicons 
                      name={getBudgetTypeInfo().icon as any} 
                      size={14} 
                      color={getBudgetTypeInfo().color} 
                    />
                    <Text style={styles.budgetTypeText}>
                      {getBudgetTypeInfo().name}
                    </Text>
                  </View>
                )}
                {linkedCategory && (
                  <View style={[styles.categoryBadge, { backgroundColor: addAlphaToHex(linkedCategory.color, 0.1) }]}>
                    <Ionicons 
                      name={linkedCategory.icon as any} 
                      size={14} 
                      color={linkedCategory.color} 
                    />
                    <Text style={[styles.categoryText, { color: linkedCategory.color }]}>
                      {linkedCategory.name}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity 
              style={styles.editButton}
              onPress={() => setShowEditModal(true)}
            >
              <Ionicons name="create-outline" size={24} color="#000000" />
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
                color={activeTab === 'overview' ? '#10B981' : '#6B7280'} 
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
                color={activeTab === 'transactions' ? '#10B981' : '#6B7280'} 
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
                color={activeTab === 'accounts' ? '#10B981' : '#6B7280'} 
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
                  <Ionicons name="close" size={24} color="#000000" />
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
                    style={[styles.excludeButton, { backgroundColor: '#10B981' }]}
                    onPress={handleExcludeTransaction}
                  >
                    <Text style={styles.excludeButtonText}>Exclude</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Edit Budget Modal */}
        <EditBudgetModal
          visible={showEditModal}
          budget={budget}
          onClose={() => setShowEditModal(false)}
          onUpdate={async () => {
            await refreshBudgets();
            await loadBudgetData();
          }}
          onDelete={async () => {
            await refreshBudgets();
            router.back();
          }}
        />

        {/* Budget Reflection Modal */}
        {budget && (
          <BudgetReflectionModal
            visible={showReflectionModal}
            budget={budget}
            onClose={() => setShowReflectionModal(false)}
            onRenewalComplete={handleReflectionComplete}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // White background
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Archivo Black', // Archivo Black for page headings
    fontWeight: '900',
    color: '#000000', // Black text
    marginBottom: 8,
    textAlign: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  budgetTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  budgetTypeText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
    marginLeft: 6,
  },
  activeTabText: {
    color: '#000000',
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
  },
  tabContent: {
    marginBottom: 20,
  },
  summaryCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  spentCard: {
    backgroundColor: '#FEF3C7', // Light orange/amber background
  },
  remainingCard: {
    backgroundColor: '#D1FAE5', // Light green background
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles/text
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 18,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
  },
  progressSection: {
    marginBottom: 20,
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercentage: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
  },
  progressRemaining: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  budgetTypeInfoCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  budgetTypeInfoTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold', // Poppins for section headings
    fontWeight: '600',
    color: '#000000', // Black text
    marginBottom: 8,
  },
  budgetTypeInfoDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  budgetTypeInfoDetails: {
    marginTop: 8,
  },
  budgetTypeInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  budgetTypeInfoRowLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  budgetTypeInfoLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
    flex: 1,
  },
  budgetTypeInfoValue: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
    flex: 1,
    textAlign: 'right',
  },
  paceCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  paceTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold', // Poppins for section headings
    fontWeight: '600',
    color: '#000000', // Black text
    marginBottom: 8,
  },
  paceText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
    lineHeight: 20,
  },
  insightsCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold', // Poppins for section headings
    fontWeight: '600',
    color: '#000000', // Black text
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles/text
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  transactionAmount: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
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
    backgroundColor: '#FFFFFF',
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
    fontSize: 20,
    fontFamily: 'Archivo Black', // Archivo Black for page headings
    fontWeight: '900',
    color: '#000000', // Black text
  },
  modalBody: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  descriptionInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    backgroundColor: '#FFFFFF',
  },
  errorTitle: {
    fontSize: 24,
    fontFamily: 'Archivo Black',
    fontWeight: '900',
    color: '#000000', // Black text
    marginBottom: 16,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  errorBackButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorBackButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#FFFFFF', // White text on button
  },
  alertBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  alertText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    color: '#92400E',
    marginLeft: 12,
    flex: 1,
  },
  alertTime: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#92400E',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981', // Dark green button
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#FFFFFF', // White text on button
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
    backgroundColor: '#F3F4F6',
  },
  includeButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#D1FAE5',
  },
  excludedSection: {
    marginTop: 20,
  },
  excludedTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold', // Poppins for section headings
    fontWeight: '600',
    color: '#000000', // Black text
    marginBottom: 12,
  },
  excludedCard: {
    opacity: 0.7,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  excludedText: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
  },
  excludedReason: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  accountsList: {
    gap: 12,
  },
  accountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
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
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  excludeButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#FFFFFF', // White text on button
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
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#000000', // Black text
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  goalInfoCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    fontFamily: 'Poppins-SemiBold', // Poppins for section headings
    fontWeight: '600',
    color: '#000000', // Black text
    marginBottom: 4,
  },
  goalInfoSubtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  viewGoalButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewGoalText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#FFFFFF', // White text on button
  },
  accountsSection: {
    padding: 20,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 20,
    lineHeight: 20,
  },
  addAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    padding: 12,
    marginTop: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  addAccountButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#10B981',
  },
  accountCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  accountCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountCardInfo: {
    flex: 1,
  },
  accountCardName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  accountCardType: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  accountCardBalance: {
    alignItems: 'flex-end',
  },
  accountCardBalanceText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 4,
  },
  accountCardBalanceLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  accountCardActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  accountCardActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  accountCardActionButtonSecondary: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  accountCardActionButtonText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#3B82F6',
  },
  accountCardActionButtonTextSecondary: {
    color: '#10B981',
  },
  editAccountsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 14,
    marginTop: 20,
    gap: 8,
  },
  editAccountsButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#FFFFFF',
  },
  goalProgressInfo: {
    marginTop: 8,
  },
  goalProgressLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles/text
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 4,
  },
  goalProgressValue: {
    fontSize: 18,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 8,
  },
  goalProgressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
});

