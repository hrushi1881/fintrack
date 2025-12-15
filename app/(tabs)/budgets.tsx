import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatCurrencyAmount } from '@/utils/currency';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { BudgetCard } from '@/components/BudgetCard';
import { useSettings } from '@/contexts/SettingsContext';
import AddBudgetModal from '@/app/modals/add-budget';
import ActionSheet, { ActionSheetItem } from '@/components/ActionSheet';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Budget } from '@/types';
import GlassCard from '@/components/GlassCard';

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

  // Calculate summary statistics
  const totalBudgets = activeBudgets.length;
  const totalSpent = activeBudgets.reduce((sum, b) => sum + b.spent_amount, 0);
  const totalAmount = activeBudgets.reduce((sum, b) => sum + b.amount, 0);

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
      <GlassCard padding={48} marginVertical={24}>
        <View style={styles.emptyContainer}>
          <Ionicons 
            name={isActive ? "wallet-outline" : "checkmark-circle-outline"} 
            size={48} 
            color="rgba(0, 0, 0, 0.4)" 
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
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.createButtonText}>Create Budget</Text>
            </TouchableOpacity>
          )}
        </View>
      </GlassCard>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refreshBudgets}
              tintColor="#000000"
            />
          }
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Budgets</Text>
            <TouchableOpacity style={styles.iconButton} onPress={handleAddBudget}>
              <Ionicons name="add" size={22} color="#0E401C" />
            </TouchableOpacity>
          </View>

          {/* Summary Card */}
          {activeTab === 'active' && totalBudgets > 0 && (
            <GlassCard padding={24} marginVertical={20}>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Active Budgets</Text>
                  <Text style={styles.summaryValue}>{totalBudgets}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Spent</Text>
                  <Text style={styles.summaryValue}>{formatCurrencyAmount(totalSpent, currency)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Budget</Text>
                  <Text style={styles.summaryValue}>{formatCurrencyAmount(totalAmount, currency)}</Text>
                </View>
              </View>
            </GlassCard>
          )}

          {/* Segmented Control */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                activeTab === 'active' && styles.segmentButtonActive,
              ]}
              onPress={() => setActiveTab('active')}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === 'active' && styles.segmentTextActive,
                ]}
              >
                Active ({activeBudgets.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                activeTab === 'completed' && styles.segmentButtonActive,
              ]}
              onPress={() => setActiveTab('completed')}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === 'completed' && styles.segmentTextActive,
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
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
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
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Archivo Black',
    color: '#000000',
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    minWidth: '30%',
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#000000',
  },
  segmentText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
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
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    marginTop: 4,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  createButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
});