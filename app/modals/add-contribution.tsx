import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import InlineAccountSelector from '@/components/InlineAccountSelector';
import FundPicker, { FundBucket } from '@/components/FundPicker';
import { 
  addContributionToGoal,
  checkMilestoneAchievements, 
  checkGoalCompletion,
  validateContributionData,
  getGoalAccounts,
  getLinkedAccountsForGoal,
} from '@/utils/goals';
import { formatCurrencyAmount } from '@/utils/currency';
import { Goal, Account } from '@/types';

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
  const { accounts, globalRefresh, refreshAccounts } = useRealtimeData();
  
  const [amount, setAmount] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFundPicker, setShowFundPicker] = useState(false);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [goalAccounts, setGoalAccounts] = useState<Array<{ account: Account; balance: number }>>([]);
  const [loadingGoalAccounts, setLoadingGoalAccounts] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<Account[]>([]);
  const [loadingLinkedAccounts, setLoadingLinkedAccounts] = useState(false);

  // Source accounts: ALL accounts (except inactive ones) - user can contribute from any account
  // Prioritize accounts that have goal funds for this goal or are linked
  // Then include all other accounts
  const sourceAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) {
      console.log('⚠️ add-contribution: No accounts available');
      return [];
    }
    
    const accountMap = new Map<string, Account & { hasGoalFunds?: boolean; isLinked?: boolean }>();
    
    // First priority: Accounts that have goal funds for this goal (these are the accounts shown in Goal Funds Breakdown)
    goalAccounts.forEach(({ account }) => {
      // Include ALL active accounts (no type restrictions) - user can contribute from any account
      if (
        (account.is_active === true || account.is_active === undefined || account.is_active === null) &&
        account.currency // Ensure currency exists
      ) {
        accountMap.set(account.id, { 
          ...account as Account,
          hasGoalFunds: true,
          isLinked: false
        });
      }
    });
    
    // Second priority: Linked accounts (accounts linked to the goal via goal_accounts)
    linkedAccounts.forEach((account) => {
      // Include ALL active accounts (no type restrictions) - user can contribute from any account
      if (
        (account.is_active === true || account.is_active === undefined || account.is_active === null) &&
        account.currency // Ensure currency exists
      ) {
        // Don't override if account already in map (from goalAccounts)
        if (!accountMap.has(account.id)) {
          accountMap.set(account.id, { 
            ...account as Account,
            hasGoalFunds: false,
            isLinked: true
          });
        } else {
          // Mark as linked if it's already in map from goalAccounts
          const existing = accountMap.get(account.id)!;
          accountMap.set(account.id, { ...existing, isLinked: true });
        }
      }
    });
    
    // Third priority: ALL other accounts (no type restrictions) - user can contribute from any account
    accounts.forEach((account) => {
      const acc = account as Account;
      // Include ALL active accounts with currency - user can contribute from any account type
      // (liability accounts, goals_savings accounts, etc. are all allowed)
      // The only restriction is fund type: goal funds cannot be used for contributions (enforced by FundPicker)
      if (
        (acc.is_active === true || acc.is_active === undefined || acc.is_active === null) &&
        acc.currency // Ensure currency exists
      ) {
        // Only add if not already in map (prioritized accounts already added)
        if (!accountMap.has(acc.id)) {
          accountMap.set(acc.id, { 
            ...acc,
            hasGoalFunds: false,
            isLinked: false
          });
        }
      }
    });
    
    // Convert to array and sort: accounts with goal funds first, then linked accounts, then others
    const result = Array.from(accountMap.values());
    result.sort((a, b) => {
      // Accounts with goal funds come first
      if (a.hasGoalFunds && !b.hasGoalFunds) return -1;
      if (!a.hasGoalFunds && b.hasGoalFunds) return 1;
      // Linked accounts come second
      if (a.isLinked && !b.isLinked) return -1;
      if (!a.isLinked && b.isLinked) return 1;
      // Otherwise alphabetical
      return a.name.localeCompare(b.name);
    });
    
    console.log('✅ add-contribution sourceAccounts:', result.length, 'total (prioritized: goal funds:', goalAccounts.length, 'linked:', linkedAccounts.length, ')');
    return result as Account[];
  }, [accounts, goalAccounts, linkedAccounts]);
  
  // Destination accounts: ONLY show accounts that are linked to the goal OR have goal funds for this goal
  // These are the accounts selected by users while creating the goal + accounts that have funds in them
  // Do NOT show all accounts - only show relevant accounts for this specific goal
  const destinationAccounts = useMemo(() => {
    if (!goal) {
      console.log('⚠️ add-contribution: No goal provided for destination');
      return [];
    }
    
    // Use goal's currency - accounts with goal funds MUST match goal currency
    // Linked accounts should also match goal currency (they were selected for this goal)
    const targetCurrency = goal.currency || currency || 'INR';
    
    const accountMap = new Map<string, Account & { goalFundBalance?: number; isLinked?: boolean }>();
    
    // First priority: Add accounts that have goal funds for this goal (accounts shown in "Goal Funds Breakdown")
    // These accounts MUST appear in "Account to Stay In" because they already hold funds for this goal
    // DO NOT filter by currency here - if account has goal funds, it's valid for this goal
    goalAccounts.forEach(({ account, balance }) => {
      const acc = account as Account;
      // Only exclude liability/goals_savings and inactive accounts
      // Currency check not needed - if it has goal funds, it's valid
      if (
        acc.type !== 'liability' &&
        acc.type !== 'goals_savings' &&
        (acc.is_active === true || acc.is_active === undefined || acc.is_active === null)
      ) {
        accountMap.set(acc.id, {
          ...acc,
          goalFundBalance: balance,
          isLinked: false, // Will be updated below if also linked
        } as Account & { goalFundBalance?: number; isLinked?: boolean });
      }
    });
    
    // Second priority: Add linked accounts (accounts selected by user when creating the goal)
    // These accounts were explicitly chosen to store goal funds
    // Filter by goal currency to ensure compatibility
    if (linkedAccounts && linkedAccounts.length > 0) {
      linkedAccounts.forEach((acc) => {
        // Filter by goal currency - linked accounts should match goal currency
        if (
          acc.type !== 'liability' &&
          acc.type !== 'goals_savings' &&
          (acc.is_active === true || acc.is_active === undefined || acc.is_active === null) &&
          acc.currency === targetCurrency
        ) {
          if (accountMap.has(acc.id)) {
            // Account already in map from goalAccounts - mark as linked
            const existing = accountMap.get(acc.id)!;
            accountMap.set(acc.id, { ...existing, isLinked: true });
          } else {
            // Account not in map - add it as linked account
            // Get goal fund balance if it exists for this account
            const goalAccount = goalAccounts.find(ga => ga.account.id === acc.id);
            accountMap.set(acc.id, {
              ...acc,
              goalFundBalance: goalAccount?.balance ?? 0,
              isLinked: true,
            } as Account & { goalFundBalance?: number; isLinked?: boolean });
          }
        }
      });
    }
    
    const result = Array.from(accountMap.values());
    
    // Sort: linked accounts with funds first, then linked accounts without funds, then accounts with funds (not linked), then others
    result.sort((a, b) => {
      const aHasFunds = (a.goalFundBalance ?? 0) > 0;
      const bHasFunds = (b.goalFundBalance ?? 0) > 0;
      const aIsLinked = a.isLinked ?? false;
      const bIsLinked = b.isLinked ?? false;
      
      // Linked with funds > Linked without funds > Non-linked with funds > Non-linked without funds
      if (aIsLinked && aHasFunds && !(bIsLinked && bHasFunds)) return -1;
      if (bIsLinked && bHasFunds && !(aIsLinked && aHasFunds)) return 1;
      if (aIsLinked && !bIsLinked) return -1;
      if (bIsLinked && !aIsLinked) return 1;
      if (aHasFunds && !bHasFunds) return -1;
      if (bHasFunds && !aHasFunds) return 1;
      return a.name.localeCompare(b.name);
    });
    
    console.log('✅ add-contribution destinationAccounts:', result.length, '(ONLY linked accounts + accounts with goal funds. Linked:', linkedAccounts?.length || 0, 'with funds:', goalAccounts.length, ')');
    console.log('   - Accounts with funds:', goalAccounts.map(ga => `${ga.account.name} (${ga.account.currency})`).join(', '));
    console.log('   - Linked accounts:', linkedAccounts.map(la => `${la.name} (${la.currency})`).join(', '));
    console.log('   - Goal currency:', targetCurrency);
    return result;
  }, [linkedAccounts, goal, goalAccounts, currency]);

  // Fetch accounts with existing goal funds for this goal
  const fetchGoalAccounts = async () => {
    if (!goal) return;
    
    try {
      setLoadingGoalAccounts(true);
      const accountsWithFunds = await getGoalAccounts(goal.id, true);
      setGoalAccounts(accountsWithFunds);
      console.log(`📊 Add Contribution: Fetched ${accountsWithFunds.length} account(s) with existing goal funds for "${goal.title}"`);
      accountsWithFunds.forEach(ga => {
        console.log(`   - ${ga.account.name}: ${ga.balance} ${ga.account.currency}`);
      });
    } catch (error) {
      console.error('Error fetching goal accounts:', error);
      // Don't show alert - just log error, modal can still work without this info
    } finally {
      setLoadingGoalAccounts(false);
    }
  };

  // Fetch linked accounts for the goal
  const fetchLinkedAccounts = async () => {
    if (!goal) return;
    
    try {
      setLoadingLinkedAccounts(true);
      const accounts = await getLinkedAccountsForGoal(goal.id);
      setLinkedAccounts(accounts);
      console.log(`📊 Add Contribution: Fetched ${accounts.length} linked account(s) for "${goal.title}"`);
      accounts.forEach(acc => {
        console.log(`   - ${acc.name} (${acc.currency})`);
      });
    } catch (error) {
      console.error('Error fetching linked accounts:', error);
      // Don't show alert - just log error, modal can still work without this info
    } finally {
      setLoadingLinkedAccounts(false);
    }
  };

  // Refresh accounts and fetch goal accounts when modal opens
  useEffect(() => {
    if (visible && goal) {
      refreshAccounts();
      // Fetch goal-specific accounts (accounts with funds + linked accounts)
      // These are critical for destination accounts
      fetchGoalAccounts();
      fetchLinkedAccounts();
    } else if (!visible) {
      // Reset state when modal closes
      setGoalAccounts([]);
      setLinkedAccounts([]);
      setSourceAccountId('');
      setDestinationAccountId('');
      setSelectedFundBucket(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, goal?.id]); // Only re-run when modal visibility or goal ID changes

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

    if (!selectedFundBucket) {
      Alert.alert('Select Fund Source', 'Please select which fund to deduct from by tapping on the account card.');
      return;
    }

    // Validate fund has sufficient balance
    if (selectedFundBucket.amount < amountValue) {
      Alert.alert('Insufficient Funds', `Selected fund (${selectedFundBucket.name}) has only ${formatCurrency(selectedFundBucket.amount)}. You need ${formatCurrency(amountValue)}.`);
      return;
    }

    // Validate contribution data
    // Use currency from settings (not goal currency) for goals
    const contributionData = {
      goal_id: goal.id,
      amount: amountValue,
      source_account_id: sourceAccountId,
      destination_account_id: destinationAccountId,
      description: description.trim(),
      date: date.toISOString().split('T')[0],
      currency: currency, // Pass currency from settings instead of goal currency
      fund_bucket: selectedFundBucket ? {
        type: selectedFundBucket.type,
        id: selectedFundBucket.id === 'personal' ? null : selectedFundBucket.id,
      } : undefined, // Pass selected fund bucket (map FundBucket to AddContributionData format)
    };

    const validation = validateContributionData(contributionData);
    if (!validation.valid) {
      Alert.alert('Validation Error', validation.errors.join('\n'));
      return;
    }

    setLoading(true);
    try {
      // Use utility function - handles all business logic
      const { goal: updatedGoal } = await addContributionToGoal(contributionData);
      
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

      // Check if goal can be completed (but don't auto-complete - manual)
      try {
        const { canComplete } = await checkGoalCompletion(goal.id);
        if (canComplete) {
          console.log('Goal can be completed!', goal.title);
          // User will manually complete when ready
        }
      } catch (error) {
        console.error('Error checking goal completion:', error);
      }

      onSuccess?.();
      
      // Reset form but keep modal open
      setAmount('');
      setSourceAccountId('');
      setDestinationAccountId('');
      setDescription('');
      setSelectedFundBucket(null);
      // Refresh goal accounts to show updated balances
      await fetchGoalAccounts();
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

            {/* Destination Account Selection - Where Goal Fund Will Be Stored */}
            <InlineAccountSelector
              accounts={destinationAccounts.map(acc => {
                // Override balance display to show goal fund balance if exists
                const goalFundBalance = (acc as any).goalFundBalance;
                if (goalFundBalance && goalFundBalance > 0) {
                  return { ...acc, balance: goalFundBalance };
                }
                return acc;
              })}
              selectedAccountId={destinationAccountId}
              onSelect={(account) => setDestinationAccountId(account.id)}
              label="Account to Stay In"
              showBalance={true}
            />
            {destinationAccountId && (() => {
              const selectedAccount = destinationAccounts.find(acc => acc.id === destinationAccountId);
              const goalFundBalance = (selectedAccount as any)?.goalFundBalance ?? 0;
              return (
                <View style={styles.infoBanner}>
                  {goalFundBalance > 0 ? (
                    <>
                      <Ionicons name="information-circle-outline" size={16} color="#4F6F3E" />
                      <Text style={styles.infoText}>
                        This account already has {formatCurrency(goalFundBalance)} saved for this goal. This contribution will be added to the existing goal fund.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="lock-closed-outline" size={16} color="#4F6F3E" />
                      <Text style={styles.infoText}>
                        This account will store the goal fund, linked to "{goal?.title}". Money will be locked and cannot be used for normal transactions.
                      </Text>
                    </>
                  )}
                </View>
              );
            })()}

            {/* Source Account Selection - Where Payment Comes From */}
            <View style={styles.accountsSection}>
              <Text style={styles.fundSourceLabel}>Account to Deduct</Text>
              <InlineAccountSelector
                accounts={sourceAccounts}
                selectedAccountId={sourceAccountId}
                onSelect={(account) => {
                  setSourceAccountId(account.id);
                  setSelectedFundBucket(null);
                  // Automatically open fund picker when account is selected
                  setShowFundPicker(true);
                }}
                label=""
                showBalance={true}
              />
            </View>
            {sourceAccountId && (
              <>
                {selectedFundBucket && (
                  <View style={styles.infoBanner}>
                    <Ionicons name="information-circle-outline" size={16} color="#4F6F3E" />
                    <Text style={styles.infoText}>
                      Money will be deducted from {selectedFundBucket.name} ({formatCurrency(selectedFundBucket.amount)} available) in {sourceAccounts.find(a => a.id === sourceAccountId)?.name || 'this account'} and transferred to the Goal Fund in the selected account above.
                    </Text>
                  </View>
                )}
                {!selectedFundBucket && (
                  <TouchableOpacity
                    style={[styles.accountCard, { marginBottom: 16 }]}
                    onPress={() => setShowFundPicker(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.selectedAccountInfo}>
                      <Ionicons name="wallet-outline" size={20} color="#4F6F3E" />
                      <View style={styles.accountDetails}>
                        <Text style={styles.fundName}>
                          Tap to select which fund to deduct from (Personal, Goal, or Borrowed)
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#637050" />
                    </View>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Fund Picker Modal */}
            {sourceAccountId && (
              <FundPicker
                visible={showFundPicker}
                onClose={() => setShowFundPicker(false)}
                accountId={sourceAccountId}
                onSelect={(bucket) => {
                  setSelectedFundBucket(bucket);
                  setShowFundPicker(false);
                }}
                amount={parseFloat(amount) || 0}
                excludeGoalFunds={true}
                allowGoalFunds={false}
              />
            )}

            {/* Date Selection */}
            <View style={styles.dateSection}>
              <Text style={styles.dateLabel}>Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#4F6F3E" />
                <Text style={styles.dateText}>
                  {date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setDate(selectedDate);
                    }
                  }}
                />
              )}
              </View>

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
  dateSection: {
    marginBottom: 24,
  },
  dateLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 16,
  },
  dateText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
  },
  accountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 16,
    marginBottom: 16,
  },
  selectedAccountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    marginBottom: 4,
  },
  fundName: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
});
