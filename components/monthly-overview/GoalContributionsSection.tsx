import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LiquidGlassCard, { LiquidGlassPresets } from '@/components/LiquidGlassCard';
import { GoalContributionItem } from '@/utils/goalContributionCalculator';
import { formatCurrencyAmount } from '@/utils/currency';
import { Fonts } from '@/utils/fonts';

interface Props {
  goals: GoalContributionItem[];
  currency: string;
  onContribute: (goal: GoalContributionItem) => void;
  onViewGoal: (goal: GoalContributionItem) => void;
}

export default function GoalContributionsSection({
  goals,
  currency,
  onContribute,
  onViewGoal,
}: Props) {
  if (!goals.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Goals this period</Text>
      {goals.map((goal) => (
        <LiquidGlassCard
          key={goal.goalId}
          {...LiquidGlassPresets.detailCard}
          style={styles.card}
        >
          <View style={styles.row}>
            <View style={styles.left}>
              <Text style={styles.title}>{goal.title}</Text>
              <Text style={styles.subtitle}>
                Target {formatCurrencyAmount(goal.targetAmount, goal.currency)} ·{' '}
                {goal.targetDate || 'No date'}
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(goal.progress * 100, 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round(goal.progress * 100)}% saved
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.amountLabel}>This period</Text>
              <Text style={styles.amount}>
                {formatCurrencyAmount(goal.monthlyContributionNeeded, currency)}
              </Text>
              <TouchableOpacity
                style={styles.cta}
                onPress={() => onContribute(goal)}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                <Text style={styles.ctaText}>Contribute</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.link}
                onPress={() => onViewGoal(goal)}
                activeOpacity={0.7}
              >
                <Text style={styles.linkText}>View goal</Text>
                <Ionicons name="chevron-forward" size={14} color="#4B5563" />
              </TouchableOpacity>
            </View>
          </View>
        </LiquidGlassCard>
      ))}
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
    width: 120,
    alignItems: 'flex-end',
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
    backgroundColor: '#22C55E',
  },
  progressText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsSemiBold,
    color: 'rgba(15,23,42,0.6)',
  },
  amountLabel: {
    fontSize: 11,
    fontFamily: Fonts.instrumentSerifRegular,
    color: 'rgba(15,23,42,0.6)',
    marginBottom: 2,
  },
  amount: {
    fontSize: 16,
    fontFamily: Fonts.instrumentSansBold,
    color: '#16A34A',
    marginBottom: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#16A34A',
    gap: 4,
    marginBottom: 6,
  },
  ctaText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: Fonts.poppinsSemiBold,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#4B5563',
  },
});

