import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { calculateGoalProgress, getProgressColor } from '@/utils/goals';
import TransactionCard from '@/components/TransactionCard';
import GoalCard from '@/components/GoalCard';
import { BudgetCard } from '@/components/BudgetCard';
import PayModal from '../modals/pay';
import ReceiveModal from '../modals/receive';
import TransferModal from '../modals/transfer';
import { AddBudgetModal } from '../modals/add-budget';

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  color: string;
  icon: string;
  description?: string;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  account_id: string;
  category_id: string;
  category?: {
    name: string;
  };
}

export default function AccountDetailScreen() {
  const { user } = useAuth();
  const { accounts, transactions, goals, budgets, refreshAccounts, refreshTransactions, refreshGoals, refreshBudgets } = useRealtimeData();
  const { currency } = useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [activeTab, setActiveTab] = useState('transactions');
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [addBudgetModalVisible, setAddBudgetModalVisible] = useState(false);
  
  const [account, setAccount] = useState<Account | null>(null);
  const [accountTransactions, setAccountTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (id && accounts.length > 0) {
      const foundAccount = accounts.find(acc => acc.id === id);
      if (foundAccount) {
        setAccount(foundAccount);
      }
    }
  }, [id, accounts]);

  useEffect(() => {
    if (account && transactions.length > 0) {
      const accountTrans = transactions.filter(t => t.account_id === account.id);
      setAccountTransactions(accountTrans);
    }
  }, [account, transactions]);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, 'INR'); // TODO: Get from user settings
  };

  const handleTransactionPress = (transactionId: string) => {
    router.push(`/transaction/${transactionId}`);
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#000000" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{account?.name || 'Account'}</Text>
      <View style={styles.placeholder} />
    </View>
  );

  const renderBalanceSection = () => (
    <View style={styles.balanceContainer}>
      <View style={styles.balanceBox}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceAmount}>
          {formatCurrency(account?.balance || 0)}
        </Text>
      </View>
    </View>
  );

  const renderQuickActions = () => (
    <View style={styles.quickActionsContainer}>
      <TouchableOpacity 
        style={styles.actionButton}
        onPress={() => setPayModalVisible(true)}
      >
        <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        <Text style={styles.actionText}>Pay</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.actionButton}
        onPress={() => setReceiveModalVisible(true)}
      >
        <Ionicons name="arrow-down" size={20} color="#FFFFFF" />
        <Text style={styles.actionText}>Receive</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.actionButton}
        onPress={() => setTransferModalVisible(true)}
      >
        <Ionicons name="swap-horizontal" size={20} color="#FFFFFF" />
        <Text style={styles.actionText}>Transfer</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFilterTabs = () => (
    <View style={styles.tabsContainer}>
      <TouchableOpacity 
        style={[styles.tab, activeTab === 'transactions' && styles.activeTab]}
        onPress={() => setActiveTab('transactions')}
      >
        <Text style={[styles.tabText, activeTab === 'transactions' && styles.activeTabText]}>
          Transactions
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.tab, activeTab === 'budgets' && styles.activeTab]}
        onPress={() => setActiveTab('budgets')}
      >
        <Text style={[styles.tabText, activeTab === 'budgets' && styles.activeTabText]}>
          Budgets
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.tab, activeTab === 'insights' && styles.activeTab]}
        onPress={() => setActiveTab('insights')}
      >
        <Text style={[styles.tabText, activeTab === 'insights' && styles.activeTabText]}>
          Insights
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.tab, activeTab === 'statements' && styles.activeTab]}
        onPress={() => setActiveTab('statements')}
      >
        <Text style={[styles.tabText, activeTab === 'statements' && styles.activeTabText]}>
          Statements
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderTransactionsList = () => (
    <View style={styles.transactionsContainer}>
      {accountTransactions.length > 0 ? (
        accountTransactions.map((transaction) => (
          <TransactionCard
            key={transaction.id}
            id={transaction.id}
            amount={transaction.amount}
            type={transaction.type as 'income' | 'expense' | 'transfer'}
            category={transaction.category?.name || 'Other'}
            description={transaction.description}
            date={transaction.date}
            onPress={() => handleTransactionPress(transaction.id)}
          />
        ))
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Transactions Yet</Text>
          <Text style={styles.emptyDescription}>
            Start by making a payment or receiving money
          </Text>
        </View>
      )}
    </View>
  );

  const renderBudgets = () => {
    // Get budgets that include this account
    const accountBudgets = budgets.filter(budget => 
      budget.budget_accounts?.some(ba => ba.account_id === account?.id)
    );

    return (
      <View style={styles.budgetsContainer}>
        <View style={styles.budgetsHeader}>
          <Text style={styles.budgetsTitle}>Account Budgets</Text>
          <TouchableOpacity 
            style={styles.addBudgetButton}
            onPress={() => setAddBudgetModalVisible(true)}
          >
            <Ionicons name="add" size={20} color="#10B981" />
            <Text style={styles.addBudgetText}>Create Budget</Text>
          </TouchableOpacity>
        </View>

        {accountBudgets.length > 0 ? (
          <View style={styles.budgetsList}>
            {accountBudgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onPress={() => router.push(`/budget/${budget.id}`)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Budgets Yet</Text>
            <Text style={styles.emptyDescription}>
              Create a budget to track spending for this account
            </Text>
            <TouchableOpacity 
              style={styles.createBudgetButton}
              onPress={() => setAddBudgetModalVisible(true)}
            >
              <Text style={styles.createBudgetText}>Create Your First Budget</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderInsights = () => (
    <View style={styles.insightsContainer}>
      <Text style={styles.insightsTitle}>Account Insights</Text>
      <View style={styles.insightCard}>
        <Text style={styles.insightText}>Coming Soon</Text>
        <Text style={styles.insightSubtext}>
          Detailed analytics and insights will be available here
        </Text>
      </View>
    </View>
  );

  const renderStatements = () => (
    <View style={styles.statementsContainer}>
      <Text style={styles.statementsTitle}>Account Statements</Text>
      <View style={styles.statementCard}>
        <Text style={styles.statementText}>Coming Soon</Text>
        <Text style={styles.statementSubtext}>
          Download your account statements here
        </Text>
      </View>
    </View>
  );

  const renderGoalsContent = () => {
    const activeGoals = goals.filter(goal => !goal.is_achieved);
    const completedGoals = goals.filter(goal => goal.is_achieved);

    return (
      <View style={styles.content}>
        {renderHeader()}
        {renderBalanceSection()}
        
        {/* Goals-specific tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'goals' && styles.activeTab]}
            onPress={() => setActiveTab('goals')}
          >
            <Text style={[styles.tabText, activeTab === 'goals' && styles.activeTabText]}>
              Goals ({activeGoals.length})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'transactions' && styles.activeTab]}
            onPress={() => setActiveTab('transactions')}
          >
            <Text style={[styles.tabText, activeTab === 'transactions' && styles.activeTabText]}>
              Transactions
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'goals' && (
          <View style={styles.goalsContainer}>
            <View style={styles.goalsSection}>
              <Text style={styles.sectionTitle}>Active Goals</Text>
              {activeGoals.length > 0 ? (
                activeGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onPress={() => router.push(`/goal/${goal.id}`)}
                  />
                ))
              ) : (
                <View style={styles.emptyGoalsContainer}>
                  <Ionicons name="flag-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
                  <Text style={styles.emptyGoalsTitle}>No Active Goals</Text>
                  <Text style={styles.emptyGoalsDescription}>
                    Create your first goal to start saving!
                  </Text>
                  <TouchableOpacity 
                    style={styles.createGoalButton}
                    onPress={() => router.push('/(tabs)/goals')}
                  >
                    <Text style={styles.createGoalButtonText}>Create Goal</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {completedGoals.length > 0 && (
              <View style={styles.goalsSection}>
                <Text style={styles.sectionTitle}>Completed Goals</Text>
                {completedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onPress={() => router.push(`/goal/${goal.id}`)}
                  />
                ))}
              </View>
            )}
          </View>
        )}
        
        {activeTab === 'transactions' && renderTransactionsList()}
      </View>
    );
  };

  const renderContent = () => {
    if (!account) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading account...</Text>
        </View>
      );
    }

    // Special handling for Goals Savings Account
    if (account.type === 'goals_savings') {
      return renderGoalsContent();
    }

    return (
      <View style={styles.content}>
        {renderHeader()}
        {renderBalanceSection()}
        {renderQuickActions()}
        {renderFilterTabs()}
        
        {activeTab === 'transactions' && renderTransactionsList()}
        {activeTab === 'budgets' && renderBudgets()}
        {activeTab === 'insights' && renderInsights()}
        {activeTab === 'statements' && renderStatements()}
      </View>
    );
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#99D795" />
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {renderContent()}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      {/* Modals */}
      <PayModal 
        visible={payModalVisible} 
        onClose={() => setPayModalVisible(false)}
        onSuccess={() => {
          refreshAccounts();
          refreshTransactions();
        }}
        preselectedAccountId={account?.id}
      />
      <ReceiveModal 
        visible={receiveModalVisible} 
        onClose={() => setReceiveModalVisible(false)}
        onSuccess={() => {
          refreshAccounts();
          refreshTransactions();
        }}
        preselectedAccountId={account?.id}
      />
      <TransferModal 
        visible={transferModalVisible} 
        onClose={() => setTransferModalVisible(false)}
        onSuccess={() => {
          refreshAccounts();
          refreshTransactions();
        }}
        preselectedAccountId={account?.id}
      />
      <AddBudgetModal 
        visible={addBudgetModalVisible} 
        onClose={() => setAddBudgetModalVisible(false)}
      />
    </>
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
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  placeholder: {
    width: 40,
  },
  balanceContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  balanceBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#000000',
    alignItems: 'center',
    minWidth: 200,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000000',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    gap: 20,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  actionText: {
    fontSize: 12,
    color: '#FFFFFF',
    marginTop: 4,
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderRadius: 25,
    padding: 4,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#99D795',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  activeTabText: {
    color: '#000000',
  },
  transactionsContainer: {
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  insightsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  insightsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
  },
  insightCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  insightText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  insightSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  statementsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  statementsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
  },
  statementCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  statementText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  statementSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  goalsContainer: {
    paddingHorizontal: 20,
  },
  goalsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  emptyGoalsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: '#000000',
    borderRadius: 16,
  },
  emptyGoalsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyGoalsDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  createGoalButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  createGoalButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  budgetsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  budgetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  budgetsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  addBudgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  addBudgetText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 4,
  },
  budgetsList: {
    gap: 12,
  },
  createBudgetButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
    alignSelf: 'center',
  },
  createBudgetText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});