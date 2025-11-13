import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { fetchUpcomingSchedules } from '@/utils/liabilitySchedules';
import { supabase } from '@/lib/supabase';
import { calculateBillStatus } from '@/utils/bills';
import GlassCard from '@/components/GlassCard';
import TransactionCard from '@/components/TransactionCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { theme, BACKGROUND_MODES } from '@/theme';
import PayModal from '../modals/pay';
import ReceiveModal from '../modals/receive';
import TransferModal from '../modals/transfer';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  account_id: string;
  category_id: string;
  account?: {
    name: string;
    color: string;
    icon: string;
  };
  category?: {
    name: string;
  };
}

export default function TransactionsScreen() {
  const { user } = useAuth();
  const { backgroundMode } = useBackgroundMode();
  const { transactions, loading, refreshTransactions, refreshAccounts } = useRealtimeData();
  const { currency } = useSettings();
  const { liabilities } = useLiabilities();
  const [selectedDate, setSelectedDate] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [filterType, setFilterType] = useState('all'); // 'all', 'income', 'expense', 'transfer'
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [bills, setBills] = useState<any[]>([]);

  // Fetch bills for calendar (always fetch, refresh when transactions change)
  useEffect(() => {
    if (user) {
      const loadBills = async () => {
        try {
          // Fetch all bills (not just liability schedules)
          const { data: billsData, error } = await supabase
            .from('bills')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_deleted', false)
            .eq('is_active', true)
            .order('due_date', { ascending: true });
          
          if (error) throw error;
          
          // Calculate status for each bill based on due date
          const billsWithStatus = (billsData || []).map(bill => ({
            ...bill,
            status: calculateBillStatus(bill),
          }));
          
          setBills(billsWithStatus);
        } catch (error) {
          console.error('Error fetching bills:', error);
          setBills([]);
        }
      };
      loadBills();
    }
  }, [user, transactions]);

  const onDayPress = (day: any) => {
    setSelectedDate(day.dateString);
  };

  const filteredTransactions = (() => {
    let filtered = transactions;
    
    // Filter by date if selected
    if (selectedDate) {
      filtered = filtered.filter(t => t.date === selectedDate);
    }
    
    // Filter by type if not 'all'
    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.type === filterType);
    }
    
    return filtered;
  })();

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };


  const renderBackground = () => {
    if (backgroundMode === BACKGROUND_MODES.IOS_GRADIENT) {
      return (
        <IOSGradientBackground gradientType="default" animated={true} shimmer={true}>
          {renderContent()}
        </IOSGradientBackground>
      );
    } else {
      return (
        <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
          {renderContent()}
        </LinearGradient>
      );
    }
  };

  const renderContent = () => (
    <>
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Transactions</Text>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setPayModalVisible(true)}
          >
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        </View>

          {/* Segmented Control */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity 
              style={[styles.segment, viewMode === 'list' && styles.activeSegment]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons name="list" size={18} color={viewMode === 'list' ? '#10B981' : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.segmentText, viewMode === 'list' && styles.activeSegmentText]}>
                List
              </Text>
            </TouchableOpacity>
            
            {/* Divider */}
            <View style={styles.segmentDivider} />
            
            <TouchableOpacity 
              style={[styles.segment, viewMode === 'calendar' && styles.activeSegment]}
              onPress={() => setViewMode('calendar')}
            >
              <Ionicons name="calendar" size={18} color={viewMode === 'calendar' ? '#10B981' : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.segmentText, viewMode === 'calendar' && styles.activeSegmentText]}>
                Calendar
              </Text>
            </TouchableOpacity>
          </View>

          {/* Transaction Type Filter */}
          <View style={styles.filterContainer}>
            <Text style={styles.filterLabel}>Filter by type:</Text>
            <View style={styles.filterButtons}>
              {[
                { key: 'all', label: 'All', icon: 'list' },
                { key: 'income', label: 'Income', icon: 'arrow-down' },
                { key: 'expense', label: 'Expense', icon: 'arrow-up' },
                { key: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
              ].map((filter) => (
                <TouchableOpacity
                  key={filter.key}
                  style={[
                    styles.filterButton,
                    filterType === filter.key && styles.activeFilterButton
                  ]}
                  onPress={() => setFilterType(filter.key)}
                >
                  <Ionicons 
                    name={filter.icon as any} 
                    size={16} 
                    color={filterType === filter.key ? '#10B981' : 'rgba(255,255,255,0.7)'} 
                  />
                  <Text style={[
                    styles.filterButtonText,
                    filterType === filter.key && styles.activeFilterButtonText
                  ]}>
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Calendar View */}
          {viewMode === 'calendar' && (
            <View style={styles.calendarContainer}>
              <Calendar
                onDayPress={onDayPress}
                markedDates={(() => {
                  const markedDates: any = {};
                  
                  // First, collect all dots for each date
                  const dateDots: { [key: string]: Array<{ color: string; key: string }> } = {};
                  
                  // Mark dates with transactions
                  transactions.forEach(transaction => {
                    const date = transaction.date;
                    const color = transaction.type === 'income' ? '#10B981' : transaction.type === 'expense' ? '#EF4444' : '#3B82F6';
                    if (!dateDots[date]) {
                      dateDots[date] = [];
                    }
                    // Add transaction dot if not already added
                    if (!dateDots[date].find(d => d.key === 'transaction')) {
                      dateDots[date].push({ color, key: 'transaction' });
                    }
                  });
                  
                  // Mark dates with bills (due dates)
                  bills.forEach(bill => {
                    if (bill.status !== 'paid' && bill.status !== 'cancelled') {
                      const date = bill.due_date;
                      let color = '#F59E0B'; // Orange for upcoming bills
                      
                      // Color code by status
                      if (bill.status === 'overdue') {
                        color = '#EF4444'; // Red for overdue
                      } else if (bill.status === 'due_today') {
                        color = '#F59E0B'; // Orange for due today
                      } else if (bill.status === 'upcoming') {
                        color = '#3B82F6'; // Blue for upcoming
                      }
                      
                      if (!dateDots[date]) {
                        dateDots[date] = [];
                      }
                      // Add bill dot if not already added
                      if (!dateDots[date].find(d => d.key === 'bill')) {
                        dateDots[date].push({ color, key: 'bill' });
                      }
                    }
                  });
                  
                  // Build markedDates with dots and selection
                  Object.keys(dateDots).forEach(date => {
                    markedDates[date] = {
                      marked: true,
                      dots: dateDots[date],
                      ...(selectedDate === date && {
                        selected: true,
                        selectedColor: '#10B981',
                        selectedTextColor: '#ffffff'
                      })
                    };
                  });
                  
                  // Mark selected date (even if no transactions or bills)
                  if (selectedDate && !markedDates[selectedDate]) {
                    markedDates[selectedDate] = {
                      selected: true,
                      selectedColor: '#10B981',
                      selectedTextColor: '#ffffff'
                    };
                  } else if (selectedDate && markedDates[selectedDate]) {
                    // Ensure selected date shows selection even with dots
                    markedDates[selectedDate] = {
                      ...markedDates[selectedDate],
                      selected: true,
                      selectedColor: '#10B981',
                      selectedTextColor: '#ffffff'
                    };
                  }
                  
                  return markedDates;
                })()}
                theme={{
                  backgroundColor: '#000000',
                  calendarBackground: '#000000',
                  textSectionTitleColor: '#ffffff',
                  selectedDayBackgroundColor: '#10B981',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: '#10B981',
                  dayTextColor: '#ffffff',
                  textDisabledColor: '#6B7280',
                  dotColor: '#10B981',
                  selectedDotColor: '#ffffff',
                  arrowColor: '#10B981',
                  monthTextColor: '#ffffff',
                  indicatorColor: '#10B981',
                }}
                style={styles.calendar}
              />
            </View>
          )}

          {/* Selected Date Info */}
          {selectedDate && viewMode === 'calendar' && (
            <View style={styles.selectedDateInfo}>
              <Text style={styles.selectedDateText}>
                {new Date(selectedDate).toLocaleDateString()}
              </Text>
              {filteredTransactions.length > 0 && (
                <Text style={styles.selectedDateCount}>
                  {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
                </Text>
              )}
              {bills.filter(b => b.due_date === selectedDate && b.status !== 'paid' && b.status !== 'cancelled').length > 0 && (
                <Text style={styles.selectedDateCount}>
                  {bills.filter(b => b.due_date === selectedDate && b.status !== 'paid' && b.status !== 'cancelled').length} bill{bills.filter(b => b.due_date === selectedDate && b.status !== 'paid' && b.status !== 'cancelled').length !== 1 ? 's' : ''} due
                </Text>
              )}
            </View>
          )}

          {/* Bills for Selected Date */}
          {selectedDate && viewMode === 'calendar' && bills.filter(b => b.due_date === selectedDate && b.status !== 'paid' && b.status !== 'cancelled').length > 0 && (
            <View style={styles.billsSection}>
              <Text style={styles.billsSectionTitle}>Bills Due</Text>
              {bills
                .filter(b => {
                  const billStatus = calculateBillStatus(b);
                  return b.due_date === selectedDate && billStatus !== 'paid' && billStatus !== 'cancelled';
                })
                .map((bill) => (
                  <TouchableOpacity
                    key={bill.id}
                    style={[
                      styles.billCard,
                      bill.status === 'overdue' && styles.billCardOverdue,
                    ]}
                    onPress={() => {
                      // Navigate to bill or liability detail page
                      if (bill.liability_id) {
                        router.push(`/liability/${bill.liability_id}`);
                      } else {
                        router.push(`/bill/${bill.id}` as any);
                      }
                    }}
                  >
                    <View style={styles.billIcon}>
                      <Ionicons 
                        name={bill.icon as any || 'receipt-outline'} 
                        size={20} 
                        color={bill.status === 'overdue' ? '#EF4444' : '#F59E0B'} 
                      />
                    </View>
                    <View style={styles.billInfo}>
                      <Text style={styles.billTitle}>{bill.title}</Text>
                      <Text style={styles.billAmount}>{formatCurrency(bill.amount || 0)}</Text>
                      {bill.principal_amount && bill.interest_amount && bill.interest_amount > 0 && (
                        <Text style={styles.billBreakdown}>
                          Principal: {formatCurrency(bill.principal_amount)} • Interest: {formatCurrency(bill.interest_amount)}
                        </Text>
                      )}
                      <Text style={[
                        styles.billStatus,
                        bill.status === 'overdue' && styles.billStatusOverdue,
                        bill.status === 'due_today' && styles.billStatusDueToday,
                      ]}>
                        {bill.status === 'overdue' ? '⚠️ Overdue' : bill.status === 'due_today' ? 'Due Today' : 'Upcoming'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                  </TouchableOpacity>
                ))}
            </View>
          )}

          {/* Transactions List */}
          <View style={styles.transactionsList}>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((transaction) => (
                <TransactionCard
                  key={transaction.id}
                  id={transaction.id}
                  amount={transaction.amount}
                  type={transaction.type as 'income' | 'expense' | 'transfer'}
                  category={transaction.category?.name || 'Other'}
                  description={transaction.description}
                  date={transaction.date}
                  metadata={(transaction as any).metadata}
                  onPress={() => router.push(`/transaction/${transaction.id}`)}
                />
              ))
            ) : (!selectedDate || (selectedDate && filteredTransactions.length === 0 && bills.filter(b => b.due_date === selectedDate && b.status !== 'paid' && b.status !== 'cancelled').length === 0)) ? (
              <GlassCard padding={24} marginVertical={12}>
                <View style={styles.emptyStateContent}>
                  <Ionicons name="receipt-outline" size={48} color="rgba(0, 0, 0, 0.4)" />
                  <Text style={styles.emptyTransactionsTitle}>No Transactions Yet</Text>
                  <Text style={styles.emptyTransactionsDescription}>
                    Start by adding money or making a transaction
                  </Text>
                </View>
                <View style={styles.emptyActions}>
                  <TouchableOpacity
                    style={styles.emptyActionButton}
                    onPress={() => setReceiveModalVisible(true)}
                  >
                    <Text style={styles.emptyActionButtonText}>Add Money</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.emptyActionButton}
                    onPress={() => setPayModalVisible(true)}
                  >
                    <Text style={styles.emptyActionButtonText}>Spend Money</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            ) : null}
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => setReceiveModalVisible(true)}
            >
              <Ionicons name="arrow-down-circle" size={24} color="#10B981" />
              <Text style={styles.actionText}>Receive</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => setPayModalVisible(true)}
            >
              <Ionicons name="arrow-up-circle" size={24} color="#EF4444" />
              <Text style={styles.actionText}>Pay</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => setTransferModalVisible(true)}
            >
              <Ionicons name="swap-horizontal" size={24} color="#3B82F6" />
              <Text style={styles.actionText}>Transfer</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Modals */}
      <PayModal 
        visible={payModalVisible} 
        onClose={() => {
          setPayModalVisible(false);
        }}
        onSuccess={async () => {
          // Refresh both transactions and accounts to show updated balances
          await Promise.all([refreshTransactions(), refreshAccounts()]);
        }}
      />
      <ReceiveModal 
        visible={receiveModalVisible} 
        onClose={() => {
          setReceiveModalVisible(false);
        }}
        onSuccess={async () => {
          // Refresh both transactions and accounts to show updated balances
          await Promise.all([refreshTransactions(), refreshAccounts()]);
        }}
      />
      <TransferModal 
        visible={transferModalVisible} 
        onClose={() => {
          setTransferModalVisible(false);
        }}
        onSuccess={async () => {
          // Refresh both transactions and accounts to show updated balances
          await Promise.all([refreshTransactions(), refreshAccounts()]);
        }}
      />
    </>
  );

  if (loading) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <GlassCard padding={24} marginVertical={12}>
            <Text style={styles.loadingText}>Loading transactions...</Text>
          </GlassCard>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return renderBackground();
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
    paddingBottom: 20,
    marginBottom: 10,
  },
  headerTitle: {
    ...theme.typography.h1,
    color: '#FFFFFF',
  },
  addButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    position: 'relative',
  },
  activeSegment: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  segmentText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  activeSegmentText: {
    color: '#10B981',
  },
  segmentDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 8,
  },
  calendarContainer: {
    backgroundColor: '#000000',
    borderRadius: 16,
    marginBottom: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  calendar: {
    borderRadius: 16,
  },
  selectedDateInfo: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  selectedDateText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  selectedDateCount: {
    color: 'rgba(16, 185, 129, 0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  transactionsList: {
    marginBottom: 30,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    marginHorizontal: 8,
    alignItems: 'center',
  },
  actionText: {
    color: 'white',
    marginTop: 8,
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(0,0,0,0.7)',
  },
  transactionAccount: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  emptyTransactionsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#99D795',
    borderRadius: 12,
    marginBottom: 20,
  },
  emptyTransactionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyTransactionsTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  emptyTransactionsDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  emptyActionButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  billsSection: {
    marginTop: 24,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  billsSectionTitle: {
    fontSize: 18,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  billCardOverdue: {
    borderColor: '#EF4444',
    borderWidth: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  billIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  billInfo: {
    flex: 1,
    gap: 4,
  },
  billTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  billAmount: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  billBreakdown: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 2,
  },
  billStatus: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#F59E0B',
    marginTop: 2,
  },
  billStatusOverdue: {
    color: '#EF4444',
  },
  billStatusDueToday: {
    color: '#F59E0B',
  },
  filterContainer: {
    marginBottom: 20,
  },
  filterLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  activeFilterButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  filterButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  activeFilterButtonText: {
    color: '#10B981',
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    textAlign: 'center',
  },
});
