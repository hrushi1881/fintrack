import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import FloatingTopBar from '@/components/FloatingTopBar';
import PeriodSelector from '@/components/monthly-overview/PeriodSelector';
import SummaryCards from '@/components/monthly-overview/SummaryCards';
import UnifiedPaymentSchedule from '@/components/monthly-overview/UnifiedPaymentSchedule';
import GoalContributionsSection from '@/components/monthly-overview/GoalContributionsSection';
import BudgetOverviewSection from '@/components/monthly-overview/BudgetOverviewSection';
import DeadlinesSection from '@/components/monthly-overview/DeadlinesSection';
import { fetchMonthlyOverviewData, OverviewPeriod } from '@/utils/monthlyOverview';
import { PaymentScheduleItem } from '@/utils/paymentScheduleDashboard';
import RecurringPaymentModal from '@/app/modals/recurring-payment-modal';
import { router } from 'expo-router';
import { Fonts } from '@/utils/fonts';

type PeriodType = 'week' | 'month' | 'quarter' | 'custom';

function getInitialMonthPeriod(): { period: OverviewPeriod & { label: string; type: PeriodType } } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    period: {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      type: 'month',
    },
  };
}

export default function MonthlyOverviewScreen() {
  const { user } = useAuth();
  const { currency } = useSettings();
  const handleBack = useBackNavigation();

  const [{ startDate, endDate, label, type }, setPeriod] = useState(() => getInitialMonthPeriod().period);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overviewData, setOverviewData] = useState<any | null>(null);

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

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      if (!refreshing) setLoading(true);
      const data = await fetchMonthlyOverviewData(user.id, {
        startDate,
        endDate,
        label,
      });
      setOverviewData(data);
    } catch (error) {
      console.error('Error loading monthly overview:', error);
      setOverviewData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, startDate, endDate, label, refreshing]);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id, startDate, endDate]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handlePreviousPeriod = () => {
    const currentStart = new Date(startDate);
    const currentEnd = new Date(endDate);

    if (type === 'month') {
      const prev = new Date(currentStart);
      prev.setMonth(prev.getMonth() - 1);
      const start = new Date(prev.getFullYear(), prev.getMonth(), 1);
      const end = new Date(prev.getFullYear(), prev.getMonth() + 1, 0);
      setPeriod({
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        type,
      });
    } else {
      // Simple generic shift: move both dates back by range length
      const diff = currentEnd.getTime() - currentStart.getTime();
      const newEnd = new Date(currentStart.getTime() - 1);
      const newStart = new Date(newEnd.getTime() - diff);
      setPeriod({
        startDate: newStart.toISOString().split('T')[0],
        endDate: newEnd.toISOString().split('T')[0],
        label: `${newStart.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })} – ${newEnd.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}`,
        type,
      });
    }
  };

  const handleNextPeriod = () => {
    const currentStart = new Date(startDate);
    const currentEnd = new Date(endDate);

    if (type === 'month') {
      const next = new Date(currentStart);
      next.setMonth(next.getMonth() + 1);
      const start = new Date(next.getFullYear(), next.getMonth(), 1);
      const end = new Date(next.getFullYear(), next.getMonth() + 1, 0);
      setPeriod({
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        type,
      });
    } else {
      const diff = currentEnd.getTime() - currentStart.getTime();
      const newStart = new Date(currentEnd.getTime() + 1);
      const newEnd = new Date(newStart.getTime() + diff);
      setPeriod({
        startDate: newStart.toISOString().split('T')[0],
        endDate: newEnd.toISOString().split('T')[0],
        label: `${newStart.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })} – ${newEnd.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}`,
        type,
      });
    }
  };

  const handlePay = (item: PaymentScheduleItem) => {
    switch (item.source_type) {
      case 'recurring_transaction':
        setRecurringModalData({
          recurringTransactionId: item.source_id,
          expectedAmount: item.amount,
          expectedDate: item.due_date,
          cycleNumber: item.metadata?.cycle_number,
          scheduledPaymentId: item.metadata?.scheduled_payment_id,
        });
        setRecurringModalVisible(true);
        break;
      case 'liability':
        router.push(
          `/modals/pay-liability?liability_id=${item.source_id}&cycle_number=${item.metadata?.cycle_number}` as any
        );
        break;
      case 'goal_schedule':
        router.push(
          `/modals/add-contribution?goal_id=${item.metadata?.goal_id || item.source_id}&amount=${item.amount}` as any
        );
        break;
      default:
        break;
    }
  };

  const handleSkip = (_item: PaymentScheduleItem) => {
    // Hook up to existing skip flows later (e.g., unified-payment-modal)
  };

  const handleReschedule = (_item: PaymentScheduleItem) => {
    // Hook up to existing reschedule flows later
  };

  const handleViewDetail = (item: PaymentScheduleItem) => {
    if (item.source_type === 'liability') {
      router.push(`/(tabs)/liabilities` as any);
    } else if (item.source_type === 'recurring_transaction') {
      router.push(`/(tabs)/recurring` as any);
    } else if (item.source_type === 'goal_schedule') {
      router.push(`/(tabs)/goals` as any);
    }
  };

  const periodSelectorPeriod = useMemo(
    () => ({ start: startDate, end: endDate, label, type }),
    [startDate, endDate, label, type]
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Monthly overview</Text>
              <Text style={styles.subtitle}>
                Every bill, EMI, and goal contribution in one smooth timeline.
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Ionicons name="sparkles-outline" size={24} color="#111827" />
            </View>
          </View>

          {/* Period selector */}
          <PeriodSelector
            period={periodSelectorPeriod}
            onPrevious={handlePreviousPeriod}
            onNext={handleNextPeriod}
          />

          {loading && !overviewData ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#111827" />
            </View>
          ) : overviewData ? (
            <>
              <SummaryCards summary={overviewData.summary} currency={currency} />

              <Text style={styles.sectionHeading}>All payments this period</Text>
              <UnifiedPaymentSchedule
                payments={overviewData.allPayments}
                currency={currency}
                onPay={handlePay}
                onSkip={handleSkip}
                onReschedule={handleReschedule}
                onViewDetail={handleViewDetail}
              />

              <GoalContributionsSection
                goals={overviewData.goalContributions}
                currency={currency}
                onContribute={(goal) =>
                  router.push(
                    `/modals/add-contribution?goal_id=${goal.goalId}&amount=${goal.monthlyContributionNeeded}` as any
                  )
                }
                onViewGoal={(goal) =>
                  router.push(`/(tabs)/goals` as any)
                }
              />

              <BudgetOverviewSection
                budgets={overviewData.budgets}
                currency={currency}
                onViewBudget={() => router.push('/(tabs)/budgets' as any)}
              />

              <DeadlinesSection
                deadlines={overviewData.deadlines}
              />
            </>
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.errorText}>Unable to load overview.</Text>
            </View>
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
          loadData();
        }}
      />

      <FloatingTopBar options={topBarOptions} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  safeArea: {
    flex: 1,
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  headerRight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    color: '#111827',
    fontFamily: Fonts.archivoBlack,
    letterSpacing: -1,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(17,24,39,0.65)',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    fontFamily: Fonts.poppinsSemiBold,
  },
  sectionHeading: {
    fontSize: 18,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
    marginBottom: 8,
  },
});

