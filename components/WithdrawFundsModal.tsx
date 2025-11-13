import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, Alert, ScrollView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrencyAmount } from '@/utils/currency';
import { Goal, Account } from '@/types';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { getGoalAccounts } from '@/utils/goals';
import InlineAccountSelector from './InlineAccountSelector';

interface WithdrawFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onWithdraw: (data: { 
    amount: number; 
    sourceAccountId: string; // Account where goal fund is located
    destinationAccountId: string; // Account where money goes
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
  const { accounts, refreshAccounts } = useRealtimeData();
  const { currency } = useSettings();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);
  const [destinationAccountId, setDestinationAccountId] = useState<string | null>(null);
  const [goalAccounts, setGoalAccounts] = useState<Array<{ account: Account; balance: number }>>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [isAmountFocused, setIsAmountFocused] = useState(false);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, goal.currency);
  };

  // Refresh accounts when modal opens
  useEffect(() => {
    if (visible) {
      console.log('🔄 Withdraw modal opened, refreshing accounts...');
      refreshAccounts();
      console.log('✅ Withdraw modal - current accounts:', accounts.length);
    }
  }, [visible, refreshAccounts, accounts.length]);

  // Fetch goal accounts when modal opens
  useEffect(() => {
    if (visible && goal) {
      fetchGoalAccounts();
      // Reset form when modal opens
      setAmount('');
      setNote('');
      setSourceAccountId(null);
      setDestinationAccountId(null);
    }
  }, [visible, goal]);

  const fetchGoalAccounts = async () => {
    if (!goal) return;
    
    try {
      setLoadingAccounts(true);
      const accounts = await getGoalAccounts(goal.id);
      setGoalAccounts(accounts);
      
      // Auto-select first account if only one account holds funds
      if (accounts.length === 1) {
        setSourceAccountId(accounts[0].account.id);
      }
    } catch (error) {
      console.error('Error fetching goal accounts', error);
      Alert.alert('Error', 'Failed to load goal accounts');
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Filter destination accounts (exclude liability and Goals Savings accounts)
  // Goals Savings account is only for displaying aggregate statistics
  // STRICT: Only show accounts that match the goal currency (required for backend validation)
  const destinationAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) {
      console.log('⚠️ Withdraw modal: No accounts available for destination');
      return [];
    }
    if (!goal || !goal.currency) {
      console.log('⚠️ Withdraw modal: Goal currency not set');
      return [];
    }
    
    // Filter accounts: exclude liability and goals_savings, must be active, must match goal currency
    const filtered = accounts.filter(
      (account) => 
        account.type !== 'liability' && 
        account.type !== 'goals_savings' &&
        (account.is_active === true || account.is_active === undefined || account.is_active === null) &&
        account.currency === goal.currency // STRICT: Must match goal currency
    );
    
    console.log('✅ Withdraw modal destinationAccounts:', filtered.length, 'from', accounts.length, 'total (goal currency:', goal.currency, ')');
    if (filtered.length === 0) {
      console.warn('⚠️ No accounts found matching goal currency:', goal.currency);
    }
    return filtered;
  }, [accounts, goal]);

  // Get selected accounts
  const sourceAccount = goalAccounts.find((ga) => ga.account.id === sourceAccountId)?.account;
  const destinationAccount = destinationAccounts.find((acc) => acc.id === destinationAccountId);
  
  // Get available balance for selected source account
  const availableBalance = sourceAccountId 
    ? goalAccounts.find((ga) => ga.account.id === sourceAccountId)?.balance || 0
    : 0;

  // Auto-select first destination account when source account is selected and destination is empty
  useEffect(() => {
    if (visible && sourceAccountId && destinationAccounts.length > 0 && !destinationAccountId) {
      // Exclude source account from destination options
      const availableDestinations = destinationAccounts.filter((acc) => acc.id !== sourceAccountId);
      if (availableDestinations.length > 0) {
        // Prefer savings accounts for destination, otherwise first account
        const savingsAccount = availableDestinations.find((acc) => acc.type === 'bank' || acc.type === 'wallet');
        const selectedId = savingsAccount?.id || availableDestinations[0].id;
        setDestinationAccountId(selectedId);
        console.log('✅ Auto-selected destination account:', savingsAccount?.name || availableDestinations[0].name);
      }
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

    if (sourceAccountId === destinationAccountId) {
      Alert.alert('Error', 'Source and destination accounts must be different');
      return;
    }

    onWithdraw({ 
      amount: withdrawAmount, 
      sourceAccountId,
      destinationAccountId,
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

            {/* Source Account Selection (Goal Fund) */}
            <InlineAccountSelector
              accounts={goalAccounts.map((ga) => ga.account)}
              selectedAccountId={sourceAccountId}
              onSelect={(account) => {
                setSourceAccountId(account.id);
              }}
              label="From Account (Goal Fund)"
              showBalance={true}
            />
            {sourceAccountId && availableBalance > 0 && (
              <View style={styles.balanceInfo}>
                <Text style={styles.balanceLabel}>Available in this account:</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(availableBalance)}</Text>
              </View>
            )}

            {/* Destination Account Selection (Personal Funds) */}
            <InlineAccountSelector
              accounts={destinationAccounts}
              selectedAccountId={destinationAccountId}
              onSelect={(account) => setDestinationAccountId(account.id)}
              label="To Account"
              excludeAccountIds={sourceAccountId ? [sourceAccountId] : []}
              showBalance={true}
            />
            {destinationAccountId && (
              <View style={styles.infoBanner}>
                <Ionicons name="wallet-outline" size={16} color="#4F6F3E" />
                <Text style={styles.infoText}>
                  Money will be added to Personal Funds in this account
                </Text>
              </View>
            )}

            {/* Amount Input */}
            <View style={styles.amountSection}>
              <Text style={styles.amountLabel}>Amount</Text>
              <View style={styles.amountContainer}>
                <Text style={styles.currencySymbol}>$</Text>
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
