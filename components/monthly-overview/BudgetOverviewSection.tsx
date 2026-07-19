import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LiquidGlassCard, { LiquidGlassPresets } from '@/components/LiquidGlassCard';
import { BudgetOverviewItem } from '@/utils/budgetOverview';
import { formatCurrencyAmount } from '@/utils/currency';
import { Fonts } from '@/utils/fonts';

interface Props {
  budgets: BudgetOverviewItem[];
  currency: string;
  onViewBudget: (budget: BudgetOverviewItem) => void;
  onAdjustLimit?: (budget: BudgetOverviewItem) => void;
}

export default function BudgetOverviewSection({
  budgets,
  currency,
  onViewBudget,
  onAdjustLimit,
}: Props) {
  if (!budgets.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Budgets</Text>
      {budgets.map((budget) => {
        const color =
          budget.statusColor === 'green'
            ? '#22C55E'
            : budget.statusColor === 'yellow'
            ? '#EAB308'
            : '#EF4444';

        return (
          <LiquidGlassCard
            key={budget.id}
            {...LiquidGlassPresets.detailCard}
            style={styles.card}
          >
            <View style={styles.row}>
              <View style={styles.left}>
                <Text style={styles.title}>{budget.name}</Text>
                <Text style={styles.subtitle}>
                  {formatCurrencyAmount(budget.spentAmount, currency)} spent ·{' '}
                  {formatCurrencyAmount(budget.amount, currency)} limit
                </Text>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(budget.progress * 100, 100)}%`, backgroundColor: color },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {Math.round(budget.progress * 100)}% used ·{' '}
                  {formatCurrencyAmount(budget.remainingAmount, currency)} left
                </Text>
              </View>
              <View style={styles.right}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => onViewBudget(budget)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pie-chart" size={18} color="#111827" />
                </TouchableOpacity>
                {onAdjustLimit && (
                  <TouchableOpacity
                    style={styles.link}
                    onPress={() => onAdjustLimit(budget)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.linkText}>Adjust</Text>
                    <Ionicons name="chevron-forward" size={14} color="#4B5563" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </LiquidGlassCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  heading: {
    fontSize: 18,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  left: {
    flex: 1,
  },
  right: {
    width: 80,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: Fonts.instrumentSerifRegular,
    color: 'rgba(15,23,42,0.6)',
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
  },
  progressText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsSemiBold,
    color: 'rgba(15,23,42,0.6)',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  linkText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#4B5563',
  },
});

