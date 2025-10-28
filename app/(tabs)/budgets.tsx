import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatCurrencyAmount } from '@/utils/currency';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { BudgetCard } from '@/components/BudgetCard';
import { useSettings } from '@/contexts/SettingsContext';
import { AddBudgetModal } from '@/app/modals/add-budget';

export default function BudgetsScreen() {
  const [activeTab, setActiveTab] = useState('active');
  const [showAddBudget, setShowAddBudget] = useState(false);
  const { budgets, loading, refreshBudgets } = useRealtimeData();
  const { currency } = useSettings();

  // Filter budgets based on active tab
  const activeBudgets = budgets.filter(budget => budget.is_active);
  const completedBudgets = budgets.filter(budget => !budget.is_active);

  const handleAddBudget = () => {
    setShowAddBudget(true);
  };

  const handleBudgetPress = (budget: any) => {
    router.push(`/budget/${budget.id}` as any);
  };

  const renderEmptyState = (type: 'active' | 'completed') => {
    const isActive = type === 'active';
    return (
      <View style={styles.emptyContainer}>
        <Ionicons 
          name={isActive ? "wallet-outline" : "checkmark-circle-outline"} 
          size={64} 
          color="rgba(255, 255, 255, 0.5)" 
        />
        <Text style={styles.emptyTitle}>
          {isActive ? 'No Active Budgets' : 'No Completed Budgets'}
        </Text>
        <Text style={styles.emptyDescription}>
          {isActive 
            ? 'Create your first budget to start tracking your spending'
            : 'Your completed budgets will appear here'
          }
        </Text>
        {isActive && (
          <TouchableOpacity style={styles.createButton} onPress={handleAddBudget}>
            <Text style={styles.createButtonText}>Create Budget</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#99D795" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refreshBudgets}
              tintColor="white"
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft} />
            <Text style={styles.headerTitle}>Budgets</Text>
            <TouchableOpacity style={styles.addButton} onPress={handleAddBudget}>
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
                Active ({activeBudgets.length})
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
                Completed ({completedBudgets.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Budgets List */}
          <View style={styles.budgetsList}>
            {activeTab === 'active' ? (
              activeBudgets.length > 0 ? (
                activeBudgets.map((budget) => (
                  <BudgetCard
                    key={budget.id}
                    budget={budget}
                    onPress={() => handleBudgetPress(budget)}
                  />
                ))
              ) : (
                renderEmptyState('active')
              )
            ) : (
              completedBudgets.length > 0 ? (
                completedBudgets.map((budget) => (
                  <BudgetCard
                    key={budget.id}
                    budget={budget}
                    onPress={() => handleBudgetPress(budget)}
                  />
                ))
              ) : (
                renderEmptyState('completed')
              )
            )}
          </View>

          {/* Add Budget Button */}
          {activeTab === 'active' && (
            <TouchableOpacity style={styles.addBudgetButton} onPress={handleAddBudget}>
              <Ionicons name="add-circle" size={24} color="#10B981" />
              <Text style={styles.addBudgetText}>Add New Budget</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>

      <AddBudgetModal
        visible={showAddBudget}
        onClose={() => setShowAddBudget(false)}
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
  budgetsList: {
    marginBottom: 20,
  },
  budgetCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  budgetIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  budgetInfo: {
    flex: 1,
  },
  budgetCategory: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  budgetPeriod: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  budgetAmount: {
    alignItems: 'flex-end',
  },
  budgetSpent: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  budgetTotal: {
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
  budgetStats: {
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
  addBudgetButton: {
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
  addBudgetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});