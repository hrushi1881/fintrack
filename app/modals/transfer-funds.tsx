import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import FundPicker, { FundBucket } from '@/components/FundPicker';

interface TransferFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedAccountId?: string;
  preselectedFundType?: 'personal' | 'liability' | 'goal';
}

export default function TransferFundsModal({
  visible,
  onClose,
  onSuccess,
  preselectedAccountId,
  preselectedFundType,
}: TransferFundsModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, globalRefresh, refreshAccountFunds, refreshAccounts } = useRealtimeData();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Source (From) selection
  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [fromFundBucket, setFromFundBucket] = useState<FundBucket | null>(null);
  const [showFromFundPicker, setShowFromFundPicker] = useState(false);

  // Destination (To) selection
  const [toAccountId, setToAccountId] = useState<string>('');
  const [toFundBucket, setToFundBucket] = useState<FundBucket | null>(null);
  const [showToFundPicker, setShowToFundPicker] = useState(false);

  // Filter accounts (exclude goals_savings and liability types)
  const availableAccounts = accounts.filter(
    (acc) =>
      acc.type !== 'goals_savings' &&
      acc.type !== 'liability' &&
      (acc.is_active === true || acc.is_active === undefined || acc.is_active === null)
  );

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setAmount('');
      setDescription('');
      setDate(new Date());
      setFromAccountId(preselectedAccountId || '');
      setFromFundBucket(null);
      setToAccountId('');
      setToFundBucket(null);
      setShowFromFundPicker(false);
      setShowToFundPicker(false);
    }
  }, [visible, preselectedAccountId]);

  // Auto-show fund picker when account is selected
  useEffect(() => {
    if (fromAccountId && !fromFundBucket && visible) {
      setShowFromFundPicker(true);
    }
  }, [fromAccountId, visible]);

  // Reset fund buckets when accounts change
  useEffect(() => {
    if (fromAccountId && fromFundBucket) {
      // Keep fund bucket if it's still valid
    }
  }, [fromAccountId]);

  useEffect(() => {
    if (toAccountId && toFundBucket) {
      // Keep fund bucket if it's still valid
    }
  }, [toAccountId]);

  const formatCurrency = (value: number) => {
    return formatCurrencyAmount(value, currency);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const validateForm = () => {
    if (!amount.trim()) {
      Alert.alert('Error', 'Please enter an amount');
      return false;
    }

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return false;
    }

    if (!fromAccountId) {
      Alert.alert('Error', 'Please select source account');
      return false;
    }

    if (!fromFundBucket) {
      Alert.alert('Error', 'Please select source fund');
      return false;
    }

    if (!toAccountId) {
      Alert.alert('Error', 'Please select destination account');
      return false;
    }

    if (!toFundBucket) {
      Alert.alert('Error', 'Please select destination fund');
      return false;
    }

    // Validate fund selection rules
    // Goal funds can only be transferred to Personal (withdrawal)
    if (fromFundBucket.type === 'goal' && toFundBucket.type !== 'personal') {
      Alert.alert(
        'Invalid Transfer',
        'Goal funds can only be transferred to Personal Fund. This is a withdrawal from the goal.'
      );
      return false;
    }

    // Liability funds can be transferred to Personal or another Liability Fund (same liability)
    if (fromFundBucket.type === 'borrowed') {
      if (toFundBucket.type === 'goal') {
        Alert.alert(
          'Invalid Transfer',
          'Liability funds cannot be transferred to Goal Fund. Transfer to Personal Fund first, then contribute to goal.'
        );
        return false;
      }
      // If transferring to another liability fund, must be same liability
      if (toFundBucket.type === 'borrowed' && fromFundBucket.id !== toFundBucket.id) {
        Alert.alert(
          'Invalid Transfer',
          'You can only transfer liability funds to the same liability fund or to Personal Fund.'
        );
        return false;
      }
    }

    // Check sufficient balance
    if (amountValue > fromFundBucket.amount) {
      Alert.alert(
        'Insufficient Funds',
        `Available: ${formatCurrency(fromFundBucket.amount)}\nRequired: ${formatCurrency(amountValue)}`
      );
      return false;
    }

    return true;
  };

  const handleTransfer = async () => {
    if (!user || !validateForm()) return;

    const amountValue = parseFloat(amount);

    try {
      setSaving(true);

      // Map fund bucket types for backend
      const mapBucketType = (type: FundBucket['type']) => {
        if (type === 'borrowed') return 'liability';
        return type;
      };

      // Step 1: Spend from source fund
      const fromBucketParam = {
        type: mapBucketType(fromFundBucket!.type),
        id: fromFundBucket!.type !== 'personal' ? fromFundBucket!.id : null,
      };

      const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user.id,
        p_account_id: fromAccountId,
        p_bucket: fromBucketParam,
        p_amount: amountValue,
        p_category: null, // Fund transfers don't need categories
        p_description: description.trim() || 'Fund transfer',
        p_date: formatDateForInput(date),
        p_currency: currency,
      });

      if (spendError) throw spendError;

      // Step 2: Receive into destination fund
      const toBucketType = mapBucketType(toFundBucket!.type);
      const toBucketId = toFundBucket!.type !== 'personal' ? toFundBucket!.id : null;

      const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
        p_user_id: user.id,
        p_account_id: toAccountId,
        p_bucket_type: toBucketType,
        p_bucket_id: toBucketId,
        p_amount: amountValue,
        p_category: 'Transfer', // Category name for transfer
        p_description: description.trim() || 'Fund transfer',
        p_date: formatDateForInput(date),
        p_notes: `Transfer from ${fromFundBucket!.name} to ${toFundBucket!.name}`,
        p_currency: currency,
      });

      if (receiveError) throw receiveError;

      // Refresh data
      await Promise.all([refreshAccounts(), refreshAccountFunds(), globalRefresh()]);

      Alert.alert('Success', 'Fund transfer completed successfully', [
        {
          text: 'OK',
          onPress: () => {
            handleClose();
            onSuccess?.();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error transferring funds:', error);
      Alert.alert('Error', error.message || 'Failed to transfer funds');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setDescription('');
    setDate(new Date());
    setFromAccountId('');
    setFromFundBucket(null);
    setToAccountId('');
    setToFundBucket(null);
    setShowFromFundPicker(false);
    setShowToFundPicker(false);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Transfer Funds</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Amount */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount *</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : '$'}</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                  />
                </View>
                {fromFundBucket && amount && parseFloat(amount) > 0 && (
                  <View style={styles.fundWarning}>
                    {(() => {
                      const amountValue = parseFloat(amount);
                      if (amountValue > fromFundBucket.amount) {
                        return (
                          <Text style={styles.fundWarningText}>
                            ⚠️ Insufficient funds. Available: {formatCurrency(fromFundBucket.amount)}
                          </Text>
                        );
                      }
                      return null;
                    })()}
                  </View>
                )}
              </View>

              {/* Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date *</Text>
                <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.dateButtonText}>{formatDate(date)}</Text>
                  <Ionicons name="chevron-down" size={16} color="rgba(0, 0, 0, 0.4)" />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                      }
                      if (selectedDate) {
                        setDate(selectedDate);
                        if (Platform.OS === 'ios') {
                          setShowDatePicker(false);
                        }
                      }
                    }}
                  />
                )}
              </View>

              {/* From Account */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>From Account *</Text>
                {availableAccounts.length === 0 ? (
                  <Text style={styles.helperText}>No accounts available</Text>
                ) : (
                  <View style={styles.accountList}>
                    {availableAccounts.map((account) => (
                      <TouchableOpacity
                        key={account.id}
                        style={[
                          styles.accountOption,
                          fromAccountId === account.id && styles.accountOptionSelected,
                        ]}
                        onPress={() => setFromAccountId(account.id)}
                      >
                        <View style={styles.accountOptionLeft}>
                          <Ionicons
                            name={account.type === 'card' ? 'card-outline' : 'wallet-outline'}
                            size={20}
                            color={fromAccountId === account.id ? '#000000' : 'rgba(0, 0, 0, 0.6)'}
                          />
                          <View>
                            <Text style={styles.accountName}>{account.name}</Text>
                            <Text style={styles.accountBalance}>{formatCurrency(account.balance)}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name={fromAccountId === account.id ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={fromAccountId === account.id ? '#10B981' : 'rgba(0, 0, 0, 0.3)'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* From Fund */}
              {fromAccountId && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>From Fund *</Text>
                  <TouchableOpacity
                    style={styles.fundButton}
                    onPress={() => setShowFromFundPicker(true)}
                  >
                    {fromFundBucket ? (
                      <View style={styles.fundButtonContent}>
                        <View style={styles.fundButtonLeft}>
                          <Ionicons
                            name={fromFundBucket.type === 'borrowed' ? 'card-outline' : 'wallet-outline'}
                            size={20}
                            color={fromFundBucket.type === 'borrowed' ? '#EF4444' : '#10B981'}
                          />
                          <View>
                            <Text style={styles.fundButtonName}>{fromFundBucket.name}</Text>
                            <Text style={styles.fundButtonBalance}>
                              Available: {formatCurrency(fromFundBucket.amount)}
                            </Text>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                      </View>
                    ) : (
                      <View style={styles.fundButtonContent}>
                        <Text style={styles.fundButtonPlaceholder}>Select source fund</Text>
                        <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.helperText}>Select which fund to transfer from</Text>
                </View>
              )}

              {/* To Account */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>To Account *</Text>
                {availableAccounts.length === 0 ? (
                  <Text style={styles.helperText}>No accounts available</Text>
                ) : (
                  <View style={styles.accountList}>
                    {availableAccounts.map((account) => (
                      <TouchableOpacity
                        key={account.id}
                        style={[
                          styles.accountOption,
                          toAccountId === account.id && styles.accountOptionSelected,
                        ]}
                        onPress={() => setToAccountId(account.id)}
                      >
                        <View style={styles.accountOptionLeft}>
                          <Ionicons
                            name={account.type === 'card' ? 'card-outline' : 'wallet-outline'}
                            size={20}
                            color={toAccountId === account.id ? '#000000' : 'rgba(0, 0, 0, 0.6)'}
                          />
                          <View>
                            <Text style={styles.accountName}>{account.name}</Text>
                            <Text style={styles.accountBalance}>{formatCurrency(account.balance)}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name={toAccountId === account.id ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={toAccountId === account.id ? '#10B981' : 'rgba(0, 0, 0, 0.3)'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* To Fund */}
              {toAccountId && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>To Fund *</Text>
                  <TouchableOpacity
                    style={styles.fundButton}
                    onPress={() => setShowToFundPicker(true)}
                  >
                    {toFundBucket ? (
                      <View style={styles.fundButtonContent}>
                        <View style={styles.fundButtonLeft}>
                          <Ionicons
                            name={toFundBucket.type === 'borrowed' ? 'card-outline' : 'wallet-outline'}
                            size={20}
                            color={toFundBucket.type === 'borrowed' ? '#EF4444' : '#10B981'}
                          />
                          <View>
                            <Text style={styles.fundButtonName}>{toFundBucket.name}</Text>
                            <Text style={styles.fundButtonBalance}>
                              Available: {formatCurrency(toFundBucket.amount)}
                            </Text>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                      </View>
                    ) : (
                      <View style={styles.fundButtonContent}>
                        <Text style={styles.fundButtonPlaceholder}>Select destination fund</Text>
                        <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.helperText}>
                    {fromFundBucket?.type === 'goal'
                      ? 'Goal funds can only be transferred to Personal Fund (withdrawal)'
                      : 'Select which fund to transfer to'}
                  </Text>
                </View>
              )}

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Add notes..."
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Transfer Rules Info */}
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Transfer Rules</Text>
                <View style={styles.infoItem}>
                  <Ionicons name="information-circle-outline" size={16} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.infoText}>
                    Personal funds can be transferred to any fund type
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="information-circle-outline" size={16} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.infoText}>
                    Liability funds can be transferred to Personal Fund only
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="lock-closed-outline" size={16} color="#EF4444" />
                  <Text style={styles.infoText}>
                    Goal funds can only be transferred to Personal Fund (withdrawal)
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.transferButton, saving && styles.transferButtonDisabled]}
                onPress={handleTransfer}
                disabled={saving || !amount || !fromAccountId || !fromFundBucket || !toAccountId || !toFundBucket}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.transferButtonText}>Transfer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* From Fund Picker */}
      {fromAccountId && (
        <FundPicker
          visible={showFromFundPicker}
          onClose={() => setShowFromFundPicker(false)}
          accountId={fromAccountId}
          onSelect={(bucket) => {
            // Goal funds can only be transferred to Personal
            // But we allow selection here, validation happens on submit
            setFromFundBucket(bucket);
            setShowFromFundPicker(false);
          }}
          amount={parseFloat(amount) || 0}
          excludeGoalFunds={false} // Allow selecting goal funds for withdrawal
        />
      )}

      {/* To Fund Picker */}
      {toAccountId && (
        <FundPicker
          visible={showToFundPicker}
          onClose={() => setShowToFundPicker(false)}
          accountId={toAccountId}
          onSelect={(bucket) => {
            // CRITICAL: Liability Funds CANNOT receive money (only created at disbursement)
            if (bucket.type === 'borrowed') {
              Alert.alert(
                'Invalid Selection',
                'Liability Funds cannot receive money. They are only created when loan money is disbursed to your account. Transfer to Personal Fund instead.'
              );
              return;
            }
            // If source is goal fund, only allow Personal
            if (fromFundBucket?.type === 'goal' && bucket.type !== 'personal') {
              Alert.alert(
                'Invalid Selection',
                'Goal funds can only be transferred to Personal Fund (withdrawal).'
              );
              return;
            }
            // If source is liability, don't allow goal
            if (fromFundBucket?.type === 'borrowed' && bucket.type === 'goal') {
              Alert.alert(
                'Invalid Selection',
                'Liability funds cannot be transferred to Goal Fund. Transfer to Personal Fund first.'
              );
              return;
            }
            setToFundBucket(bucket);
            setShowToFundPicker(false);
          }}
          amount={0} // No amount check for destination
          excludeGoalFunds={fromFundBucket?.type === 'borrowed'} // Exclude goal if source is liability
          excludeBorrowedFunds={true} // ALWAYS exclude liability funds as destination (they cannot receive money)
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: 'transparent',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  modalContainer: {
    width: '100%',
    height: '100%',
    minHeight: 500,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 30,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    flexShrink: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: 'bold',
    color: '#000000',
  },
  closeButton: {
    padding: 5,
  },
  scrollView: {
    flex: 1,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  inputGroup: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 8,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingLeft: 16,
  },
  currencySymbol: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    padding: 16,
    paddingLeft: 0,
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  accountList: {
    gap: 12,
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  accountOptionSelected: {
    borderColor: '#10B981',
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  accountOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  accountName: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  accountBalance: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginTop: 2,
  },
  fundButton: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  fundButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fundButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  fundButtonName: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  fundButtonBalance: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginTop: 2,
  },
  fundButtonPlaceholder: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: 'rgba(0, 0, 0, 0.4)',
    flex: 1,
  },
  fundWarning: {
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  fundWarningText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#EF4444',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 6,
  },
  infoCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.1)',
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    flexShrink: 0,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  transferButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferButtonDisabled: {
    opacity: 0.5,
  },
  transferButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

