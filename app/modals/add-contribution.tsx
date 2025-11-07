import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import FundPicker, { FundBucket } from '@/components/FundPicker';
import { supabase } from '@/lib/supabase';
import { addContributionToGoal, AddContributionData, checkMilestoneAchievements, checkGoalCompletion } from '@/utils/goals';
import { createCategory } from '@/utils/categories';
import { formatCurrencyAmount } from '@/utils/currency';
import { Goal } from '@/types';

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
  const { accounts, refreshGoals, refreshAccounts, refreshTransactions } = useRealtimeData();
  
  const [amount, setAmount] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);

  // Filter out Goals Savings Account from source accounts
  const availableAccounts = accounts.filter(account => account.type !== 'goals_savings');

  useEffect(() => {
    if (visible && availableAccounts.length > 0 && !sourceAccountId) {
      setSourceAccountId(availableAccounts[0].id);
    }
  }, [visible, availableAccounts, sourceAccountId]);

  // Reset fund bucket when source account changes
  useEffect(() => {
    if (sourceAccountId && selectedFundBucket) {
      setSelectedFundBucket(null);
    }
  }, [sourceAccountId]);

  // Auto-show fund picker when account is selected
  useEffect(() => {
    if (visible && sourceAccountId && !selectedFundBucket) {
      setShowFundPicker(true);
    }
  }, [visible, sourceAccountId]);

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

    const sourceAccount = availableAccounts.find(acc => acc.id === sourceAccountId);
    if (!sourceAccount) {
      Alert.alert('Error', 'Source account not found');
      return;
    }

    // We rely on bucket-aware deduction; base balance check is not sufficient when using liability/goal buckets

    if (!selectedFundBucket) {
      Alert.alert('Error', 'Please select a fund source');
      return;
    }

    setLoading(true);
    try {
      // Get Goals Savings Account
      const { data: goalsAccount, error: goalsAccErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'goals_savings')
        .single();
      if (goalsAccErr || !goalsAccount) throw new Error('Goals Savings Account not found');

      // Get Goal Savings category; create if missing
      let goalCategoryId: string | null = null;
      const { data: goalCategory, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', 'Goal Savings')
        .contains('activity_types', ['goal'])
        .eq('is_deleted', false)
        .single();
      if (goalCategory?.id) {
        goalCategoryId = goalCategory.id;
      } else {
        try {
          const created = await createCategory({
            name: 'Goal Savings',
            color: '#10B981',
            icon: 'flag',
            activity_types: ['goal'] as any,
          });
          goalCategoryId = created.id;
        } catch (e) {
          throw new Error('Goal Savings category not found');
        }
      }

      // 1) Deduct from selected bucket using spend_from_account_bucket
      const bucketParam = {
        type: selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };

      const { data: sourceTxn, error: bucketErr } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user.id,
        p_account_id: sourceAccountId,
        p_bucket: bucketParam,
        p_amount: amountValue,
        p_category: goalCategoryId,
        p_description: description.trim() || `Contribution to ${goal.title}`,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: goal.currency,
      });
      if (bucketErr) throw bucketErr;

      // 2) Receive into Goals Savings account as goal bucket using RPC
      // Get category name for the RPC (it expects category name, not ID)
      const { data: goalCategoryData } = await supabase
        .from('categories')
        .select('name')
        .eq('id', goalCategoryId)
        .single();
      
      const categoryName = goalCategoryData?.name || 'Goal Savings';

      const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
        p_user_id: user.id,
        p_account_id: goalsAccount.id,
        p_bucket_type: 'goal',
        p_bucket_id: goal.id,
        p_amount: amountValue,
        p_category: categoryName,
        p_description: description.trim() || `Contribution to ${goal.title}`,
        p_date: new Date().toISOString().split('T')[0],
        p_notes: `Contribution from ${accounts.find(acc => acc.id === sourceAccountId)?.name || 'account'}`,
        p_currency: goal.currency,
      });
      if (receiveError) throw receiveError;

      // 3) Get the transaction ID from the source transaction (spend_from_account_bucket result)
      // The receive_to_account_bucket creates a transaction internally, but we need to link it
      // Let's fetch the most recent transaction for this goal contribution
      const { data: recentTransactions, error: fetchTxnError } = await supabase
        .from('transactions')
        .select('id')
        .eq('account_id', goalsAccount.id)
        .eq('type', 'income')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (fetchTxnError) {
        console.warn('Could not fetch transaction ID for goal contribution:', fetchTxnError);
      }

      // 4) Create goal contribution record (link to the expense transaction from source account)
      const sourceTransactionId = (sourceTxn as any)?.id || (sourceTxn as any)?.transaction_id || null;
      const { error: contributionError } = await supabase
        .from('goal_contributions')
        .insert({
          goal_id: goal.id,
          transaction_id: sourceTransactionId || recentTransactions?.id,
          amount: amountValue,
          source_account_id: sourceAccountId,
          contribution_type: 'manual',
        });
      if (contributionError) throw contributionError;
      
      // Refresh data to show updated goal progress and account balances
      await Promise.all([
        refreshGoals(),
        refreshAccounts(),
        refreshTransactions(),
      ]);
      
      // Small delay to ensure database has committed and state has updated
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check if goal is now completed
      try {
        const { isCompleted } = await checkGoalCompletion(goal.id);
        if (isCompleted) {
          // Goal completed! The celebration will be handled by the goal detail page
          console.log('Goal completed!', goal.title);
        }
      } catch (error) {
        console.error('Error checking goal completion:', error);
      }
      
      const progress = Math.round((updatedGoal.current_amount / updatedGoal.target_amount) * 100);
      
      // Check for milestone achievements
      const milestones = checkMilestoneAchievements(updatedGoal.current_amount, updatedGoal.target_amount);
      const newlyAchieved = milestones.filter(m => m.achieved && 
        checkMilestoneAchievements(goal.current_amount, goal.target_amount).find(
          prev => prev.milestone === m.milestone
        )?.achieved === false
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
        showNotification({
          type: 'success',
          title: 'Contribution Added',
          amount: amountValue,
          currency: currency,
          description: `"${goal.title}" - ${progress}% complete!`,
        });
      }

      onSuccess?.();
      onClose();
      
      // Reset form
      setAmount('');
      setSourceAccountId('');
      setDescription('');
    } catch (error) {
      console.error('Error adding contribution:', error);
      Alert.alert('Error', 'Failed to add contribution. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const selectedAccount = availableAccounts.find(acc => acc.id === sourceAccountId);
  
  // Styles for selected fund info

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <LinearGradient
        colors={['#99D795', '#99D795', '#99D795']}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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

            {/* Form */}
            <View style={styles.form}>
              {/* Amount */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>
                    {formatCurrencyAmount(0, currency).charAt(0)}
                  </Text>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>
                {amount && parseFloat(amount) > 0 && (
                  <Text style={styles.amountPreview}>
                    {formatCurrency(parseFloat(amount))}
                  </Text>
                )}
              </View>

              {/* Source Account */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>From Account</Text>
                <View style={styles.accountSelector}>
                  {availableAccounts.map((account) => (
                    <TouchableOpacity
                      key={account.id}
                      style={[
                        styles.accountOption,
                        sourceAccountId === account.id && styles.accountOptionSelected
                      ]}
                      onPress={() => {
                        setSourceAccountId(account.id);
                        setShowFundPicker(true);
                      }}
                    >
                      <View style={styles.accountInfo}>
                        <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                          <Ionicons name={account.icon as any} size={20} color="white" />
                        </View>
                        <View style={styles.accountDetails}>
                          <Text style={styles.accountName}>{account.name}</Text>
                          <Text style={styles.accountBalance}>
                            Balance: {formatCurrency(account.balance)}
                          </Text>
                        </View>
                      </View>
                      {sourceAccountId === account.id && (
                        <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                {sourceAccountId && selectedFundBucket && (
                  <View style={styles.selectedFundInfo}>
                    <Ionicons 
                      name={
                        selectedFundBucket.type === 'personal' ? 'wallet' :
                        selectedFundBucket.type === 'liability' ? 'card' :
                        'flag'
                      } 
                      size={16} 
                      color="#10B981" 
                    />
                    <Text style={styles.selectedFundText}>
                      Using: {selectedFundBucket.name}
                    </Text>
                    <TouchableOpacity onPress={() => setShowFundPicker(true)}>
                      <Text style={styles.changeFundText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Note (Optional)</Text>
                <TextInput
                  style={[styles.textInput, styles.multilineInput]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add a note about this contribution..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Preview */}
              {amount && sourceAccountId && selectedAccount && (
                <View style={styles.previewContainer}>
                  <Text style={styles.previewTitle}>Preview</Text>
                  <View style={styles.previewCard}>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>Transfer</Text>
                      <Text style={styles.previewValue}>
                        {formatCurrency(parseFloat(amount))}
                      </Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>From</Text>
                      <Text style={styles.previewValue}>{selectedAccount.name}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>To</Text>
                      <Text style={styles.previewValue}>Goals Savings</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>For</Text>
                      <Text style={styles.previewValue}>{goal?.title}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
        {/* FundPicker Modal */}
        <FundPicker
          visible={showFundPicker}
          onClose={() => setShowFundPicker(false)}
          accountId={sourceAccountId}
          amount={amount ? parseFloat(amount) : 0}
          onSelect={(bucket) => {
            setSelectedFundBucket(bucket);
            setShowFundPicker(false);
          }}
        />
      </LinearGradient>
    </Modal>
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
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  addButton: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  addText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  goalDetails: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  goalProgress: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  currencySymbol: {
    fontSize: 18,
    color: 'white',
    fontWeight: '600',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    color: 'white',
    paddingVertical: 16,
  },
  amountPreview: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  accountSelector: {
    gap: 8,
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  accountOptionSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  accountBalance: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  accountDetailText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  multilineInput: {
    height: 60,
    textAlignVertical: 'top',
  },
  previewContainer: {
    marginTop: 8,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
  },
  previewCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  selectedFundInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    gap: 8,
  },
  selectedFundText: {
    flex: 1,
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  changeFundText: {
    fontSize: 14,
    color: '#10B981',
    textDecorationLine: 'underline',
  },
});
