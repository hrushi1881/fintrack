import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import InlineAccountSelector from '@/components/InlineAccountSelector';
import { checkMilestoneAchievements, checkGoalCompletion } from '@/utils/goals';
import { createCategory } from '@/utils/categories';
import { formatCurrencyAmount } from '@/utils/currency';
import { Goal, Account } from '@/types';
import { supabase } from '@/lib/supabase';

interface AddContributionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  goal: Goal | null;
}

export default function AddContributionModal({ 
  visible, 
  onClose, 
  onSuccess, 
  goal 
}: AddContributionModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { showNotification } = useNotification();
  const { accounts, refreshGoals, refreshAccounts, refreshTransactions, globalRefresh } = useRealtimeData();
  
  const [amount, setAmount] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  // Filter accounts - exclude liability and Goals Savings accounts from transactions
  // Goals Savings account is only for displaying aggregate statistics
  // For currency matching: prefer matching currency, but show all if none match
  const sourceAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) {
      console.log('⚠️ add-contribution: No accounts available');
      return [];
    }
    if (!goal) {
      console.log('⚠️ add-contribution: No goal provided');
      return [];
    }
    
    const filtered = accounts.filter(
      (account) => 
        account.type !== 'liability' && 
        account.type !== 'goals_savings' &&
        (account.is_active === true || account.is_active === undefined || account.is_active === null)
    );
    
    // Filter by currency if goal has currency, otherwise show all
    const currencyMatched = goal.currency 
      ? filtered.filter((acc) => acc.currency === goal.currency)
      : filtered;

    // If no currency matches, show all filtered accounts (user can still select)
    const result = currencyMatched.length > 0 ? currencyMatched : filtered;
    
    console.log('✅ add-contribution sourceAccounts:', result.length, 'from', accounts.length, 'total (goal currency:', goal.currency, ')');
    return result;
  }, [accounts, goal]);
  
  const destinationAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) {
      console.log('⚠️ add-contribution: No accounts available for destination');
      return [];
    }
    if (!goal) {
      console.log('⚠️ add-contribution: No goal provided for destination');
      return [];
    }
    
    const filtered = accounts.filter(
      (account) => 
        account.type !== 'liability' && 
        account.type !== 'goals_savings' &&
        (account.is_active === true || account.is_active === undefined || account.is_active === null)
    );
    
    // Filter by currency if goal has currency, otherwise show all
    const currencyMatched = goal.currency 
      ? filtered.filter((acc) => acc.currency === goal.currency)
      : filtered;
    
    // If no currency matches, show all filtered accounts (user can still select)
    const result = currencyMatched.length > 0 ? currencyMatched : filtered;
    
    console.log('✅ add-contribution destinationAccounts:', result.length, 'from', accounts.length, 'total (goal currency:', goal.currency, ')');
    return result;
  }, [accounts, goal]);

  // Refresh accounts when modal opens
  useEffect(() => {
    if (visible) {
      refreshAccounts();
    }
  }, [visible, refreshAccounts]);

  // Initialize accounts when modal opens
  useEffect(() => {
    if (visible && goal) {
      if (sourceAccounts.length > 0 && !sourceAccountId) {
        const firstAccountId = sourceAccounts[0].id;
        setSourceAccountId(firstAccountId);
        // Auto-select same account for destination (user can change it)
        // This allows saving goal funds in the same account they're paying from
        if (!destinationAccountId) {
          setDestinationAccountId(firstAccountId);
        }
      }
      // If source is already selected but destination is not, auto-select same account
      if (sourceAccountId && !destinationAccountId && destinationAccounts.some(acc => acc.id === sourceAccountId)) {
        setDestinationAccountId(sourceAccountId);
      }
      // Fallback: if no source selected yet, just set destination to first available
      if (!sourceAccountId && destinationAccounts.length > 0 && !destinationAccountId) {
        const savingsAccount = destinationAccounts.find((acc) => acc.type === 'bank' || acc.type === 'wallet');
        setDestinationAccountId(savingsAccount?.id || destinationAccounts[0].id);
      }
    }
  }, [visible, sourceAccounts, destinationAccounts, goal, sourceAccountId, destinationAccountId]);


  const handleSubmit = async () => {
    if (!user || !goal) return;

    const amountValue = parseFloat(amount);
    if (!amountValue || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!sourceAccountId) {
      Alert.alert('Error', 'Please select a source account');
      return;
    }

    if (!destinationAccountId) {
      Alert.alert('Error', 'Please select a destination account');
      return;
    }

    // Allow same account - user can save goal funds in the same account they're paying from

    // Contribution always uses personal fund from source account
    // No fund selection needed - always defaults to personal fund

    setLoading(true);
    try {
      // Use the updated addContributionToGoal function
      // Note: The function handles spending from source account and receiving into destination
      // But we need to handle the fund bucket selection ourselves since the function uses personal bucket
      // For now, we'll use the utility function which handles the RPC calls

      // Get Goal Savings category; create if missing
      const { data: goalCategory, error: categoryError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('name', 'Goal Savings')
        .contains('activity_types', ['goal'])
        .eq('is_deleted', false)
        .single();

      let goalCategoryId: string | null = null;
      let categoryName: string = 'Goal Savings';

      if (goalCategory?.id) {
        goalCategoryId = goalCategory.id;
        categoryName = goalCategory.name;
      } else {
        try {
          const created = await createCategory({
            name: 'Goal Savings',
            color: '#10B981',
            icon: 'flag',
            activity_types: ['goal'] as any,
          });
          goalCategoryId = created.id;
          categoryName = created.name;
        } catch (e) {
          throw new Error('Goal Savings category not found');
        }
      }

      // 1) Spend from source account's personal fund (always)
      // Contributions always come from personal funds - no fund selection needed
      const bucketParam = {
        type: 'personal',
        id: null,
      };

      const { data: sourceTxn, error: spendError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user.id,
        p_account_id: sourceAccountId,
        p_bucket: bucketParam,
        p_amount: amountValue,
        p_category: categoryName, // Category name is expected
        p_description: description.trim() || `Contribution to ${goal.title}`,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: goal.currency,
      });
      if (spendError) throw spendError;

      // 2) Receive into destination account as goal bucket
      const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
        p_user_id: user.id,
        p_account_id: destinationAccountId,
        p_bucket_type: 'goal',
        p_bucket_id: goal.id,
        p_amount: amountValue,
        p_category: categoryName,
        p_description: description.trim() || `Contribution to ${goal.title}`,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: goal.currency,
      });
      if (receiveError) throw receiveError;

      // 3) Update goal current amount (sum all goal funds)
      const { data: goalFunds } = await supabase
        .from('account_funds')
        .select('balance')
        .eq('type', 'goal')
        .or(`reference_id.eq.${goal.id},metadata->>goal_id.eq.${goal.id}`);

      const totalGoalAmount = goalFunds?.reduce((sum, fund) => {
        const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0;
        return sum + balance;
      }, 0) || (goal.current_amount + amountValue);

      const isAchieved = totalGoalAmount >= goal.target_amount;
      const { data: updatedGoal, error: goalUpdateError } = await supabase
        .from('goals')
        .update({
          current_amount: totalGoalAmount,
          is_achieved: isAchieved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', goal.id)
        .select()
        .single();
      
      if (goalUpdateError) throw goalUpdateError;

      // 4) Create goal contribution record (with destination_account_id)
      const sourceTransactionId = (sourceTxn as any)?.id || (sourceTxn as any)?.transaction_id || null;
      const { error: contributionError } = await supabase
        .from('goal_contributions')
        .insert({
          goal_id: goal.id,
          transaction_id: sourceTransactionId,
          amount: amountValue,
          source_account_id: sourceAccountId,
          destination_account_id: destinationAccountId, // Account where goal funds are stored
          contribution_type: 'manual',
        });
      if (contributionError) throw contributionError;
      
      // Refresh data
      await globalRefresh();
      
      // Check for milestone achievements
      const milestones = checkMilestoneAchievements(updatedGoal.current_amount, updatedGoal.target_amount);
      const previousMilestones = checkMilestoneAchievements(goal.current_amount, goal.target_amount);
      const newlyAchieved = milestones.filter(
        (m) => m.achieved && !previousMilestones.find((p) => p.milestone === m.milestone)?.achieved
      );
      
      if (newlyAchieved.length > 0) {
        const latestMilestone = newlyAchieved[newlyAchieved.length - 1];
        showNotification({
          type: 'success',
          title: '🎉 Milestone Reached!',
          amount: amountValue,
          currency: currency,
          description: `${latestMilestone.milestone} for "${goal.title}"!`,
        });
      } else {
        const progress = Math.round((updatedGoal.current_amount / updatedGoal.target_amount) * 100);
        showNotification({
          type: 'success',
          title: 'Contribution Added',
          amount: amountValue,
          currency: currency,
          description: `"${goal.title}" - ${progress}% complete!`,
        });
      }

      // Check if goal is completed
      try {
        const { isCompleted } = await checkGoalCompletion(goal.id);
        if (isCompleted) {
          console.log('Goal completed!', goal.title);
        }
      } catch (error) {
        console.error('Error checking goal completion:', error);
      }

      onSuccess?.();
      onClose();
      
      // Reset form
      setAmount('');
      setSourceAccountId('');
      setDestinationAccountId('');
      setDescription('');
    } catch (error: any) {
      console.error('Error adding contribution:', error);
      Alert.alert('Error', error.message || 'Failed to add contribution. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      >
        <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Add Contribution</Text>
              <TouchableOpacity 
                style={[styles.addButton, loading && styles.addButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.addText}>Add</Text>
              </TouchableOpacity>
            </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Goal Info */}
            {goal && (
              <View style={styles.goalInfo}>
                <View style={[styles.goalIcon, { backgroundColor: goal.color }]}>
                  <Ionicons name={goal.icon as any} size={24} color="white" />
                </View>
                <View style={styles.goalDetails}>
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  <Text style={styles.goalProgress}>
                    {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
                  </Text>
                </View>
              </View>
            )}

            {/* Amount Input */}
            <View style={styles.amountSection}>
              <Text style={styles.amountLabel}>Amount</Text>
              <View style={styles.amountInputWrapper}>
                <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                  placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  autoFocus={!amount}
                />
              </View>
                        </View>

            {/* Source Account Selection - Pays from Personal Fund */}
            <InlineAccountSelector
              accounts={sourceAccounts}
              selectedAccountId={sourceAccountId}
              onSelect={(account) => setSourceAccountId(account.id)}
              label="Pay From Account"
              showBalance={true}
            />
            {sourceAccountId && (
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={16} color="#4F6F3E" />
                <Text style={styles.infoText}>
                  Money will be deducted from Personal Funds in this account
                          </Text>
                        </View>
            )}

            {/* Destination Account Selection - Stores as Goal Fund */}
            <InlineAccountSelector
              accounts={destinationAccounts}
              selectedAccountId={destinationAccountId}
              onSelect={(account) => setDestinationAccountId(account.id)}
              label="Store In Account"
              showBalance={true}
            />
            {destinationAccountId && (
              <View style={styles.infoBanner}>
                <Ionicons name="lock-closed-outline" size={16} color="#4F6F3E" />
                <Text style={styles.infoText}>
                  {sourceAccountId === destinationAccountId 
                    ? 'Money will be deducted from Personal Funds and stored as locked Goal Funds in this same account'
                    : 'Money will be stored as locked Goal Funds in this account'}
                    </Text>
              </View>
            )}

              {/* Description */}
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionLabel}>Note (Optional)</Text>
                <TextInput
                style={styles.descriptionInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add a note about this contribution..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                numberOfLines={3}
                />
            </View>
          </ScrollView>
        </View>
        </SafeAreaView>
    </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 16,
    color: '#4F6F3E',
    fontFamily: 'Poppins-SemiBold',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
    letterSpacing: 0.5,
  },
  addButton: {
    backgroundColor: '#4F6F3E',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  addText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9F2',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5ECD6',
  },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  goalDetails: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#0E401C',
    marginBottom: 4,
  },
  goalProgress: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  amountSection: {
    marginBottom: 32,
    alignItems: 'center',
    width: '100%',
  },
  amountLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 24,
    paddingVertical: 24,
    minHeight: 100,
  },
  currencySymbol: {
    fontSize: 32,
    fontFamily: 'Poppins-Regular',
    color: '#9CA3AF',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 40,
    fontFamily: 'Poppins-Bold',
    color: '#1F2937',
    textAlign: 'center',
    paddingVertical: 0,
    minWidth: 120,
  },
  amountInputPlaceholder: {
    color: '#9CA3AF',
  },
  accountsSection: {
    marginBottom: 24,
  },
  fundSourceSection: {
    marginBottom: 24,
  },
  selectedFundCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 16,
  },
  selectedFundInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedFundDetails: {
    flex: 1,
    gap: 4,
  },
  fundSourceLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    marginBottom: 8,
  },
  selectedFundName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
  },
  selectedFundAmount: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  selectFundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7F9F2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 16,
    gap: 12,
  },
  selectFundText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4F6F3E',
  },
  descriptionSection: {
    marginBottom: 24,
  },
  descriptionLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    marginBottom: 8,
  },
  descriptionInput: {
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    borderWidth: 1,
    borderColor: '#E5ECD6',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    padding: 12,
    marginTop: -8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
});
