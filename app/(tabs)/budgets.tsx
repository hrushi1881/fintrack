import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatCurrencyAmount } from '@/utils/currency';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { BudgetCard } from '@/components/BudgetCard';
import { useSettings } from '@/contexts/SettingsContext';
import { AddBudgetModal } from '@/app/modals/add-budget';
import ActionSheet, { ActionSheetItem } from '@/components/ActionSheet';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Budget } from '@/types';

export default function BudgetsScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('active');
  const [showAddBudget, setShowAddBudget] = useState(false);
  const { budgets, loading, refreshBudgets } = useRealtimeData();
  const { currency } = useSettings();
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);

  // Filter budgets based on active tab
  const activeBudgets = budgets.filter(budget => budget.is_active);
  const completedBudgets = budgets.filter(budget => !budget.is_active);

  const handleAddBudget = () => {
    setShowAddBudget(true);
  };

  const handleBudgetPress = (budget: any) => {
    router.push(`/budget/${budget.id}` as any);
  };

  const handleMoreOptions = (budget: Budget, event: any) => {
    event?.stopPropagation?.();
    setSelectedBudget(budget);
    setShowActionSheet(true);
  };

  const handleEdit = () => {
    if (!selectedBudget) return;
    router.push(`/budget/${selectedBudget.id}?action=edit` as any);
    setShowActionSheet(false);
  };

  const handleArchive = async () => {
    if (!selectedBudget) return;
    
    Alert.alert(
      'Archive Budget',
      `Archive "${selectedBudget.name}"? Archived budgets won't appear in your active list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('budgets')
                .update({ is_active: false })
                .eq('id', selectedBudget.id)
                .eq('user_id', user?.id);
              
              if (error) throw error;
              await refreshBudgets();
              setShowActionSheet(false);
              Alert.alert('Success', 'Budget archived successfully!');
            } catch (error) {
              console.error('Error archiving budget:', error);
              Alert.alert('Error', 'Failed to archive budget. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleUnarchive = async () => {
    if (!selectedBudget) return;
    
    try {
      const { error } = await supabase
        .from('budgets')
        .update({ is_active: true })
        .eq('id', selectedBudget.id)
        .eq('user_id', user?.id);
      
      if (error) throw error;
      await globalRefresh();
      setShowActionSheet(false);
    } catch (error) {
      console.error('Error unarchiving budget:', error);
      Alert.alert('Error', 'Failed to unarchive budget. Please try again.');
    }
  };

  const handleDelete = () => {
    if (!selectedBudget) return;
    
    Alert.alert(
      'Delete Budget',
      `Are you sure you want to delete "${selectedBudget.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('budgets')
                .update({ 
                  is_deleted: true,
                  is_active: false,
                  deleted_at: new Date().toISOString(),
                })
                .eq('id', selectedBudget.id)
                .eq('user_id', user?.id);
              
              if (error) throw error;
              await refreshBudgets();
              setShowActionSheet(false);
            } catch (error) {
              console.error('Error deleting budget:', error);
              Alert.alert('Error', 'Failed to delete budget. Please try again.');
            }
          },
        },
      ]
    );
  };

  const getActionSheetItems = (budget: Budget): ActionSheetItem[] => {
    const isArchived = !budget.is_active;
    
    const items: ActionSheetItem[] = [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'create-outline',
        onPress: handleEdit,
      },
    ];

    items.push({
      id: 'separator',
      label: '',
      icon: 'ellipsis-horizontal',
      onPress: () => {},
      separator: true,
      disabled: true,
    });

    if (isArchived) {
      items.push({
        id: 'unarchive',
        label: 'Unarchive',
        icon: 'archive-outline',
        onPress: handleUnarchive,
      });
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

  const renderEmptyState = (type: 'active' | 'completed') => {
    const isActive = type === 'active';
    return (
      <View style={styles.emptyContainer}>
        <Ionicons 
          name={isActive ? "wallet-outline" : "checkmark-circle-outline"} 
          size={64} 
          color="#D1D5DB" 
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
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refreshBudgets}
              tintColor="#10B981"
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft} />
            <Text style={styles.headerTitle}>Budgets</Text>
            <TouchableOpacity style={styles.addButton} onPress={handleAddBudget}>
              <Ionicons name="add" size={24} color="#000000" />
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
                    onMoreOptions={handleMoreOptions}
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
                    onMoreOptions={handleMoreOptions}
                  />
                ))
              ) : (
                renderEmptyState('completed')
              )
            )}
          </View>

          {/* Add Budget Button */}
          {activeTab === 'active' && activeBudgets.length > 0 && (
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

      {/* Action Sheet */}
      <ActionSheet
        visible={showActionSheet}
        onClose={() => {
          setShowActionSheet(false);
          setSelectedBudget(null);
        }}
        items={selectedBudget ? getActionSheetItems(selectedBudget) : []}
        title={selectedBudget?.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // White background
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Archivo Black', // Archivo Black for page headings
    fontWeight: '900',
    color: '#000000', // Black text
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
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
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#000000', // Black text
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
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
    backgroundColor: '#10B981', // Dark green button
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  addBudgetText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold', // Poppins for headings
    fontWeight: '600',
    color: '#FFFFFF', // White text on button
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#000000', // Black text
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#10B981', // Dark green button
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#FFFFFF', // White text on button
  },
});