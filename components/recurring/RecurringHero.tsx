import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from '@/components/GlassCard';
import { RecurringSummarySnapshot } from '@/utils/mockRecurringData';

interface Props {
  summary: RecurringSummarySnapshot;
  netMonthly: number;
  onAdd?: () => void;
}

const RecurringHero: React.FC<Props> = ({ summary, netMonthly, onAdd }) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Recurring Transactions</Text>
          <Text style={styles.subtitle}>
            {summary.totalActive} active • {summary.subscriptionMonthly.toLocaleString()}₹ in
            subscriptions
          </Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={onAdd}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <GlassCard padding={20}>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Monthly Expenses</Text>
            <Text style={styles.metricValue}>₹{summary.monthlyExpense.toLocaleString()}</Text>
            <Text style={styles.metricHint}>Across subscriptions, bills & EMIs</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Monthly Income</Text>
            <Text style={styles.metricValue}>₹{summary.monthlyIncome.toLocaleString()}</Text>
            <Text style={styles.metricHint}>Recurring inflows tracked</Text>
          </View>
        </View>

        <View style={styles.netCard}>
          <View>
            <Text style={styles.netLabel}>Net Impact</Text>
            <Text style={[styles.netValue, netMonthly >= 0 ? styles.netPositive : styles.netNegative]}>
              ₹{netMonthly.toLocaleString()}
            </Text>
            <Text style={styles.netHint}>
              {netMonthly >= 0 ? 'Positive cash flow' : 'Needs attention'}
            </Text>
          </View>
          <View>
            <Text style={styles.miniLabel}>Upcoming (7 days)</Text>
            <Text style={styles.miniValue}>{summary.upcomingThisWeek} items</Text>
            <Text style={styles.miniLabel}>Paused</Text>
            <Text style={styles.miniValue}>{summary.totalPaused}</Text>
          </View>
        </View>
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: 'HelveticaNeue-Bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    marginRight: 12,
  },
  metricLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  metricValue: {
    fontSize: 22,
    color: '#FFFFFF',
    fontFamily: 'InstrumentSerif-Regular',
  },
  metricHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  netCard: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  netLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  netValue: {
    fontSize: 28,
    fontFamily: 'InstrumentSerif-Regular',
  },
  netPositive: {
    color: '#4ade80',
  },
  netNegative: {
    color: '#f87171',
  },
  netHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  miniLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  miniValue: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'InstrumentSerif-Regular',
    marginBottom: 8,
  },
});

export default RecurringHero;

