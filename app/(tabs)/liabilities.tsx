import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';

const LiabilitiesScreen: React.FC = () => {
  const { liabilities, loading } = useLiabilities();
  const { currency } = useSettings();

  const [activeSegment, setActiveSegment] = useState<'upcoming' | 'all'>('upcoming');

  const { upcoming, all, summary } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcomingItems = liabilities
      .filter((item) => {
        if (item.status !== 'active') return false;
        if (!item.next_due_date) return false;
        const dueDate = new Date(item.next_due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= now;
      })
      .sort((a, b) => {
        if (!a.next_due_date || !b.next_due_date) return 0;
        return new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime();
      });

    const outstanding = liabilities.reduce((sum, item) => sum + Number(item.current_balance ?? 0), 0);
    const monthlyPayments = liabilities.reduce((sum, item) => sum + Number(item.periodical_payment ?? 0), 0);
    const averageRate = liabilities.reduce((sum, item) => sum + Number(item.interest_rate_apy ?? 0), 0) /
      (liabilities.length || 1);

    return {
      upcoming: upcomingItems,
      all: liabilities,
      summary: {
        outstanding,
        monthlyPayments,
        activeCount: liabilities.filter((item) => item.status === 'active').length,
        averageRate,
      },
    };
  }, [liabilities]);

  const list = activeSegment === 'upcoming' ? upcoming : all;
  const formatCurrency = (value: number) => formatCurrencyAmount(value, currency);

  const renderEmptyState = (message: string, icon: keyof typeof Ionicons.glyphMap) => (
    <GlassCard padding={48} marginVertical={24}>
      <View style={styles.emptyStateContent}>
        <Ionicons name={icon} size={48} color="rgba(0, 0, 0, 0.4)" />
        <Text style={styles.emptyText}>{message}</Text>
        <TouchableOpacity 
          style={styles.emptyActionButton} 
          onPress={() => router.push('/modals/add-liability')}
        >
          <Ionicons name="add" size={20} color="#000000" />
          <Text style={styles.emptyActionText}>Add Liability</Text>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.loadingText}>Loading liabilities...</Text>
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
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.pageTitle}>Liabilities</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/modals/add-liability')}
              accessibilityLabel="Add liability"
            >
              <Ionicons name="add" size={24} color="#000000" />
            </TouchableOpacity>
          </View>

          {/* Summary Card */}
          <GlassCard padding={24} marginVertical={20}>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Outstanding</Text>
                <Text style={styles.summaryValue}>{formatCurrency(summary.outstanding)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Monthly Payments</Text>
                <Text style={styles.summaryValue}>{formatCurrency(summary.monthlyPayments)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Active Liabilities</Text>
                <Text style={styles.summaryMetric}>{summary.activeCount}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Avg. Interest Rate</Text>
                <Text style={styles.summaryMetric}>
                  {Number.isFinite(summary.averageRate) ? `${summary.averageRate.toFixed(1)}%` : '—'}
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Segmented Control */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segmentButton, activeSegment === 'upcoming' && styles.segmentButtonActive]}
              onPress={() => setActiveSegment('upcoming')}
            >
              <Text style={[styles.segmentText, activeSegment === 'upcoming' && styles.segmentTextActive]}>
                Upcoming ({upcoming.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, activeSegment === 'all' && styles.segmentButtonActive]}
              onPress={() => setActiveSegment('all')}
            >
              <Text style={[styles.segmentText, activeSegment === 'all' && styles.segmentTextActive]}>
                All ({all.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Liability List */}
          <View style={styles.listContainer}>
            {list.length === 0 ? (
              renderEmptyState(
                activeSegment === 'upcoming'
                  ? 'No upcoming payments. Everything is cleared for now.'
                  : 'No liabilities yet. Add one to start tracking.',
                activeSegment === 'upcoming' ? 'checkmark-circle-outline' : 'card-outline'
              )
            ) : (
              list.map((item) => {
                const originalAmount = Number(item.original_amount ?? item.disbursed_amount ?? item.current_balance ?? 0);
                const currentBalance = Number(item.current_balance ?? 0);
                const paidProgress = originalAmount > 0 ? Math.max(0, Math.min(1, (originalAmount - currentBalance) / originalAmount)) : 0;
                const dueDate = item.next_due_date ? new Date(item.next_due_date) : null;
                const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => router.push(`/liability/${item.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <GlassCard padding={20} marginVertical={12}>
                      <View style={styles.liabilityCardContent}>
                        {/* Header */}
                        <View style={styles.liabilityHeader}>
                          <View style={styles.liabilityIconContainer}>
                            <Ionicons 
                              name={(item.icon ?? 'card-outline') as any} 
                              size={24} 
                              color="rgba(0, 0, 0, 0.8)" 
                            />
                          </View>
                          <View style={styles.liabilityInfo}>
                            <Text style={styles.liabilityTitle}>{item.title}</Text>
                            <Text style={styles.liabilitySubtitle}>
                              {item.liability_type?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Liability'}
                            </Text>
                          </View>
                          <StatusBadge status={item.status} />
                        </View>

                        {/* Balance and Payment */}
                        <View style={styles.liabilityAmounts}>
                          <View style={styles.amountSection}>
                            <Text style={styles.amountLabel}>Current Balance</Text>
                            <Text style={styles.amountValue}>{formatCurrency(currentBalance)}</Text>
                          </View>
                          {item.periodical_payment && (
                            <View style={styles.amountSection}>
                              <Text style={styles.amountLabel}>Monthly Payment</Text>
                              <Text style={styles.amountValue}>{formatCurrency(Number(item.periodical_payment))}</Text>
                            </View>
                          )}
                        </View>

                        {/* Progress Bar */}
                        {originalAmount > 0 && (
                          <View style={styles.progressSection}>
                            <View style={styles.progressBarContainer}>
                              <View 
                                style={[
                                  styles.progressBarFill, 
                                  { width: `${paidProgress * 100}%` }
                                ]} 
                              />
                            </View>
                            <Text style={styles.progressText}>
                              {Math.round(paidProgress * 100)}% repaid
                            </Text>
                          </View>
                        )}

                        {/* Footer */}
                        <View style={styles.liabilityFooter}>
                          {dueDate && (
                            <View style={styles.footerItem}>
                              <Ionicons name="calendar-outline" size={16} color="rgba(0, 0, 0, 0.5)" />
                              <Text style={styles.footerText}>
                                Due {dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </Text>
                            </View>
                          )}
                          {daysUntilDue !== null && (
                            <View style={[
                              styles.dueBadge,
                              daysUntilDue <= 7 && styles.dueBadgeUrgent
                            ]}>
                              <Text style={[
                                styles.dueBadgeText,
                                daysUntilDue <= 7 && styles.dueBadgeTextUrgent
                              ]}>
                                {daysUntilDue <= 0 ? 'Due now' : `${daysUntilDue} days`}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

interface StatusBadgeProps {
  status?: string | null;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusMap: Record<string, { label: string; backgroundColor: string; textColor: string }> = {
    active: { label: 'Active', backgroundColor: 'rgba(0, 0, 0, 0.08)', textColor: '#000000' },
    paid_off: { label: 'Paid Off', backgroundColor: 'rgba(0, 200, 0, 0.1)', textColor: '#008000' },
    overdue: { label: 'Overdue', backgroundColor: 'rgba(255, 0, 0, 0.1)', textColor: '#FF0000' },
    paused: { label: 'Paused', backgroundColor: 'rgba(255, 165, 0, 0.1)', textColor: '#FFA500' },
  };

  const meta = status ? statusMap[status] : undefined;
  if (!meta) return null;

  return (
    <View style={[styles.statusBadge, { backgroundColor: meta.backgroundColor }]}>
      <Text style={[styles.statusBadgeText, { color: meta.textColor }]}>{meta.label}</Text>
    </View>
  );
};

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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
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
  summaryMetric: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 4,
    marginTop: 8,
    marginBottom: 20,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
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
  listContainer: {
    gap: 12,
  },
  liabilityCardContent: {
    gap: 16,
  },
  liabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liabilityIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liabilityInfo: {
    flex: 1,
  },
  liabilityTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  liabilitySubtitle: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  liabilityAmounts: {
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
  progressSection: {
    gap: 8,
  },
  progressBarContainer: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#000000',
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  liabilityFooter: {
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
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
  },
  dueBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  dueBadgeTextUrgent: {
    color: '#FF0000',
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
    lineHeight: 24,
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

export default LiabilitiesScreen;
