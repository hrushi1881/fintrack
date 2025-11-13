import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import EditTransactionModal from '../modals/edit-transaction';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  account_id: string;
  category_id: string;
  notes?: string;
  location?: string;
  reference_number?: string;
  tags?: string[];
  created_at?: string;
  balance_before?: number;
  balance_after?: number;
  account?: {
    name: string;
    color: string;
    icon: string;
  };
  category?: {
    name: string;
  };
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, refreshAccounts } = useRealtimeData();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedTransactions, setRelatedTransactions] = useState<Transaction[]>([]);
  const [dailyTransactionCount, setDailyTransactionCount] = useState(0);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [beforeBalance, setBeforeBalance] = useState<number | null>(null);
  const [afterBalance, setAfterBalance] = useState<number | null>(null);
  const [currentAccountBalance, setCurrentAccountBalance] = useState<number | null>(null);

  // Update current account balance from real-time accounts data
  const updateCurrentAccountBalance = React.useCallback(() => {
    if (transaction?.account_id && accounts && accounts.length > 0) {
      const account = accounts.find(acc => acc.id === transaction.account_id);
      if (account) {
        const newBalance = Number(account.balance) || 0;
        console.log('✅ Updating current account balance from real-time data:', {
          accountId: transaction.account_id,
          accountName: account.name,
          oldBalance: currentAccountBalance,
          newBalance: newBalance,
          afterBalance: afterBalance,
          matchesAfter: Math.abs(newBalance - (afterBalance || 0)) < 0.01
        });
        setCurrentAccountBalance(newBalance);
      } else {
        console.warn('⚠️ Account not found in real-time data:', transaction.account_id);
      }
    } else if (transaction?.account_id && (!accounts || accounts.length === 0)) {
      console.warn('⚠️ Accounts data not available yet, will retry when available');
    }
  }, [transaction?.account_id, accounts]);

  // Update balance when accounts data changes or transaction loads
  useEffect(() => {
    updateCurrentAccountBalance();
  }, [updateCurrentAccountBalance]);

  // Refresh account balance when page is focused (to get latest balance)
  useFocusEffect(
    React.useCallback(() => {
      // Refresh accounts to ensure we have the latest balance
      refreshAccounts().then(() => {
        // Balance will be updated via useEffect after accounts are refreshed
      });
    }, [refreshAccounts])
  );

  useEffect(() => {
    if (id && user) {
      fetchTransactionDetails();
    }
  }, [id, user]);

  const fetchTransactionDetails = async () => {
    try {
      // Fetch the main transaction (including created_at, balance_before, balance_after)
      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .select(`
          *,
          account:accounts!transactions_account_id_fkey(name, color, icon),
          category:categories!transactions_category_id_fkey_new(name, color, icon)
        `)
        .eq('id', id)
        .eq('user_id', user?.id)
        .single();

      if (transactionError) {
        console.error('Error fetching transaction:', transactionError);
        Alert.alert('Error', 'Failed to load transaction details');
        return;
      }

      // Ensure created_at exists
      if (transactionData && !transactionData.created_at) {
        transactionData.created_at = transactionData.date;
      }

      setTransaction(transactionData);

      // Refresh accounts to ensure we have the latest balance
      await refreshAccounts();

      // Calculate before and after balance
      if (transactionData) {
        await calculateBalanceImpact(transactionData);
      }
      
      // Current account balance will be updated via useEffect when accounts data is available

      // Fetch related transactions (same day)
      if (transactionData) {
        const { data: relatedData, error: relatedError } = await supabase
          .from('transactions')
          .select(`
            *,
            account:accounts!transactions_account_id_fkey(name, color, icon),
            category:categories!transactions_category_id_fkey_new(name, color, icon)
          `)
          .eq('user_id', user?.id)
          .eq('date', transactionData.date)
          .neq('id', id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!relatedError) {
          setRelatedTransactions(relatedData || []);
        }

        // Count total transactions for the day
        const { count } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user?.id)
          .eq('date', transactionData.date);

        setDailyTransactionCount(count || 0);
      }
    } catch (error) {
      console.error('Error fetching transaction details:', error);
      Alert.alert('Error', 'Failed to load transaction details');
    } finally {
      setLoading(false);
    }
  };

  const calculateBalanceImpact = async (transaction: Transaction) => {
    try {
      // Use stored balance_before and balance_after if available (for new transactions)
      if (transaction.balance_before !== null && transaction.balance_before !== undefined &&
          transaction.balance_after !== null && transaction.balance_after !== undefined) {
        setBeforeBalance(Number(transaction.balance_before));
        setAfterBalance(Number(transaction.balance_after));
        console.log('Using stored balance values:', {
          balance_before: transaction.balance_before,
          balance_after: transaction.balance_after,
        });
        return;
      }

      // Fallback: For old transactions without stored balances, calculate from history
      // Get all transactions for this account with type information, ordered chronologically
      const { data: allTransactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('id, amount, type, date, created_at, balance_before, balance_after')
        .eq('account_id', transaction.account_id)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      if (transactionsError) throw transactionsError;

      // Get account's current balance
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('balance, created_at')
        .eq('id', transaction.account_id)
        .single();

      if (accountError) throw accountError;

      const currentBalance = Number(accountData.balance) || 0;
      
      // Calculate signed transaction amounts based on type
      // Expenses are negative, income is positive
      const signedTransactions = (allTransactions || []).map(t => ({
        ...t,
        signedAmount: t.type === 'expense' ? -Math.abs(Number(t.amount) || 0) : Math.abs(Number(t.amount) || 0)
      }));
      
      const sumOfAllTransactions = signedTransactions.reduce(
        (sum, t) => sum + t.signedAmount,
        0
      );
      const initialBalance = currentBalance - sumOfAllTransactions;

      // Now calculate running balance up to and including this transaction
      const transactionDate = transaction.date;
      const transactionCreatedAt = transaction.created_at || transaction.date;
      
      let runningBalance = initialBalance;
      let beforeBalance = initialBalance;
      let afterBalance = initialBalance;
      let foundTransaction = false;

      // Calculate running balance chronologically using signed transactions
      for (const txn of signedTransactions) {
        const txnDate = txn.date;
        const txnCreatedAt = txn.created_at || txn.date;
        
        // Check if we've reached our target transaction
        const isTargetTransaction = txn.id === transaction.id;
        
        if (isTargetTransaction) {
          // Use stored balance if available, otherwise calculate
          if (txn.balance_before !== null && txn.balance_before !== undefined &&
              txn.balance_after !== null && txn.balance_after !== undefined) {
            beforeBalance = Number(txn.balance_before);
            afterBalance = Number(txn.balance_after);
          } else {
            // This is our transaction - balance before it
            beforeBalance = runningBalance;
            // Apply signed transaction amount to get balance after
            afterBalance = runningBalance + txn.signedAmount;
          }
          foundTransaction = true;
          break;
        } else {
          // Check if this transaction is before our target
          const isBefore = 
            txnDate < transactionDate || 
            (txnDate === transactionDate && txnCreatedAt < transactionCreatedAt);
          
          if (isBefore) {
            // Use stored balance_after if available, otherwise calculate
            if (txn.balance_after !== null && txn.balance_after !== undefined) {
              runningBalance = Number(txn.balance_after);
            } else {
              // This transaction happened before our target - include it in running balance
              runningBalance = runningBalance + txn.signedAmount;
            }
          } else {
            // This transaction happened after our target - we've passed it
            break;
          }
        }
      }

      // If we didn't find the transaction in the list (shouldn't happen), use fallback
      if (!foundTransaction) {
        // Fallback: calculate from current balance and transactions after
        const transactionsAfter = signedTransactions.filter(t => {
          if (t.id === transaction.id) return false;
          const txnDate = t.date;
          const txnCreatedAt = t.created_at || t.date;
          return (
            txnDate > transactionDate ||
            (txnDate === transactionDate && txnCreatedAt > transactionCreatedAt)
          );
        });

        const sumAfter = transactionsAfter.reduce(
          (sum, t) => sum + t.signedAmount,
          0
        );
        
        // Get signed amount for current transaction
        const transactionSignedAmount = transaction.type === 'expense' 
          ? -Math.abs(Number(transaction.amount) || 0) 
          : Math.abs(Number(transaction.amount) || 0);
        
        afterBalance = currentBalance - sumAfter;
        beforeBalance = afterBalance - transactionSignedAmount;
      }

      setBeforeBalance(beforeBalance);
      setAfterBalance(afterBalance);

      console.log('Balance Impact Calculation (fallback):', {
        transactionId: transaction.id,
        transactionAmount: transaction.amount,
        transactionType: transaction.type,
        transactionDate: transaction.date,
        beforeBalance,
        afterBalance,
        currentBalance,
        foundInSequence: foundTransaction,
      });

    } catch (error) {
      console.error('Error calculating balance impact:', error);
      setBeforeBalance(null);
      setAfterBalance(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTransactionIcon = (type: string, category?: string) => {
    if (type === 'income') return 'arrow-up';
    if (type === 'expense') {
      const categoryName = (category || '').toLowerCase();
      if (categoryName.includes('food') || categoryName.includes('dining')) return 'restaurant';
      if (categoryName.includes('transport') || categoryName.includes('gas')) return 'car';
      if (categoryName.includes('entertainment')) return 'game-controller';
      if (categoryName.includes('utilities') || categoryName.includes('bills')) return 'flash';
      return 'arrow-down';
    }
    return 'swap-horizontal';
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'income': return '#10B981';
      case 'expense': return '#EF4444';
      case 'transfer': return '#3B82F6';
      default: return '#6B7280';
    }
  };

  if (loading) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
        <LinearGradient colors={['#065F46', '#047857', '#059669']} style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading transaction details...</Text>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Modal>
    );
  }

  if (!transaction) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
        <LinearGradient colors={['#065F46', '#047857', '#059669']} style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Transaction not found</Text>
              <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Text style={styles.backButtonText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Modal>
    );
  }

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <LinearGradient
        colors={['#065F46', '#047857', '#059669']}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Transaction Details</Text>
                  <TouchableOpacity 
                      style={styles.editButton}
                      onPress={() => setEditModalVisible(true)}
                    >
                      <Ionicons name="create" size={24} color="white" />
                    </TouchableOpacity>
            </View>

            {/* Transaction Amount Card */}
            <View style={styles.amountCard}>
              <View style={styles.amountHeader}>
                <View style={[styles.transactionIcon, { backgroundColor: getTransactionColor(transaction?.type || '') + '20' }]}>
                  <Ionicons 
                    name={getTransactionIcon(transaction?.type || '', transaction?.category?.name) as any} 
                    size={32} 
                    color={getTransactionColor(transaction?.type || '')} 
                  />
                </View>
                <View style={styles.amountInfo}>
                  <Text style={styles.transactionTitle}>{transaction?.description || 'Transaction'}</Text>
                  <Text style={styles.transactionDate}>{transaction?.date ? formatDate(transaction.date) : 'Unknown Date'}</Text>
                </View>
              </View>
              
              <View style={styles.amountSection}>
                <Text style={styles.amountLabel}>Transaction Amount</Text>
                <Text style={[
                  styles.amountValue,
                  { color: getTransactionColor(transaction?.type || '') }
                ]}>
                  {transaction?.type === 'income' ? '+' : transaction?.type === 'expense' ? '-' : ''}{formatCurrency(Math.abs(transaction?.amount || 0))}
                </Text>
                <Text style={styles.amountCurrency}>{currency}</Text>
              </View>
            </View>

            {/* Transaction Information */}
            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Transaction Information</Text>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Description:</Text>
                <Text style={styles.infoValue}>{transaction?.description || 'No description'}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Category:</Text>
                <Text style={styles.infoValue}>{transaction?.category?.name || 'Unknown'}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Account:</Text>
                <Text style={styles.infoValue}>{transaction?.account?.name || 'Unknown'}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Type:</Text>
                <Text style={styles.infoValue}>{transaction?.type ? transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1) : 'Unknown'}</Text>
              </View>
              
              {transaction?.reference_number && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Reference:</Text>
                  <Text style={styles.infoValue}>{transaction.reference_number}</Text>
                </View>
              )}
              
              {transaction?.location && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Location:</Text>
                  <Text style={styles.infoValue}>{transaction.location}</Text>
                </View>
              )}
            </View>

            {/* Tags */}
            {transaction?.tags && transaction.tags.length > 0 && (
              <View style={styles.infoCard}>
                <Text style={styles.sectionTitle}>Tags</Text>
                <View style={styles.tagsContainer}>
                  {transaction.tags.map((tag, index) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Balance Impact */}
            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Balance Impact</Text>
              
              {beforeBalance !== null && afterBalance !== null ? (
                <>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Before (at time of transaction):</Text>
                    <Text style={styles.balanceValue}>{formatCurrency(beforeBalance)}</Text>
                  </View>
                  
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Transaction:</Text>
                    <Text style={[
                      styles.balanceValue,
                      { color: getTransactionColor(transaction?.type || '') }
                    ]}>
                      {transaction?.type === 'income' ? '+' : transaction?.type === 'expense' ? '-' : ''}{formatCurrency(Math.abs(transaction?.amount || 0))}
                    </Text>
                  </View>
                  
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>After (at time of transaction):</Text>
                    <Text style={[styles.balanceValue, styles.afterBalanceValue]}>{formatCurrency(afterBalance)}</Text>
                  </View>
                  
                  {currentAccountBalance !== null && (
                    <View style={[styles.balanceRow, styles.currentBalanceRow]}>
                      <Text style={styles.currentBalanceLabel}>Current Account Balance:</Text>
                      <Text style={styles.currentBalanceValue}>{formatCurrency(currentAccountBalance)}</Text>
                    </View>
                  )}
                  
                  {/* Verify calculation */}
                  <View style={styles.verificationNote}>
                    <Ionicons name="information-circle" size={16} color="#9CA3AF" />
                    <Text style={styles.verificationText}>
                      {(() => {
                        // Calculate expected after balance based on transaction type
                        const transactionAmount = Number(transaction?.amount || 0);
                        const expectedAfterBalance = transaction?.type === 'expense' 
                          ? beforeBalance - Math.abs(transactionAmount)
                          : transaction?.type === 'income'
                          ? beforeBalance + Math.abs(transactionAmount)
                          : beforeBalance;
                        
                        const isVerified = Math.abs(afterBalance - expectedAfterBalance) < 0.01;
                        const currentMatchesAfter = currentAccountBalance !== null && Math.abs(currentAccountBalance - afterBalance) < 0.01;
                        
                        if (isVerified && currentMatchesAfter) {
                          return 'Balance calculation verified ✓';
                        } else if (isVerified && !currentMatchesAfter) {
                          return `Balance at transaction time verified ✓. Current balance may differ due to subsequent transactions.`;
                        } else {
                          return 'Note: Balance shown reflects the account state at the time of this transaction';
                        }
                      })()}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Unable to calculate balance impact</Text>
                </View>
              )}
            </View>

            {/* Daily Activity */}
            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Daily Activity</Text>
              <View style={styles.dailyActivity}>
                <Ionicons name="calendar" size={20} color="#3B82F6" />
                <View style={styles.dailyInfo}>
                  <Text style={styles.dailyText}>
                    {dailyTransactionCount} transactions on {transaction?.date ? formatDate(transaction.date) : 'Unknown Date'}
                  </Text>
                  <Text style={styles.dailySubtext}>
                    {dailyTransactionCount > 1 ? `You had ${dailyTransactionCount} transactions this day` : 'This was your only transaction this day'}
                  </Text>
                </View>
              </View>
            </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity 
                      style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
                      onPress={() => setEditModalVisible(true)}
                    >
                      <Ionicons name="create" size={20} color="white" />
                      <Text style={styles.actionText}>Edit Transaction</Text>
                    </TouchableOpacity>
                  
                  <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#8B5CF6' }]}>
                    <Ionicons name="copy" size={20} color="white" />
                    <Text style={styles.actionText}>Duplicate</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#EF4444' }]}>
                    <Ionicons name="trash" size={20} color="white" />
                    <Text style={styles.actionText}>Delete</Text>
                  </TouchableOpacity>
                </View>

            {/* Related Transactions */}
            {relatedTransactions.length > 0 && (
              <View style={styles.infoCard}>
                <Text style={styles.sectionTitle}>Related Transactions</Text>
                <View style={styles.relatedTransactions}>
                  {relatedTransactions.map((relatedTransaction) => (
                    <TouchableOpacity 
                      key={relatedTransaction.id} 
                      style={styles.relatedItem}
                      onPress={() => router.push(`/transaction/${relatedTransaction.id}`)}
                    >
                      <Ionicons 
                        name={getTransactionIcon(relatedTransaction.type, relatedTransaction.category?.name) as any} 
                        size={20} 
                        color={getTransactionColor(relatedTransaction.type)} 
                      />
                      <View style={styles.relatedInfo}>
                        <Text style={styles.relatedTitle}>{relatedTransaction.description}</Text>
                        <Text style={styles.relatedDate}>{formatDate(relatedTransaction.date)}</Text>
                      </View>
                      <Text style={[
                        styles.relatedAmount,
                        { color: getTransactionColor(relatedTransaction.type) }
                      ]}>
                        {relatedTransaction.type === 'income' ? '+' : relatedTransaction.type === 'expense' ? '-' : ''}{formatCurrency(Math.abs(relatedTransaction.amount))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>

        {/* Edit Transaction Modal */}
        <EditTransactionModal
          visible={editModalVisible}
          onClose={() => setEditModalVisible(false)}
          transaction={transaction}
          onSuccess={() => {
            fetchTransactionDetails();
          }}
        />
      </LinearGradient>
    </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  headerTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  amountCard: {
    backgroundColor: '#000000',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  amountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  transactionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  amountInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  amountSection: {
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 16,
    color: 'white',
    fontFamily: 'serif',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    color: 'white',
    fontFamily: 'serif',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  amountCurrency: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  infoCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: 'white',
    fontWeight: 'bold',
    flex: 2,
    textAlign: 'right',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tag: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: 'bold',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  balanceRowFinal: {
    borderBottomWidth: 0,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  currentBalanceRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    marginTop: 12,
    paddingTop: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    flex: 1,
  },
  balanceValue: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
  afterBalanceValue: {
    fontSize: 18,
    color: '#10B981',
    fontWeight: 'bold',
  },
  currentBalanceLabel: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
    flex: 1,
  },
  currentBalanceValue: {
    fontSize: 18,
    color: '#3B82F6',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
  verificationNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
    borderRadius: 8,
    gap: 8,
  },
  verificationText: {
    flex: 1,
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
  },
  dailyActivity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dailyInfo: {
    marginLeft: 12,
    flex: 1,
  },
  dailyText: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  dailySubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  actionText: {
    color: 'white',
    marginLeft: 8,
    fontSize: 12,
    fontWeight: 'bold',
  },
  relatedTransactions: {
    marginTop: 8,
  },
  relatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  relatedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  relatedTitle: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  relatedDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  relatedAmount: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 18,
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
