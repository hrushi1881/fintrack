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
import { formatCurrencyAmount } from '@/utils/currency';
import GlassmorphCard from '@/components/GlassmorphCard';
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
  const [selectedDate, setSelectedDate] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [filterType, setFilterType] = useState('all'); // 'all', 'income', 'expense', 'transfer'
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);

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
                  
                  // Mark selected date
                  if (selectedDate) {
                    markedDates[selectedDate] = { 
                      selected: true, 
                      selectedColor: '#10B981',
                      selectedTextColor: '#ffffff'
                    };
                  }
                  
                  // Mark dates with transactions
                  transactions.forEach(transaction => {
                    const date = transaction.date;
                    const color = transaction.type === 'income' ? '#10B981' : transaction.type === 'expense' ? '#EF4444' : '#3B82F6';
                    if (!markedDates[date]) {
                      markedDates[date] = {
                        marked: true,
                        dotColor: color
                      };
                    } else {
                      // If date is selected, also show the dot
                      markedDates[date].marked = true;
                      markedDates[date].dotColor = color;
                    }
                  });
                  
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
                Transactions for {new Date(selectedDate).toLocaleDateString()}
              </Text>
              {filteredTransactions.length > 0 && (
                <Text style={styles.selectedDateCount}>
                  {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
                </Text>
              )}
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
            ) : (
              <GlassmorphCard style={styles.emptyTransactionsContainer}>
                <Ionicons name="receipt-outline" size={48} color="rgba(255,255,255,0.5)" />
                <Text style={styles.emptyTransactionsTitle}>No Transactions Yet</Text>
                <Text style={styles.emptyTransactionsDescription}>
                  Start by adding money or making a transaction
                </Text>
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
              </GlassmorphCard>
            )}
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
          <GlassmorphCard style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading transactions...</Text>
          </GlassmorphCard>
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
  emptyTransactionsDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyActionButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
});
