import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Goal, Account } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';

interface TransferGoalFundsModalProps {
  visible: boolean;
  goal: Goal;
  fromAccountId: string;
  goalAccounts: { account: Account; balance: number }[];
  availableAccounts: Account[];
  onClose: () => void;
  onTransfer: (fromAccountId: string, toAccountId: string, amount: number) => Promise<void>;
}

export default function TransferGoalFundsModal({
  visible,
  goal,
  fromAccountId,
  goalAccounts,
  availableAccounts,
  onClose,
  onTransfer,
}: TransferGoalFundsModalProps) {
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const fromAccount = goalAccounts.find(ga => ga.account.id === fromAccountId);
  const availableBalance = fromAccount?.balance || 0;

  const handleTransfer = async () => {
    if (!toAccountId || !amount) {
      Alert.alert('Validation Error', 'Please select a destination account and enter an amount.');
      return;
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      Alert.alert('Validation Error', 'Amount must be greater than 0.');
      return;
    }

    if (transferAmount > availableBalance) {
      Alert.alert('Validation Error', 'Transfer amount exceeds available goal fund balance.');
      return;
    }

    setLoading(true);
    try {
      await onTransfer(fromAccountId, toAccountId, transferAmount);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Transfer Goal Funds</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#000000" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* From Account */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>From Account</Text>
              {fromAccount && (
                <View style={styles.accountCard}>
                  <View style={[styles.accountIcon, { backgroundColor: fromAccount.account.color }]}>
                    <Ionicons name={fromAccount.account.icon as any} size={24} color="white" />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{fromAccount.account.name}</Text>
                    <Text style={styles.accountBalance}>
                      Available: {formatCurrencyAmount(availableBalance, goal.currency)}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* To Account */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>To Account</Text>
              <ScrollView style={styles.accountList} nestedScrollEnabled>
                {availableAccounts.map((account) => (
                  <TouchableOpacity
                    key={account.id}
                    style={[
                      styles.accountOption,
                      toAccountId === account.id && styles.accountOptionActive
                    ]}
                    onPress={() => setToAccountId(account.id)}
                  >
                    <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                      <Ionicons name={account.icon as any} size={20} color="white" />
                    </View>
                    <View style={styles.accountInfo}>
                      <Text style={styles.accountName}>{account.name}</Text>
                      <Text style={styles.accountBalance}>
                        {formatCurrencyAmount(account.balance, goal.currency)}
                      </Text>
                    </View>
                    {toAccountId === account.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {availableAccounts.length === 0 && (
                <Text style={styles.emptyText}>
                  No other accounts available for transfer
                </Text>
              )}
            </View>

            {/* Amount */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Amount ({goal.currency})</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.amountPrefix}>
                  {goal.currency === 'USD' ? '$' : goal.currency === 'INR' ? '₹' : goal.currency}
                </Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>
              <Text style={styles.helperText}>
                Available: {formatCurrencyAmount(availableBalance, goal.currency)}
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.cancelButton, loading && styles.buttonDisabled]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.transferButton,
                (!toAccountId || !amount || loading) && styles.buttonDisabled
              ]}
              onPress={handleTransfer}
              disabled={!toAccountId || !amount || loading}
            >
              <Text style={styles.transferButtonText}>
                {loading ? 'Transferring...' : 'Transfer'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    fontWeight: '900',
    color: '#000000',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    paddingHorizontal: 20,
    paddingTop: 24,
    maxHeight: 500,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  accountList: {
    maxHeight: 200,
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    gap: 12,
  },
  accountOptionActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    marginBottom: 4,
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  amountPrefix: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    paddingHorizontal: 16,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 16,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
  },
  helperText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 16,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#374151',
  },
  transferButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

