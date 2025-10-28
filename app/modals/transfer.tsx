import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import DateTimePicker from '@react-native-community/datetimepicker';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedAccountId?: string;
}

export default function TransferModal({ visible, onClose, onSuccess, preselectedAccountId }: TransferModalProps) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { currency } = useSettings();
  const { globalRefresh } = useRealtimeData();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // Fetch user accounts
  useEffect(() => {
    if (visible && user) {
      fetchAccounts();
    }
  }, [visible, user]);

  // Set preselected account when modal opens
  useEffect(() => {
    if (visible && preselectedAccountId) {
      setFromAccount(preselectedAccountId);
    }
  }, [visible, preselectedAccountId]);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!amount.trim()) {
      newErrors.amount = 'Amount is required';
    } else if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      newErrors.amount = 'Please enter a valid amount';
    }

    if (!fromAccount) {
      newErrors.fromAccount = 'Please select source account';
    }

    if (!toAccount) {
      newErrors.toAccount = 'Please select destination account';
    }

    if (fromAccount === toAccount) {
      newErrors.toAccount = 'Source and destination accounts must be different';
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const amountValue = parseFloat(amount);
      
      // Create transfer transaction using our helper function
      const { data, error } = await supabase.rpc('create_transfer_transaction', {
        p_user_id: user?.id,
        p_from_account_id: fromAccount,
        p_to_account_id: toAccount,
        p_amount: amountValue,
        p_description: description.trim(),
        p_date: date.toISOString().split('T')[0],
        p_notes: `Transfer from ${accounts.find(acc => acc.id === fromAccount)?.name} to ${accounts.find(acc => acc.id === toAccount)?.name}`
      });

      if (error) throw error;

      // Get account names for notification
      const fromAccountData = accounts.find(acc => acc.id === fromAccount);
      const toAccountData = accounts.find(acc => acc.id === toAccount);
      const fromAccountName = fromAccountData?.name || 'Account';
      const toAccountName = toAccountData?.name || 'Account';

      // Show success notification
      showNotification({
        type: 'success',
        title: 'Transferred',
        amount: amountValue,
        currency: currency,
        description: 'Transfer',
        account: `${fromAccountName} → ${toAccountName}`,
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      });

      // Global refresh to update all data
      await globalRefresh();

      onSuccess?.(); // Call success callback for immediate UI update
      
      // Reset form
      setAmount('');
      setDescription('');
      setFromAccount('');
      setToAccount('');
      setDate(new Date());
      setErrors({});
      onClose();

    } catch (error) {
      console.error('Error creating transfer:', error);
      Alert.alert('Error', 'Failed to complete transfer. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fromAccountData = accounts.find(acc => acc.id === fromAccount);
  const toAccountData = accounts.find(acc => acc.id === toAccount);
  const amountValue = parseFloat(amount) || 0;

  // Calculate balances
  const fromBeforeBalance = fromAccountData?.balance || 0;
  const fromAfterBalance = fromBeforeBalance - amountValue;
  const toBeforeBalance = toAccountData?.balance || 0;
  const toAfterBalance = toBeforeBalance + amountValue;

  // Filter accounts for "To Account" (exclude selected "From Account")
  const availableToAccounts = accounts.filter(acc => acc.id !== fromAccount);

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
          <ScrollView style={styles.scrollView}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Transfer Money</Text>
              <TouchableOpacity 
                style={[styles.saveButton, isLoading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                <Text style={styles.saveText}>
                  {isLoading ? 'Transferring...' : 'Transfer'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountInput}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={[styles.amountTextInput, errors.amount && styles.errorInput]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  keyboardType="numeric"
                />
              </View>
              {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
            </View>

            {/* Description Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, errors.description && styles.errorInput]}
                value={description}
                onChangeText={setDescription}
                placeholder="What is this transfer for?"
                placeholderTextColor="#6B7280"
                multiline
              />
              {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
            </View>

            {/* From Account Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>From Account</Text>
              <View style={styles.accountList}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountButton,
                      fromAccount === acc.id && styles.selectedAccount
                    ]}
                    onPress={() => {
                      setFromAccount(acc.id);
                      // Reset toAccount if it's the same as fromAccount
                      if (toAccount === acc.id) {
                        setToAccount('');
                      }
                    }}
                  >
                    <View style={styles.accountInfo}>
                      <Text style={[
                        styles.accountName,
                        fromAccount === acc.id && styles.selectedAccountText
                      ]}>
                        {acc.name}
                      </Text>
                      <Text style={[
                        styles.accountBalance,
                        fromAccount === acc.id && styles.selectedAccountText
                      ]}>
                        ${acc.balance.toLocaleString()}
                      </Text>
                    </View>
                    {fromAccount === acc.id.toString() && (
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* To Account Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>To Account</Text>
              {fromAccount ? (
                <View style={styles.accountList}>
                  {availableToAccounts.map((acc) => (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.accountButton,
                        toAccount === acc.id && styles.selectedAccount
                      ]}
                      onPress={() => setToAccount(acc.id)}
                    >
                      <View style={styles.accountInfo}>
                        <Text style={[
                          styles.accountName,
                          toAccount === acc.id && styles.selectedAccountText
                        ]}>
                          {acc.name}
                        </Text>
                        <Text style={[
                          styles.accountBalance,
                          toAccount === acc.id && styles.selectedAccountText
                        ]}>
                          ${acc.balance.toLocaleString()}
                        </Text>
                      </View>
                      {toAccount === acc.id && (
                        <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.placeholderContainer}>
                  <Text style={styles.placeholderText}>
                    Select a "From Account" first
                  </Text>
                </View>
              )}
            </View>

            {/* Date Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <View style={styles.dateButtonContent}>
                  <Ionicons name="calendar" size={20} color="#10B981" />
                  <Text style={styles.dateText}>
                    {date.toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                </View>
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
                  maximumDate={new Date()}
                />
              )}
            </View>

            {/* Balance Impact */}
            {fromAccount && toAccount && (
              <View style={styles.balanceCard}>
                <Text style={styles.balanceTitle}>Balance Impact</Text>
                
                <View style={styles.balanceRow}>
                  <View style={styles.balanceBox}>
                    <Text style={styles.balanceLabel}>From Account</Text>
                    <Text style={styles.accountName}>{fromAccountData?.name}</Text>
                    <Text style={styles.balanceBefore}>${fromBeforeBalance.toLocaleString()}</Text>
                    <Text style={styles.balanceAfter}>${fromAfterBalance.toLocaleString()}</Text>
                  </View>
                  
                  <View style={styles.balanceBox}>
                    <Text style={styles.balanceLabel}>To Account</Text>
                    <Text style={styles.accountName}>{toAccountData?.name}</Text>
                    <Text style={styles.balanceBefore}>${toBeforeBalance.toLocaleString()}</Text>
                    <Text style={styles.balanceAfter}>${toAfterBalance.toLocaleString()}</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  headerTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#6B7280',
    opacity: 0.6,
  },
  inputCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold',
    marginRight: 8,
  },
  amountTextInput: {
    flex: 1,
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
  },
  accountList: {
    gap: 8,
  },
  accountButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedAccount: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  accountBalance: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  selectedAccountText: {
    color: '#10B981',
  },
  placeholderContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#6B7280',
    fontSize: 14,
    fontStyle: 'italic',
  },
  balanceCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
  },
  balanceTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  balanceBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 8,
  },
  balanceBefore: {
    color: '#6B7280',
    fontSize: 14,
    textDecorationLine: 'line-through',
    marginBottom: 4,
  },
  balanceAfter: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  dateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: 'white',
    fontSize: 16,
    flex: 1,
    marginLeft: 12,
  },
  errorInput: {
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
