import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { fetchRecurringTransactions, RecurringTransaction, deleteRecurringTransaction } from '@/utils/recurringTransactions';
import { formatCurrencyAmount } from '@/utils/currency';
import { getRecurrenceDescription, calculateNextOccurrence } from '@/utils/recurrence';

const getNatureLabel = (transaction: RecurringTransaction) => {
  if (transaction.is_subscription) return 'Subscription';
  if (transaction.nature === 'income') return 'Income';
  if (transaction.nature === 'bill') return 'Utility / Variable';
  if (transaction.nature === 'payment') return 'Loan / EMI';
  return 'Recurring Transaction';
};

const RecurringScreen = () => {
  const { user } = useAuth();
  const { currency } = useSettings();
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecurringTransactions();
  }, [user]);

  const loadRecurringTransactions = async () => {
    if (!user?.id) {
      console.log('⚠️ No user ID available');
      return;
    }
    
    try {
      setLoading(true);
      console.log('🔄 Fetching recurring transactions for user:', user.id);
      const transactions = await fetchRecurringTransactions(user.id);
      console.log('✅ Fetched recurring transactions:', transactions.length);
      // Filter to show only active transactions
      const activeTransactions = transactions.filter(
        (t) => t.status === 'active'
      );
      console.log('✅ Active recurring transactions:', activeTransactions.length);
      setRecurringTransactions(activeTransactions);
    } catch (error: any) {
      console.error('❌ Error loading recurring transactions:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      Alert.alert('Error', `Failed to load recurring transactions: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (transaction: RecurringTransaction) => {
    router.push(`/recurring/${transaction.id}` as any);
  };

  const handleDelete = async (transaction: RecurringTransaction) => {
    Alert.alert(
      'Delete Recurring Transaction',
      `Are you sure you want to delete "${transaction.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecurringTransaction(transaction.id);
              await loadRecurringTransactions();
              Alert.alert('Success', 'Recurring transaction deleted successfully');
            } catch (error: any) {
              console.error('Error deleting recurring transaction:', error);
              Alert.alert('Error', error.message || 'Failed to delete recurring transaction');
            }
          },
        },
      ]
    );
  };

  const getNextDueDate = (transaction: RecurringTransaction) => {
    if (transaction.next_transaction_date) {
      return new Date(transaction.next_transaction_date);
    }
    
    if (transaction.start_date) {
      const nextDate = calculateNextOccurrence(
        {
          frequency: transaction.frequency,
          interval: transaction.interval || 1,
          start_date: transaction.start_date,
          end_date: transaction.end_date || undefined,
          date_of_occurrence: transaction.date_of_occurrence || undefined,
          custom_unit: transaction.custom_unit || undefined,
          custom_interval: transaction.custom_interval || undefined,
        },
        new Date().toISOString().split('T')[0]
      );
      return nextDate ? new Date(nextDate) : new Date(transaction.start_date);
    }
    
    return new Date();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Recurring Transactions</Text>
          <TouchableOpacity
            style={styles.cta}
            onPress={() => router.push('/modals/add-recurring-transaction' as any)}
          >
            <Ionicons name="add" size={20} color="#041B11" />
            <Text style={styles.ctaText}>New Recurring</Text>
          </TouchableOpacity>
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadRecurringTransactions} />
            }
          >
            {recurringTransactions.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="repeat-outline" size={48} color="rgba(0,0,0,0.3)" />
                <Text style={styles.emptyTitle}>No recurring transactions yet</Text>
                <Text style={styles.emptyText}>
                  Schedule subscriptions, utilities, income, or regular payments from here.
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push('/modals/add-recurring-transaction' as any)}
                >
                  <Text style={styles.emptyButtonText}>Create Recurring Transaction</Text>
                </TouchableOpacity>
              </View>
            )}

            {recurringTransactions.map((transaction) => {
              const nextDate = getNextDueDate(transaction);
              const amountDisplay = transaction.amount_type === 'variable' 
                ? `~${formatCurrencyAmount(transaction.estimated_amount || 0, currency)}`
                : formatCurrencyAmount(transaction.amount || 0, currency);
              
              return (
                <TouchableOpacity
                  key={transaction.id}
                  style={styles.card}
                  onPress={() => handleEdit(transaction)}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.iconContainer}>
                        <Ionicons name={transaction.icon as any || 'repeat-outline'} size={24} color="#10B981" />
                      </View>
                      <View style={styles.titleContainer}>
                        <Text style={styles.transactionTitle}>{transaction.title}</Text>
                        <Text style={styles.transactionSubtitle}>{getNatureLabel(transaction)}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDelete(transaction);
                      }}
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color="rgba(4,27,17,0.4)" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.amountRow}>
                    <View>
                      <Text style={styles.label}>Amount</Text>
                      <Text style={styles.amount}>
                        {transaction.direction === 'income' ? '+' : '-'}
                        {amountDisplay}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.label}>Next</Text>
                      <Text style={styles.nextDate}>
                        {nextDate.toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.frequencyRow}>
                    <Text style={styles.frequencyText}>
                      {getRecurrenceDescription({
                        frequency: transaction.frequency,
                        interval: transaction.interval || 1,
                        start_date: transaction.start_date,
                        end_date: transaction.end_date || undefined,
                        date_of_occurrence: transaction.date_of_occurrence || undefined,
                      })}
                    </Text>
                    {transaction.is_subscription && (
                      <View style={styles.subscriptionBadge}>
                        <Text style={styles.subscriptionBadgeText}>Subscription</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  cta: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: {
    color: '#041B11',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  scroll: {
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(4,27,17,0.08)',
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  billSubtitle: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
  },
  link: {
    color: '#0EA5E9',
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  label: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
  },
  amount: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(4,27,17,0.08)',
    marginVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: '#041B11',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(4,27,17,0.15)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#041B11',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 8,
  },
  emptyButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyButtonText: {
    color: '#041B11',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  transactionSubtitle: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
    marginTop: 2,
  },
  frequencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  frequencyText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
  },
  subscriptionBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  subscriptionBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: '#10B981',
  },
  nextDate: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginTop: 4,
  },
});

export default RecurringScreen;

