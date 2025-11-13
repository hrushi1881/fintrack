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
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import GlassCard from '@/components/GlassCard';
import { formatCurrencyAmount, formatCurrencySymbol } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface AddLiabilityBillModalProps {
  visible: boolean;
  onClose: () => void;
  liabilityId: string;
  liabilityName: string;
  liabilityStartDate: string;
  liabilityEndDate?: string;
  onSuccess?: () => void;
}

export default function AddLiabilityBillModal({
  visible,
  onClose,
  liabilityId,
  liabilityName,
  liabilityStartDate,
  liabilityEndDate,
  onSuccess,
}: AddLiabilityBillModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, refreshTransactions, getFundSummary, refreshAccountFunds } = useRealtimeData();

  const [amount, setAmount] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [interestIncluded, setInterestIncluded] = useState(false);
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

  // Get default due date (today or liability start date, whichever is later)
  const getDefaultDueDate = (): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(liabilityStartDate);
    startDate.setHours(0, 0, 0, 0);
    
    // Use today if it's after start date, otherwise use start date
    return today >= startDate ? today : startDate;
  };

  // Filter out goals_savings and liability accounts - these shouldn't be used for bill payments
  const availableAccounts = useMemo(() => {
    return accounts.filter(
      (acc) => {
        // Exclude by type
        if (acc.type === 'goals_savings' || acc.type === 'liability') {
          return false;
        }
        // Also exclude by name (in case type is wrong or name contains "Goals Savings")
        const accountNameLower = (acc.name || '').toLowerCase();
        if (accountNameLower.includes('goals savings') || 
            accountNameLower.includes('goal savings') ||
            accountNameLower === 'goals savings') {
          return false;
        }
        // Only include active accounts
        return acc.is_active === true || acc.is_active === undefined || acc.is_active === null;
      }
    );
  }, [accounts]);

  const calculatePaymentNumber = async (): Promise<number> => {
    try {
      const { data: existingBills, error } = await supabase
        .from('bills')
        .select('payment_number')
        .eq('liability_id', liabilityId)
        .eq('user_id', user?.id)
        .order('payment_number', { ascending: false })
        .limit(1);

      if (error) throw error;

      return existingBills && existingBills.length > 0 
        ? (existingBills[0].payment_number || 0) + 1 
        : 1;
    } catch (error) {
      console.error('Error calculating payment number:', error);
      return 1;
    }
  };

  const handleSave = async () => {
    if (!user) return;

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid payment amount');
      return;
    }

    const interestValue = parseFloat(interestAmount || '0');
    if (interestAmount && (isNaN(interestValue) || interestValue < 0)) {
      Alert.alert('Error', 'Please enter a valid interest amount');
      return;
    }

    if (!linkedAccountId) {
      Alert.alert('Error', 'Please select an account');
      return;
    }

    try {
      setSaving(true);

      // Calculate payment number
      const paymentNumber = await calculatePaymentNumber();

      // Calculate total amount and principal
      // If interest is included: total = amount (already includes interest), principal = amount - interest
      // If interest is NOT included: total = amount + interest, principal = amount
      let totalAmount = amountValue;
      let principalAmount = amountValue;

      if (interestIncluded && interestValue > 0) {
        // Interest is included in the payment amount
        // Total = amount (already includes interest)
        totalAmount = amountValue;
        principalAmount = Math.max(0, amountValue - interestValue);
      } else if (!interestIncluded && interestValue > 0) {
        // Interest is additional to payment amount
        // Total = payment amount + interest
        totalAmount = amountValue + interestValue;
        principalAmount = amountValue;
      } else {
        // No interest specified
        totalAmount = amountValue;
        principalAmount = amountValue;
      }

      // Format due date
      const dueDateString = dueDate.toISOString().split('T')[0];

      // Create bill with all required fields
      const { error: billError } = await supabase
        .from('bills')
        .insert({
          user_id: user.id,
          title: `${liabilityName} - Payment #${paymentNumber}`,
          description: null,
          amount: totalAmount, // Total bill amount (payment + interest if not included)
          currency: currency,
          due_date: dueDateString,
          original_due_date: dueDateString, // Store original due date
          status: 'upcoming',
          bill_type: 'liability_linked',
          liability_id: liabilityId,
          linked_account_id: linkedAccountId,
          interest_amount: interestValue || 0,
          principal_amount: principalAmount,
          payment_number: paymentNumber,
          interest_included: interestIncluded,
          color: '#10B981', // Green for liability bills
          icon: 'receipt-outline', // Receipt icon
          reminder_days: [1, 3, 7], // Default reminder days
          metadata: {
            source_type: 'liability',
            payment_amount: amountValue, // Store original payment amount
            total_amount: totalAmount,
            interest_included: interestIncluded,
            created_manually: true,
          },
          is_active: true,
          is_deleted: false,
        });

      if (billError) throw billError;

      // Wait for database commit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Refresh data
      await Promise.all([
        refreshTransactions(),
        refreshAccountFunds(),
      ]);

      Alert.alert('Success', 'Bill created successfully', [
        {
          text: 'OK',
          onPress: () => {
            onSuccess?.();
            handleClose();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error creating bill:', error);
      Alert.alert('Error', error.message || 'Failed to create bill');
    } finally {
      setSaving(false);
    }
  };

  // Initialize default account and refresh funds when modal opens
  useEffect(() => {
    if (visible) {
      // Refresh account funds to ensure we have latest data
      refreshAccountFunds();
      
      // Set default due date to today or liability start date (whichever is later)
      const defaultDueDate = getDefaultDueDate();
      setDueDate(defaultDueDate);
      
      // Set first available account as default if no account selected
      if (availableAccounts.length > 0 && !linkedAccountId) {
        setLinkedAccountId(availableAccounts[0].id);
      } else if (availableAccounts.length === 0 && linkedAccountId) {
        // Clear selection if selected account is no longer available
        setLinkedAccountId('');
      } else if (linkedAccountId && !availableAccounts.find(acc => acc.id === linkedAccountId)) {
        // If selected account is no longer available, select first available
        if (availableAccounts.length > 0) {
          setLinkedAccountId(availableAccounts[0].id);
        } else {
          setLinkedAccountId('');
        }
      }
    }
  }, [visible, availableAccounts, linkedAccountId, refreshAccountFunds, liabilityStartDate]);

  const handleClose = () => {
    setAmount('');
    setInterestAmount('');
    setInterestIncluded(false);
    setLinkedAccountId('');
    setDueDate(new Date());
    setShowDatePicker(false);
    onClose();
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Create Bill</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Liability Info */}
              <View style={styles.liabilityInfo}>
                <Text style={styles.liabilityName}>{liabilityName}</Text>
              </View>

              {/* Payment Amount Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Amount *</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>{formatCurrencySymbol(currency)}</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.helperText}>
                  The base payment amount
                </Text>
              </View>

              {/* Interest Amount */}
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Interest Amount (Optional)</Text>
                  <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>Included</Text>
                    <Switch
                      value={interestIncluded}
                      onValueChange={setInterestIncluded}
                      trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>{formatCurrencySymbol(currency)}</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    value={interestAmount}
                    onChangeText={setInterestAmount}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.helperText}>
                  {interestAmount && amount ? (
                    interestIncluded 
                      ? `Interest (${formatCurrency(parseFloat(interestAmount))}) is included in payment amount. Principal: ${formatCurrency(parseFloat(amount) - parseFloat(interestAmount))}`
                      : `Interest (${formatCurrency(parseFloat(interestAmount))}) will be added to payment. Total: ${formatCurrency(parseFloat(amount) + parseFloat(interestAmount))}`
                  ) : (
                    interestIncluded 
                      ? 'If interest is included, it is part of the payment amount above'
                      : 'If interest is not included, it will be added to the payment amount'
                  )}
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
                  When this bill payment is due
                </Text>
                {showDatePicker && (
                  <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                      }
                      if (selectedDate) {
                        setDueDate(selectedDate);
                        if (Platform.OS === 'ios') {
                          setShowDatePicker(false);
                        }
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
                        // Personal funds = spendable funds minus borrowed (liability) funds
                        // Since borrowed funds are spendable, we subtract them to get personal funds
                        const personalFunds = Math.max(0, fundSummary.spendable - (fundSummary.borrowed || 0));
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
                              color={linkedAccountId === account.id ? '#10B981' : 'rgba(0, 0, 0, 0.3)'}
                            />
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                )}
              </View>

              {/* Bill Summary */}
              {amount && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Bill Summary</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Payment Amount:</Text>
                    <Text style={styles.summaryValue}>
                      {formatCurrency(parseFloat(amount) || 0)}
                    </Text>
                  </View>
                  {interestAmount && parseFloat(interestAmount) > 0 && (
                    <>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>
                          Interest ({interestIncluded ? 'Included' : 'Additional'}):
                        </Text>
                        <Text style={styles.summaryValue}>
                          {formatCurrency(parseFloat(interestAmount))}
                        </Text>
                      </View>
                      <View style={styles.summaryDivider} />
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Principal:</Text>
                        <Text style={styles.summaryValue}>
                          {formatCurrency(
                            interestIncluded
                              ? Math.max(0, parseFloat(amount) - parseFloat(interestAmount))
                              : parseFloat(amount)
                          )}
                        </Text>
                      </View>
                    </>
                  )}
                  <View style={styles.summaryDivider} />
                  <View style={[styles.summaryRow, styles.summaryTotal]}>
                    <Text style={styles.summaryTotalLabel}>Total Amount:</Text>
                    <Text style={styles.summaryTotalValue}>
                      {formatCurrency(
                        interestAmount && parseFloat(interestAmount) > 0 && !interestIncluded
                          ? parseFloat(amount) + parseFloat(interestAmount)
                          : parseFloat(amount)
                      )}
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
                  <Text style={styles.createButtonText}>Save Bill</Text>
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
  liabilityInfo: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  liabilityName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
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
  createButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.1)',
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
    color: 'rgba(0, 0, 0, 0.6)',
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginVertical: 8,
  },
  summaryTotal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  summaryTotalValue: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
});

