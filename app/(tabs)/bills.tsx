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
import { Calendar } from 'react-native-calendars';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { UpcomingPayment, BillsViewOptions, BillsViewFilters, PaymentSourceType } from '@/types/bills';
import { fetchAllUpcomingPayments, getUpcomingPaymentsSummary } from '@/utils/billsAggregator';
import GlassCard from '@/components/GlassCard';
import ActionSheet, { ActionSheetItem } from '@/components/ActionSheet';

type ViewType = 'day' | 'week' | 'month' | 'year';
type FilterStatus = 'all' | 'upcoming' | 'due_today' | 'overdue';

export default function BillsScreen() {
  const { user } = useAuth();
  const { currency } = useSettings();
  
  // View state
  const [viewType, setViewType] = useState<ViewType>('month');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<FilterStatus>('all');
  const [selectedSourceTypes, setSelectedSourceTypes] = useState<PaymentSourceType[]>([]);
  
  // Data state
  const [payments, setPayments] = useState<UpcomingPayment[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<UpcomingPayment | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);

  // Load payments when view changes
  useEffect(() => {
    if (user) {
      loadPayments();
    }
  }, [user, viewType, currentDate, selectedFilter, selectedSourceTypes]);

  const loadPayments = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const options: BillsViewOptions = {
        view_type: viewType,
        current_date: currentDate.toISOString().split('T')[0],
        include_paid: selectedFilter === 'all',
        include_cancelled: false,
      };

      const filters: BillsViewFilters = {
        source_type: selectedSourceTypes.length > 0 ? selectedSourceTypes : undefined,
        status: selectedFilter === 'all' ? undefined : [selectedFilter],
      };

      const [paymentsData, summaryData] = await Promise.all([
        fetchAllUpcomingPayments(user.id, options, filters),
        getUpcomingPaymentsSummary(user.id, options),
      ]);

      setPayments(paymentsData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Error loading payments:', error);
      setPayments([]);
      setSummary(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPayments();
  };

  const handlePaymentPress = (payment: UpcomingPayment) => {
    // Navigate to appropriate detail screen based on source_type
    switch (payment.source_type) {
      case 'recurring_transaction':
        router.push(`/recurring-transaction/${payment.source_id}` as any);
        break;
      case 'liability':
        router.push(`/liability/${payment.source_id}` as any);
        break;
      case 'scheduled_payment':
        router.push(`/scheduled-payment/${payment.source_id}` as any);
        break;
      case 'goal_contribution':
        router.push(`/goal/${payment.source_id}` as any);
        break;
      case 'budget':
        router.push(`/budget/${payment.source_id}` as any);
        break;
    }
  };

  const handlePayPayment = (payment: UpcomingPayment) => {
    // Open appropriate pay modal based on source_type
    switch (payment.source_type) {
      case 'recurring_transaction':
        router.push(`/modals/pay-recurring-transaction?id=${payment.source_id}&occurrence_date=${payment.due_date}` as any);
        break;
      case 'liability':
        router.push(`/modals/pay-liability?liability_id=${payment.source_id}` as any);
        break;
      case 'scheduled_payment':
        router.push(`/modals/pay-scheduled-payment?id=${payment.source_id}` as any);
        break;
      case 'goal_contribution':
        router.push(`/modals/goal-contribution?goal_id=${payment.source_id}&amount=${payment.amount}` as any);
        break;
    }
  };

  const handleMoreOptions = (payment: UpcomingPayment, event: any) => {
    event?.stopPropagation?.();
    setSelectedPayment(payment);
    setShowActionSheet(true);
  };

  const handleEdit = () => {
    if (!selectedPayment) return;
    handlePaymentPress(selectedPayment);
    setShowActionSheet(false);
  };

  const handleDelete = () => {
    if (!selectedPayment) return;
    // Delete based on source_type
    // Implementation will depend on each source type
    setShowActionSheet(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'overdue':
        return '#EF4444';
      case 'due_today':
        return '#F59E0B';
      case 'upcoming':
        return '#3B82F6';
      case 'paid':
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    return status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getSourceTypeLabel = (sourceType: PaymentSourceType) => {
    switch (sourceType) {
      case 'recurring_transaction':
        return 'Recurring';
      case 'liability':
        return 'Liability';
      case 'scheduled_payment':
        return 'Scheduled';
      case 'goal_contribution':
        return 'Goal';
      case 'budget':
        return 'Budget';
      default:
        return sourceType;
    }
  };

  const getSourceTypeIcon = (sourceType: PaymentSourceType) => {
    switch (sourceType) {
      case 'recurring_transaction':
        return 'repeat';
      case 'liability':
        return 'card';
      case 'scheduled_payment':
        return 'calendar';
      case 'goal_contribution':
        return 'target';
      case 'budget':
        return 'pie-chart';
      default:
        return 'receipt';
    }
  };

  // Group payments by date
  const paymentsByDate = useMemo(() => {
    const grouped: { [key: string]: UpcomingPayment[] } = {};
    
    payments.forEach(payment => {
      const date = payment.due_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(payment);
    });

    // Sort dates
    const sortedDates = Object.keys(grouped).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );

    return { grouped, sortedDates };
  }, [payments]);

  // Group payments by source type
  const paymentsBySource = useMemo(() => {
    const grouped: { [key: string]: UpcomingPayment[] } = {};
    
    payments.forEach(payment => {
      if (!grouped[payment.source_type]) {
        grouped[payment.source_type] = [];
      }
      grouped[payment.source_type].push(payment);
    });

    return grouped;
  }, [payments]);

  // Filter payments for calendar view
  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      if (selectedFilter !== 'all' && payment.status !== selectedFilter) {
        return false;
      }
      if (selectedSourceTypes.length > 0 && !selectedSourceTypes.includes(payment.source_type)) {
        return false;
      }
      return true;
    });
  }, [payments, selectedFilter, selectedSourceTypes]);

  const getActionSheetItems = (payment: UpcomingPayment): ActionSheetItem[] => {
    const items: ActionSheetItem[] = [
      {
        id: 'pay',
        label: 'Pay Now',
        icon: 'cash-outline',
        onPress: () => {
          handlePayPayment(payment);
          setShowActionSheet(false);
        },
      },
      {
        id: 'view',
        label: 'View Details',
        icon: 'eye-outline',
        onPress: () => {
          handlePaymentPress(payment);
          setShowActionSheet(false);
        },
      },
    ];

    // Add source-type-specific actions
    if (payment.source_type === 'recurring_transaction') {
      items.push({
        id: 'edit',
        label: 'Edit Recurring Transaction',
        icon: 'create-outline',
        onPress: handleEdit,
      });
    }

    items.push({
      id: 'separator',
      label: '',
      icon: 'ellipsis-horizontal',
      onPress: () => {},
      separator: true,
      disabled: true,
    });

    items.push({
      id: 'skip',
      label: 'Skip',
      icon: 'skip-forward-outline',
      onPress: () => {
        // Skip payment logic
        setShowActionSheet(false);
      },
    });

    return items;
  };

  const formatCurrency = (value: number) => formatCurrencyAmount(value, currency);

  // Change view date (prev/next day/week/month/year)
  const changeViewDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    
    switch (viewType) {
      case 'day':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        break;
      case 'month':
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        break;
      case 'year':
        newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1));
        break;
    }
    
    setCurrentDate(newDate);
  };

  if (loading && payments.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.loadingText}>Loading upcoming payments...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.pageTitle}>Bills</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push('/modals/add-bill' as any)}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="add"
                  size={24}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewToggleButton}
                onPress={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={viewMode === 'list' ? 'calendar-outline' : 'list-outline'}
                  size={22}
                  color="#000000"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* View Type Selector */}
          <View style={styles.viewTypeContainer}>
            <TouchableOpacity
              style={[styles.viewTypeButton, viewType === 'day' && styles.viewTypeButtonActive]}
              onPress={() => setViewType('day')}
            >
              <Text style={[styles.viewTypeText, viewType === 'day' && styles.viewTypeTextActive]}>
                Day
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewTypeButton, viewType === 'week' && styles.viewTypeButtonActive]}
              onPress={() => setViewType('week')}
            >
              <Text style={[styles.viewTypeText, viewType === 'week' && styles.viewTypeTextActive]}>
                Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewTypeButton, viewType === 'month' && styles.viewTypeButtonActive]}
              onPress={() => setViewType('month')}
            >
              <Text style={[styles.viewTypeText, viewType === 'month' && styles.viewTypeTextActive]}>
                Month
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewTypeButton, viewType === 'year' && styles.viewTypeButtonActive]}
              onPress={() => setViewType('year')}
            >
              <Text style={[styles.viewTypeText, viewType === 'year' && styles.viewTypeTextActive]}>
                Year
              </Text>
            </TouchableOpacity>
            
            {/* Date Navigation */}
            <View style={styles.dateNavigation}>
              <TouchableOpacity onPress={() => changeViewDate('prev')}>
                <Ionicons name="chevron-back" size={20} color="#000000" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCurrentDate(new Date())}>
                <Text style={styles.todayButton}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => changeViewDate('next')}>
                <Ionicons name="chevron-forward" size={20} color="#000000" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Summary Cards */}
          {summary && (
            <GlassCard padding={20} marginVertical={12}>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(summary.totalAmount)}</Text>
                  <Text style={styles.summaryCount}>{summary.total} payments</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Due Today</Text>
                  <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
                    {summary.dueTodayCount}
                  </Text>
                  <Text style={styles.summaryCount}>payments</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Overdue</Text>
                  <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                    {summary.overdueCount}
                  </Text>
                  <Text style={styles.summaryCount}>payments</Text>
                </View>
              </View>
            </GlassCard>
          )}

          {/* Filter Tabs */}
          <View style={styles.filterContainer}>
            {(['all', 'upcoming', 'due_today', 'overdue'] as const).map((filterKey) => {
              const count = payments.filter(p => {
                if (filterKey === 'all') return true;
                return p.status === filterKey;
              }).length;

              return (
                <TouchableOpacity
                  key={filterKey}
                  style={[
                    styles.filterButton,
                    selectedFilter === filterKey && styles.filterButtonActive,
                  ]}
                  onPress={() => setSelectedFilter(filterKey)}
                >
                  <Text
                    style={[
                      styles.filterText,
                      selectedFilter === filterKey && styles.filterTextActive,
                    ]}
                  >
                    {filterKey.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Text>
                  {count > 0 && (
                    <View style={[
                      styles.filterBadge,
                      selectedFilter === filterKey && styles.filterBadgeActive,
                    ]}>
                      <Text style={[
                        styles.filterBadgeText,
                        selectedFilter === filterKey && styles.filterBadgeTextActive,
                      ]}>
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Source Type Filter */}
          <View style={styles.sourceTypeFilter}>
            <Text style={styles.sourceTypeLabel}>Source:</Text>
            {(['recurring_transaction', 'liability', 'scheduled_payment', 'goal_contribution'] as PaymentSourceType[]).map((sourceType) => {
              const isSelected = selectedSourceTypes.length === 0 || selectedSourceTypes.includes(sourceType);
              const count = payments.filter(p => p.source_type === sourceType).length;

              return (
                <TouchableOpacity
                  key={sourceType}
                  style={[
                    styles.sourceTypeButton,
                    selectedSourceTypes.includes(sourceType) && styles.sourceTypeButtonActive,
                    selectedSourceTypes.length === 0 && styles.sourceTypeButtonActive, // All selected by default
                  ]}
                  onPress={() => {
                    if (selectedSourceTypes.includes(sourceType)) {
                      setSelectedSourceTypes(selectedSourceTypes.filter(t => t !== sourceType));
                    } else {
                      setSelectedSourceTypes([...selectedSourceTypes, sourceType]);
                    }
                  }}
                >
                  <Ionicons 
                    name={getSourceTypeIcon(sourceType) as any} 
                    size={14} 
                    color={isSelected ? '#FFFFFF' : '#000000'} 
                  />
                  <Text style={[
                    styles.sourceTypeText,
                    isSelected && styles.sourceTypeTextActive,
                  ]}>
                    {getSourceTypeLabel(sourceType)} {count > 0 && `(${count})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Calendar View */}
          {viewMode === 'calendar' && (
            <View style={styles.calendarSection}>
              <GlassCard padding={20} marginVertical={12}>
                <Calendar
                  current={currentDate.toISOString().split('T')[0]}
                  onDayPress={(day) => setSelectedDate(day.dateString)}
                  markedDates={(() => {
                    const markedDates: any = {};
                    const datePayments: { [key: string]: UpcomingPayment[] } = {};

                    filteredPayments.forEach((payment) => {
                      if (payment.status !== 'paid' && payment.status !== 'cancelled') {
                        const date = payment.due_date;
                        if (!datePayments[date]) {
                          datePayments[date] = [];
                        }
                        datePayments[date].push(payment);
                      }
                    });

                    Object.keys(datePayments).forEach((date) => {
                      const paymentsForDate = datePayments[date];
                      const overdueCount = paymentsForDate.filter(p => p.status === 'overdue').length;
                      const dueTodayCount = paymentsForDate.filter(p => p.status === 'due_today').length;

                      let color = '#3B82F6';
                      if (overdueCount > 0) color = '#EF4444';
                      else if (dueTodayCount > 0) color = '#F59E0B';

                      markedDates[date] = {
                        marked: true,
                        dotColor: color,
                        selected: selectedDate === date,
                        selectedColor: selectedDate === date ? '#000000' : undefined,
                        selectedTextColor: selectedDate === date ? '#FFFFFF' : undefined,
                      };
                    });

                    if (selectedDate && !markedDates[selectedDate]) {
                      markedDates[selectedDate] = {
                        selected: true,
                        selectedColor: '#000000',
                        selectedTextColor: '#FFFFFF',
                      };
                    }

                    return markedDates;
                  })()}
                  theme={{
                    backgroundColor: '#FFFFFF',
                    calendarBackground: '#FFFFFF',
                    textSectionTitleColor: '#000000',
                    selectedDayBackgroundColor: '#000000',
                    selectedDayTextColor: '#FFFFFF',
                    todayTextColor: '#000000',
                    dayTextColor: '#000000',
                    textDisabledColor: '#9CA3AF',
                    dotColor: '#000000',
                    selectedDotColor: '#FFFFFF',
                    arrowColor: '#000000',
                    monthTextColor: '#000000',
                    indicatorColor: '#000000',
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
                    const paymentsForDate = filteredPayments.filter(p => p.due_date === selectedDate);

                    if (paymentsForDate.length === 0) {
                      return (
                        <GlassCard padding={32} marginVertical={12}>
                          <View style={styles.emptyDatePayments}>
                            <Ionicons name="checkmark-circle-outline" size={48} color="rgba(0, 0, 0, 0.3)" />
                            <Text style={styles.emptyDatePaymentsText}>No payments due on this date</Text>
                          </View>
                        </GlassCard>
                      );
                    }

                    return (
                      <View>
                        {paymentsForDate.map((payment) => (
                          <GlassCard key={payment.id} padding={16} marginVertical={8}>
                            <TouchableOpacity
                              onPress={() => handlePaymentPress(payment)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.calendarPaymentCard}>
                                <View style={styles.calendarPaymentLeft}>
                                  <View style={[styles.calendarPaymentIcon, { backgroundColor: (payment.color || '#F59E0B') + '15' }]}>
                                    <Ionicons name={(payment.icon as any) || 'receipt-outline'} size={20} color={payment.color || '#F59E0B'} />
                                  </View>
                                  <View style={styles.calendarPaymentInfo}>
                                    <Text style={styles.calendarPaymentTitle}>{payment.title}</Text>
                                    <View style={styles.calendarPaymentMeta}>
                                      <View style={[styles.sourceBadge, { backgroundColor: getStatusColor(payment.status) + '15' }]}>
                                        <Text style={[styles.sourceBadgeText, { color: getStatusColor(payment.status) }]}>
                                          {getSourceTypeLabel(payment.source_type)}
                                        </Text>
                                      </View>
                                      <Text style={styles.calendarPaymentStatus}>
                                        {getStatusText(payment.status)}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                                <View style={styles.calendarPaymentRight}>
                                  <Text style={styles.calendarPaymentAmount}>
                                    {payment.amount ? formatCurrency(payment.amount) : 'Variable'}
                                  </Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          </GlassCard>
                        ))}
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>
          )}

          {/* List View */}
          {viewMode === 'list' && (
            <View style={styles.paymentsList}>
              {filteredPayments.length === 0 ? (
                <GlassCard padding={48} marginVertical={24}>
                  <View style={styles.emptyStateContent}>
                    <Ionicons name="receipt-outline" size={48} color="rgba(0, 0, 0, 0.4)" />
                    <Text style={styles.emptyText}>No upcoming payments</Text>
                    <Text style={styles.emptySubtext}>
                      Your upcoming payments will appear here
                    </Text>
                    <TouchableOpacity
                      style={styles.emptyActionButton}
                      onPress={() => router.push('/modals/add-scheduled-payment' as any)}
                    >
                      <Ionicons name="add" size={20} color="#000000" />
                      <Text style={styles.emptyActionText}>Schedule Payment</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              ) : (
                <>
                  {/* Grouped by Date */}
                  {paymentsByDate.sortedDates.map((date) => {
                    const datePayments = paymentsByDate.grouped[date];
                    if (datePayments.length === 0) return null;

                    return (
                      <View key={date} style={styles.dateGroup}>
                        <View style={styles.dateGroupHeader}>
                          <Text style={styles.dateGroupTitle}>{formatDate(date)}</Text>
                          <Text style={styles.dateGroupTotal}>
                            {formatCurrency(datePayments.reduce((sum, p) => sum + (p.amount || 0), 0))}
                          </Text>
                        </View>
                        
                        {datePayments
                          .filter(p => {
                            if (selectedFilter !== 'all' && p.status !== selectedFilter) return false;
                            if (selectedSourceTypes.length > 0 && !selectedSourceTypes.includes(p.source_type)) return false;
                            return true;
                          })
                          .map((payment) => {
                            const isOverdue = payment.status === 'overdue';
                            const isDueToday = payment.status === 'due_today';
                            const isPaid = payment.status === 'paid';

                            return (
                              <TouchableOpacity
                                key={payment.id}
                                onPress={() => handlePaymentPress(payment)}
                                activeOpacity={0.7}
                              >
                                <GlassCard padding={20} marginVertical={8}>
                                  <View style={styles.paymentCardContent}>
                                    {/* Header */}
                                    <View style={styles.paymentHeader}>
                                      <View style={styles.paymentIconContainer}>
                                        <Ionicons 
                                          name={(payment.icon || 'receipt-outline') as any} 
                                          size={24} 
                                          color={payment.color || '#F59E0B'} 
                                        />
                                      </View>
                                      <View style={styles.paymentInfo}>
                                        <Text style={styles.paymentTitle}>{payment.title}</Text>
                                        <View style={styles.paymentMeta}>
                                          <View style={[styles.sourceBadge, { backgroundColor: getStatusColor(payment.status) + '15' }]}>
                                            <Text style={[styles.sourceBadgeText, { color: getStatusColor(payment.status) }]}>
                                              {getSourceTypeLabel(payment.source_type)}
                                            </Text>
                                          </View>
                                          {payment.category_name && (
                                            <Text style={styles.paymentCategory}>{payment.category_name}</Text>
                                          )}
                                        </View>
                                      </View>
                                      <View style={styles.paymentHeaderRight}>
                                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(payment.status) + '15' }]}>
                                          <Text style={[styles.statusText, { color: getStatusColor(payment.status) }]}>
                                            {getStatusText(payment.status)}
                                          </Text>
                                        </View>
                                        <TouchableOpacity
                                          style={styles.moreButton}
                                          onPress={(e) => handleMoreOptions(payment, e)}
                                          activeOpacity={0.7}
                                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                          <Ionicons name="ellipsis-horizontal" size={20} color="rgba(0, 0, 0, 0.6)" />
                                        </TouchableOpacity>
                                      </View>
                                    </View>

                                    {/* Amount and Account */}
                                    <View style={styles.paymentAmounts}>
                                      <View style={styles.amountSection}>
                                        <Text style={styles.amountLabel}>Amount</Text>
                                        <Text style={styles.amountValue}>
                                          {payment.amount ? formatCurrency(payment.amount) : 'Variable'}
                                        </Text>
                                      </View>
                                      {payment.account_name && (
                                        <View style={styles.amountSection}>
                                          <Text style={styles.amountLabel}>Account</Text>
                                          <Text style={styles.amountValue}>{payment.account_name}</Text>
                                        </View>
                                      )}
                                    </View>

                                    {/* Footer */}
                                    <View style={styles.paymentFooter}>
                                      <View style={styles.footerItem}>
                                        <Ionicons name="calendar-outline" size={16} color="rgba(0, 0, 0, 0.5)" />
                                        <Text style={styles.footerText}>
                                          Due {formatDate(payment.due_date)}
                                        </Text>
                                      </View>
                                      {!isPaid && payment.days_until !== undefined && (
                                        <View style={[
                                          styles.dueBadge,
                                          (payment.days_until <= 7 || isOverdue) && styles.dueBadgeUrgent
                                        ]}>
                                          <Text style={[
                                            styles.dueBadgeText,
                                            (payment.days_until <= 7 || isOverdue) && styles.dueBadgeTextUrgent
                                          ]}>
                                            {isOverdue ? `Overdue ${Math.abs(payment.days_until)}d` : 
                                             payment.days_until === 0 ? 'Due today' : 
                                             `${payment.days_until} days`}
                                          </Text>
                                        </View>
                                      )}
                                    </View>

                                    {/* Quick Pay Button */}
                                    {!isPaid && (
                                      <TouchableOpacity
                                        style={styles.quickPayButton}
                                        onPress={() => handlePayPayment(payment)}
                                        activeOpacity={0.7}
                                      >
                                        <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
                                        <Text style={styles.quickPayButtonText}>Pay Now</Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                </GlassCard>
                              </TouchableOpacity>
                            );
                          })}
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Action Sheet */}
      <ActionSheet
        visible={showActionSheet}
        onClose={() => {
          setShowActionSheet(false);
          setSelectedPayment(null);
        }}
        items={selectedPayment ? getActionSheetItems(selectedPayment) : []}
        title={selectedPayment?.title}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: {
    fontSize: 32,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  viewTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  viewTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  viewTypeButtonActive: {
    backgroundColor: '#000000',
  },
  viewTypeText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  viewTypeTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  todayButton: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    minWidth: '30%',
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  summaryCount: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: '#000000',
  },
  filterText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  filterBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  filterBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  filterBadgeTextActive: {
    color: '#FFFFFF',
  },
  sourceTypeFilter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sourceTypeLabel: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  sourceTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sourceTypeButtonActive: {
    backgroundColor: '#000000',
  },
  sourceTypeText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  sourceTypeTextActive: {
    color: '#FFFFFF',
  },
  calendarSection: {
    marginTop: 8,
  },
  calendar: {
    borderRadius: 16,
  },
  selectedDateSection: {
    marginTop: 16,
  },
  selectedDateTitle: {
    fontSize: 20,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  emptyDatePayments: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyDatePaymentsText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  calendarPaymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarPaymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  calendarPaymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarPaymentInfo: {
    flex: 1,
    gap: 4,
  },
  calendarPaymentTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  calendarPaymentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarPaymentStatus: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  calendarPaymentRight: {
    alignItems: 'flex-end',
  },
  calendarPaymentAmount: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  paymentsList: {
    marginTop: 8,
  },
  dateGroup: {
    marginBottom: 24,
  },
  dateGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  dateGroupTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  dateGroupTotal: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  paymentCardContent: {
    gap: 16,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  paymentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  paymentCategory: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  paymentHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  paymentAmounts: {
    flexDirection: 'row',
    gap: 16,
  },
  amountSection: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  paymentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  dueBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  dueBadgeUrgent: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dueBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  dueBadgeTextUrgent: {
    color: '#EF4444',
  },
  quickPayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  quickPayButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyStateContent: {
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
    marginTop: 4,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyActionText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
