import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { supabase } from '@/lib/supabase';
import { calculateBillStatus } from '@/utils/bills';
import GlassCard from '@/components/GlassCard';
import LiquidGlassCard from '@/components/LiquidGlassCard';
import TransactionCard from '@/components/TransactionCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { BACKGROUND_MODES } from '@/theme';
import PayModal from '../modals/pay';
import ReceiveModal from '../modals/receive';
import TransferModal from '../modals/transfer';

export default function TransactionsScreen() {
  const { user } = useAuth();
  const { backgroundMode } = useBackgroundMode();
  const { transactions, loading, refreshTransactions, refreshAccounts } = useRealtimeData();
  const { currency } = useSettings();
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

  // Calculate summary statistics
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const netAmount = totalIncome - totalExpenses;

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
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
        <View style={[styles.container, styles.whiteBackground]}>
          {renderContent()}
        </View>
      );
    }
  };

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: typeof transactions } = {};
    filteredTransactions.forEach(transaction => {
      const date = transaction.date;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(transaction);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime());
  }, [filteredTransactions]);

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const renderContent = () => (
    <>
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
          <Text style={styles.headerTitle}>Transactions</Text>
            <Text style={styles.headerSubtitle}>
              {transactions.length} total transactions
            </Text>
          </View>
          <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.iconButton}
            onPress={() => setPayModalVisible(true)}
          >
              <Ionicons name="add" size={22} color="#000000" />
          </TouchableOpacity>
          </View>
        </View>

        {/* Summary Card - Liquid Glass */}
        {transactions.length > 0 && (
          <LiquidGlassCard
            variant="frosted"
            size="lg"
            elevation="medium"
            shimmer
            marginVertical={16}
          >
            {/* Net Amount - Hero Display */}
            <View style={styles.netHero}>
              <Text style={styles.netLabel}>Net Balance</Text>
              <Text style={[styles.netValue, { color: netAmount >= 0 ? '#10B981' : '#EF4444' }]}>
                {netAmount >= 0 ? '+' : ''}{formatCurrency(netAmount)}
              </Text>
            </View>

            {/* Income & Expense Row */}
            <View style={styles.summaryRow}>
              <Pressable style={styles.summaryCard}>
                <View style={[styles.summaryIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <Ionicons name="trending-up" size={18} color="#10B981" />
                </View>
                <View style={styles.summaryTextContainer}>
                <Text style={styles.summaryLabel}>Income</Text>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                  {formatCurrency(totalIncome)}
                </Text>
              </View>
              </Pressable>

              <View style={styles.summaryDivider} />

              <Pressable style={styles.summaryCard}>
                <View style={[styles.summaryIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <Ionicons name="trending-down" size={18} color="#EF4444" />
                </View>
                <View style={styles.summaryTextContainer}>
                <Text style={styles.summaryLabel}>Expenses</Text>
                <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                  {formatCurrency(totalExpenses)}
                </Text>
              </View>
              </Pressable>
              </View>
          </LiquidGlassCard>
        )}

        {/* View Mode Toggle - Liquid Glass Pill */}
        <LiquidGlassCard
          variant="light"
          padding={4}
          borderRadius={16}
          elevation="low"
          marginVertical={8}
        >
          <View style={styles.segmentedControl}>
            <TouchableOpacity 
              style={[styles.segmentButton, viewMode === 'list' && styles.segmentButtonActive]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons 
                name="list-outline" 
                size={16} 
                color={viewMode === 'list' ? '#FFFFFF' : 'rgba(0, 0, 0, 0.6)'} 
              />
              <Text style={[styles.segmentText, viewMode === 'list' && styles.segmentTextActive]}>
                List
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentButton, viewMode === 'calendar' && styles.segmentButtonActive]}
              onPress={() => setViewMode('calendar')}
            >
              <Ionicons 
                name="calendar-outline" 
                size={16} 
                color={viewMode === 'calendar' ? '#FFFFFF' : 'rgba(0, 0, 0, 0.6)'} 
              />
              <Text style={[styles.segmentText, viewMode === 'calendar' && styles.segmentTextActive]}>
                Calendar
              </Text>
            </TouchableOpacity>
          </View>
        </LiquidGlassCard>

        {/* Transaction Type Filter - Scrollable Pills */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
              {[
            { key: 'all', label: 'All', icon: 'apps' },
            { key: 'income', label: 'Income', icon: 'trending-up' },
            { key: 'expense', label: 'Expense', icon: 'trending-down' },
                { key: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
              ].map((filter) => (
            <Pressable
                  key={filter.key}
              style={({ pressed }) => [
                styles.filterPill,
                filterType === filter.key && styles.filterPillActive,
                { opacity: pressed ? 0.8 : 1 },
                  ]}
                  onPress={() => setFilterType(filter.key)}
                >
                  <Ionicons 
                    name={filter.icon as any} 
                size={14} 
                    color={filterType === filter.key ? '#FFFFFF' : 'rgba(0, 0, 0, 0.6)'} 
                  />
                  <Text style={[
                styles.filterPillText,
                filterType === filter.key && styles.filterPillTextActive
                  ]}>
                    {filter.label}
                  </Text>
            </Pressable>
              ))}
        </ScrollView>

          {/* Calendar View */}
          {viewMode === 'calendar' && (
            <LiquidGlassCard
              variant="frosted"
              size="lg"
              elevation="medium"
              marginVertical={12}
            >
              <Calendar
                onDayPress={onDayPress}
                markingType="multi-dot"
                markedDates={(() => {
                  const markedDates: any = {};
                  
                  // First, collect all dots for each date
                  const dateDots: { [key: string]: { color: string; key: string }[] } = {};
                  
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
                        selectedColor: '#000000',
                        selectedTextColor: '#ffffff'
                      })
                    };
                  });
                  
                  // Mark selected date (even if no transactions or bills)
                  if (selectedDate && !markedDates[selectedDate]) {
                    markedDates[selectedDate] = {
                      selected: true,
                      selectedColor: '#000000',
                      selectedTextColor: '#ffffff'
                    };
                  } else if (selectedDate && markedDates[selectedDate]) {
                    // Ensure selected date shows selection even with dots
                    markedDates[selectedDate] = {
                      ...markedDates[selectedDate],
                      selected: true,
                      selectedColor: '#000000',
                      selectedTextColor: '#ffffff'
                    };
                  }
                  
                  return markedDates;
                })()}
                theme={{
                  backgroundColor: 'transparent',
                  calendarBackground: 'transparent',
                  textSectionTitleColor: 'rgba(0, 0, 0, 0.6)',
                  selectedDayBackgroundColor: '#000000',
                  selectedDayTextColor: '#FFFFFF',
                  todayTextColor: '#10B981',
                  todayBackgroundColor: 'rgba(16, 185, 129, 0.1)',
                  dayTextColor: '#000000',
                  textDisabledColor: 'rgba(0, 0, 0, 0.25)',
                  dotColor: '#000000',
                  selectedDotColor: '#FFFFFF',
                  arrowColor: '#000000',
                  monthTextColor: '#000000',
                  indicatorColor: '#000000',
                  textDayFontFamily: 'Poppins-Medium',
                  textMonthFontFamily: 'Poppins-Bold',
                  textDayHeaderFontFamily: 'Poppins-Medium',
                  textDayFontSize: 15,
                  textMonthFontSize: 17,
                  textDayHeaderFontSize: 12,
                }}
                style={styles.calendar}
              />
            </LiquidGlassCard>
          )}

          {/* Selected Date Info */}
          {selectedDate && viewMode === 'calendar' && (
            <LiquidGlassCard
              variant="mint"
              size="md"
              elevation="low"
              marginVertical={8}
            >
              <View style={styles.selectedDateContainer}>
                <View style={styles.selectedDateIcon}>
                  <Ionicons name="calendar" size={20} color="#10B981" />
                </View>
                <View style={styles.selectedDateInfo}>
              <Text style={styles.selectedDateText}>
                {new Date(selectedDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
                  <View style={styles.selectedDateStats}>
              {filteredTransactions.length > 0 && (
                      <View style={styles.selectedDateStatItem}>
                        <Ionicons name="receipt-outline" size={12} color="rgba(0, 0, 0, 0.5)" />
                <Text style={styles.selectedDateCount}>
                  {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
                </Text>
                      </View>
              )}
              {bills.filter(b => b.due_date === selectedDate && b.status !== 'paid' && b.status !== 'cancelled').length > 0 && (
                      <View style={styles.selectedDateStatItem}>
                        <Ionicons name="alert-circle-outline" size={12} color="#F59E0B" />
                        <Text style={[styles.selectedDateCount, { color: '#F59E0B' }]}>
                  {bills.filter(b => b.due_date === selectedDate && b.status !== 'paid' && b.status !== 'cancelled').length} bill{bills.filter(b => b.due_date === selectedDate && b.status !== 'paid' && b.status !== 'cancelled').length !== 1 ? 's' : ''} due
                </Text>
                      </View>
                    )}
                  </View>
                </View>
                {selectedDate && (
                  <TouchableOpacity 
                    style={styles.clearDateButton}
                    onPress={() => setSelectedDate('')}
                  >
                    <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.4)" />
                  </TouchableOpacity>
              )}
              </View>
            </LiquidGlassCard>
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
                  <Pressable
                    key={bill.id}
                      onPress={() => {
                        if (bill.liability_id) {
                          router.push(`/liability/${bill.liability_id}`);
                        } else {
                          router.push(`/bill/${bill.id}` as any);
                        }
                      }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                  >
                    <LiquidGlassCard
                      variant="light"
                      size="md"
                      elevation="low"
                      marginVertical={6}
                    >
                      <View style={styles.billCard}>
                        <View style={[styles.billIcon, { backgroundColor: (bill.status === 'overdue' ? '#EF4444' : '#F59E0B') + '12' }]}>
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
                        </View>
                        <View style={styles.billStatusContainer}>
                          <View style={[
                            styles.billStatusBadge,
                            { backgroundColor: bill.status === 'overdue' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)' }
                          ]}>
                          <Text style={[
                              styles.billStatusText,
                              { color: bill.status === 'overdue' ? '#EF4444' : '#F59E0B' }
                          ]}>
                              {bill.status === 'overdue' ? 'Overdue' : bill.status === 'due_today' ? 'Today' : 'Due'}
                          </Text>
                        </View>
                          <Ionicons name="chevron-forward" size={16} color="rgba(0, 0, 0, 0.3)" />
                      </View>
                      </View>
                    </LiquidGlassCard>
                  </Pressable>
                ))}
            </View>
          )}

          {/* Transactions List - Grouped by Date */}
          <View style={styles.transactionsList}>
            {viewMode === 'list' && groupedTransactions.length > 0 ? (
              groupedTransactions.map(([date, dayTransactions]) => (
                <View key={date} style={styles.transactionGroup}>
                  <View style={styles.dateHeaderContainer}>
                    <Text style={styles.dateHeader}>{formatDateHeader(date)}</Text>
                    <View style={styles.dateHeaderLine} />
                  </View>
                  {dayTransactions.map((transaction) => (
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
                  ))}
                </View>
              ))
            ) : viewMode === 'calendar' && filteredTransactions.length > 0 ? (
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
              <LiquidGlassCard
                variant="crystal"
                size="xl"
                elevation="medium"
                marginVertical={20}
              >
                <View style={styles.emptyStateContent}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="receipt-outline" size={40} color="rgba(0, 0, 0, 0.3)" />
                  </View>
                  <Text style={styles.emptyTransactionsTitle}>No Transactions Yet</Text>
                  <Text style={styles.emptyTransactionsDescription}>
                    Start tracking your finances by adding your first transaction
                  </Text>
                </View>
                <View style={styles.emptyActions}>
                  <Pressable
                    style={({ pressed }) => [styles.emptyActionButton, styles.emptyActionButtonPrimary, { opacity: pressed ? 0.9 : 1 }]}
                    onPress={() => setReceiveModalVisible(true)}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.emptyActionButtonTextPrimary}>Add Money</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.emptyActionButton, styles.emptyActionButtonSecondary, { opacity: pressed ? 0.9 : 1 }]}
                    onPress={() => setPayModalVisible(true)}
                  >
                    <Ionicons name="arrow-up-circle-outline" size={18} color="#000000" />
                    <Text style={styles.emptyActionButtonTextSecondary}>Spend Money</Text>
                  </Pressable>
                </View>
              </LiquidGlassCard>
            ) : null}
          </View>

          {/* Quick Actions - Floating Action Bar */}
          <LiquidGlassCard
            variant="dark"
            size="md"
            elevation="high"
            marginVertical={20}
            borderRadius={20}
          >
          <View style={styles.quickActions}>
              <Pressable 
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => setReceiveModalVisible(true)}
            >
                <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                  <Ionicons name="arrow-down" size={20} color="#10B981" />
                </View>
              <Text style={styles.actionText}>Receive</Text>
              </Pressable>

              <View style={styles.actionDivider} />

              <Pressable 
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => setPayModalVisible(true)}
            >
                <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                  <Ionicons name="arrow-up" size={20} color="#EF4444" />
                </View>
              <Text style={styles.actionText}>Pay</Text>
              </Pressable>

              <View style={styles.actionDivider} />

              <Pressable 
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => setTransferModalVisible(true)}
            >
                <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
                  <Ionicons name="swap-horizontal" size={20} color="#3B82F6" />
                </View>
              <Text style={styles.actionText}>Transfer</Text>
              </Pressable>
          </View>
          </LiquidGlassCard>

          {/* Bottom Spacing */}
          <View style={{ height: 100 }} />
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
      <View style={[styles.container, styles.whiteBackground]}>
        <SafeAreaView style={styles.safeArea}>
          <GlassCard padding={24} marginVertical={12}>
            <Text style={styles.loadingText}>Loading transactions...</Text>
          </GlassCard>
        </SafeAreaView>
      </View>
    );
  }

  return renderBackground();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  whiteBackground: {
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Header Styles
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Archivo Black',
    color: '#000000',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Summary Card Styles
  netHero: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  netLabel: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  netValue: {
    fontSize: 32,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  summaryIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  summaryTextContainer: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 17,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
  },
  // Segmented Control Styles
  segmentedControl: {
    flexDirection: 'row',
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#000000',
  },
  segmentText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  // Filter Styles
  filterContainer: {
    marginVertical: 12,
  },
  filterContent: {
    paddingVertical: 4,
    gap: 8,
    flexDirection: 'row',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: '#000000',
  },
  filterPillText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  // Calendar Styles
  calendar: {
    borderRadius: 16,
  },
  // Selected Date Styles
  selectedDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedDateIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  selectedDateInfo: {
    flex: 1,
  },
  selectedDateText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  selectedDateStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  selectedDateStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectedDateCount: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.55)',
  },
  clearDateButton: {
    padding: 4,
  },
  // Transaction List Styles
  transactionsList: {
    marginTop: 8,
  },
  transactionGroup: {
    marginBottom: 16,
  },
  dateHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  dateHeader: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: 12,
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  // Quick Actions Styles
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
  },
  // Empty State Styles
  emptyStateContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTransactionsTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  emptyTransactionsDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    justifyContent: 'center',
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
  },
  emptyActionButtonPrimary: {
    backgroundColor: '#000000',
  },
  emptyActionButtonSecondary: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  emptyActionButtonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  emptyActionButtonTextSecondary: {
    color: '#000000',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  // Bills Section Styles
  billsSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  billsSectionTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 8,
    marginLeft: 4,
  },
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  billInfo: {
    flex: 1,
    gap: 2,
  },
  billTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  billAmount: {
    fontSize: 17,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  billBreakdown: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.45)',
    marginTop: 2,
  },
  billStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  billStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  billStatusText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Loading Styles
  loadingText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    textAlign: 'center',
  },
  // Legacy styles (kept for compatibility)
  emptyTransactionsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 20,
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionAccount: {
    fontSize: 10,
    color: '#6B7280',
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
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  activeFilterButton: {
    backgroundColor: '#000000',
  },
  filterButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  activeFilterButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  summaryItem: {
    flex: 1,
    minWidth: '30%',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
});
