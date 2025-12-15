import React, { useMemo, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { fetchRecurringTransactions, RecurringTransaction } from '@/utils/recurringTransactions';
import FloatingTopBar from '@/components/FloatingTopBar';
import { Fonts } from '@/utils/fonts';

/**
 * Overview Screen - Combined view of Goals, Liabilities, and Recurring Transactions
 * Shows status and quick overview of all financial commitments
 */
export default function OverviewScreen() {
  const { user } = useAuth();
  const { goals, loading: goalsLoading } = useRealtimeData();
  const { liabilities, loading: liabilitiesLoading } = useLiabilities();
  const { currency } = useSettings();
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadRecurringTransactions();
    }
  }, [user]);

  const loadRecurringTransactions = async () => {
    if (!user?.id) return;
    try {
      setRecurringLoading(true);
      const transactions = await fetchRecurringTransactions(user.id);
      const activeTransactions = transactions.filter(t => t.status === 'active');
      setRecurringTransactions(activeTransactions);
    } catch (error) {
      console.error('Error loading recurring transactions:', error);
      setRecurringTransactions([]);
    } finally {
      setRecurringLoading(false);
    }
  };

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

  // Calculate statistics
  const stats = useMemo(() => {
    const activeGoals = goals.filter(g => !g.is_archived && !g.is_deleted);
    const totalGoalTarget = activeGoals.reduce((sum, g) => sum + (g.target_amount || 0), 0);
    const totalGoalCurrent = activeGoals.reduce((sum, g) => sum + (g.current_amount || 0), 0);
    const totalGoalProgress = totalGoalTarget > 0 ? (totalGoalCurrent / totalGoalTarget) * 100 : 0;

    const activeLiabilities = liabilities.filter(l => l.status === 'active');
    const totalLiabilityBalance = activeLiabilities.reduce((sum, l) => sum + (l.current_balance || 0), 0);
    const totalMonthlyPayments = activeLiabilities.reduce((sum, l) => sum + (l.monthly_payment || 0), 0);

    const activeRecurring = recurringTransactions.filter(t => t.status === 'active');
    const totalRecurringMonthly = activeRecurring.reduce((sum, t) => {
      if (t.amount_type === 'fixed' && t.amount) {
        // Convert to monthly if needed
        const amount = Number(t.amount);
        switch (t.frequency) {
          case 'monthly':
            return sum + amount;
          case 'yearly':
            return sum + (amount / 12);
          case 'quarterly':
            return sum + (amount / 3);
          case 'halfyearly':
            return sum + (amount / 6);
          case 'weekly':
            return sum + (amount * 4.33);
          case 'biweekly':
            return sum + (amount * 2.17);
          default:
            return sum + amount;
        }
      }
      return sum + (Number(t.estimated_amount) || 0);
    }, 0);

    return {
      goals: {
        count: activeGoals.length,
        totalTarget: totalGoalTarget,
        totalCurrent: totalGoalCurrent,
        progress: totalGoalProgress,
      },
      liabilities: {
        count: activeLiabilities.length,
        totalBalance: totalLiabilityBalance,
        monthlyPayments: totalMonthlyPayments,
      },
      recurring: {
        count: activeRecurring.length,
        monthlyTotal: totalRecurringMonthly,
      },
    };
  }, [goals, liabilities, recurringTransactions]);

  const loading = goalsLoading || liabilitiesLoading || recurringLoading;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Overview</Text>
            <Text style={styles.subtitle}>Your financial commitments at a glance</Text>
          </View>

          {/* Goals Section */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => router.push('/(tabs)/goals')}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIconContainer, { backgroundColor: 'rgba(0, 179, 126, 0.15)' }]}>
                  <Ionicons name="flag" size={24} color="#00B37E" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Goals</Text>
                  <Text style={styles.sectionSubtitle}>{stats.goals.count} active goals</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
            </TouchableOpacity>

            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : stats.goals.count > 0 ? (
              <View style={styles.statsCard}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Target</Text>
                  <Text style={styles.statValue}>
                    {formatCurrencyAmount(stats.goals.totalTarget, currency)}
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Saved</Text>
                  <Text style={styles.statValue}>
                    {formatCurrencyAmount(stats.goals.totalCurrent, currency)}
                  </Text>
                </View>
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(stats.goals.progress, 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {stats.goals.progress.toFixed(1)}% Complete
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Ionicons name="flag-outline" size={32} color="rgba(0, 0, 0, 0.3)" />
                <Text style={styles.emptyText}>No goals yet</Text>
              </View>
            )}
          </View>

          {/* Liabilities Section */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => router.push('/(tabs)/liabilities')}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIconContainer, { backgroundColor: 'rgba(255, 107, 53, 0.15)' }]}>
                  <Ionicons name="card" size={24} color="#FF6B35" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Liabilities</Text>
                  <Text style={styles.sectionSubtitle}>{stats.liabilities.count} active loans</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
            </TouchableOpacity>

            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : stats.liabilities.count > 0 ? (
              <View style={styles.statsCard}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Balance</Text>
                  <Text style={styles.statValue}>
                    {formatCurrencyAmount(stats.liabilities.totalBalance, currency)}
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Monthly Payments</Text>
                  <Text style={styles.statValue}>
                    {formatCurrencyAmount(stats.liabilities.monthlyPayments, currency)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Ionicons name="card-outline" size={32} color="rgba(0, 0, 0, 0.3)" />
                <Text style={styles.emptyText}>No liabilities yet</Text>
              </View>
            )}
          </View>

          {/* Recurring Transactions Section */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => router.push('/(tabs)/recurring')}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIconContainer, { backgroundColor: 'rgba(107, 142, 35, 0.15)' }]}>
                  <Ionicons name="repeat" size={24} color="#6B8E23" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Recurring</Text>
                  <Text style={styles.sectionSubtitle}>Subscriptions & payments</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
            </TouchableOpacity>

            {recurringLoading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : stats.recurring.count > 0 ? (
              <View style={styles.statsCard}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Active Recurring</Text>
                  <Text style={styles.statValue}>{stats.recurring.count}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Monthly Total</Text>
                  <Text style={styles.statValue}>
                    {formatCurrencyAmount(stats.recurring.monthlyTotal, currency)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Ionicons name="repeat-outline" size={32} color="rgba(0, 0, 0, 0.3)" />
                <Text style={styles.emptyText}>No recurring transactions yet</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

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
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    color: '#000000',
    fontFamily: Fonts.archivoBlack,
    letterSpacing: -1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(0, 0, 0, 0.6)',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    color: '#000000',
    fontFamily: Fonts.poppinsSemiBold,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.5)',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  statsCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 15,
    color: 'rgba(0, 0, 0, 0.6)',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  statValue: {
    fontSize: 18,
    color: '#000000',
    fontFamily: Fonts.instrumentSansBold,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00B37E',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.6)',
    fontFamily: Fonts.poppinsSemiBold,
    textAlign: 'right',
  },
  emptyCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(0, 0, 0, 0.4)',
    fontFamily: Fonts.instrumentSerifRegular,
    marginTop: 12,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: 'rgba(0, 0, 0, 0.5)',
    fontFamily: Fonts.instrumentSerifRegular,
  },
});

