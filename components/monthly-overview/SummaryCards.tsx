import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LiquidGlassCard, { LiquidGlassPresets } from '@/components/LiquidGlassCard';
import { MonthlyOverviewSummary } from '@/utils/monthlyOverview';
import { formatCurrencyAmount } from '@/utils/currency';
import { Fonts } from '@/utils/fonts';

interface SummaryCardsProps {
  summary: MonthlyOverviewSummary;
  currency: string;
}

export default function SummaryCards({ summary, currency }: SummaryCardsProps) {
  const items = [
    {
      key: 'outflows',
      label: 'Scheduled Outflows',
      value: summary.totalScheduledOutflows,
      accent: '#F97316',
      subtitle: 'Bills & EMIs this period',
    },
    {
      key: 'budget',
      label: 'Budget Remaining',
      value: summary.totalBudgetRemaining,
      accent: '#22C55E',
      subtitle: 'Safe-to-spend cushion',
    },
    {
      key: 'goals',
      label: 'Goal Contributions',
      value: summary.goalContributionNeeded,
      accent: '#3B82F6',
      subtitle: 'Suggested savings this period',
    },
    {
      key: 'cashflow',
      label: 'Net Cash Flow',
      value: summary.netCashFlow,
      accent: summary.netCashFlow >= 0 ? '#22C55E' : '#EF4444',
      subtitle:
        summary.netCashFlow >= 0
          ? 'You are projected to be positive'
          : 'Tight month, watch spending',
    },
  ];

  return (
    <View style={styles.row}>
      {items.map((item) => (
        <LiquidGlassCard
          key={item.key}
          {...LiquidGlassPresets.summaryCard}
          style={styles.card}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.accentDot, { backgroundColor: item.accent }]} />
            <Text style={styles.label}>{item.label}</Text>
          </View>
          <Text style={styles.value}>
            {formatCurrencyAmount(item.value, currency)}
          </Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </LiquidGlassCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  card: {
    flexBasis: '48%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.7)',
    fontFamily: Fonts.poppinsSemiBold,
  },
  value: {
    fontSize: 20,
    color: '#000000',
    fontFamily: Fonts.instrumentSansBold,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.6)',
    fontFamily: Fonts.instrumentSerifRegular,
  },
});

