import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, Alert, ScrollView, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatCurrencyAmount, formatCurrencySymbol } from '@/utils/currency';
import { Goal, Account } from '@/types';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { getGoalAccounts, getLinkedAccountsForGoal } from '@/utils/goals';
import InlineAccountSelector from './InlineAccountSelector';

interface WithdrawFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onWithdraw: (data: { 
    amount: number; 
    sourceAccountId: string; // Account where goal fund is located
    destinationAccountId: string; // Account where money goes
    date?: string; // Date of withdrawal
    note?: string;
  }) => void;
  goal: Goal;
}

export default function WithdrawFundsModal({
  visible,
  onClose,
  onWithdraw,
  goal,
}: WithdrawFundsModalProps) {
  const { accounts, refreshAccounts, refreshAccountFunds } = useRealtimeData();
  const { currency } = useSettings();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);
  const [destinationAccountId, setDestinationAccountId] = useState<string | null>(null);
  const [goalAccounts, setGoalAccounts] = useState<{ account: Account; balance: number }[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<Account[]>([]);

  const formatCurrency = (amount: number) => {
    // Use currency from settings instead of goal currency
    return formatCurrencyAmount(amount, currency);
  };

  // Refresh accounts and account funds when modal opens, then fetch goal accounts
  useEffect(() => {
    if (visible && goal) {
      console.log('🔄 Withdraw modal opened, refreshing accounts and funds...');
      
      // Reset form when modal opens
      setAmount('');
      setNote('');
      setDate(new Date());
      setShowDatePicker(false);
      setSourceAccountId(null);
      setDestinationAccountId(null);
      
      // Refresh data first
      refreshAccounts();
      refreshAccountFunds();
      
      // Fetch linked accounts first, then goal accounts
      const fetchLinkedAccounts = async () => {
        if (!goal) return;
        
        try {
          const accounts = await getLinkedAccountsForGoal(goal.id);
          setLinkedAccounts(accounts);
          console.log(`📊 WithdrawFundsModal: Fetched ${accounts.length} linked account(s) for "${goal.title}"`);
          
          // After linked accounts are fetched, fetch goal accounts
          if (accounts.length > 0) {
            await fetchGoalAccounts(accounts);
          } else {
            setGoalAccounts([]);
          }
        } catch (error) {
          console.error('Error fetching linked accounts:', error);
        }
      };

      const fetchGoalAccounts = async (linkedAccts: Account[]) => {
        if (!goal) return;
        
        try {
          setLoadingAccounts(true);
          // Get ALL accounts with goal funds (not just linked ones)
          const accountsWithFunds = await getGoalAccounts(goal.id);
          console.log(`📊 WithdrawFundsModal: Fetched ${accountsWithFunds.length} account(s) with goal funds for "${goal.title}"`);
          
          // Filter by goal currency - accounts MUST match goal currency
          const goalCurrency = goal.currency || currency;
          const filteredAccounts = accountsWithFunds.filter(({ account }) => {
            return account.currency === goalCurrency;
          });
          
          console.log(`📊 WithdrawFundsModal: Filtered to ${filteredAccounts.length} account(s) matching goal currency (${goalCurrency})`);
          
          // Show all accounts with funds (linked or not) that match goal currency
          // Priority: linked accounts with funds first, then non-linked accounts with funds
          const linkedAccountIds = new Set(linkedAccts.map(acc => acc.id));
          const sorted = filteredAccounts.sort((a, b) => {
            const aIsLinked = linkedAccountIds.has(a.account.id);
            const bIsLinked = linkedAccountIds.has(b.account.id);
            if (aIsLinked && !bIsLinked) return -1;
            if (bIsLinked && !aIsLinked) return 1;
            return a.account.name.localeCompare(b.account.name);
          });
          
          setGoalAccounts(sorted);
          
          // Auto-select first account if only one account holds funds
          if (sorted.length === 1) {
            setSourceAccountId(sorted[0].account.id);
            console.log(`✅ Auto-selected source account: ${sorted[0].account.name}`);
          } else if (sorted.length > 1) {
            console.log(`ℹ️ Multiple accounts found. User needs to select one.`);
          } else {
            console.warn(`⚠️ No accounts found with funds for this goal`);
          }
        } catch (error) {
          console.error('Error fetching goal accounts', error);
          Alert.alert('Error', 'Failed to load goal accounts');
        } finally {
          setLoadingAccounts(false);
        }
      };

      // Then fetch linked accounts after a short delay to ensure refresh completes
      const timer = setTimeout(() => {
        fetchLinkedAccounts();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [visible, goal, refreshAccounts, refreshAccountFunds]);

  // Destination accounts: Show ALL accounts (money goes to personal funds in any account)
  // Since money goes to personal funds, any account can receive the withdrawal
  // Filter: exclude liability and Goals Savings accounts, must be active, must match GOAL currency (not settings)
  // IMPORTANT: Goal funds are stored in goal currency, so destination account must match goal currency
  // Goals Savings account is only for displaying aggregate statistics
  const destinationAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0 || !goal) {
      console.log('⚠️ Withdraw modal: No accounts available for destination or no goal');
      return [];
    }
    
    // Use goal currency - destination account must match goal currency
    const targetCurrency = goal.currency || currency;
    if (!targetCurrency) {
      console.log('⚠️ Withdraw modal: No currency available (goal or settings)');
      return [];
    }
    
    // Show ALL accounts: exclude only liability and goals_savings, must be active, must match GOAL currency
    // Money goes to personal funds, so any account can receive it (as long as currency matches)
    const filtered = accounts
      .filter((account) => {
        const acc = account as Account;
        return (
          acc.type !== 'liability' && 
          acc.type !== 'goals_savings' &&
          (acc.is_active === true || acc.is_active === undefined || acc.is_active === null) &&
          acc.currency === targetCurrency // Match GOAL currency (not settings currency)
        );
      })
      .map((account) => account as Account);
    
    console.log('✅ Withdraw modal destinationAccounts:', filtered.length, 'from', accounts.length, 'total (ALL accounts, goal currency:', targetCurrency, ')');
    if (filtered.length === 0) {
      console.warn('⚠️ No accounts found matching goal currency:', targetCurrency);
    }
    return filtered;
  }, [accounts, goal, currency]);

  // Check if there are any accounts at all (for helpful error message)
  const hasAnyAccounts = useMemo(() => {
    return accounts && accounts.length > 0;
  }, [accounts]);

  // Check if accounts exist but don't match goal currency
  const accountsWithDifferentCurrency = useMemo(() => {
    if (!accounts || !goal) return [];
    const targetCurrency = goal.currency || currency;
    if (!targetCurrency) return [];
    return accounts.filter((account) => {
      const acc = account as Account;
      return (
        acc.type !== 'liability' && 
        acc.type !== 'goals_savings' &&
        (acc.is_active === true || acc.is_active === undefined || acc.is_active === null) &&
        acc.currency !== targetCurrency
      );
    });
  }, [accounts, goal, currency]);

  // Get selected accounts
  const sourceAccount = goalAccounts.find((ga) => ga.account.id === sourceAccountId)?.account;
  const destinationAccount = destinationAccounts.find((acc) => acc.id === destinationAccountId);
  
  // Get available balance for selected source account
  // Use useMemo to ensure it updates when sourceAccountId or goalAccounts change
  const availableBalance = useMemo(() => {
    if (!sourceAccountId) return 0;
    const goalAccount = goalAccounts.find((ga) => ga.account.id === sourceAccountId);
    return goalAccount?.balance || 0;
  }, [sourceAccountId, goalAccounts]);

  // Auto-select first destination account when source account is selected and destination is empty
  // Note: Same account can be selected for both source and destination (different fund sources)
  useEffect(() => {
    if (visible && sourceAccountId && destinationAccounts.length > 0 && !destinationAccountId) {
      // Same account is allowed since source is goal fund and destination is personal fund
      // Prefer savings accounts for destination, otherwise first account (can be same as source)
      const savingsAccount = destinationAccounts.find((acc) => acc.type === 'bank' || acc.type === 'wallet');
      const selectedId = savingsAccount?.id || destinationAccounts[0].id;
      setDestinationAccountId(selectedId);
      console.log('✅ Auto-selected destination account:', savingsAccount?.name || destinationAccounts[0].name);
    }
  }, [visible, sourceAccountId, destinationAccounts, destinationAccountId]);

  const handleWithdraw = () => {
    const withdrawAmount = parseFloat(amount);
    
    if (!amount || withdrawAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid withdrawal amount');
      return;
    }
    
    if (withdrawAmount > availableBalance) {
      Alert.alert('Error', `Cannot withdraw more than ${formatCurrency(availableBalance)} available in this account`);
      return;
    }

    if (!sourceAccountId) {
      Alert.alert('Error', 'Please select the account where the goal funds are located');
      return;
    }

    if (!destinationAccountId) {
      Alert.alert('Error', 'Please select a destination account');
      return;
    }

    // Validate currency match before withdrawing
    const sourceAccount = goalAccounts.find(ga => ga.account.id === sourceAccountId)?.account;
    const destinationAccount = destinationAccounts.find(acc => acc.id === destinationAccountId);
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

    // Note: Same account is allowed - source is goal fund, destination is personal fund
    // No need to check if sourceAccountId === destinationAccountId

    onWithdraw({ 
      amount: withdrawAmount, 
      sourceAccountId,
      destinationAccountId,
      date: date.toISOString().split('T')[0],
      note: note.trim() || undefined 
    });
  };

  const handleFullWithdraw = () => {
    if (availableBalance > 0) {
      setAmount(availableBalance.toString());
    }
  };

  const handleClose = () => {
    setAmount('');
    setNote('');
    setDate(new Date());
    setShowDatePicker(false);
    setSourceAccountId(null);
    setDestinationAccountId(null);
    setIsAmountFocused(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={24} color="#1F3A24" />
            </TouchableOpacity>
            <Text style={styles.title}>Withdraw from Goal</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Goal Info */}
            <View style={styles.goalInfo}>
              <View style={[styles.goalIcon, { backgroundColor: goal.color }]}>
                <Ionicons name={goal.icon as any} size={24} color="white" />
              </View>
              <View style={styles.goalDetails}>
                <Text style={styles.goalTitle}>{goal.title}</Text>
                <Text style={styles.goalBalance}>
                  Total: {formatCurrency(goal.current_amount)}
                </Text>
              </View>
            </View>

            {/* Source Account Selection - Only Linked Accounts with Funds for THIS Goal */}
            <InlineAccountSelector
              accounts={goalAccounts.map((ga) => ({
                ...ga.account,
                balance: ga.balance, // Override account balance with goal fund balance
              }))}
              selectedAccountId={sourceAccountId}
              onSelect={(account) => {
                setSourceAccountId(account.id);
              }}
              label="From Account (Goal Fund)"
              showBalance={true}
            />
            {sourceAccountId && availableBalance > 0 && (
              <View style={styles.balanceInfo}>
                <Text style={styles.balanceLabel}>Available Goal Fund in this account:</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(availableBalance)}</Text>
              </View>
            )}
            {goalAccounts.length === 0 && linkedAccounts.length === 0 && (
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
                <Text style={styles.infoText}>
                  No accounts linked to this goal. Please link accounts first in goal settings.
                </Text>
              </View>
            )}
            {goalAccounts.length === 0 && linkedAccounts.length > 0 && (
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
                <Text style={styles.infoText}>
                  No goal funds found in linked accounts. Add a contribution first.
                </Text>
              </View>
            )}

            {/* Destination Account Selection - Personal Funds */}
            {/* Note: Same account can be selected for source and destination since they are different fund sources:
                - Source: Goal fund (where money is withdrawn from)
                - Destination: Personal fund (where money goes to)
            */}
            {destinationAccounts.length > 0 ? (
              <>
                <InlineAccountSelector
                  accounts={destinationAccounts}
                  selectedAccountId={destinationAccountId}
                  onSelect={(account) => setDestinationAccountId(account.id)}
                  label="To Account (Personal Funds)"
                  showBalance={true}
                />
                {destinationAccountId && (
                  <View style={styles.infoBanner}>
                    <Ionicons name="wallet-outline" size={16} color="#4F6F3E" />
                    <Text style={styles.infoText}>
                      Money will be withdrawn from the Goal Fund and added to Personal Funds in this account. You can then use it for normal transactions.
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
                <View style={styles.errorContent}>
                  <Text style={styles.errorTitle}>No Accounts Available</Text>
                  {hasAnyAccounts && accountsWithDifferentCurrency.length > 0 ? (
                    <Text style={styles.errorText}>
                      You need an account with currency {goal?.currency || currency} to receive the withdrawal. 
                      Your accounts use different currencies. Please create an account with currency {goal?.currency || currency} first.
                    </Text>
                  ) : (
                    <Text style={styles.errorText}>
                      You need at least one active account to receive the withdrawal. Please create an account first.
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Amount Input */}
            <View style={styles.amountSection}>
              <Text style={styles.amountLabel}>Amount</Text>
              <View style={styles.amountContainer}>
                <Text style={styles.currencySymbol}>{formatCurrencySymbol(currency || goal.currency)}</Text>
                <TextInput
                  style={[styles.amountInput, !amount && styles.amountInputPlaceholder]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  autoFocus={!amount}
                  onFocus={() => setIsAmountFocused(true)}
                  onBlur={() => setIsAmountFocused(false)}
                />
              </View>
              {availableBalance > 0 && (
                <TouchableOpacity
                  style={styles.fullWithdrawButton}
                  onPress={handleFullWithdraw}
                >
                  <Text style={styles.fullWithdrawText}>Withdraw All ({formatCurrency(availableBalance)})</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Date Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Date</Text>
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

            {/* Note Input */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Note (Optional)</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a note..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!amount || parseFloat(amount) <= 0 || !sourceAccountId || !destinationAccountId) && styles.submitButtonDisabled
              ]}
              onPress={handleWithdraw}
              disabled={!amount || parseFloat(amount) <= 0 || !sourceAccountId || !destinationAccountId}
            >
              <Text style={styles.submitButtonText}>Withdraw Funds</Text>
            </TouchableOpacity>
          </ScrollView>

        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECD6',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    color: '#1F3A24',
    letterSpacing: 0.5,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 24,
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    gap: 12,
  },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalDetails: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    marginBottom: 4,
  },
  goalBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4F6F3E',
  },
  section: {
    gap: 12,
    marginBottom: 24,
  },
  amountSection: {
    marginBottom: 24,
    alignItems: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    marginBottom: 8,
  },
  amountLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  balanceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  balanceAmount: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4F6F3E',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 24,
    paddingVertical: 24,
    minHeight: 100,
    width: '100%',
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
  fullWithdrawButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#E5ECD6',
    borderRadius: 8,
  },
  fullWithdrawText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4F6F3E',
  },
  noteInput: {
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 16,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F3A24',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#4F6F3E',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  submitButtonDisabled: {
    backgroundColor: '#D7DECC',
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#FFFFFF',
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
    marginBottom: 24,
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
});
