import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, FlatList, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Bill } from '../../types';
import { calculateBillStatistics, calculateBillStatus, fetchBills } from '../../utils/bills';
import { formatCurrencyAmount } from '../../utils/currency';
import { supabase } from '@/lib/supabase';
import GlassCard from '@/components/GlassCard';
import PayBillModal from '@/app/modals/pay-bill';

export default function BillsScreen() {
  const { user } = useAuth();
  const { bills, categories, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState('');
  const [billStats, setBillStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [showPayBillModal, setShowPayBillModal] = useState(false);
  const [allBills, setAllBills] = useState<Bill[]>([]);

  const filters = [
    { key: 'all', label: 'All', count: bills ? bills.length : 0 },
    { key: 'upcoming', label: 'Upcoming', count: bills ? bills.filter(b => b.status === 'upcoming').length : 0 },
    { key: 'due_today', label: 'Due Today', count: bills ? bills.filter(b => b.status === 'due_today').length : 0 },
    { key: 'overdue', label: 'Overdue', count: bills ? bills.filter(b => b.status === 'overdue').length : 0 },
    { key: 'paid', label: 'Paid', count: bills ? bills.filter(b => b.status === 'paid').length : 0 },
  ];

  // Load all bills with calculated status for calendar
  useEffect(() => {
    if (user && viewMode === 'calendar') {
      const loadBills = async () => {
        try {
          const billsData = await fetchBills(user.id);
          // Calculate status for each bill
          const billsWithStatus = billsData.map(bill => ({
            ...bill,
            status: calculateBillStatus(bill),
          }));
          setAllBills(billsWithStatus);
        } catch (error) {
          console.error('Error loading bills:', error);
          setAllBills([]);
        }
      };
      loadBills();
    } else {
      setAllBills(bills || []);
    }
  }, [user, viewMode, bills]);

  useEffect(() => {
    if (bills !== null) {
      if (bills.length > 0) {
        loadBillStats();
      } else {
        setLoading(false);
      }
    }
  }, [bills]);

  const loadBillStats = async () => {
    try {
      setLoading(true);
      if (bills && bills.length > 0) {
        const stats = await calculateBillStatistics(bills[0].user_id, '1 month');
        setBillStats(stats);
      } else {
        setBillStats(null);
      }
    } catch (error) {
      console.error('Error loading bill stats:', error);
      setBillStats(null);
    } finally {
      setLoading(false);
    }
  };

  const filteredBills = (allBills.length > 0 ? allBills : bills) ? (allBills.length > 0 ? allBills : bills).filter((bill: Bill) => {
    if (selectedFilter === 'all') return true;
    const billStatus = calculateBillStatus(bill);
    return billStatus === selectedFilter;
  }) : [];

  const onDayPress = (day: any) => {
    setSelectedDate(day.dateString);
  };

  const handleBillPress = (bill: Bill) => {
    if (bill.liability_id) {
      router.push(`/liability/${bill.liability_id}`);
    } else {
      setSelectedBill(bill);
      setShowPayBillModal(true);
    }
  };

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Uncategorized';
  };

  const getCategoryColor = (categoryId?: string) => {
    if (!categoryId) return '#6B7280';
    const category = categories.find(c => c.id === categoryId);
    return category?.color || '#6B7280';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#10B981';
      case 'overdue': return '#EF4444';
      case 'due_today': return '#F59E0B';
      case 'upcoming': return '#3B82F6';
      case 'skipped': return '#6B7280';
      case 'cancelled': return '#6B7280';
      case 'postponed': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'overdue': return 'Overdue';
      case 'due_today': return 'Due Today';
      case 'upcoming': return 'Upcoming';
      case 'skipped': return 'Skipped';
      case 'cancelled': return 'Cancelled';
      case 'postponed': return 'Postponed';
      default: return 'Unknown';
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

  const renderBillCard = ({ item }: { item: Bill }) => (
    <TouchableOpacity 
      style={styles.billItem}
      onPress={() => router.push(`/bill/${item.id}` as any)}
    >
      <View style={styles.billHeader}>
        <View style={[styles.billIcon, { backgroundColor: item.color + '20' }]}>
          <Ionicons name={item.icon as any} size={24} color={item.color} />
        </View>
        <View style={styles.billInfo}>
          <Text style={styles.billTitle}>{item.title}</Text>
          <Text style={styles.billCategory}>{getCategoryName(item.category_id)}</Text>
          <Text style={styles.billDueDate}>Due: {formatDate(item.due_date)}</Text>
        </View>
        <View style={styles.billAmount}>
          <Text style={styles.amountText}>
            {item.amount ? formatCurrency(item.amount) : 'Variable'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusText(item.status)}
            </Text>
          </View>
        </View>
      </View>
      
      {item.status !== 'paid' && item.status !== 'cancelled' && (
        <View style={styles.billActions}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#10B981' }]}
            onPress={() => router.push(`/modals/mark-bill-paid?id=${item.id}` as any)}
          >
            <Ionicons name="checkmark" size={16} color="white" />
            <Text style={styles.actionText}>Pay Bill</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
            onPress={() => router.push(`/modals/postpone-bill?id=${item.id}` as any)}
          >
            <Ionicons name="calendar" size={16} color="white" />
            <Text style={styles.actionText}>Postpone</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Bills & Liabilities</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity 
                style={styles.viewToggle}
                onPress={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
              >
                <Ionicons 
                  name={viewMode === 'list' ? 'calendar-outline' : 'list-outline'} 
                  size={24} 
                  color="white" 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => router.push('/modals/add-bill' as any)}
              >
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* View Mode Toggle */}
          <View style={styles.viewModeContainer}>
            <TouchableOpacity
              style={[styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons name="list" size={20} color={viewMode === 'list' ? '#FFFFFF' : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.viewModeText, viewMode === 'list' && styles.viewModeTextActive]}>List</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewModeButton, viewMode === 'calendar' && styles.viewModeButtonActive]}
              onPress={() => setViewMode('calendar')}
            >
              <Ionicons name="calendar" size={20} color={viewMode === 'calendar' ? '#FFFFFF' : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.viewModeText, viewMode === 'calendar' && styles.viewModeTextActive]}>Calendar</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Tabs */}
          {viewMode === 'list' && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.filterContainer}
              contentContainerStyle={styles.filterContent}
            >
              {filters.map((filter) => (
                <TouchableOpacity
                  key={filter.key}
                  style={[
                    styles.filterButton,
                    selectedFilter === filter.key && styles.activeFilterButton,
                  ]}
                  onPress={() => setSelectedFilter(filter.key)}
                >
                  <Text style={[
                    styles.filterText,
                    selectedFilter === filter.key && styles.activeFilterText,
                  ]}>
                    {filter.label}
                  </Text>
                  <View style={[
                    styles.filterCount,
                    selectedFilter === filter.key && styles.activeFilterCount,
                  ]}>
                    <Text style={[
                      styles.filterCountText,
                      selectedFilter === filter.key && styles.activeFilterCountText,
                    ]}>
                      {filter.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Summary Cards */}
          {viewMode === 'list' && (
            <View style={styles.summaryCards}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Upcoming</Text>
                <Text style={styles.summaryAmount}>
                  {billStats ? formatCurrency(billStats.upcoming_amount) : formatCurrency(0)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Overdue</Text>
                <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>
                  {billStats ? formatCurrency(billStats.overdue_amount) : formatCurrency(0)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Due Today</Text>
                <Text style={[styles.summaryAmount, { color: '#F59E0B' }]}>
                  {allBills.length > 0 ? allBills.filter(b => calculateBillStatus(b) === 'due_today').length : (bills ? bills.filter(b => b.status === 'due_today').length : 0)}
                </Text>
              </View>
            </View>
          )}

          {/* Calendar View */}
          {viewMode === 'calendar' && (
            <View style={styles.calendarSection}>
              <GlassCard padding={20} marginVertical={12}>
                <Calendar
                  onDayPress={onDayPress}
                  markedDates={(() => {
                    const markedDates: any = {};
                    const dateBills: { [key: string]: Bill[] } = {};
                    
                    // Group bills by due date
                    (allBills.length > 0 ? allBills : bills || []).forEach(bill => {
                      const billStatus = calculateBillStatus(bill);
                      if (billStatus !== 'paid' && billStatus !== 'cancelled') {
                        const date = bill.due_date;
                        if (!dateBills[date]) {
                          dateBills[date] = [];
                        }
                        dateBills[date].push(bill);
                      }
                    });
                    
                    // Mark dates with bills
                    Object.keys(dateBills).forEach(date => {
                      const billsForDate = dateBills[date];
                      const overdueCount = billsForDate.filter(b => calculateBillStatus(b) === 'overdue').length;
                      const dueTodayCount = billsForDate.filter(b => calculateBillStatus(b) === 'due_today').length;
                      const totalAmount = billsForDate.reduce((sum, b) => sum + (b.amount || 0), 0);
                      
                      let color = '#3B82F6'; // Blue for upcoming
                      if (overdueCount > 0) {
                        color = '#EF4444'; // Red for overdue
                      } else if (dueTodayCount > 0) {
                        color = '#F59E0B'; // Orange for due today
                      }
                      
                      markedDates[date] = {
                        marked: true,
                        dotColor: color,
                        selected: selectedDate === date,
                        selectedColor: selectedDate === date ? '#10B981' : undefined,
                        selectedTextColor: selectedDate === date ? '#FFFFFF' : undefined,
                        customStyles: {
                          container: {
                            backgroundColor: selectedDate === date ? '#10B981' : 'transparent',
                            borderRadius: 16,
                          },
                          text: {
                            color: selectedDate === date ? '#FFFFFF' : '#000000',
                            fontWeight: overdueCount > 0 || dueTodayCount > 0 ? 'bold' : 'normal',
                          },
                        },
                      };
                    });
                    
                    // Mark selected date
                    if (selectedDate && !markedDates[selectedDate]) {
                      markedDates[selectedDate] = {
                        selected: true,
                        selectedColor: '#10B981',
                        selectedTextColor: '#FFFFFF',
                      };
                    }
                    
                    return markedDates;
                  })()}
                  theme={{
                    backgroundColor: '#FFFFFF',
                    calendarBackground: '#FFFFFF',
                    textSectionTitleColor: '#000000',
                    selectedDayBackgroundColor: '#10B981',
                    selectedDayTextColor: '#FFFFFF',
                    todayTextColor: '#10B981',
                    dayTextColor: '#000000',
                    textDisabledColor: '#9CA3AF',
                    dotColor: '#10B981',
                    selectedDotColor: '#FFFFFF',
                    arrowColor: '#000000',
                    monthTextColor: '#000000',
                    indicatorColor: '#10B981',
                    textDayFontFamily: 'Poppins-SemiBold',
                    textMonthFontFamily: 'HelveticaNeue-Bold',
                    textDayHeaderFontFamily: 'Poppins-SemiBold',
                    textDayFontSize: 16,
                    textMonthFontSize: 18,
                    textDayHeaderFontSize: 13,
                  }}
                  style={styles.calendar}
                />
              </GlassCard>

              {/* Selected Date Info */}
              {selectedDate && (
                <View style={styles.selectedDateSection}>
                  <Text style={styles.selectedDateTitle}>
                    {new Date(selectedDate).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  {(() => {
                    const billsForDate = (allBills.length > 0 ? allBills : bills || []).filter(b => {
                      const billStatus = calculateBillStatus(b);
                      return b.due_date === selectedDate && billStatus !== 'paid' && billStatus !== 'cancelled';
                    });
                    
                    if (billsForDate.length === 0) {
                      return (
                        <View style={styles.emptyDateBills}>
                          <Ionicons name="checkmark-circle-outline" size={48} color="rgba(0, 0, 0, 0.3)" />
                          <Text style={styles.emptyDateBillsText}>No bills due on this date</Text>
                        </View>
                      );
                    }
                    
                    const totalAmount = billsForDate.reduce((sum, b) => sum + (b.amount || 0), 0);
                    
                    return (
                      <View>
                        <View style={styles.dateSummary}>
                          <Text style={styles.dateSummaryText}>
                            {billsForDate.length} bill{billsForDate.length !== 1 ? 's' : ''} due
                          </Text>
                          <Text style={styles.dateSummaryAmount}>
                            Total: {formatCurrency(totalAmount)}
                          </Text>
                        </View>
                        {billsForDate.map((bill) => {
                          const billStatus = calculateBillStatus(bill);
                          const isOverdue = billStatus === 'overdue';
                          const isDueToday = billStatus === 'due_today';
                          
                          return (
                            <TouchableOpacity
                              key={bill.id}
                              style={[
                                styles.calendarBillCard,
                                isOverdue && styles.calendarBillCardOverdue,
                                isDueToday && styles.calendarBillCardDueToday,
                              ]}
                              onPress={() => handleBillPress(bill)}
                            >
                              <View style={styles.calendarBillLeft}>
                                <View style={[styles.calendarBillIcon, { backgroundColor: bill.color + '20' }]}>
                                  <Ionicons name={bill.icon as any || 'receipt-outline'} size={20} color={bill.color} />
                                </View>
                                <View style={styles.calendarBillInfo}>
                                  <Text style={styles.calendarBillTitle}>{bill.title}</Text>
                                  {bill.payment_number && (
                                    <Text style={styles.calendarBillNumber}>Payment #{bill.payment_number}</Text>
                                  )}
                                  {bill.principal_amount && bill.interest_amount && bill.interest_amount > 0 && (
                                    <Text style={styles.calendarBillBreakdown}>
                                      {formatCurrency(bill.principal_amount)} principal + {formatCurrency(bill.interest_amount)} interest
                                    </Text>
                                  )}
                                  <Text style={[
                                    styles.calendarBillStatus,
                                    isOverdue && styles.calendarBillStatusOverdue,
                                    isDueToday && styles.calendarBillStatusDueToday,
                                  ]}>
                                    {isOverdue ? '⚠️ Overdue' : isDueToday ? 'Due Today' : 'Upcoming'}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.calendarBillRight}>
                                <Text style={styles.calendarBillAmount}>{formatCurrency(bill.amount || 0)}</Text>
                                <TouchableOpacity
                                  style={[styles.calendarPayButton, isOverdue && styles.calendarPayButtonOverdue]}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleBillPress(bill);
                                  }}
                                >
                                  <Text style={[styles.calendarPayButtonText, isOverdue && styles.calendarPayButtonTextOverdue]}>
                                    Pay
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>
          )}

          {/* Bills List */}
          {viewMode === 'list' && (
            <View style={styles.billsList}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading bills...</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredBills}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={styles.billItem}
                      onPress={() => handleBillPress(item)}
                    >
                      <View style={styles.billHeader}>
                        <View style={[styles.billIcon, { backgroundColor: item.color + '20' }]}>
                          <Ionicons name={item.icon as any} size={24} color={item.color} />
                        </View>
                        <View style={styles.billInfo}>
                          <Text style={styles.billTitle}>{item.title}</Text>
                          <Text style={styles.billCategory}>{getCategoryName(item.category_id)}</Text>
                          <Text style={styles.billDueDate}>Due: {formatDate(item.due_date)}</Text>
                        </View>
                        <View style={styles.billAmount}>
                          <Text style={styles.amountText}>
                            {item.amount ? formatCurrency(item.amount) : 'Variable'}
                          </Text>
                          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(calculateBillStatus(item)) + '20' }]}>
                            <Text style={[styles.statusText, { color: getStatusColor(calculateBillStatus(item)) }]}>
                              {getStatusText(calculateBillStatus(item))}
                            </Text>
                          </View>
                        </View>
                      </View>
                      
                      {calculateBillStatus(item) !== 'paid' && calculateBillStatus(item) !== 'cancelled' && (
                        <View style={styles.billActions}>
                          <TouchableOpacity 
                            style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleBillPress(item);
                            }}
                          >
                            <Ionicons name="checkmark" size={16} color="white" />
                            <Text style={styles.actionText}>Pay Bill</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
                      <Text style={styles.emptyText}>
                        {selectedFilter === 'all' ? 'No bills found' : `No ${selectedFilter} bills`}
                      </Text>
                      <Text style={styles.emptySubtext}>
                        {selectedFilter === 'all' ? 'Add your first bill to get started' : 'Try a different filter'}
                      </Text>
                      {selectedFilter === 'all' && (
                        <TouchableOpacity
                          style={styles.createFirstButton}
                          onPress={() => router.push('/modals/add-bill' as any)}
                        >
                          <Text style={styles.createFirstButtonText}>Add Bill</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  }
                />
              )}
            </View>
          )}

          {/* Quick Actions */}
          {viewMode === 'list' && (
            <View style={styles.quickActions}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => router.push('/modals/add-bill' as any)}
              >
                <Ionicons name="add-circle" size={24} color="#10B981" />
                <Text style={styles.actionText}>Add Bill</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => router.push('/categories' as any)}
              >
                <Ionicons name="folder" size={24} color="#3B82F6" />
                <Text style={styles.actionText}>Categories</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Pay Bill Modal */}
      <PayBillModal
        visible={showPayBillModal}
        bill={selectedBill}
        onClose={() => {
          setShowPayBillModal(false);
          setSelectedBill(null);
        }}
        onSuccess={() => {
          setShowPayBillModal(false);
          setSelectedBill(null);
          globalRefresh();
          // Reload bills for calendar
          if (viewMode === 'calendar' && user) {
            fetchBills(user.id).then(billsData => {
              const billsWithStatus = billsData.map(bill => ({
                ...bill,
                status: calculateBillStatus(bill),
              }));
              setAllBills(billsWithStatus);
            });
          }
        }}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  filterContainer: {
    marginBottom: 20,
  },
  filterContent: {
    paddingRight: 20,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  activeFilterButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  filterText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  activeFilterText: {
    color: '#10B981',
  },
  filterCount: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeFilterCount: {
    backgroundColor: '#10B981',
  },
  filterCountText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  activeFilterCountText: {
    color: 'white',
  },
  summaryCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  summaryCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    flex: 1,
    marginHorizontal: 8,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  billsList: {
    marginBottom: 30,
  },
  billItem: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  billIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  billInfo: {
    flex: 1,
  },
  billTitle: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  billCategory: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  billDueDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  billAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  billActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  actionText: {
    color: 'white',
    marginLeft: 4,
    fontSize: 12,
    fontWeight: 'bold',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  createFirstButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  createFirstButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewToggle: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 8,
  },
  viewModeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  viewModeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  viewModeButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  viewModeText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  viewModeTextActive: {
    color: '#FFFFFF',
  },
  calendarSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  calendar: {
    borderRadius: 16,
  },
  selectedDateSection: {
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  selectedDateTitle: {
    fontSize: 20,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  dateSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dateSummaryText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dateSummaryAmount: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  emptyDateBills: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
  },
  emptyDateBillsText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 12,
  },
  calendarBillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  calendarBillCardOverdue: {
    borderColor: '#EF4444',
    borderWidth: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  calendarBillCardDueToday: {
    borderColor: '#F59E0B',
    borderWidth: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  calendarBillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  calendarBillIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarBillInfo: {
    flex: 1,
    gap: 4,
  },
  calendarBillTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  calendarBillNumber: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  calendarBillBreakdown: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 2,
  },
  calendarBillStatus: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#3B82F6',
    marginTop: 4,
  },
  calendarBillStatusOverdue: {
    color: '#EF4444',
  },
  calendarBillStatusDueToday: {
    color: '#F59E0B',
  },
  calendarBillRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  calendarBillAmount: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  calendarPayButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  calendarPayButtonOverdue: {
    backgroundColor: '#EF4444',
  },
  calendarPayButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  calendarPayButtonTextOverdue: {
    color: '#FFFFFF',
  },
});
