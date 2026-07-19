/**
 * Income Stream Card Component
 * 
 * Beautiful liquid glass card displaying an individual income stream
 * with reliability indicator, next payment info, and quick actions.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LiquidGlassCard from '@/components/LiquidGlassCard';
import { formatCurrencyAmount } from '@/utils/currency';
import { IncomeDashboardStream } from '@/utils/incomeDashboard';

interface IncomeStreamCardProps {
  stream: IncomeDashboardStream;
  currency: string;
  onPress: () => void;
  onVerifyPress?: () => void;
  compact?: boolean;
}

export default function IncomeStreamCard({
  stream,
  currency,
  onPress,
  onVerifyPress,
  compact = false,
}: IncomeStreamCardProps) {
  const reliabilityColor = getReliabilityColor(stream.statistics.reliability);
  const statusColor = getStatusColor(stream.status);
  const isDueSoon = stream.daysUntilNext !== undefined && stream.daysUntilNext <= 3;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
      <LiquidGlassCard
        variant="premium"
        style={styles.card}
        blurIntensity={20}
        borderRadius={24}
      >
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={[stream.color + '40', stream.color + '10']}
              style={styles.iconGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name={stream.icon as any} size={22} color={stream.color} />
            </LinearGradient>
          </View>

          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <Text style={styles.streamTitle} numberOfLines={1}>
                {stream.title}
              </Text>
              {stream.status !== 'active' && (
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {formatStatus(stream.status)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.frequencyText}>
              {stream.frequency === 'month' ? 'Monthly' : 
               stream.frequency === 'week' ? 'Weekly' : 
               stream.frequency === 'year' ? 'Yearly' : 'Custom'}
            </Text>
          </View>

          <View style={[styles.reliabilityBadge, { backgroundColor: reliabilityColor + '15' }]}>
            <Ionicons name="shield-checkmark" size={12} color={reliabilityColor} />
            <Text style={[styles.reliabilityText, { color: reliabilityColor }]}>
              {stream.statistics.reliability}%
            </Text>
          </View>
        </View>

        {!compact && (
          <>
            {/* Main Content */}
            <View style={styles.mainContent}>
              <View style={styles.amountContainer}>
                <Text style={styles.label}>Expected Income</Text>
                <Text style={styles.amount}>
                  {formatCurrencyAmount(stream.nextExpectedAmount, currency)}
                </Text>
              </View>

              <View style={styles.dateContainer}>
                <Text style={styles.label}>Next Payment</Text>
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={14} color="rgba(4,27,17,0.6)" />
                  <Text style={styles.nextDate}>
                    {stream.nextDueDate
                      ? formatNextDate(stream.nextDueDate)
                      : 'TBD'}
                  </Text>
                </View>
                {stream.daysUntilNext !== undefined && stream.daysUntilNext <= 14 && (
                  <Text style={[styles.daysUntil, { color: getDaysUntilColor(stream.daysUntilNext) }]}>
                    {formatDaysUntil(stream.daysUntilNext)}
                  </Text>
                )}
              </View>
            </View>

            {/* Stats Divider */}
            <View style={styles.divider} />

            {/* Quick Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Received</Text>
                <View style={styles.statValueRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={styles.statValue}>{stream.statistics.receivedCount}</Text>
                </View>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statLabel}>On-Time</Text>
                <View style={styles.statValueRow}>
                  <Ionicons name="time" size={14} color="#3B82F6" />
                  <Text style={styles.statValue}>{stream.statistics.onTimeRate}%</Text>
                </View>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Avg Amount</Text>
                <View style={styles.statValueRow}>
                  <Text style={styles.statValue}>
                    {formatCurrencyAmount(stream.statistics.averageAmount, currency, true)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Action Button */}
            {onVerifyPress && isDueSoon && (
              <TouchableOpacity
                style={styles.verifyButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onVerifyPress();
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)']}
                  style={styles.verifyGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="checkmark-done-circle" size={18} color="#10B981" />
                  <Text style={styles.verifyButtonText}>Verify Received</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </>
        )}

        {compact && (
          <View style={styles.compactRow}>
            <Text style={styles.compactAmount}>
              {formatCurrencyAmount(stream.nextExpectedAmount, currency)}
            </Text>
            <View style={styles.compactDateRow}>
              <Text style={styles.compactNext}>
                {stream.nextDueDate ? formatCompactDate(stream.nextDueDate) : 'TBD'}
              </Text>
              {stream.daysUntilNext !== undefined && stream.daysUntilNext <= 3 && (
                <View style={styles.compactIndicator} />
              )}
            </View>
          </View>
        )}
      </LiquidGlassCard>
    </TouchableOpacity>
  );
}

function getReliabilityColor(score: number): string {
  if (score >= 90) return '#10B981'; // Green
  if (score >= 75) return '#3B82F6'; // Blue
  if (score >= 60) return '#F59E0B'; // Amber
  return '#EF4444'; // Red
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active': return '#10B981';
    case 'paused': return '#94A3B8';
    case 'late': return '#EF4444';
    case 'upcoming': return '#3B82F6';
    default: return '#94A3B8';
  }
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getDaysUntilColor(days: number): string {
  if (days < 0) return '#EF4444'; // Late
  if (days === 0) return '#10B981'; // Today
  if (days <= 3) return '#F59E0B'; // Soon
  return '#3B82F6'; // Future
}

function formatDaysUntil(days: number): string {
  if (days === 0) return 'Due Today';
  if (days === 1) return 'Due Tomorrow';
  if (days < 0) return `${Math.abs(days)} days late`;
  return `Due in ${days} days`;
}

function formatNextDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatCompactDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    marginRight: 14,
  },
  iconGradient: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  streamTitle: {
    fontSize: 17,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    letterSpacing: -0.3,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontFamily: 'Poppins-Medium',
  },
  frequencyText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
  },
  reliabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reliabilityText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
  },
  mainContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  amountContainer: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amount: {
    fontSize: 26,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
    letterSpacing: -0.5,
  },
  dateContainer: {
    alignItems: 'flex-end',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  nextDate: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  daysUntil: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(4,27,17,0.06)',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  verifyButton: {
    marginTop: 16,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  verifyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  verifyButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#10B981',
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  compactAmount: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  compactDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactNext: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(4,27,17,0.6)',
  },
  compactIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
});
