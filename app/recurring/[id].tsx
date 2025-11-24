import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import { fetchRecurringTransactionById, RecurringTransaction, pauseRecurringTransaction, resumeRecurringTransaction, deleteRecurringTransaction } from '@/utils/recurringTransactions';
import { fetchBills, calculateBillStatus } from '@/utils/bills';
import { Bill } from '@/types';
import RecurringTransactionCycles from '@/components/cycles/RecurringTransactionCycles';
import UnifiedPaymentModal from '@/app/modals/unified-payment-modal';
import GlassCard from '@/components/GlassCard';
import { getRecurrenceDescription } from '@/utils/recurrence';

const RecurringTransactionDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts } = useRealtimeData();

  const [recurringTransaction, setRecurringTransaction] = useState<RecurringTransaction | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billsRefreshKey, setBillsRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [showUnifiedPayModal, setShowUnifiedPayModal] = useState(false);
  const [viewMode, setViewMode] = useState<'bills' | 'cycles'>('bills');

  useEffect(() => {
    if (id && user) {
      loadRecurringTransaction();
    }
  }, [id, user]);

  // Refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (id && user) {
        loadRecurringTransaction();
      }
    }, [id, user])
  );

  const loadRecurringTransaction = async () => {
    if (!id || !user) return;

    try {
      setLoading(true);

      // Fetch recurring transaction
      const transaction = await fetchRecurringTransactionById(id);
      if (!transaction) {
        Alert.alert('Error', 'Recurring transaction not found');
        router.back();
        return;
      }
      setRecurringTransaction(transaction);

      // Fetch bills linked to this recurring transaction
      try {
        const billsData = await fetchBills(user.id, {
          billType: 'recurring_fixed', // or recurring_variable
        });
        // Filter bills for this recurring transaction (check metadata)
        const recurringBills = billsData.filter(b => {
          const metadata = b.metadata || {};
          return metadata.recurring_transaction_id === id;
        });
        // Calculate status for each bill
        const billsWithStatus = recurringBills.map(bill => {
          const currentStatus = calculateBillStatus(bill);
          return {
            ...bill,
            status: currentStatus,
          };
        });
        // Sort by due date
        billsWithStatus.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        setBills(billsWithStatus);
        setBillsRefreshKey(prev => prev + 1);
      } catch (error) {
        console.error('Error fetching bills:', error);
        setBills([]);
      }
    } catch (error) {
      console.error('Failed to load recurring transaction details', error);
      Alert.alert('Error', 'Could not load recurring transaction details.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Calculate next payment due from bills
  const nextPaymentDue = useMemo(() => {
    if (!bills || bills.length === 0) {
      return recurringTransaction?.next_transaction_date;
    }

    const upcomingBills = bills.filter(b => {
      const status = b.status?.toLowerCase();
      return status !== 'paid' && status !== 'cancelled' && status !== 'skipped';
    });

    if (upcomingBills.length === 0) {
      return recurringTransaction?.next_transaction_date;
    }

    const sortedBills = [...upcomingBills].sort((a, b) => {
      const dateA = new Date(a.due_date).getTime();
      const dateB = new Date(b.due_date).getTime();
      return dateA - dateB;
    });
    
    return sortedBills[0]?.due_date || recurringTransaction?.next_transaction_date;
  }, [bills, recurringTransaction, billsRefreshKey]);

  const handlePause = async () => {
    if (!recurringTransaction) return;
    
    Alert.alert(
      'Pause Recurring Transaction',
      `Pause "${recurringTransaction.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pause',
          onPress: async () => {
            try {
              await pauseRecurringTransaction(recurringTransaction.id);
              await loadRecurringTransaction();
              Alert.alert('Success', 'Recurring transaction paused');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to pause');
            }
          },
        },
      ]
    );
  };

  const handleResume = async () => {
    if (!recurringTransaction) return;
    
    try {
      await resumeRecurringTransaction(recurringTransaction.id);
      await loadRecurringTransaction();
      Alert.alert('Success', 'Recurring transaction resumed');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resume');
    }
  };

  const handleDelete = async () => {
    if (!recurringTransaction) return;
    
    Alert.alert(
      'Delete Recurring Transaction',
      `Are you sure you want to delete "${recurringTransaction.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecurringTransaction(recurringTransaction.id);
              Alert.alert('Success', 'Recurring transaction deleted');
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  if (!recurringTransaction) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Recurring transaction not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const amountDisplay = recurringTransaction.amount_type === 'variable' 
    ? `~${formatCurrencyAmount(recurringTransaction.estimated_amount || 0, currency)}`
    : formatCurrencyAmount(recurringTransaction.amount || 0, currency);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#041B11" />
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <View style={[styles.iconContainer, { backgroundColor: `${recurringTransaction.color}20` }]}>
            <Ionicons name={recurringTransaction.icon as any || 'repeat'} size={32} color={recurringTransaction.color || '#10B981'} />
          </View>
          <Text style={styles.title}>{recurringTransaction.title}</Text>
          {recurringTransaction.description && (
            <Text style={styles.description}>{recurringTransaction.description}</Text>
          )}
        </View>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <GlassCard padding={20}>
            <Text style={styles.metricLabel}>Amount</Text>
            <Text style={styles.metricValue}>
              {recurringTransaction.direction === 'income' ? '+' : '-'}
              {amountDisplay}
            </Text>
          </GlassCard>
          <GlassCard padding={20}>
            <Text style={styles.metricLabel}>Frequency</Text>
            <Text style={styles.metricValue}>
              {getRecurrenceDescription({
                frequency: recurringTransaction.frequency,
                interval: recurringTransaction.interval || 1,
                start_date: recurringTransaction.start_date,
                end_date: recurringTransaction.end_date || undefined,
                date_of_occurrence: recurringTransaction.date_of_occurrence || undefined,
              })}
            </Text>
          </GlassCard>
          <GlassCard padding={20}>
            <Text style={styles.metricLabel}>Next Payment</Text>
            <Text style={styles.metricValue}>
              {formatDate(nextPaymentDue)}
            </Text>
          </GlassCard>
          <GlassCard padding={20}>
            <Text style={styles.metricLabel}>Status</Text>
            <Text style={[styles.metricValue, { 
              color: recurringTransaction.status === 'active' ? '#10B981' : 
                     recurringTransaction.status === 'paused' ? '#F59E0B' : '#6B7280'
            }]}>
              {recurringTransaction.status.charAt(0).toUpperCase() + recurringTransaction.status.slice(1)}
            </Text>
          </GlassCard>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {recurringTransaction.status === 'active' ? (
            <TouchableOpacity style={styles.pauseButton} onPress={handlePause}>
              <Ionicons name="pause-circle" size={20} color="#F59E0B" />
              <Text style={styles.pauseButtonText}>Pause</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.resumeButton} onPress={handleResume}>
              <Ionicons name="play-circle" size={20} color="#10B981" />
              <Text style={styles.resumeButtonText}>Resume</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'bills' && styles.tabActive]}
            onPress={() => setViewMode('bills')}
          >
            <Ionicons name="receipt-outline" size={20} color={viewMode === 'bills' ? '#10B981' : '#6B7280'} />
            <Text style={[styles.tabText, viewMode === 'bills' && styles.tabTextActive]}>
              Bills
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'cycles' && styles.tabActive]}
            onPress={() => setViewMode('cycles')}
          >
            <Ionicons name="calendar-outline" size={20} color={viewMode === 'cycles' ? '#10B981' : '#6B7280'} />
            <Text style={[styles.tabText, viewMode === 'cycles' && styles.tabTextActive]}>
              Cycles
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content based on view mode */}
        {viewMode === 'bills' ? (
          <View style={styles.billsContainer}>
            {bills.length === 0 ? (
              <GlassCard padding={24} marginVertical={12}>
                <View style={styles.emptyState}>
                  <Ionicons name="receipt-outline" size={48} color="rgba(0,0,0,0.3)" />
                  <Text style={styles.emptyTitle}>No bills yet</Text>
                  <Text style={styles.emptyText}>
                    Create bills from cycles to track payments
                  </Text>
                </View>
              </GlassCard>
            ) : (
              bills.map((bill) => (
                <TouchableOpacity
                  key={bill.id}
                  onPress={() => {
                    setSelectedBill(bill);
                    setShowUnifiedPayModal(true);
                  }}
                >
                  <GlassCard padding={20} marginVertical={8}>
                    <View style={styles.billHeader}>
                      <View>
                        <Text style={styles.billTitle}>{bill.title}</Text>
                        <Text style={styles.billDate}>{formatDate(bill.due_date)}</Text>
                      </View>
                      <View style={styles.billAmountContainer}>
                        <Text style={styles.billAmount}>
                          {formatCurrencyAmount(bill.amount || 0, currency)}
                        </Text>
                        <View style={[styles.statusBadge, {
                          backgroundColor: bill.status === 'paid' ? '#10B98120' :
                                          bill.status === 'overdue' ? '#EF444420' :
                                          bill.status === 'due_today' ? '#F59E0B20' : '#6B728020'
                        }]}>
                          <Text style={[styles.statusText, {
                            color: bill.status === 'paid' ? '#10B981' :
                                   bill.status === 'overdue' ? '#EF4444' :
                                   bill.status === 'due_today' ? '#F59E0B' : '#6B7280'
                          }]}>
                            {bill.status?.charAt(0).toUpperCase() + bill.status?.slice(1)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))
            )}

            {/* Floating Action Button for Create Bill */}
            {viewMode === 'bills' && (
              <TouchableOpacity
                style={styles.fab}
                onPress={() => {
                  setSelectedBill(null);
                  setShowUnifiedPayModal(true);
                }}
              >
                <Ionicons name="add" size={24} color="#041B11" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.cyclesContainer}>
            <RecurringTransactionCycles recurringTransactionId={id!} />
          </View>
        )}
      </ScrollView>

      {/* Unified Payment Modal */}
      <UnifiedPaymentModal
        visible={showUnifiedPayModal}
        onSuccess={async () => {
          setShowUnifiedPayModal(false);
          setSelectedBill(null);
          await new Promise(resolve => setTimeout(resolve, 300));
          await loadRecurringTransaction();
        }}
        onClose={() => {
          setShowUnifiedPayModal(false);
          setSelectedBill(null);
        }}
        billId={selectedBill?.id}
        recurringTransactionId={recurringTransaction?.id}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  scroll: {
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
  backButton: {
    padding: 8,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteButton: {
    padding: 8,
  },
  titleSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  actionButtons: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F59E0B20',
    paddingVertical: 12,
    borderRadius: 12,
  },
  pauseButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#F59E0B',
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B98120',
    paddingVertical: 12,
    borderRadius: 12,
  },
  resumeButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#10B981',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(4,27,17,0.05)',
  },
  tabActive: {
    backgroundColor: '#10B98120',
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#10B981',
  },
  billsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  cyclesContainer: {
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
    textAlign: 'center',
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginBottom: 4,
  },
  billDate: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
  },
  billAmountContainer: {
    alignItems: 'flex-end',
  },
  billAmount: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});

export default RecurringTransactionDetailScreen;
