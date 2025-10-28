import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrencyAmount } from '@/utils/currency';
import { Goal, Account } from '@/types';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface WithdrawFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onWithdraw: (data: { amount: number; destinationAccountId: string; note?: string }) => void;
  goal: Goal;
}

export default function WithdrawFundsModal({
  visible,
  onClose,
  onWithdraw,
  goal,
}: WithdrawFundsModalProps) {
  const { accounts } = useRealtimeData();
  const [amount, setAmount] = useState(goal.current_amount.toString());
  const [note, setNote] = useState('');
  const [withdrawType, setWithdrawType] = useState<'full' | 'partial'>('full');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  
  // Filter out the Goals Savings Account from destination options
  const destinationAccounts = accounts.filter(account => account.type !== 'goals_savings');

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, goal.currency);
  };

  const handleWithdraw = () => {
    const withdrawAmount = parseFloat(amount);
    
    if (withdrawAmount <= 0) {
      Alert.alert('Error', 'Withdrawal amount must be greater than 0');
      return;
    }
    
    if (withdrawAmount > goal.current_amount) {
      Alert.alert('Error', 'Cannot withdraw more than available balance');
      return;
    }

    if (!selectedAccountId) {
      Alert.alert('Error', 'Please select a destination account');
      return;
    }

    onWithdraw({ 
      amount: withdrawAmount, 
      destinationAccountId: selectedAccountId,
      note: note.trim() || undefined 
    });
    onClose();
  };

  const handleFullWithdraw = () => {
    setAmount(goal.current_amount.toString());
    setWithdrawType('full');
  };

  const handlePartialWithdraw = () => {
    setWithdrawType('partial');
  };

  const remainingAmount = goal.current_amount - parseFloat(amount || '0');

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#000000', '#1F2937']}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Withdraw Funds</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>

            {/* Goal Info */}
            <View style={styles.goalInfo}>
              <View style={[styles.goalIcon, { backgroundColor: goal.color }]}>
                <Ionicons name={goal.icon as any} size={24} color="white" />
              </View>
              <View style={styles.goalDetails}>
                <Text style={styles.goalTitle}>{goal.title}</Text>
                <Text style={styles.goalBalance}>
                  Available: {formatCurrency(goal.current_amount)}
                </Text>
              </View>
            </View>

            {/* Withdrawal Type */}
            <View style={styles.withdrawalTypeContainer}>
              <Text style={styles.sectionTitle}>Withdrawal Type</Text>
              
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  withdrawType === 'full' && styles.activeTypeButton
                ]}
                onPress={handleFullWithdraw}
              >
                <View style={styles.typeIcon}>
                  <Ionicons name="cash" size={20} color={withdrawType === 'full' ? '#10B981' : '#6B7280'} />
                </View>
                <View style={styles.typeContent}>
                  <Text style={[
                    styles.typeTitle,
                    withdrawType === 'full' && styles.activeTypeTitle
                  ]}>
                    Full Withdrawal
                  </Text>
                  <Text style={styles.typeDescription}>
                    Withdraw all {formatCurrency(goal.current_amount)}
                  </Text>
                </View>
                {withdrawType === 'full' && (
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  withdrawType === 'partial' && styles.activeTypeButton
                ]}
                onPress={handlePartialWithdraw}
              >
                <View style={styles.typeIcon}>
                  <Ionicons name="calculator" size={20} color={withdrawType === 'partial' ? '#10B981' : '#6B7280'} />
                </View>
                <View style={styles.typeContent}>
                  <Text style={[
                    styles.typeTitle,
                    withdrawType === 'partial' && styles.activeTypeTitle
                  ]}>
                    Partial Withdrawal
                  </Text>
                  <Text style={styles.typeDescription}>
                    Withdraw a specific amount
                  </Text>
                </View>
                {withdrawType === 'partial' && (
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                )}
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Withdrawal Amount</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="Enter amount"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                editable={withdrawType === 'partial'}
              />
              {withdrawType === 'partial' && amount && (
                <Text style={styles.remainingText}>
                  Remaining: {formatCurrency(remainingAmount)}
                </Text>
              )}
            </View>

            {/* Destination Account Selection */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Destination Account</Text>
              <View style={styles.accountList}>
                {destinationAccounts.map((account) => (
                  <TouchableOpacity
                    key={account.id}
                    style={[
                      styles.accountItem,
                      selectedAccountId === account.id && styles.selectedAccountItem
                    ]}
                    onPress={() => setSelectedAccountId(account.id)}
                  >
                    <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                      <Ionicons name={account.icon as any} size={20} color="white" />
                    </View>
                    <View style={styles.accountInfo}>
                      <Text style={styles.accountName}>{account.name}</Text>
                      <Text style={styles.accountBalance}>
                        {formatCurrencyAmount(account.balance, account.currency)}
                      </Text>
                    </View>
                    {selectedAccountId === account.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Note Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Note (Optional)</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="e.g., Bought the laptop"
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Preview */}
            {amount && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewTitle}>Withdrawal Preview</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Amount:</Text>
                  <Text style={styles.previewValue}>{formatCurrency(parseFloat(amount) || 0)}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Remaining:</Text>
                  <Text style={styles.previewValue}>{formatCurrency(remainingAmount)}</Text>
                </View>
                {note && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Note:</Text>
                    <Text style={styles.previewValue}>{note}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.withdrawButton,
                  (!amount || parseFloat(amount) <= 0) && styles.disabledButton
                ]}
                onPress={handleWithdraw}
                disabled={!amount || parseFloat(amount) <= 0}
              >
                <Ionicons name="cash" size={20} color="white" />
                <Text style={styles.withdrawButtonText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
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
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  goalBalance: {
    fontSize: 14,
    color: '#10B981',
  },
  withdrawalTypeContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeTypeButton: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  typeContent: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  activeTypeTitle: {
    color: '#10B981',
  },
  typeDescription: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  remainingText: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 4,
  },
  noteInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    textAlignVertical: 'top',
  },
  previewContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  previewLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  previewValue: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  withdrawButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
  },
  disabledButton: {
    backgroundColor: '#6B7280',
  },
  withdrawButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  accountList: {
    gap: 8,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedAccountItem: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountInfo: {
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
    color: '#9CA3AF',
  },
});

