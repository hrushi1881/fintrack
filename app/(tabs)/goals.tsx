import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import GoalCard from '@/components/GoalCard';
import AddGoalModal from '../modals/add-goal';

export default function GoalsScreen() {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { goals, loading, refreshGoals } = useRealtimeData();
  const [activeTab, setActiveTab] = useState('active');
  const [addGoalModalVisible, setAddGoalModalVisible] = useState(false);

  // Filter goals based on active tab
  const activeGoals = goals.filter(goal => !goal.is_achieved);
  const completedGoals = goals.filter(goal => goal.is_achieved);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const handleGoalPress = (goalId: string) => {
    router.push(`/goal/${goalId}` as any);
  };

  const handleAddGoalSuccess = () => {
    refreshGoals();
  };

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#99D795" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft} />
            <Text style={styles.headerTitle}>Financial Goals</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setAddGoalModalVisible(true)}
            >
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'active' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('active')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'active' && styles.activeTabText,
                ]}
              >
                Active ({activeGoals.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'completed' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('completed')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'completed' && styles.activeTabText,
                ]}
              >
                Completed ({completedGoals.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Goals List */}
          <View style={styles.goalsList}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading goals...</Text>
              </View>
            ) : activeTab === 'active' ? (
              activeGoals.length > 0 ? (
                activeGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onPress={() => handleGoalPress(goal.id)}
                  />
                ))
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="flag-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
                  <Text style={styles.emptyTitle}>No Active Goals</Text>
                  <Text style={styles.emptyDescription}>
                    Start saving for what matters! Create your first goal.
                  </Text>
                </View>
              )
            ) : (
              completedGoals.length > 0 ? (
                completedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onPress={() => handleGoalPress(goal.id)}
                  />
                ))
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="checkmark-circle-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
                  <Text style={styles.emptyTitle}>No Completed Goals</Text>
                  <Text style={styles.emptyDescription}>
                    Keep saving! Your completed goals will appear here.
                  </Text>
                </View>
              )
            )}
          </View>

          {/* Add Goal Button */}
          <TouchableOpacity 
            style={styles.addGoalButton}
            onPress={() => setAddGoalModalVisible(true)}
          >
            <Ionicons name="add-circle" size={24} color="#10B981" />
            <Text style={styles.addGoalText}>Add New Goal</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* Add Goal Modal */}
      <AddGoalModal
        visible={addGoalModalVisible}
        onClose={() => setAddGoalModalVisible(false)}
        onSuccess={handleAddGoalSuccess}
      />
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
  headerLeft: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  activeTabText: {
    color: 'white',
  },
  goalsList: {
    marginBottom: 20,
  },
  goalCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
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
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#10B981',
    borderStyle: 'dashed',
  },
  addGoalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
});