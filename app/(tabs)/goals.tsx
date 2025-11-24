import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import AddGoalModal from '../modals/add-goal';
import ActionSheet, { ActionSheetItem } from '@/components/ActionSheet';
import { archiveGoal, deleteGoal } from '@/utils/goals';
import { Goal } from '@/types';

const GoalsScreen: React.FC = () => {
  const { currency } = useSettings();
  const { goals, loading, refreshGoals } = useRealtimeData();

  const [activeSegment, setActiveSegment] = useState<'active' | 'completed'>('active');
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);

  const { activeGoals, completedGoals, totalSaved, totalTarget } = useMemo(() => {
    const active = goals.filter((goal) => !goal.is_achieved);
    const completed = goals.filter((goal) => goal.is_achieved);

    const totals = goals.reduce(
      (acc, goal) => {
        const saved = Number(goal.current_amount ?? 0);
        const target = Number(goal.target_amount ?? 0);
        return {
          saved: acc.saved + saved,
          target: acc.target + target,
        };
      },
      { saved: 0, target: 0 }
    );

    return {
      activeGoals: active,
      completedGoals: completed,
      totalSaved: totals.saved,
      totalTarget: totals.target,
    };
  }, [goals]);

  const formatCurrency = (value: number) => formatCurrencyAmount(value, currency);

  const segmentedGoals = activeSegment === 'active' ? activeGoals : completedGoals;

  const handleGoalPress = (goalId: string) => {
    router.push(`/goal/${goalId}` as any);
  };

  const handleMoreOptions = (goal: Goal, event: any) => {
    event?.stopPropagation?.();
    setSelectedGoal(goal);
    setShowActionSheet(true);
  };

  const handleEdit = () => {
    if (!selectedGoal) return;
    router.push(`/goal/${selectedGoal.id}` as any);
    setShowActionSheet(false);
  };

  const handleExtend = () => {
    if (!selectedGoal) return;
    router.push(`/goal/${selectedGoal.id}?action=extend` as any);
    setShowActionSheet(false);
  };

  const handleArchive = async () => {
    if (!selectedGoal) return;
    
    Alert.alert(
      'Archive Goal',
      `Archive "${selectedGoal.title || selectedGoal.name}"? You can unarchive it later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              await archiveGoal(selectedGoal.id);
              await globalRefresh();
              setShowActionSheet(false);
              Alert.alert('Goal archived', 'We tucked this goal away for later.');
            } catch (error) {
              console.error('Error archiving goal:', error);
              Alert.alert('Error', 'Failed to archive goal. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleWithdraw = () => {
    if (!selectedGoal) return;
    router.push(`/goal/${selectedGoal.id}?action=withdraw` as any);
    setShowActionSheet(false);
  };

  const handleDelete = () => {
    if (!selectedGoal) return;
    
    Alert.alert(
      'Delete Goal',
      `Are you sure you want to delete "${selectedGoal.title || selectedGoal.name}"? This will remove the goal and its history permanently.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGoal(selectedGoal.id);
              await globalRefresh();
              setShowActionSheet(false);
            } catch (error) {
              console.error('Error deleting goal:', error);
              Alert.alert('Error', 'Failed to delete goal. Please try again.');
            }
          },
        },
      ]
    );
  };

  const getActionSheetItems = (goal: Goal): ActionSheetItem[] => {
    const isArchived = goal.is_archived;
    const isCompleted = goal.is_achieved;
    
    const items: ActionSheetItem[] = [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'create-outline',
        onPress: handleEdit,
      },
    ];

    if (!isCompleted) {
      items.push({
        id: 'extend',
        label: 'Extend',
        icon: 'calendar-outline',
        onPress: handleExtend,
      });

      if (goal.current_amount && goal.current_amount > 0) {
        items.push({
          id: 'withdraw',
          label: 'Withdraw Funds',
          icon: 'arrow-down-outline',
          onPress: handleWithdraw,
        });
      }
    }

    items.push({
      id: 'separator',
      label: '',
      icon: 'ellipsis-horizontal',
      onPress: () => {},
      separator: true,
      disabled: true,
    });

    if (isArchived) {
      // Note: Unarchive would need to be implemented
    } else {
      items.push({
        id: 'archive',
        label: 'Archive',
        icon: 'archive-outline',
        onPress: handleArchive,
      });
    }

    items.push({
      id: 'delete',
      label: 'Delete',
      icon: 'trash-outline',
      onPress: handleDelete,
      destructive: true,
    });

    return items;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Goals</Text>
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={() => setShowAddGoalModal(true)}
              accessibilityLabel="Add goal"
            >
              <Ionicons name="add" size={22} color="#0E401C" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryColumn}>
                <Text style={styles.summaryLabel}>Total Saved</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totalSaved)}</Text>
              </View>
              <View style={styles.summaryColumn}>
                <Text style={styles.summaryLabel}>Goal Target</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totalTarget)}</Text>
              </View>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowDivider]}>
              <View style={styles.summaryColumn}>
                <Text style={styles.summaryLabel}>Active Goals</Text>
                <Text style={styles.summaryMetric}>{activeGoals.length}</Text>
              </View>
              <View style={styles.summaryColumn}>
                <Text style={styles.summaryLabel}>Completed</Text>
                <Text style={styles.summaryMetric}>{completedGoals.length}</Text>
              </View>
            </View>
          </View>

          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segmentButton, activeSegment === 'active' && styles.segmentButtonActive]}
              onPress={() => setActiveSegment('active')}
            >
              <Text style={[styles.segmentText, activeSegment === 'active' && styles.segmentTextActive]}>
                Active ({activeGoals.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, activeSegment === 'completed' && styles.segmentButtonActive]}
              onPress={() => setActiveSegment('completed')}
            >
              <Text style={[styles.segmentText, activeSegment === 'completed' && styles.segmentTextActive]}>
                Completed ({completedGoals.length})
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.goalsContainer}>
            {loading ? (
              <View style={styles.emptyState}>
                <Ionicons name="hourglass-outline" size={32} color="#8BA17B" />
                <Text style={styles.emptyText}>Loading goals…</Text>
              </View>
            ) : segmentedGoals.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name={activeSegment === 'active' ? 'flag-outline' : 'checkmark-done-outline'} size={36} color="#8BA17B" />
                <Text style={styles.emptyText}>
                  {activeSegment === 'active'
                    ? 'No active goals yet. Start by adding one.'
                    : 'No completed goals yet. Keep saving!'}
                  </Text>
                </View>
            ) : (
              segmentedGoals.map((goal) => {
                const saved = Number(goal.current_amount ?? 0);
                const target = Number(goal.target_amount ?? 0);
                const percent = target === 0 ? 0 : Math.min(Math.round((saved / target) * 100), 100);

                return (
                  <TouchableOpacity
                    key={goal.id}
                    style={styles.goalCard}
                    onPress={() => handleGoalPress(goal.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.goalHeader}>
                      <View style={styles.goalIcon}>
                        <Ionicons name="airplane-outline" size={20} color="#0E401C" />
                      </View>
                      <View style={styles.goalInfo}>
                        <Text style={styles.goalTitle}>{goal.title || goal.name}</Text>
                        {goal.target_date && (
                          <Text style={styles.goalSubtitle}>
                            Target date {new Date(goal.target_date).toLocaleDateString()}
                  </Text>
                        )}
                      </View>
                      <View style={styles.goalHeaderRight}>
                      <Text style={styles.goalPercent}>{percent}%</Text>
                        <TouchableOpacity
                          style={styles.moreButton}
                          onPress={(e) => handleMoreOptions(goal, e)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={20} color="rgba(0, 0, 0, 0.6)" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${percent}%` }]} />
                    </View>

                    <View style={styles.goalAmounts}>
                      <View style={styles.goalAmountColumn}>
                        <Text style={styles.goalAmountLabel}>Saved</Text>
                        <Text style={styles.goalAmountValue}>{formatCurrency(saved)}</Text>
                      </View>
                      <View style={styles.goalAmountColumn}>
                        <Text style={styles.goalAmountLabel}>Target</Text>
                        <Text style={styles.goalAmountValue}>{formatCurrency(target)}</Text>
                      </View>
                </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          <TouchableOpacity 
            style={styles.addGoalCallout}
            onPress={() => setShowAddGoalModal(true)}
          >
            <Ionicons name="add-circle" size={20} color="#4F6F3E" />
            <Text style={styles.addGoalCalloutText}>Create Goal</Text>
          </TouchableOpacity>
        </ScrollView>

      <AddGoalModal
          visible={showAddGoalModal}
          onClose={() => setShowAddGoalModal(false)}
          onSuccess={refreshGoals}
      />

      {/* Action Sheet */}
      <ActionSheet
        visible={showActionSheet}
        onClose={() => {
          setShowActionSheet(false);
          setSelectedGoal(null);
        }}
        items={selectedGoal ? getActionSheetItems(selectedGoal) : []}
        title={selectedGoal?.title || selectedGoal?.name}
      />
      </View>
    </SafeAreaView>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7DECC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: '#F7F9F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 20,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryRowDivider: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5ECD6',
  },
  summaryColumn: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    color: '#0E401C',
    fontFamily: 'Poppins-SemiBold',
  },
  summaryMetric: {
    fontSize: 20,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F2F5EC',
    borderRadius: 999,
    padding: 4,
    marginTop: 24,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#4F6F3E',
  },
  segmentText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#4F6F3E',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  goalsContainer: {
    marginTop: 20,
    gap: 14,
  },
  goalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 18,
    shadowColor: '#1A331F',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E7EDDD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  goalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#7C8C6B',
    fontFamily: 'InstrumentSerif-Regular',
  },
  goalPercent: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#4F6F3E',
  },
  progressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#EEF3E4',
    marginTop: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#4F6F3E',
  },
  goalAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  goalAmountColumn: {
    flex: 1,
  },
  goalAmountLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  goalAmountValue: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: '#F7F9F2',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5ECD6',
  },
  emptyText: {
    marginTop: 14,
    fontSize: 13,
    color: '#637050',
    textAlign: 'center',
    fontFamily: 'InstrumentSerif-Regular',
  },
  addGoalCallout: {
    marginTop: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addGoalCalloutText: {
    fontSize: 14,
    color: '#4F6F3E',
    fontFamily: 'Poppins-SemiBold',
  },
});

export default GoalsScreen;