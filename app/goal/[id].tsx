import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import { BudgetCard } from '@/components/BudgetCard';
import { 
  calculateGoalProgress, 
  calculateMonthlyNeed, 
  getProgressColor,
  updateGoalProgress,
  checkGoalCompletion,
  extendGoal,
  archiveGoal,
  deleteGoal,
  withdrawFromGoal,
  fetchGoalContributions
} from '@/utils/goals';
import { Goal, GoalContribution, GoalContributionWithTransaction } from '@/types';
import AddContributionModal from '../modals/add-contribution';
import GoalCelebrationScreen from '@/components/GoalCelebrationScreen';
import WhatsNextModal from '@/components/WhatsNextModal';
import ExtendGoalModal from '@/components/ExtendGoalModal';
import WithdrawFundsModal from '@/components/WithdrawFundsModal';

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { currency } = useSettings();
  const { goals, budgets, refreshGoals, refreshBudgets } = useRealtimeData();
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddContribution, setShowAddContribution] = useState(false);
  const [contributions, setContributions] = useState<GoalContributionWithTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Completion flow states
  const [showCelebration, setShowCelebration] = useState(false);
  const [showWhatsNext, setShowWhatsNext] = useState(false);
  const [showExtendGoal, setShowExtendGoal] = useState(false);
  const [showWithdrawFunds, setShowWithdrawFunds] = useState(false);

  // Find the goal by ID
  const goal = goals.find(g => g.id === id as string);

  useEffect(() => {
    if (goal) {
      fetchContributions();
      checkForCompletion();
    }
  }, [goal]);

  // Periodic check for completion (every 5 seconds when goal is active)
  useEffect(() => {
    if (!goal || goal.is_achieved) return;

    const interval = setInterval(async () => {
      try {
        const { isCompleted } = await checkGoalCompletion(goal.id);
        if (isCompleted) {
          setShowCelebration(true);
          await refreshGoals();
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Error in periodic completion check:', error);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [goal]);

  const checkForCompletion = async () => {
    if (!goal) return;
    
    try {
      const { isCompleted } = await checkGoalCompletion(goal.id);
      if (isCompleted) {
        setShowCelebration(true);
        await refreshGoals(); // Refresh to get updated goal data
      }
    } catch (error) {
      console.error('Error checking goal completion:', error);
    }
  };

  const fetchContributions = async () => {
    if (!goal) return;
    
    try {
      setLoading(true);
      const contributions = await fetchGoalContributions(goal.id);
      setContributions(contributions);
      
      // Update goal progress
      const { goal: updatedGoal, isNewlyAchieved } = await updateGoalProgress(goal.id);
      
      if (isNewlyAchieved) {
        setShowCelebration(true);
      }
      
      // Refresh goals data
      await refreshGoals();
    } catch (error) {
      console.error('Error fetching contributions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!goal) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.errorTitle}>Goal Not Found</Text>
            <Text style={styles.errorDescription}>
              The goal you're looking for doesn't exist or has been deleted.
            </Text>
            <TouchableOpacity style={styles.errorBackButton} onPress={() => router.back()}>
              <Text style={styles.errorBackButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const progress = calculateGoalProgress(goal.current_amount, goal.target_amount);
  const progressColor = getProgressColor(progress);
  const monthlyNeed = calculateMonthlyNeed(goal.current_amount, goal.target_amount, goal.target_date);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysRemaining = (deadline?: string) => {
    if (!deadline) return null;
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleAddContributionSuccess = async () => {
    await refreshGoals();
    await fetchContributions();
    await checkForCompletion(); // Check if goal is now completed
    setShowAddContribution(false);
  };

  // Completion flow handlers
  const handleViewSummary = () => {
    setShowCelebration(false);
    // TODO: Navigate to summary screen
  };

  const handleWhatsNext = () => {
    setShowCelebration(false);
    setShowWhatsNext(true);
  };

  const handleExtendGoal = () => {
    setShowWhatsNext(false);
    setShowExtendGoal(true);
  };

  const handleArchiveGoal = async () => {
    if (!goal) return;
    
    try {
      await archiveGoal(goal.id);
      await refreshGoals();
      setShowWhatsNext(false);
      Alert.alert('Goal Archived', 'We\'ll tuck this away. You can revisit it anytime.');
      router.back();
    } catch (error) {
      console.error('Error archiving goal:', error);
      Alert.alert('Error', 'Failed to archive goal. Please try again.');
    }
  };

  const handleWithdrawFunds = () => {
    setShowWhatsNext(false);
    setShowWithdrawFunds(true);
  };

  const handleDeleteGoal = () => {
    setShowWhatsNext(false);
    Alert.alert(
      'Delete Goal',
      'Delete this goal and all its history? This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDeleteConfirm }
      ]
    );
  };

  const handleDeleteConfirm = async () => {
    if (!goal) return;
    
    try {
      await deleteGoal(goal.id);
      await refreshGoals();
      router.back();
    } catch (error) {
      console.error('Error deleting goal:', error);
      Alert.alert('Error', 'Failed to delete goal. Please try again.');
    }
  };

  const handleExtendGoalConfirm = async (data: { newTarget?: number; newDate?: string }) => {
    if (!goal) return;
    
    try {
      await extendGoal(goal.id, data.newTarget, data.newDate);
      await refreshGoals();
      setShowExtendGoal(false);
      Alert.alert('Goal Extended', 'Dream extended — let\'s aim for your new target!');
    } catch (error) {
      console.error('Error extending goal:', error);
      Alert.alert('Error', 'Failed to extend goal. Please try again.');
    }
  };

  const handleWithdrawConfirm = async (data: { amount: number; destinationAccountId: string; note?: string }) => {
    if (!goal) return;
    
    try {
      await withdrawFromGoal(goal.id, data.amount, data.destinationAccountId, data.note);
      await refreshGoals();
      await fetchContributions();
      setShowWithdrawFunds(false);
      Alert.alert('Funds Withdrawn', `${formatCurrency(data.amount)} withdrawn — you made it real.`);
    } catch (error) {
      console.error('Error withdrawing funds:', error);
      Alert.alert('Error', 'Failed to withdraw funds. Please try again.');
    }
  };

  const renderOverview = () => (
    <View style={styles.tabContent}>
      {/* Goal Progress Card */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <View style={[styles.goalIcon, { backgroundColor: goal.color }]}>
            <Ionicons name={goal.icon as any} size={32} color="white" />
          </View>
          <View style={styles.goalInfo}>
            <Text style={styles.goalTitle}>{goal.title}</Text>
            <Text style={styles.goalDescription}>{goal.description}</Text>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress}%`,
                  backgroundColor: progressColor,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>

        <View style={styles.goalStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Current</Text>
            <Text style={styles.statValue}>{formatCurrency(goal.current_amount)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Target</Text>
            <Text style={styles.statValue}>{formatCurrency(goal.target_amount)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Remaining</Text>
            <Text style={styles.statValue}>
              {formatCurrency(goal.target_amount - goal.current_amount)}
            </Text>
          </View>
        </View>
      </View>

      {/* Goal Timeline */}
      <View style={styles.timelineCard}>
        <Text style={styles.sectionTitle}>Goal Timeline</Text>
        {goal.target_date && (
          <View style={styles.timelineItem}>
            <View style={styles.timelineIcon}>
              <Ionicons name="calendar" size={20} color="#10B981" />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Deadline</Text>
              <Text style={styles.timelineValue}>
                {formatDate(goal.target_date)} ({getDaysRemaining(goal.target_date)} days)
              </Text>
            </View>
          </View>
        )}
        {monthlyNeed !== null && (
          <View style={styles.timelineItem}>
            <View style={styles.timelineIcon}>
              <Ionicons name="calculator" size={20} color="#F59E0B" />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Monthly Need</Text>
              <Text style={styles.timelineValue}>
                {formatCurrency(monthlyNeed)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Linked Budgets Section */}
      {(() => {
        const linkedBudgets = budgets.filter(budget => 
          budget.budget_type === 'goal_based' && budget.goal_id === goal.id
        );
        
        return (
          <View style={styles.linkedBudgetsCard}>
            <Text style={styles.sectionTitle}>Linked Budgets</Text>
            {linkedBudgets.length > 0 ? (
              <View style={styles.linkedBudgetsList}>
                {linkedBudgets.map((budget) => (
                  <BudgetCard
                    key={budget.id}
                    budget={budget}
                    onPress={() => router.push(`/budget/${budget.id}`)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyLinkedBudgets}>
                <Ionicons name="wallet-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
                <Text style={styles.emptyLinkedBudgetsTitle}>No Linked Budgets</Text>
                <Text style={styles.emptyLinkedBudgetsDescription}>
                  Create a goal-based budget to track spending and automatically contribute to this goal
                </Text>
                <TouchableOpacity 
                  style={styles.createBudgetButton}
                  onPress={() => router.push('/(tabs)/budgets')}
                >
                  <Text style={styles.createBudgetText}>Create Budget</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })()}
    </View>
  );

  const renderContributions = () => (
    <View style={styles.tabContent}>
      <View style={styles.addContributionButton}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddContribution(true)}
        >
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addButtonText}>Add Contribution</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contributionsList}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading contributions...</Text>
          </View>
        ) : contributions.length > 0 ? (
          contributions.map((contribution) => (
            <View key={contribution.id} style={styles.contributionCard}>
              <View style={styles.contributionHeader}>
                <View style={styles.contributionIcon}>
                  <Ionicons
                    name={contribution.contribution_type === 'manual' ? 'add-circle' : 'refresh'}
                    size={20}
                    color="#10B981"
                  />
                </View>
                <View style={styles.contributionInfo}>
                  <Text style={styles.contributionDescription}>
                    {contribution.contribution_type === 'manual' ? 'Manual Contribution' : 'Automatic Contribution'}
                  </Text>
                  <Text style={styles.contributionDate}>
                    {formatDate(contribution.created_at)}
                  </Text>
                </View>
                <Text style={styles.contributionAmount}>
                  +{formatCurrency(contribution.amount)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContributions}>
            <Ionicons name="add-circle-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
            <Text style={styles.emptyContributionsTitle}>No Contributions Yet</Text>
            <Text style={styles.emptyContributionsDescription}>
              Start contributing to your goal to see your progress here.
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderMilestones = () => {
    const milestones = [
      { id: 1, amount: goal.target_amount * 0.25, title: '25% Complete', achieved: progress >= 25 },
      { id: 2, amount: goal.target_amount * 0.5, title: '50% Complete', achieved: progress >= 50 },
      { id: 3, amount: goal.target_amount * 0.75, title: '75% Complete', achieved: progress >= 75 },
      { id: 4, amount: goal.target_amount, title: 'Goal Achieved', achieved: progress >= 100 },
    ];

    return (
      <View style={styles.tabContent}>
        <View style={styles.milestonesList}>
          {milestones.map((milestone, index) => (
            <View key={`${goal.id}-milestone-${index}`} style={styles.milestoneCard}>
              <View style={styles.milestoneHeader}>
                <View
                  style={[
                    styles.milestoneIcon,
                    {
                      backgroundColor: milestone.achieved ? '#10B981' : '#6B7280',
                    },
                  ]}
                >
                  <Ionicons
                    name={milestone.achieved ? 'checkmark' : 'flag'}
                    size={20}
                    color="white"
                  />
                </View>
                <View style={styles.milestoneInfo}>
                  <Text style={styles.milestoneTitle}>{milestone.title}</Text>
                  <Text style={styles.milestoneAmount}>
                    {formatCurrency(milestone.amount)}
                  </Text>
                </View>
                {milestone.achieved && (
                  <Text style={styles.milestoneDate}>
                    Achieved!
                  </Text>
                )}
              </View>
              {milestone.achieved && (
                <View style={styles.milestoneProgress}>
                  <View style={styles.milestoneProgressBar}>
                    <View
                      style={[
                        styles.milestoneProgressFill,
                        { backgroundColor: '#10B981' },
                      ]}
                    />
                  </View>
                  <Text style={styles.milestoneProgressText}>Achieved!</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Goal Details</Text>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="create" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'overview' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('overview')}
            >
              <Ionicons 
                name={activeTab === 'overview' ? 'home' : 'home-outline'} 
                size={20} 
                color={activeTab === 'overview' ? '#10B981' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'overview' && styles.activeTabText,
                ]}
              >
                Overview
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'contributions' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('contributions')}
            >
              <Ionicons 
                name={activeTab === 'contributions' ? 'add-circle' : 'add-circle-outline'} 
                size={20} 
                color={activeTab === 'contributions' ? '#10B981' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'contributions' && styles.activeTabText,
                ]}
              >
                Contributions
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'milestones' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('milestones')}
            >
              <Ionicons 
                name={activeTab === 'milestones' ? 'flag' : 'flag-outline'} 
                size={20} 
                color={activeTab === 'milestones' ? '#10B981' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'milestones' && styles.activeTabText,
                ]}
              >
                Milestones
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'contributions' && renderContributions()}
          {activeTab === 'milestones' && renderMilestones()}
        </ScrollView>

        {/* Add Contribution Modal */}
        <AddContributionModal
          visible={showAddContribution}
          onClose={() => setShowAddContribution(false)}
          onSuccess={handleAddContributionSuccess}
          goal={goal}
        />

        {/* Completion Flow Modals */}
        {showCelebration && (
          <GoalCelebrationScreen
            goal={goal}
            onViewSummary={handleViewSummary}
            onWhatsNext={handleWhatsNext}
            onClose={() => setShowCelebration(false)}
          />
        )}

        <WhatsNextModal
          visible={showWhatsNext}
          onClose={() => setShowWhatsNext(false)}
          onExtendGoal={handleExtendGoal}
          onArchiveGoal={handleArchiveGoal}
          onWithdrawFunds={handleWithdrawFunds}
          onDeleteGoal={handleDeleteGoal}
          goal={goal}
        />

        <ExtendGoalModal
          visible={showExtendGoal}
          onClose={() => setShowExtendGoal(false)}
          onExtend={handleExtendGoalConfirm}
          goal={goal}
        />

        <WithdrawFundsModal
          visible={showWithdrawFunds}
          onClose={() => setShowWithdrawFunds(false)}
          onWithdraw={handleWithdrawConfirm}
          goal={goal}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 30,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginLeft: 6,
  },
  activeTabText: {
    color: 'white',
  },
  tabContent: {
    marginBottom: 20,
  },
  progressCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  goalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  goalDescription: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressBar: {
    flex: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    marginRight: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    minWidth: 50,
    textAlign: 'right',
  },
  goalStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  timelineCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  timelineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  timelineValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  addContributionButton: {
    marginBottom: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  contributionsList: {
    marginBottom: 20,
  },
  contributionCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  contributionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contributionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contributionInfo: {
    flex: 1,
  },
  contributionDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  contributionDate: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  contributionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  milestonesList: {
    marginBottom: 20,
  },
  milestoneCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  milestoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  milestoneIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  milestoneAmount: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  milestoneDate: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  milestoneProgress: {
    marginTop: 12,
  },
  milestoneProgressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    marginBottom: 8,
  },
  milestoneProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  milestoneProgressText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  modalBody: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    marginBottom: 20,
  },
  addContributionText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
  },
  errorDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorBackButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorBackButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  emptyContributions: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyContributionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyContributionsDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  linkedBudgetsCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  linkedBudgetsList: {
    gap: 12,
  },
  emptyLinkedBudgets: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyLinkedBudgetsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyLinkedBudgetsDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  createBudgetButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createBudgetText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
