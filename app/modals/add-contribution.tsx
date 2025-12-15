import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { formatCurrencyAmount, formatCurrencySymbol } from '@/utils/currency';
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
  const [destinationAccountId, setDestinationAccountId] = useState(''); // Keep for backward compatibility, but we'll use selectedDestinationAccounts
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFundPicker, setShowFundPicker] = useState(false);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [goalAccounts, setGoalAccounts] = useState<{ account: Account; balance: number }[]>([]);
  const [, setLoadingGoalAccounts] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<Account[]>([]);
  const [, setLoadingLinkedAccounts] = useState(false);
  const [showAddNewAccount, setShowAddNewAccount] = useState(false);
  const [selectedDestinationAccounts, setSelectedDestinationAccounts] = useState<string[]>([]); // Multiple selection for destination

  // Source accounts: ALL accounts (except inactive ones) - user can contribute from any account
  // Prioritize accounts that have goal funds for this goal or are linked
  // Then include all other accounts
  // IMPORTANT: Filter by goal currency to prevent currency mismatch errors
  const sourceAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0 || !goal) {
      console.log('⚠️ add-contribution: No accounts available or no goal');
      return [];
    }
    
    // Use goal's currency - source accounts MUST match goal currency
    const targetCurrency = goal.currency || currency || 'INR';
    
    const accountMap = new Map<string, Account & { hasGoalFunds?: boolean; isLinked?: boolean }>();
    
    // First priority: Accounts that have goal funds for this goal (these are the accounts shown in Goal Funds Breakdown)
    goalAccounts.forEach(({ account }) => {
      // Include ALL active accounts that match goal currency
      if (
        (account.is_active === true || account.is_active === undefined || account.is_active === null) &&
        account.currency === targetCurrency // Match goal currency
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
      // Include ALL active accounts that match goal currency
      if (
        (account.is_active === true || account.is_active === undefined || account.is_active === null) &&
        account.currency === targetCurrency // Match goal currency
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
    
    // Third priority: ALL other accounts that match goal currency
    accounts.forEach((account) => {
      const acc = account as Account;
      // Include ALL active accounts with matching currency
      // (liability accounts, goals_savings accounts, etc. are all allowed if currency matches)
      // The only restriction is fund type: goal funds cannot be used for contributions (enforced by FundPicker)
      if (
        (acc.is_active === true || acc.is_active === undefined || acc.is_active === null) &&
        acc.currency === targetCurrency // Match goal currency
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
    
    console.log('✅ add-contribution sourceAccounts:', result.length, 'total (prioritized: goal funds:', goalAccounts.length, 'linked:', linkedAccounts.length, ', goal currency:', targetCurrency, ')');
    return result as Account[];
  }, [accounts, goalAccounts, linkedAccounts, goal, currency]);
  
  // ROW 1: Accounts with funds OR accounts linked during goal creation (show even if zero balance)
  // These are the accounts where goal funds can stay
  const destinationAccountsRow1 = useMemo(() => {
    if (!goal) return [];
    
    const targetCurrency = goal.currency || currency || 'INR';
    const accountMap = new Map<string, Account & { goalFundBalance?: number; isLinked?: boolean }>();
    
    // Add accounts that have goal funds (even if balance is 0)
    goalAccounts.forEach(({ account, balance }) => {
      const acc = account as Account;
      if (
        acc.type !== 'liability' && // Only exclude liability accounts - goals_savings is valid for goal funds
        (acc.is_active === true || acc.is_active === undefined || acc.is_active === null) &&
        acc.currency === targetCurrency
      ) {
        accountMap.set(acc.id, {
          ...acc,
          goalFundBalance: balance,
          isLinked: false,
        } as Account & { goalFundBalance?: number; isLinked?: boolean });
      }
    });
    
    // Add linked accounts (accounts selected during goal creation) - show even if zero balance
    if (linkedAccounts && linkedAccounts.length > 0) {
      linkedAccounts.forEach((acc) => {
        if (
          acc.type !== 'liability' && // Only exclude liability accounts - goals_savings is valid for goal funds
          (acc.is_active === true || acc.is_active === undefined || acc.is_active === null) &&
          acc.currency === targetCurrency
        ) {
          if (!accountMap.has(acc.id)) {
            const goalAccount = goalAccounts.find(ga => ga.account.id === acc.id);
            accountMap.set(acc.id, {
              ...acc,
              goalFundBalance: goalAccount?.balance ?? 0,
              isLinked: true,
            } as Account & { goalFundBalance?: number; isLinked?: boolean });
          } else {
            const existing = accountMap.get(acc.id)!;
            accountMap.set(acc.id, { ...existing, isLinked: true });
          }
        }
      });
    }
    
    return Array.from(accountMap.values()).sort((a, b) => {
      const aHasFunds = (a.goalFundBalance ?? 0) > 0;
      const bHasFunds = (b.goalFundBalance ?? 0) > 0;
      const aIsLinked = a.isLinked ?? false;
      const bIsLinked = b.isLinked ?? false;
      
      if (aIsLinked && aHasFunds && !(bIsLinked && bHasFunds)) return -1;
      if (bIsLinked && bHasFunds && !(aIsLinked && aHasFunds)) return 1;
      if (aIsLinked && !bIsLinked) return -1;
      if (bIsLinked && !aIsLinked) return 1;
      if (aHasFunds && !bHasFunds) return -1;
      if (bHasFunds && !aHasFunds) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [linkedAccounts, goal, goalAccounts, currency]);

  // ROW 2: Other accounts (excluding Row 1 accounts) - shown when user wants to add new account
  const destinationAccountsRow2 = useMemo(() => {
    if (!goal || !showAddNewAccount) return [];
    
    const targetCurrency = goal.currency || currency || 'INR';
    const row1AccountIds = new Set(destinationAccountsRow1.map(acc => acc.id));
    
    return (accounts || [])
      .filter((account) => {
        const acc = account as Account;
        return (
          !row1AccountIds.has(acc.id) && // Exclude Row 1 accounts
          acc.type !== 'liability' && // Only exclude liability accounts - goals_savings is valid for goal funds
          (acc.is_active === true || acc.is_active === undefined || acc.is_active === null) &&
          acc.currency === targetCurrency
        );
      })
      .map(account => account as Account)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, goal, currency, showAddNewAccount, destinationAccountsRow1]);

  // ROW 3: Source accounts - ALL accounts matching goal currency (for paying from)
  // This is already correctly implemented in sourceAccounts useMemo

  // Fetch accounts with existing goal funds for this goal
  const fetchGoalAccounts = useCallback(async () => {
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
  }, [goal?.id, setGoalAccounts, setLoadingGoalAccounts]);

  // Fetch linked accounts for the goal
  const fetchLinkedAccounts = useCallback(async () => {
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
  }, [goal?.id, setLinkedAccounts, setLoadingLinkedAccounts]);

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
  }, [visible, goal?.id, fetchGoalAccounts, fetchLinkedAccounts]); // Include callbacks in dependencies

  // Initialize accounts when modal opens
  useEffect(() => {
    if (visible && goal) {
      // Auto-select first destination account from Row 1 if available
      if (destinationAccountsRow1.length > 0 && !destinationAccountId) {
        const firstAccountId = destinationAccountsRow1[0].id;
        setDestinationAccountId(firstAccountId);
        setSelectedDestinationAccounts([firstAccountId]);
      }
    }
  }, [visible, destinationAccountsRow1, goal, destinationAccountId]);


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

    // Validate currency match before submitting
    const sourceAccount = sourceAccounts.find(acc => acc.id === sourceAccountId);
    const allDestinationAccounts = [...destinationAccountsRow1, ...destinationAccountsRow2];
    const destinationAccount = allDestinationAccounts.find(acc => acc.id === destinationAccountId);
    const goalCurrency = goal.currency || currency;
    
    if (sourceAccount && destinationAccount) {
      if (sourceAccount.currency !== destinationAccount.currency) {
        Alert.alert(
          'Currency Mismatch',
          `Source account (${sourceAccount.name}) uses ${sourceAccount.currency}, but destination account (${destinationAccount.name}) uses ${destinationAccount.currency}. Both accounts must use the same currency.`
        );
        return;
      }
      
      if (sourceAccount.currency !== goalCurrency) {
        Alert.alert(
          'Currency Mismatch',
          `Selected accounts use ${sourceAccount.currency}, but the goal uses ${goalCurrency}. Please select accounts that match the goal currency.`
        );
        return;
      }
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
      setShowAddNewAccount(false);
      setSelectedDestinationAccounts([]);
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
                <Text style={styles.currencySymbol}>{formatCurrencySymbol(goal?.currency || currency)}</Text>
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

            {/* ROW 1: Accounts with funds OR accounts linked during goal creation */}
            <View style={styles.accountsSection}>
              <Text style={styles.sectionTitle}>Accounts for Funds to Stay In</Text>
              <Text style={styles.sectionSubtitle}>
                Select account(s) where goal funds will be stored
              </Text>
              {destinationAccountsRow1.length > 0 ? (
                <View style={styles.accountRow}>
                  {destinationAccountsRow1.map((acc) => {
                    const goalFundBalance = (acc as any).goalFundBalance ?? 0;
                    const isSelected = selectedDestinationAccounts.includes(acc.id) || destinationAccountId === acc.id;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[
                          styles.accountCardSelectable,
                          isSelected && styles.accountCardSelected
                        ]}
                        onPress={() => {
                          setDestinationAccountId(acc.id);
                          if (selectedDestinationAccounts.includes(acc.id)) {
                            setSelectedDestinationAccounts(selectedDestinationAccounts.filter(id => id !== acc.id));
                          } else {
                            setSelectedDestinationAccounts([...selectedDestinationAccounts, acc.id]);
                          }
                        }}
                      >
                        <View style={styles.accountCardContent}>
                          <View style={[styles.accountIcon, { backgroundColor: acc.color || '#4F6F3E' }]}>
                            <Ionicons name={acc.icon as any || 'wallet'} size={20} color="white" />
                          </View>
                          <View style={styles.accountCardDetails}>
                            <Text style={styles.accountCardName}>{acc.name}</Text>
                            <Text style={styles.accountCardBalance}>
                              {goalFundBalance > 0 
                                ? `Goal Fund: ${formatCurrency(goalFundBalance)}`
                                : 'No funds yet'}
                            </Text>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={24} color="#4F6F3E" />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.infoBanner}>
                  <Ionicons name="information-circle-outline" size={16} color="#637050" />
                  <Text style={styles.infoText}>
                    No accounts linked to this goal. Link accounts in goal settings or add a new account below.
                  </Text>
                </View>
              )}
            </View>

            {/* ROW 2: Option to add new account */}
            <View style={styles.accountsSection}>
              <TouchableOpacity
                style={styles.addAccountToggle}
                onPress={() => setShowAddNewAccount(!showAddNewAccount)}
              >
                <Text style={styles.addAccountToggleText}>
                  {showAddNewAccount ? '▼' : '▶'} Add New Account for Funds
                </Text>
              </TouchableOpacity>
              {showAddNewAccount && (
                <>
                  {destinationAccountsRow2.length > 0 ? (
                    <View style={styles.accountRow}>
                      {destinationAccountsRow2.map((acc) => {
                        const isSelected = selectedDestinationAccounts.includes(acc.id) || destinationAccountId === acc.id;
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            style={[
                              styles.accountCardSelectable,
                              isSelected && styles.accountCardSelected
                            ]}
                            onPress={() => {
                              setDestinationAccountId(acc.id);
                              if (selectedDestinationAccounts.includes(acc.id)) {
                                setSelectedDestinationAccounts(selectedDestinationAccounts.filter(id => id !== acc.id));
                              } else {
                                setSelectedDestinationAccounts([...selectedDestinationAccounts, acc.id]);
                              }
                            }}
                          >
                            <View style={styles.accountCardContent}>
                              <View style={[styles.accountIcon, { backgroundColor: acc.color || '#4F6F3E' }]}>
                                <Ionicons name={acc.icon as any || 'wallet'} size={20} color="white" />
                              </View>
                              <View style={styles.accountCardDetails}>
                                <Text style={styles.accountCardName}>{acc.name}</Text>
                                <Text style={styles.accountCardBalance}>
                                  Balance: {formatCurrency(acc.balance || 0)}
                                </Text>
                              </View>
                              {isSelected && (
                                <Ionicons name="checkmark-circle" size={24} color="#4F6F3E" />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.infoBanner}>
                      <Ionicons name="information-circle-outline" size={16} color="#637050" />
                      <Text style={styles.infoText}>
                        No other accounts available with currency {goal?.currency || currency}. Create a new account first.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
            {destinationAccountId && (() => {
              const selectedAccount = [...destinationAccountsRow1, ...destinationAccountsRow2].find(acc => acc.id === destinationAccountId);
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
                        This account will store the goal fund, linked to &quot;{goal?.title}&quot;. Money will be locked and cannot be used for normal transactions.
                      </Text>
                    </>
                  )}
                </View>
              );
            })()}

            {/* ROW 3: Source Account Selection - Where Payment Comes From */}
            <View style={styles.accountsSection}>
              <Text style={styles.sectionTitle}>Account to Deduct From</Text>
              <Text style={styles.sectionSubtitle}>
                Select account to pay from (all accounts matching goal currency)
              </Text>
              {sourceAccounts.length > 0 ? (
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
              ) : (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
                  <View style={styles.errorContent}>
                    <Text style={styles.errorTitle}>No Accounts Available</Text>
                    <Text style={styles.errorText}>
                      No accounts found with currency {goal?.currency || currency} to contribute from. 
                      Please create an account with this currency first.
                    </Text>
                  </View>
                </View>
              )}
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#DC2626',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#991B1B',
    lineHeight: 20,
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
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
    marginBottom: 12,
  },
  accountRow: {
    gap: 12,
    marginBottom: 16,
  },
  accountCardSelectable: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 16,
  },
  accountCardSelected: {
    borderColor: '#4F6F3E',
    borderWidth: 2,
    backgroundColor: '#F7F9F2',
  },
  accountCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountCardDetails: {
    flex: 1,
  },
  accountCardName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    marginBottom: 4,
  },
  accountCardBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  addAccountToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    marginBottom: 12,
  },
  addAccountToggleText: {
    fontSize: 15,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4F6F3E',
  },
});
