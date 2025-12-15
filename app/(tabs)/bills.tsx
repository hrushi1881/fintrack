import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { UpcomingPayment, BillsViewOptions, BillsViewFilters } from '@/types/bills';
import { fetchAllUpcomingPayments } from '@/utils/billsAggregator';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import FloatingTopBar from '@/components/FloatingTopBar';
import DateTimePicker from '@react-native-community/datetimepicker';
import RecurringPaymentModal from '@/app/modals/recurring-payment-modal';

type SortBy = 'date' | 'type';
type ViewMode = 'type' | 'date';

interface GroupedPayments {
  recurring: UpcomingPayment[];
  liability: UpcomingPayment[];
  goals: UpcomingPayment[];
  budgets: UpcomingPayment[];
}

interface DateGroupedPayments {
  [dateKey: string]: UpcomingPayment[];
}

export default function BillsScreen() {
  const { user } = useAuth();
  const { currency } = useSettings();
  const handleBack = useBackNavigation();

  // State
  const [payments, setPayments] = useState<UpcomingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [viewMode, setViewMode] = useState<ViewMode>('type');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(() => {
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    return end.toISOString().split('T')[0];
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [recurringModalData, setRecurringModalData] = useState<{
    recurringTransactionId: string;
    expectedAmount?: number;
    expectedDate?: string;
    cycleNumber?: number;
    scheduledPaymentId?: string;
  } | null>(null);

  const topBarOptions = [
    {
      id: 'profile',
      label: 'Profile',
      icon: 'person-outline' as const,
      onPress: () => router.push('/profile'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings-outline' as const,
      onPress: () => router.push('/settings'),
    },
  ];

  // Load payments
  useEffect(() => {
    if (user) {
      loadPayments();
    }
  }, [user]);

  const loadPayments = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const options: BillsViewOptions = {
        view_type: 'custom',
        current_date: new Date().toISOString().split('T')[0],
        include_paid: false,
        include_cancelled: false,
      };

      const filters: BillsViewFilters = {
        start_date: startDate,
        end_date: endDate,
      };

      const paymentsData = await fetchAllUpcomingPayments(user.id, options, filters);
      setPayments(paymentsData);
    } catch (error) {
      console.error('Error loading payments:', error);
      setPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPayments();
  };

  const handleStartDateChange = (event: any, date?: Date) => {
    setShowStartPicker(false);
    if (date) {
      const iso = date.toISOString().split('T')[0];
      setStartDate(iso);
    }
  };

  const handleEndDateChange = (event: any, date?: Date) => {
    setShowEndPicker(false);
    if (date) {
      const iso = date.toISOString().split('T')[0];
      setEndDate(iso);
    }
  };

  // Reload when date range changes
  useEffect(() => {
    if (user) loadPayments();
  }, [startDate, endDate, user]);

  // Group payments by type
  const groupedByType = useMemo(() => {
    const grouped: GroupedPayments = {
      recurring: [],
      liability: [],
      goals: [],
      budgets: [],
    };

    payments.forEach((payment) => {
      switch (payment.source_type) {
        case 'recurring_transaction':
          grouped.recurring.push(payment);
          break;
        case 'liability':
          grouped.liability.push(payment);
          break;
        case 'goal_contribution':
          grouped.goals.push(payment);
          break;
        case 'budget':
          grouped.budgets.push(payment);
          break;
      }
    });

    // Sort each group
    const sortFunction = (a: UpcomingPayment, b: UpcomingPayment) => {
      if (sortBy === 'date') {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      } else {
        // Sort by type (title)
        return a.title.localeCompare(b.title);
      }
    };

    grouped.recurring.sort(sortFunction);
    grouped.liability.sort(sortFunction);
    grouped.goals.sort(sortFunction);
    grouped.budgets.sort(sortFunction);

    return grouped;
  }, [payments, sortBy]);

  // Group payments by date
  const groupedByDate = useMemo(() => {
    const grouped: DateGroupedPayments = {};

    // Sort all payments first
    const sortedPayments = [...payments].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      } else {
        // Sort by type (title) within date groups
        return a.title.localeCompare(b.title);
      }
    });

    sortedPayments.forEach((payment) => {
      const date = new Date(payment.due_date);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(payment);
    });

    // Sort payments within each date group if sorting by type
    if (sortBy === 'type') {
      Object.keys(grouped).forEach((dateKey) => {
        grouped[dateKey].sort((a, b) => a.title.localeCompare(b.title));
      });
    }

    return grouped;
  }, [payments, sortBy]);

  // Format date for display
  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateStr = date.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) {
      return 'Due today';
    } else if (dateStr === tomorrowStr) {
      return 'Due tomorrow';
    } else {
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      return `Due on ${day}${getDaySuffix(day)} ${month}`;
    }
  };

  const getDaySuffix = (day: number) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1:
        return 'st';
      case 2:
        return 'nd';
      case 3:
        return 'rd';
      default:
        return 'th';
    }
  };

  // Get icon for payment type
  const getPaymentIcon = (payment: UpcomingPayment) => {
    switch (payment.source_type) {
      case 'recurring_transaction':
        if (payment.icon) return payment.icon;
        return 'wifi'; // Default for internet/recurring
      case 'liability':
        return 'card';
      case 'goal_contribution':
        return 'airplane';
      case 'budget':
        return 'bag';
      default:
        return 'receipt';
    }
  };

  // Handle pay button press
  const handlePay = (payment: UpcomingPayment) => {
    switch (payment.source_type) {
      case 'recurring_transaction':
        setRecurringModalData({
          recurringTransactionId: payment.source_id,
          expectedAmount: payment.amount,
          expectedDate: payment.due_date,
          cycleNumber: payment.metadata?.cycle_number,
          scheduledPaymentId: payment.metadata?.scheduled_payment_id,
        });
        setRecurringModalVisible(true);
        break;
      case 'liability':
        router.push(`/modals/pay-liability?liability_id=${payment.source_id}` as any);
        break;
      case 'goal_contribution':
        router.push(`/modals/goal-contribution?goal_id=${payment.source_id}&amount=${payment.amount}` as any);
        break;
      default:
        // Navigate to detail page
        router.push(`/bill/${payment.source_id}` as any);
    }
  };

  // Render payment item
  const renderPaymentItem = (payment: UpcomingPayment) => {
    const isGoal = payment.source_type === 'goal_contribution';
    const amountColor = isGoal ? '#00B37E' : '#000000';
    const amountPrefix = isGoal ? '+' : '-';

    return (
      <View key={payment.id} style={styles.paymentCard}>
        <View style={styles.paymentIconContainer}>
          <Ionicons name={getPaymentIcon(payment) as any} size={24} color="#000000" />
        </View>
        <View style={styles.paymentInfo}>
          <Text style={styles.paymentTitle}>{payment.title}</Text>
          <Text style={styles.paymentSubtitle}>{formatDueDate(payment.due_date)}</Text>
        </View>
        <View style={styles.paymentActions}>
          <TouchableOpacity
            style={styles.payButton}
            onPress={() => handlePay(payment)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.paymentAmount, { color: amountColor }]}>
            {amountPrefix}{formatCurrencyAmount(Math.abs(payment.amount), currency)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          {showStartPicker && (
            <DateTimePicker
              value={new Date(startDate)}
              mode="date"
              display="default"
              onChange={handleStartDateChange}
            />
          )}
          {showEndPicker && (
            <DateTimePicker
              value={new Date(endDate)}
              mode="date"
              display="default"
              onChange={handleEndDateChange}
            />
          )}
          {/* Date range filter */}
          <View style={styles.dateContainer}>
            <Text style={styles.filterLabel}>Date Range</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.datePill} onPress={() => setShowStartPicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#000" />
                <Text style={styles.datePillText}>From: {startDate}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.datePill} onPress={() => setShowEndPicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#000" />
                <Text style={styles.datePillText}>To: {endDate}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#000000" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Upcoming Bills</Text>
              <Text style={styles.headerTitle}>{"&"} Targets</Text>
            </View>
            <TouchableOpacity
              style={styles.menuButton}
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-vertical" size={24} color="#000000" />
            </TouchableOpacity>
          </View>

          {/* Sort/Filter Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.sortButton}
              onPress={() => setSortBy(sortBy === 'date' ? 'type' : 'date')}
              activeOpacity={0.7}
            >
              <Text style={styles.sortButtonText}>
                Sort by: {sortBy === 'date' ? 'Date' : 'Type'}
              </Text>
              <Ionicons name="swap-vertical" size={16} color="rgba(0, 0, 0, 0.6)" />
            </TouchableOpacity>
            <View style={styles.viewToggleContainer}>
              <TouchableOpacity
                style={[styles.viewToggleButton, viewMode === 'type' && styles.viewToggleButtonActive]}
                onPress={() => setViewMode('type')}
                activeOpacity={0.7}
              >
                <Text style={[styles.viewToggleText, viewMode === 'type' && styles.viewToggleTextActive]}>
                  Type
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewToggleButton, viewMode === 'date' && styles.viewToggleButtonActive]}
                onPress={() => setViewMode('date')}
                activeOpacity={0.7}
              >
                <Text style={[styles.viewToggleText, viewMode === 'date' && styles.viewToggleTextActive]}>
                  Date
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.filterButton} activeOpacity={0.7}>
              <Ionicons name="options" size={20} color="#000000" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#000000" />
            </View>
          ) : viewMode === 'type' ? (
            /* Type View */
            <>
              {/* Recurring Transactions */}
              {groupedByType.recurring.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recurring Transactions</Text>
                  {groupedByType.recurring.map(renderPaymentItem)}
                </View>
              )}

              {/* Liability Payments */}
              {groupedByType.liability.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Liability Payments</Text>
                  {groupedByType.liability.map(renderPaymentItem)}
                </View>
              )}

              {/* Goals Targets */}
              {groupedByType.goals.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Goals Targets</Text>
                  {groupedByType.goals.map(renderPaymentItem)}
                </View>
              )}

              {/* Budgets */}
              {groupedByType.budgets.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Budgets</Text>
                  {groupedByType.budgets.map(renderPaymentItem)}
                </View>
              )}

              {/* Empty State */}
              {payments.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Ionicons name="receipt-outline" size={64} color="rgba(0, 0, 0, 0.2)" />
                  <Text style={styles.emptyText}>No upcoming bills or targets</Text>
                </View>
              )}
            </>
          ) : (
            /* Date View */
            <>
              {Object.keys(groupedByDate).length > 0 ? (
                Object.keys(groupedByDate)
                  .sort() // Sort dates chronologically
                  .map((dateKey) => {
                    const date = new Date(dateKey);
                    const datePayments = groupedByDate[dateKey];
                    
                    // Format date header
                    const today = new Date();
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    
                    const dateStr = date.toISOString().split('T')[0];
                    const todayStr = today.toISOString().split('T')[0];
                    const tomorrowStr = tomorrow.toISOString().split('T')[0];
                    
                    let dateHeader = '';
                    if (dateStr === todayStr) {
                      dateHeader = 'Today';
                    } else if (dateStr === tomorrowStr) {
                      dateHeader = 'Tomorrow';
                    } else {
                      const month = date.toLocaleDateString('en-US', { month: 'long' });
                      const day = date.getDate();
                      const year = date.getFullYear();
                      dateHeader = `${month} ${day}, ${year}`;
                    }

                    return (
                      <View key={dateKey} style={styles.section}>
                        <Text style={styles.sectionTitle}>{dateHeader}</Text>
                        {datePayments.map(renderPaymentItem)}
                      </View>
                    );
                  })
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="receipt-outline" size={64} color="rgba(0, 0, 0, 0.2)" />
                  <Text style={styles.emptyText}>No upcoming bills or targets</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

    <RecurringPaymentModal
      visible={recurringModalVisible}
      recurringTransactionId={recurringModalData?.recurringTransactionId || ''}
      expectedAmount={recurringModalData?.expectedAmount}
      expectedDate={recurringModalData?.expectedDate}
      cycleNumber={recurringModalData?.cycleNumber}
      scheduledPaymentId={recurringModalData?.scheduledPaymentId}
      onClose={() => setRecurringModalVisible(false)}
      onSuccess={() => {
        setRecurringModalVisible(false);
        loadPayments();
      }}
    />

      <FloatingTopBar options={topBarOptions} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    fontFamily: 'Archivo Black',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 24,
    gap: 12,
    flexWrap: 'wrap',
  },
  dateContainer: {
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  filterLabel: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  datePillText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Poppins-Medium',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    flexShrink: 1,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
    fontFamily: 'Poppins-SemiBold',
  },
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    padding: 4,
    gap: 4,
    flexShrink: 0,
  },
  viewToggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  viewToggleButtonActive: {
    backgroundColor: '#000000',
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
    fontFamily: 'Poppins-SemiBold',
  },
  viewToggleTextActive: {
    color: '#FFFFFF',
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Poppins-Bold',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  paymentIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 4,
  },
  paymentSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(0, 0, 0, 0.6)',
    fontFamily: 'InstrumentSerif-Regular',
  },
  paymentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  payButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'InstrumentSans-Bold',
    minWidth: 80,
    textAlign: 'right',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(0, 0, 0, 0.5)',
    fontFamily: 'InstrumentSerif-Regular',
    marginTop: 16,
  },
});
