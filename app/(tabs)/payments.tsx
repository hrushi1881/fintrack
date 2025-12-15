import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { getPaymentDashboard, PaymentDashboardData, PaymentItem } from '@/utils/paymentDashboard';
import GlassCard from '@/components/GlassCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { BACKGROUND_MODES } from '@/theme';

export default function PaymentsScreen() {
  const { user } = useAuth();
  const { backgroundMode } = useBackgroundMode();
  const { currency } = useSettings();
  const [dashboardData, setDashboardData] = useState<PaymentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [filterType, setFilterType] = useState<'all' | 'overdue' | 'due_today' | 'upcoming' | 'paid'>('all');

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  useEffect(() => {
    loadDashboard();
  }, [user?.id]);

  const loadDashboard = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      const data = await getPaymentDashboard(user.id);
      setDashboardData(data);
      
      // Auto-expand today and overdue days
      const today = new Date().toISOString().split('T')[0];
      const initialExpanded: Record<string, boolean> = {};
      data.days.forEach(day => {
        if (day.date <= today || day.overdueCount > 0 || day.dueTodayCount > 0) {
          initialExpanded[day.date] = true;
        }
      });
      setExpandedDays(initialExpanded);
    } catch (error) {
      console.error('Error loading payment dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const toggleDay = (date: string) => {
    setExpandedDays(prev => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const getStatusColor = (status: PaymentItem['status']) => {
    switch (status) {
      case 'overdue':
        return '#EF4444';
      case 'due_today':
        return '#F59E0B';
      case 'upcoming':
        return '#3B82F6';
      case 'paid':
      case 'completed':
        return '#10B981';
      case 'skipped':
        return '#9CA3AF';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = (status: PaymentItem['status']) => {
    switch (status) {
      case 'overdue':
        return 'alert-circle';
      case 'due_today':
        return 'time';
      case 'upcoming':
        return 'calendar';
      case 'paid':
      case 'completed':
        return 'checkmark-circle';
      case 'skipped':
        return 'close-circle';
      default:
        return 'ellipse';
    }
  };

  const getTypeIcon = (type: PaymentItem['type']) => {
    switch (type) {
      case 'recurring':
        return 'repeat';
      case 'liability':
        return 'card';
      case 'bill':
        return 'receipt';
      case 'goal_contribution':
        return 'flag';
      case 'budget_reflection':
        return 'pie-chart';
      default:
        return 'cash';
    }
  };

  const getTypeLabel = (type: PaymentItem['type']) => {
    switch (type) {
      case 'recurring':
        return 'Recurring';
      case 'liability':
        return 'Liability';
      case 'bill':
        return 'Bill';
      case 'goal_contribution':
        return 'Goal';
      case 'budget_reflection':
        return 'Budget';
      default:
        return 'Payment';
    }
  };

  const handleItemPress = (item: PaymentItem) => {
    if (item.type === 'liability' && item.metadata?.liability_id) {
      router.push(`/liability/${item.metadata.liability_id}`);
    } else if (item.type === 'bill' && item.metadata?.bill_id) {
      router.push(`/bill/${item.metadata.bill_id}`);
    } else if (item.type === 'recurring' && item.metadata?.recurring_transaction_id) {
      router.push(`/recurring/${item.metadata.recurring_transaction_id}`);
    } else if (item.type === 'goal_contribution' && item.metadata?.goal_id) {
      router.push(`/goal/${item.metadata.goal_id}`);
    } else if (item.type === 'budget_reflection' && item.metadata?.budget_id) {
      router.push(`/budget/${item.metadata.budget_id}`);
    }
  };

  const filteredDays = dashboardData?.days.filter(day => {
    if (filterType === 'all') return true;
    if (filterType === 'overdue') return day.overdueCount > 0;
    if (filterType === 'due_today') return day.dueTodayCount > 0;
    if (filterType === 'upcoming') return day.upcomingCount > 0;
    if (filterType === 'paid') {
      return day.items.some(item => item.status === 'paid' || item.status === 'completed');
    }
    return true;
  }) || [];

  const renderBackground = () => {
    if (backgroundMode === BACKGROUND_MODES.IOS_GRADIENT) {
      return (
        <IOSGradientBackground gradientType="default" animated={true} shimmer={true}>
          {renderContent()}
        </IOSGradientBackground>
      );
    } else {
      return (
        <LinearGradient
          colors={['#99D795', '#99D795', '#99D795']}
          style={styles.container}
        >
          {renderContent()}
        </LinearGradient>
      );
    }
  };

  const renderContent = () => (
    <>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />
          }
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Payments</Text>
          </View>

          {/* Summary Card */}
          {dashboardData && (
            <GlassCard padding={24} marginVertical={20}>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Overdue</Text>
                  <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                    {dashboardData.summary.totalOverdue}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Due Today</Text>
                  <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
                    {dashboardData.summary.totalDueToday}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Upcoming</Text>
                  <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>
                    {dashboardData.summary.totalUpcoming}
                  </Text>
                </View>
              </View>
              <View style={styles.summaryAmountRow}>
                <View style={styles.summaryAmountItem}>
                  <Text style={styles.summaryAmountLabel}>Total Due</Text>
                  <Text style={styles.summaryAmountValue}>
                    {formatCurrency(dashboardData.summary.totalDueAmount)}
                  </Text>
                </View>
                <View style={styles.summaryAmountItem}>
                  <Text style={styles.summaryAmountLabel}>Total Paid</Text>
                  <Text style={[styles.summaryAmountValue, { color: '#10B981' }]}>
                    {formatCurrency(dashboardData.summary.totalPaidAmount)}
                  </Text>
                </View>
              </View>
            </GlassCard>
          )}

          {/* Segmented Control */}
          <View style={styles.segmentedControl}>
            {(['all', 'overdue', 'due_today', 'upcoming', 'paid'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.segmentButton,
                  filterType === filter && styles.segmentButtonActive,
                ]}
                onPress={() => setFilterType(filter)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    filterType === filter && styles.segmentTextActive,
                  ]}
                >
                  {filter === 'all' ? 'All' :
                   filter === 'overdue' ? 'Overdue' :
                   filter === 'due_today' ? 'Due Today' :
                   filter === 'upcoming' ? 'Upcoming' : 'Paid'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Payment Days */}
          {loading ? (
            <GlassCard padding={48} marginVertical={24}>
              <Text style={styles.loadingText}>Loading payments...</Text>
            </GlassCard>
          ) : filteredDays.length === 0 ? (
            <GlassCard padding={48} marginVertical={24}>
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color="rgba(0, 0, 0, 0.4)" />
                <Text style={styles.emptyTitle}>No Payments Found</Text>
                <Text style={styles.emptyDescription}>
                  {filterType === 'all' 
                    ? 'You have no payments scheduled'
                    : `No ${filterType.replace('_', ' ')} payments found`}
                </Text>
              </View>
            </GlassCard>
          ) : (
            <View style={styles.daysSection}>
              {filteredDays.map((day) => (
                <GlassCard key={day.date} padding={20} marginVertical={12}>
                  {/* Day Header */}
                  <TouchableOpacity
                    style={styles.dayHeader}
                    onPress={() => toggleDay(day.date)}
                  >
                    <View style={styles.dayHeaderLeft}>
                      <View style={styles.dayDateContainer}>
                        <Text style={styles.dayDate}>
                          {new Date(day.date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </Text>
                        <Text style={styles.dayName}>{day.dayName}</Text>
                      </View>
                      <View style={styles.dayStats}>
                        {day.overdueCount > 0 && (
                          <View style={[styles.dayStatBadge, { backgroundColor: '#EF4444' }]}>
                            <Text style={styles.dayStatText}>{day.overdueCount} Overdue</Text>
                          </View>
                        )}
                        {day.dueTodayCount > 0 && (
                          <View style={[styles.dayStatBadge, { backgroundColor: '#F59E0B' }]}>
                            <Text style={styles.dayStatText}>{day.dueTodayCount} Due</Text>
                          </View>
                        )}
                        {day.upcomingCount > 0 && (
                          <View style={[styles.dayStatBadge, { backgroundColor: '#3B82F6' }]}>
                            <Text style={styles.dayStatText}>{day.upcomingCount} Upcoming</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.dayHeaderRight}>
                      <Text style={styles.dayAmount}>
                        {formatCurrency(day.dueAmount > 0 ? day.dueAmount : day.totalAmount)}
                      </Text>
                      <Ionicons
                        name={expandedDays[day.date] ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="rgba(0, 0, 0, 0.6)"
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Day Items */}
                  {expandedDays[day.date] && (
                    <View style={styles.dayItems}>
                      {day.items.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.paymentItem}
                          onPress={() => handleItemPress(item)}
                        >
                          <View style={styles.paymentItemLeft}>
                            <View
                              style={[
                                styles.paymentItemIcon,
                                { backgroundColor: item.color || '#6B7280' },
                              ]}
                            >
                              <Ionicons
                                name={item.icon || getTypeIcon(item.type)}
                                size={20}
                                color="#FFFFFF"
                              />
                            </View>
                            <View style={styles.paymentItemContent}>
                              <View style={styles.paymentItemHeader}>
                                <Text style={styles.paymentItemTitle}>{item.title}</Text>
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                                  <Ionicons
                                    name={getStatusIcon(item.status)}
                                    size={12}
                                    color="#FFFFFF"
                                  />
                                  <Text style={styles.statusText}>
                                    {item.status.replace('_', ' ').toUpperCase()}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.paymentItemMeta}>
                                <View style={styles.typeBadge}>
                                  <Ionicons
                                    name={getTypeIcon(item.type)}
                                    size={12}
                                    color="#FFFFFF"
                                  />
                                  <Text style={styles.typeText}>{getTypeLabel(item.type)}</Text>
                                </View>
                                {item.category && (
                                  <>
                                    <Text style={styles.metaSeparator}>•</Text>
                                    <Text style={styles.metaText}>{item.category.name}</Text>
                                  </>
                                )}
                                {item.account && (
                                  <>
                                    <Text style={styles.metaSeparator}>•</Text>
                                    <Text style={styles.metaText}>{item.account.name}</Text>
                                  </>
                                )}
                              </View>
                              {item.description && (
                                <Text style={styles.paymentItemDescription}>{item.description}</Text>
                              )}
                            </View>
                          </View>
                          <View style={styles.paymentItemRight}>
                            <Text
                              style={[
                                styles.paymentItemAmount,
                                {
                                  color:
                                    item.status === 'paid' || item.status === 'completed'
                                      ? '#10B981'
                                      : item.status === 'overdue'
                                      ? '#EF4444'
                                      : item.direction === 'income'
                                      ? '#10B981'
                                      : '#FFFFFF',
                                },
                              ]}
                            >
                              {item.direction === 'income' || item.type === 'goal_contribution' ? '+' : '-'}
                              {formatCurrency(item.amount)}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color="rgba(0, 0, 0, 0.4)" />
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </GlassCard>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );

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
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Archivo Black',
    color: '#000000',
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
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#000000',
  },
  segmentText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: 8,
  },
  summaryAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
  },
  summaryAmountItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryAmountLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 4,
  },
  summaryAmountValue: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    marginTop: 4,
  },
  daysSection: {
    marginBottom: 24,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dayHeaderLeft: {
    flex: 1,
  },
  dayDateContainer: {
    marginBottom: 8,
  },
  dayDate: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  dayName: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  dayStats: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  dayStatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayStatText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
  dayHeaderRight: {
    alignItems: 'flex-end',
  },
  dayAmount: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  dayItems: {
    gap: 8,
    marginTop: 16,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    marginBottom: 8,
  },
  paymentItemLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-start',
  },
  paymentItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  paymentItemContent: {
    flex: 1,
  },
  paymentItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  paymentItemTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  paymentItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  metaSeparator: {
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.4)',
    marginHorizontal: 6,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  paymentItemDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginTop: 4,
  },
  paymentItemRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  paymentItemAmount: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    marginBottom: 4,
  },
});

