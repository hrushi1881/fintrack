/**
 * Income Overview Screen
 * 
 * Comprehensive dashboard for all income streams with:
 * - Active income streams with reliability metrics
 * - Analytics and insights
 * - Upcoming income
 * - Recent income transactions
 * - Income verification
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import LiquidGlassCard from '@/components/LiquidGlassCard';
import IncomeStreamCard from '@/components/income/IncomeStreamCard';
import IncomeAnalyticsDashboard from '@/components/income/IncomeAnalyticsDashboard';
import {
  fetchIncomeDashboardData,
  IncomeDashboardData,
} from '@/utils/incomeDashboard';
import { calculateIncomeAnalytics, IncomeAnalytics } from '@/utils/incomeAnalytics';
import { verifyIncomeReceived } from '@/utils/incomeCycles';

const { width } = Dimensions.get('window');

type TabType = 'overview' | 'streams' | 'analytics';

export default function IncomeOverviewScreen() {
  const { user } = useAuth();
  const { currency } = useSettings();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<IncomeDashboardData | null>(null);
  const [analytics, setAnalytics] = useState<IncomeAnalytics | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Fetch dashboard data and analytics in parallel
      const [dashboard, analyticsData] = await Promise.all([
        fetchIncomeDashboardData(user.id, { includeHistory: true }),
        calculateIncomeAnalytics(user.id),
      ]);

      setDashboardData(dashboard);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Error loading income data:', error);
      Alert.alert('Error', 'Failed to load income data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleStreamPress = (streamId: string) => {
    router.push(`/recurring/${streamId}` as any);
  };

  const handleVerifyIncome = async (streamId: string) => {
    if (!user?.id || !dashboardData) return;

    const stream = dashboardData.streams.find((s) => s.id === streamId);
    if (!stream || !stream.nextDueDate) return;

    if (!stream.account_id) {
      Alert.alert('Error', 'Please set an account for this income stream first.');
      return;
    }

    Alert.alert(
      'Verify Income',
      `Have you received ${formatCurrencyAmount(stream.nextExpectedAmount, currency)} from "${stream.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Received',
          onPress: async () => {
            try {
              const result = await verifyIncomeReceived(
                streamId,
                stream.nextDueDate!,
                stream.nextExpectedAmount,
                stream.account_id!,
                `Income verified for ${stream.title}`
              );

              if (result.success) {
                Alert.alert('Success', 'Income verified successfully!');
                await loadData();
              } else {
                Alert.alert('Error', 'Failed to verify income');
              }
            } catch (error: any) {
              console.error('Error verifying income:', error);
              Alert.alert('Error', error.message || 'Failed to verify income');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  if (!dashboardData || !analytics) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cash-outline" size={64} color="rgba(4,27,17,0.3)" />
        <Text style={styles.emptyTitle}>No Income Data</Text>
        <Text style={styles.emptyText}>Start by adding your first income stream</Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => router.push('/modals/add-recurring-transaction' as any)}
        >
          <Text style={styles.emptyButtonText}>Add Income Stream</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Income</Text>
            <Text style={styles.headerSubtitle}>
              Overview
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/modals/add-recurring-transaction' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          {/* Summary Section */}
          <View style={styles.summaryGrid}>
            {/* Total Expected Card - Large */}
            <LiquidGlassCard variant="premium" style={styles.largeSummaryCard} blurIntensity={25}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryIconContainer}>
                  <Ionicons name="wallet" size={20} color="#10B981" />
                </View>
                <Text style={styles.summaryLabel}>Expected this month</Text>
              </View>
              <Text style={styles.largeSummaryValue}>
                {formatCurrencyAmount(dashboardData.expectedIncome, currency)}
              </Text>
              <View style={styles.progressBarBg}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { width: `${dashboardData.expectedIncome > 0 ? (dashboardData.actualIncome / dashboardData.expectedIncome) * 100 : 0}%` }
                  ]} 
                />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressText}>
                  Received: {formatCurrencyAmount(dashboardData.actualIncome, currency)}
                </Text>
                <Text style={styles.progressText}>
                  {Math.round(dashboardData.expectedIncome > 0 ? (dashboardData.actualIncome / dashboardData.expectedIncome) * 100 : 0)}%
                </Text>
              </View>
            </LiquidGlassCard>

            <View style={styles.smallCardsRow}>
              {/* Pending Card */}
              <LiquidGlassCard variant="frosted" style={styles.smallSummaryCard}>
                <Ionicons name="hourglass-outline" size={20} color="#3B82F6" />
                <Text style={styles.smallSummaryLabel}>Pending</Text>
                <Text style={[styles.smallSummaryValue, { color: '#3B82F6' }]}>
                  {formatCurrencyAmount(dashboardData.pendingIncome, currency)}
                </Text>
              </LiquidGlassCard>

              {/* Reliability Card */}
              <LiquidGlassCard variant="frosted" style={styles.smallSummaryCard}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#8B5CF6" />
                <Text style={styles.smallSummaryLabel}>Reliability</Text>
                <Text style={[styles.smallSummaryValue, { color: '#8B5CF6' }]}>
                  {dashboardData.overallReliability}%
                </Text>
              </LiquidGlassCard>
            </View>
          </View>

          {/* Custom Tabs */}
          <View style={styles.tabContainer}>
            <View style={styles.tabBackground}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'overview' && styles.tabButtonActive]}
                onPress={() => setActiveTab('overview')}
              >
                <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>Overview</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'streams' && styles.tabButtonActive]}
                onPress={() => setActiveTab('streams')}
              >
                <Text style={[styles.tabText, activeTab === 'streams' && styles.tabTextActive]}>Streams</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'analytics' && styles.tabButtonActive]}
                onPress={() => setActiveTab('analytics')}
              >
                <Text style={[styles.tabText, activeTab === 'analytics' && styles.tabTextActive]}>Analytics</Text>
              </TouchableOpacity>
            </View>
          </View>

          {activeTab === 'overview' && (
            <View style={styles.tabContent}>
              {/* Upcoming Section */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Upcoming</Text>
                {dashboardData.upcomingIncome.length > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{dashboardData.upcomingIncome.length}</Text>
                  </View>
                )}
              </View>
              
              {dashboardData.upcomingIncome.length > 0 ? (
                dashboardData.upcomingIncome.map((income) => (
                  <TouchableOpacity
                    key={income.id}
                    onPress={() => handleStreamPress(income.streamId)}
                    activeOpacity={0.7}
                  >
                    <LiquidGlassCard variant="subtle" style={styles.upcomingCard}>
                      <View style={styles.upcomingLeft}>
                        <View style={[styles.upcomingIcon, { backgroundColor: income.color + '15' }]}>
                          <Ionicons name={income.icon as any} size={20} color={income.color} />
                        </View>
                        <View>
                          <Text style={styles.upcomingTitle}>{income.streamTitle}</Text>
                          <Text style={[styles.upcomingDate, { color: getDaysUntilColor(income.daysUntil) }]}>
                            {formatDate(income.expectedDate)} • {formatDaysUntil(income.daysUntil)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.upcomingAmount}>
                        {formatCurrencyAmount(income.expectedAmount, currency)}
                      </Text>
                    </LiquidGlassCard>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptySectionText}>No upcoming income scheduled.</Text>
              )}

              {/* Recent Section */}
              <View style={[styles.sectionHeader, { marginTop: 24 }]}>
                <Text style={styles.sectionTitle}>Recent History</Text>
              </View>

              {dashboardData.recentIncome.length > 0 ? (
                dashboardData.recentIncome.slice(0, 5).map((income) => (
                  <LiquidGlassCard key={income.id} variant="light" style={styles.recentRow} padding={16}>
                    <View style={styles.recentLeft}>
                      <Text style={styles.recentDay}>{new Date(income.date).getDate()}</Text>
                      <Text style={styles.recentMonth}>
                        {new Date(income.date).toLocaleDateString('en-US', { month: 'short' })}
                      </Text>
                    </View>
                    <View style={styles.recentContent}>
                      <Text style={styles.recentTitle} numberOfLines={1}>{income.streamTitle}</Text>
                      {income.accountName && (
                        <Text style={styles.recentAccount}>{income.accountName}</Text>
                      )}
                    </View>
                    <View style={styles.recentRight}>
                      <Text style={styles.recentAmount}>
                        +{formatCurrencyAmount(income.amount, currency)}
                      </Text>
                      {income.verified && (
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ alignSelf: 'flex-end', marginTop: 2 }} />
                      )}
                    </View>
                  </LiquidGlassCard>
                ))
              ) : (
                <Text style={styles.emptySectionText}>No recent income recorded.</Text>
              )}
            </View>
          )}

          {activeTab === 'streams' && (
            <View style={styles.tabContent}>
              {dashboardData.streams.map((stream) => (
                <IncomeStreamCard
                  key={stream.id}
                  stream={stream}
                  currency={currency}
                  onPress={() => handleStreamPress(stream.id)}
                  onVerifyPress={
                    stream.daysUntilNext !== undefined && stream.daysUntilNext <= 3
                      ? () => handleVerifyIncome(stream.id)
                      : undefined
                  }
                />
              ))}
            </View>
          )}

          {activeTab === 'analytics' && (
            <View style={styles.tabContent}>
              <IncomeAnalyticsDashboard analytics={analytics} currency={currency} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDaysUntil(days: number) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}

function getDaysUntilColor(days: number) {
  if (days <= 3) return '#F59E0B';
  return 'rgba(4,27,17,0.5)';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
    lineHeight: 38,
  },
  headerSubtitle: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
    marginTop: -4,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  summaryGrid: {
    marginBottom: 24,
    gap: 16,
  },
  largeSummaryCard: {
    padding: 20,
    borderRadius: 24,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  summaryIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(4,27,17,0.6)',
  },
  largeSummaryValue: {
    fontSize: 32,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
    letterSpacing: -1,
    marginBottom: 16,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(4,27,17,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
  },
  smallCardsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  smallSummaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    gap: 8,
  },
  smallSummaryLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(4,27,17,0.5)',
  },
  smallSummaryValue: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
  },
  tabContainer: {
    marginBottom: 24,
  },
  tabBackground: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4,27,17,0.04)',
    borderRadius: 16,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(0,0,0,0.05)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(4,27,17,0.5)',
  },
  tabTextActive: {
    color: '#041B11',
    fontFamily: 'Poppins-SemiBold',
  },
  tabContent: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  badge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Poppins-Bold',
  },
  upcomingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
  },
  upcomingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upcomingIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upcomingTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginBottom: 2,
  },
  upcomingDate: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
  },
  upcomingAmount: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    color: '#10B981',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 16,
  },
  recentLeft: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,27,17,0.04)',
    borderRadius: 12,
    paddingVertical: 8,
    width: 48,
  },
  recentDay: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
    lineHeight: 20,
  },
  recentMonth: {
    fontSize: 10,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
    textTransform: 'uppercase',
  },
  recentContent: {
    flex: 1,
  },
  recentTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
    color: '#041B11',
    marginBottom: 2,
  },
  recentAccount: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
  },
  recentRight: {
    alignItems: 'flex-end',
  },
  recentAmount: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#10B981',
  },
  emptySectionText: {
    textAlign: 'center',
    color: 'rgba(4,27,17,0.4)',
    fontFamily: 'InstrumentSerif-Regular',
    marginTop: 12,
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  emptyButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
  },
});
