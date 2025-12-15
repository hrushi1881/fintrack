import React, { useState, useEffect, useMemo } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrencyAmount, formatCurrencySymbol } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { fetchRecurringTransactionById, RecurringTransaction } from '@/utils/recurringTransactions';
import { createScheduledPayment } from '@/utils/scheduledPayments';
import { calculateNextOccurrence, RecurrenceDefinition } from '@/utils/recurrence';

interface AddRecurringTransactionPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  recurringTransactionId: string;
  onSuccess?: () => void;
}

export default function AddRecurringTransactionPaymentModal({
  visible,
  onClose,
  recurringTransactionId,
  onSuccess,
}: AddRecurringTransactionPaymentModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, refreshTransactions, getFundSummary, refreshAccountFunds } = useRealtimeData();

  const [recurringTransaction, setRecurringTransaction] = useState<RecurringTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatCurrency = (value: number) => {
    return formatCurrencyAmount(value, currency);
  };

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  // Filter out goals_savings and liability accounts
  const availableAccounts = useMemo(() => {
    return accounts.filter(
      (acc) => {
        if (acc.type === 'goals_savings' || acc.type === 'liability') {
          return false;
        }
        const accountNameLower = (acc.name || '').toLowerCase();
        if (accountNameLower.includes('goals savings') || 
            accountNameLower.includes('goal savings') ||
            accountNameLower === 'goals savings') {
          return false;
        }
        return acc.is_active === true || acc.is_active === undefined || acc.is_active === null;
      }
    );
  }, [accounts]);

  // Load recurring transaction
  useEffect(() => {
    if (visible && recurringTransactionId && user) {
      setLoading(true);
      fetchRecurringTransactionById(recurringTransactionId)
        .then((tx) => {
          setRecurringTransaction(tx);
          if (tx) {
            // Set default amount based on transaction type
            if (tx.amount_type === 'fixed' && tx.amount) {
              setAmount(tx.amount.toString());
            } else if (tx.amount_type === 'variable' && tx.estimated_amount) {
              setAmount(tx.estimated_amount.toString());
            }
            // Set default account
            if (tx.linked_account_id) {
              setLinkedAccountId(tx.linked_account_id);
            }
            // Calculate next due date based on recurrence
            const def: RecurrenceDefinition = {
              frequency: tx.frequency,
              interval: tx.interval || 1,
              start_date: tx.start_date,
              end_date: tx.end_date || undefined,
              date_of_occurrence: tx.date_of_occurrence || undefined,
              custom_unit: tx.custom_unit || undefined,
              custom_interval: tx.custom_interval || undefined,
            };
            const today = new Date().toISOString().split('T')[0];
            const nextDate = calculateNextOccurrence(def, today);
            if (nextDate) {
              setDueDate(new Date(nextDate));
            }
          }
        })
        .catch((error) => {
          console.error('Error loading recurring transaction:', error);
          Alert.alert('Error', 'Failed to load recurring transaction');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [visible, recurringTransactionId, user]);

  // Initialize default account when modal opens
  useEffect(() => {
    if (visible) {
      refreshAccountFunds();
      if (availableAccounts.length > 0 && !linkedAccountId) {
        setLinkedAccountId(availableAccounts[0].id);
      }
    }
  }, [visible, availableAccounts, linkedAccountId, refreshAccountFunds]);

  const handleSave = async () => {
    if (!user || !recurringTransaction) return;

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid payment amount');
      return;
    }

    if (!linkedAccountId) {
      Alert.alert('Error', 'Please select an account');
      return;
    }

    try {
      setSaving(true);

      const dueDateString = formatDateForInput(dueDate);

      // Create scheduled payment linked to recurring transaction
      await createScheduledPayment({
        title: `${recurringTransaction.title} - Payment`,
        category_id: recurringTransaction.category_id || undefined,
        amount: amountValue,
        type: recurringTransaction.type as 'income' | 'expense',
        due_date: dueDateString,
        linked_account_id: linkedAccountId,
        fund_type: (recurringTransaction.fund_type || 'personal') as 'personal' | 'liability' | 'goal',
        linked_recurring_transaction_id: recurringTransactionId,
        recurring_transaction_id: recurringTransactionId,
        notes: `Cycle payment for ${recurringTransaction.title}`,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      await Promise.all([
        refreshTransactions(),
        refreshAccountFunds(),
      ]);

      Alert.alert('Success', 'Payment scheduled successfully', [
        {
          text: 'OK',
          onPress: () => {
            onSuccess?.();
            handleClose();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error scheduling payment:', error);
      Alert.alert('Error', error.message || 'Failed to schedule payment');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setLinkedAccountId('');
    setDueDate(new Date());
    setShowDatePicker(false);
    setRecurringTransaction(null);
    onClose();
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#000000" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (!recurringTransaction) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Recurring transaction not found</Text>
              <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Schedule Payment</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Recurring Transaction Info */}
              <View style={styles.transactionInfo}>
                <Ionicons name={recurringTransaction.icon as any} size={24} color={recurringTransaction.color} />
                <Text style={styles.transactionName}>{recurringTransaction.title}</Text>
                <Text style={styles.transactionFrequency}>
                  {recurringTransaction.frequency} • {recurringTransaction.amount_type === 'fixed' ? 'Fixed' : 'Variable'}
                </Text>
              </View>

              {/* Payment Amount Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Amount *</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>{formatCurrencySymbol(currency)}</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder={recurringTransaction.amount_type === 'variable' ? 'Enter amount' : recurringTransaction.amount?.toString() || '0.00'}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.helperText}>
                  {recurringTransaction.amount_type === 'variable' 
                    ? 'Enter the actual amount for this cycle'
                    : 'Amount is fixed for this recurring transaction'}
                </Text>
              </View>

              {/* Due Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Due Date *</Text>
                <TouchableOpacity 
                  style={styles.dateButton} 
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.dateButtonText}>{formatDate(dueDate)}</Text>
                  <Ionicons name="chevron-down" size={16} color="rgba(0, 0, 0, 0.4)" />
                </TouchableOpacity>
                <Text style={styles.helperText}>
                  When this payment is due
                </Text>
                {showDatePicker && (
                  <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                        if (event.type === 'set' && selectedDate) {
                          setDueDate(selectedDate);
                        }
                      } else {
                        if (selectedDate) {
                          setDueDate(selectedDate);
                        }
                        setShowDatePicker(false);
                      }
                    }}
                  />
                )}
              </View>

              {/* Account Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Account *</Text>
                {availableAccounts.length === 0 ? (
                  <Text style={styles.helperText}>
                    No accounts available. Please create an account first.
                  </Text>
                ) : (
                  <View style={styles.accountList}>
                    {availableAccounts.map((account) => {
                        const fundSummary = getFundSummary(account.id);
                        const accountBalance = typeof account.balance === 'string' ? parseFloat(account.balance) : account.balance ?? 0;
                        const personalFunds = Math.max(0, accountBalance - (fundSummary.borrowed || 0) - (fundSummary.goal || 0));
                        const hasLiabilityFunds = (fundSummary.borrowed || 0) > 0;
                        
                        return (
                          <TouchableOpacity
                            key={account.id}
                            style={[
                              styles.accountOption,
                              linkedAccountId === account.id && styles.accountOptionSelected,
                            ]}
                            onPress={() => setLinkedAccountId(account.id)}
                          >
                            <View style={styles.accountOptionLeft}>
                              <Ionicons
                                name={
                                  account.type === 'card' 
                                    ? 'card-outline' 
                                    : account.type === 'wallet' 
                                    ? 'wallet-outline' 
                                    : account.type === 'cash'
                                    ? 'cash-outline'
                                    : 'wallet-outline'
                                }
                                size={20}
                                color={linkedAccountId === account.id ? '#000000' : 'rgba(0, 0, 0, 0.6)'}
                              />
                              <View style={styles.accountInfo}>
                                <Text style={styles.accountName}>{account.name}</Text>
                                <Text style={styles.accountBalance}>{formatCurrency(account.balance)}</Text>
                                {linkedAccountId === account.id && fundSummary.total > 0 && (
                                  <View style={styles.fundBreakdown}>
                                    {personalFunds > 0 && (
                                      <Text style={styles.fundText}>
                                        Personal: {formatCurrency(personalFunds)}
                                      </Text>
                                    )}
                                    {hasLiabilityFunds && (
                                      <Text style={styles.fundText}>
                                        Liability: {formatCurrency(fundSummary.borrowed)}
                                      </Text>
                                    )}
                                    {(fundSummary.goal || 0) > 0 && (
                                      <Text style={styles.fundText}>
                                        Goal: {formatCurrency(fundSummary.goal)}
                                      </Text>
                                    )}
                                  </View>
                                )}
                              </View>
                            </View>
                            <Ionicons
                              name={linkedAccountId === account.id ? 'checkmark-circle' : 'ellipse-outline'}
                              size={24}
                              color={linkedAccountId === account.id ? '#F59E0B' : 'rgba(0, 0, 0, 0.3)'}
                            />
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                )}
              </View>

              {/* Payment Summary */}
              {amount && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Payment Summary</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Amount:</Text>
                    <Text style={styles.summaryValue}>
                      {formatCurrency(parseFloat(amount) || 0)}
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={[styles.summaryRow, styles.summaryTotal]}>
                    <Text style={styles.summaryTotalLabel}>Total:</Text>
                    <Text style={styles.summaryTotalValue}>
                      {formatCurrency(parseFloat(amount) || 0)}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, (saving || !amount || !linkedAccountId) && styles.createButtonDisabled]}
                onPress={handleSave}
                disabled={saving || !amount || !linkedAccountId}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.createButtonText}>Schedule Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
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
  scrollView: {
    flex: 1,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 20,
  },
  closeButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
    padding: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
  },
  transactionInfo: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    gap: 8,
  },
  transactionName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  transactionFrequency: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
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
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  helperText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 6,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    gap: 12,
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
    borderColor: '#F59E0B',
    borderWidth: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  accountOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  accountInfo: {
    flex: 1,
    gap: 4,
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
  },
  fundBreakdown: {
    marginTop: 4,
    gap: 2,
  },
  fundText: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  summaryTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginVertical: 8,
  },
  summaryTotal: {
    marginTop: 4,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  summaryTotalValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
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
    color: '#000000',
  },
  createButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
  },
});

