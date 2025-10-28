import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Budget } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface BudgetCardProps {
  budget: Budget;
  onPress: () => void;
  compact?: boolean;
}

export const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onPress, compact = false }) => {
  const { currency } = useSettings();
  const { goals } = useRealtimeData();
  
  const progress = budget.amount > 0 ? (budget.spent_amount / budget.amount) * 100 : 0;
  const remaining = budget.remaining_amount;
  
  // Find linked goal if this is a goal-based budget
  const linkedGoal = budget.budget_type === 'goal_based' && budget.goal_id 
    ? goals.find(g => g.id === budget.goal_id)
    : null;
  
  // Determine status and colors
  const getStatusInfo = () => {
    if (progress >= 100) {
      return {
        status: 'Over Budget',
        color: '#EF4444',
        bgColor: '#FEF2F2'
      };
    } else if (progress >= 80) {
      return {
        status: 'Warning',
        color: '#F59E0B',
        bgColor: '#FFFBEB'
      };
    } else {
      return {
        status: 'On Track',
        color: '#10B981',
        bgColor: '#F0FDF4'
      };
    }
  };

  const statusInfo = getStatusInfo();
  
  // Get budget type icon and color
  const getBudgetTypeInfo = () => {
    switch (budget.budget_type) {
      case 'monthly':
        return { icon: 'calendar-outline', color: '#3B82F6' };
      case 'category':
        return { icon: 'pricetag-outline', color: '#8B5CF6' };
      case 'goal_based':
        return { icon: 'flag-outline', color: '#F59E0B' };
      case 'smart':
        return { icon: 'bulb-outline', color: '#10B981' };
      default:
        return { icon: 'wallet-outline', color: '#6B7280' };
    }
  };

  const typeInfo = getBudgetTypeInfo();

  if (compact) {
    return (
      <TouchableOpacity style={[styles.compactCard, { backgroundColor: statusInfo.bgColor }]} onPress={onPress}>
        <View style={styles.compactHeader}>
          <View style={styles.compactTitleRow}>
            <Ionicons name={typeInfo.icon as any} size={16} color={typeInfo.color} />
            <Text style={styles.compactTitle} numberOfLines={1}>{budget.name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
            <Text style={styles.statusText}>{statusInfo.status}</Text>
          </View>
        </View>
        
        <View style={styles.compactProgress}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${Math.min(progress, 100)}%`,
                  backgroundColor: statusInfo.color
                }
              ]} 
            />
          </View>
          <Text style={styles.compactAmount}>
            {formatCurrencyAmount(budget.spent_amount, currency)} / {formatCurrencyAmount(budget.amount, currency)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: statusInfo.bgColor }]} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name={typeInfo.icon as any} size={20} color={typeInfo.color} />
          <Text style={styles.title} numberOfLines={1}>{budget.name}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
          <Text style={styles.statusText}>{statusInfo.status}</Text>
        </View>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${Math.min(progress, 100)}%`,
                backgroundColor: statusInfo.color
              }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>{Math.round(progress)}%</Text>
      </View>

      <View style={styles.amountsRow}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Spent</Text>
          <Text style={[styles.amountValue, { color: statusInfo.color }]}>
            {formatCurrencyAmount(budget.spent_amount, currency)}
          </Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Remaining</Text>
          <Text style={styles.amountValue}>
            {formatCurrencyAmount(remaining, currency)}
          </Text>
        </View>
      </View>

      {/* Goal Info for Goal-Based Budgets */}
      {linkedGoal && (
        <View style={styles.goalSection}>
          <View style={styles.goalHeader}>
            <Ionicons name="flag" size={16} color={linkedGoal.color} />
            <Text style={styles.goalTitle}>{linkedGoal.title}</Text>
          </View>
          <View style={styles.goalProgress}>
            <Text style={styles.goalProgressText}>
              Goal: {formatCurrencyAmount(linkedGoal.current_amount, currency)} / {formatCurrencyAmount(linkedGoal.target_amount, currency)}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.periodText}>
          {new Date(budget.start_date).toLocaleDateString()} - {new Date(budget.end_date).toLocaleDateString()}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#6B7280" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  compactCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 8,
    flex: 1,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 6,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressSection: {
    marginBottom: 12,
  },
  compactProgress: {
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  amountItem: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodText: {
    fontSize: 12,
    color: '#6B7280',
  },
  compactAmount: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },
  goalSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 6,
  },
  goalProgress: {
    marginTop: 4,
  },
  goalProgressText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
