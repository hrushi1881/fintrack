import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { Goal } from '@/types';
import { calculateGoalProgress, calculateMonthlyNeed, getProgressColor } from '@/utils/goals';

interface GoalCardProps {
  goal: Goal;
  onPress?: () => void;
}

export default function GoalCard({ goal, onPress }: GoalCardProps) {
  const { currency } = useSettings();
  
  const progress = calculateGoalProgress(goal.current_amount, goal.target_amount);
  const progressColor = getProgressColor(progress);
  const monthlyNeed = calculateMonthlyNeed(goal.current_amount, goal.target_amount, goal.target_date);
  
  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysRemaining = (targetDate?: string) => {
    if (!targetDate) return null;
    const today = new Date();
    const deadline = new Date(targetDate);
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysRemaining = getDaysRemaining(goal.target_date);

  return (
    <TouchableOpacity
      style={styles.goalCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.goalHeader}>
        <View style={[styles.goalIcon, { backgroundColor: goal.color }]}>
          <Ionicons name={goal.icon as any} size={24} color="white" />
        </View>
        <View style={styles.goalInfo}>
          <Text style={styles.goalTitle}>{goal.title}</Text>
          {goal.target_date && (
            <Text style={styles.goalDeadline}>
              Due: {formatDate(goal.target_date)}
            </Text>
          )}
        </View>
        <View style={styles.goalAmount}>
          <Text style={styles.goalCurrent}>
            {formatCurrency(goal.current_amount)}
          </Text>
          <Text style={styles.goalTarget}>
            of {formatCurrency(goal.target_amount)}
          </Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, progress)}%`,
                backgroundColor: progressColor,
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>{progress}%</Text>
      </View>

      <View style={styles.goalStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Remaining</Text>
          <Text style={styles.statValue}>
            {formatCurrency(goal.target_amount - goal.current_amount)}
          </Text>
        </View>
        {daysRemaining !== null && (
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Days Left</Text>
            <Text style={[
              styles.statValue,
              daysRemaining < 30 && styles.statValueWarning
            ]}>
              {daysRemaining}
            </Text>
          </View>
        )}
        {monthlyNeed !== null && (
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Monthly Need</Text>
            <Text style={styles.statValue}>
              {formatCurrency(monthlyNeed)}
            </Text>
          </View>
        )}
      </View>

      {goal.is_achieved && (
        <View style={styles.achievedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.achievedText}>Achieved!</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  goalCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    position: 'relative',
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  goalDeadline: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  goalAmount: {
    alignItems: 'flex-end',
  },
  goalCurrent: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  goalTarget: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    marginRight: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    minWidth: 40,
    textAlign: 'right',
  },
  goalStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  statValueWarning: {
    color: '#EF4444',
  },
  achievedBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  achievedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    marginLeft: 4,
  },
});
