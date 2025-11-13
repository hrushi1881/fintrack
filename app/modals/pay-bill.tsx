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
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Bill } from '@/types';
import GlassCard from '@/components/GlassCard';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { fetchCategories } from '@/utils/categories';
import FundPicker, { FundBucket } from '@/components/FundPicker';

interface PayBillModalProps {
  visible: boolean;
  onClose: () => void;
  bill: Bill | null;
  onSuccess?: () => void;
}

export default function PayBillModal({ visible, onClose, bill, onSuccess }: PayBillModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, globalRefresh } = useRealtimeData();

  const [paymentDate, setPaymentDate] = useState(new Date());
  const [amount, setAmount] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [interestIncluded, setInterestIncluded] = useState(false);
  const [dueDate, setDueDate] = useState(new Date());
  const [description, setDescription] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  // Reset form when bill changes
  useEffect(() => {
    if (bill) {
      setAmount(bill.amount?.toString() || '');
      setInterestAmount(bill.interest_amount?.toString() || '');
      setInterestIncluded(bill.interest_included || false);
      setDueDate(new Date(bill.due_date));
      setPaymentDate(bill.last_paid_date ? new Date(bill.last_paid_date) : new Date());
      setDescription(bill.description || `Payment for ${bill.title}`);
      setSelectedAccountId(bill.linked_account_id || (accounts.length > 0 ? accounts[0].id : ''));
      setSelectedFundBucket(null); // Reset fund selection when bill changes
    }
  }, [bill, accounts]);

  // Auto-show fund picker when account is selected (only for unpaid bills)
  useEffect(() => {
    if (selectedAccountId && !selectedFundBucket && visible && bill && bill.status !== 'paid') {
      setShowFundPicker(true);
    }
  }, [selectedAccountId, visible, bill, selectedFundBucket]);

  // Reset fund bucket when account changes
  useEffect(() => {
    if (selectedAccountId && selectedFundBucket) {
      setSelectedFundBucket(null);
    }
  }, [selectedAccountId]);

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

  const handleSave = async () => {
    if (!user || !bill) return;

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const interestValue = parseFloat(interestAmount || '0');
    if (interestAmount && (isNaN(interestValue) || interestValue < 0)) {
      Alert.alert('Error', 'Please enter a valid interest amount');
      return;
    }

    try {
      setSaving(true);

      // Calculate total amount and principal
      let totalAmount = amountValue;
      let principalAmount = amountValue;

      if (interestIncluded && interestValue > 0) {
        totalAmount = amountValue;
        principalAmount = Math.max(0, amountValue - interestValue);
      } else if (!interestIncluded && interestValue > 0) {
        totalAmount = amountValue + interestValue;
        principalAmount = amountValue;
      }

      // Update bill with new values
      const { error: billError } = await supabase
        .from('bills')
        .update({
          amount: totalAmount,
          principal_amount: principalAmount,
          interest_amount: interestValue || 0,
          interest_included: interestIncluded,
          due_date: formatDateForInput(dueDate), // Update deadline
          original_due_date: bill.original_due_date || formatDateForInput(dueDate),
          description: description || null,
          linked_account_id: selectedAccountId || bill.linked_account_id,
          updated_at: new Date().toISOString(),
          metadata: {
            ...bill.metadata,
            payment_amount: amountValue,
            total_amount: totalAmount,
            deadline_changed: true,
            deadline_changed_date: formatDateForInput(dueDate),
          },
        })
        .eq('id', bill.id);

      if (billError) throw billError;

      await globalRefresh();

      Alert.alert('Success', 'Bill updated successfully', [
        {
          text: 'OK',
          onPress: () => {
            onSuccess?.();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error updating bill:', error);
      Alert.alert('Error', error.message || 'Failed to update bill');
    } finally {
      setSaving(false);
    }
  };

  const handlePayment = async () => {
    if (!user || !bill) return;

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid payment amount');
      return;
    }

    if (!selectedAccountId) {
      Alert.alert('Error', 'Please select an account');
      return;
    }

    if (!selectedFundBucket) {
      Alert.alert('Error', 'Please select a fund source');
      return;
    }

    // Validate fund selection for liability bills
    if (bill.liability_id) {
      // For liability bills, only allow Personal Fund or the correct Liability Fund
      if (selectedFundBucket.type === 'borrowed' && selectedFundBucket.id !== bill.liability_id) {
        Alert.alert(
          'Invalid Fund Selection',
          `This bill is for a different liability. Please select Personal Fund or the Liability Fund for this bill.`
        );
        return;
      }
    }

    try {
      setSaving(true);

      // Calculate total amount and principal (in case user edited them)
      const interestValue = parseFloat(interestAmount || '0');
      let totalAmount = amountValue;
      let principalAmount = amountValue;

      if (interestIncluded && interestValue > 0) {
        // Interest is included in the payment amount
        totalAmount = amountValue;
        principalAmount = Math.max(0, amountValue - interestValue);
      } else if (!interestIncluded && interestValue > 0) {
        // Interest is additional, so total = principal + interest
        totalAmount = amountValue + interestValue;
        principalAmount = amountValue;
      }

      // First, update bill with any changes (deadline, amounts, etc.)
      const { error: updateError } = await supabase
        .from('bills')
        .update({
          amount: totalAmount,
          principal_amount: principalAmount,
          interest_amount: interestValue || 0,
          interest_included: interestIncluded,
          due_date: formatDateForInput(dueDate),
          description: description || null,
          linked_account_id: selectedAccountId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bill.id);

      if (updateError) throw updateError;

      // Get or find "Bills" category for bill payments
      let billCategoryId: string | null = null;
      try {
        const categories = await fetchCategories(user.id, { activityType: 'bill' });
        const billsCategory = categories.find(c => c.name === 'Bills' || c.name === 'Bill Payment');
        if (billsCategory) {
          billCategoryId = billsCategory.id;
        } else if (categories.length > 0) {
          billCategoryId = categories[0].id;
        } else {
          const expenseCategories = await fetchCategories(user.id, { activityType: 'expense' });
          const billsExpenseCategory = expenseCategories.find(c => c.name === 'Bills');
          if (billsExpenseCategory) {
            billCategoryId = billsExpenseCategory.id;
          } else if (expenseCategories.length > 0) {
            billCategoryId = expenseCategories[0].id;
          }
        }
      } catch (error) {
        console.error('Error fetching category:', error);
      }

      // 1. Create expense transaction via RPC - Use totalAmount (includes interest if not included)
      // Construct bucket parameter from selected fund
      const bucketParam = {
        type: selectedFundBucket.type === 'borrowed' ? 'liability' : selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };

      const { data: rpcData, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user.id,
        p_account_id: selectedAccountId,
        p_bucket: bucketParam,
        p_amount: totalAmount, // Use totalAmount which includes interest when interest is not included
        p_category: billCategoryId || null,
        p_description: description || `Payment for ${bill.title}`,
        p_date: formatDateForInput(paymentDate),
        p_currency: currency,
      });

      if (rpcError) throw rpcError;

      // 2. Mark bill as paid
      const { error: billError } = await supabase
        .from('bills')
        .update({
          status: 'paid',
          last_paid_date: formatDateForInput(paymentDate),
          updated_at: new Date().toISOString(),
          metadata: {
            ...bill.metadata,
            paid_amount: totalAmount, // Store the total amount paid (includes interest)
            principal_paid: principalAmount,
            interest_paid: interestValue || 0,
            paid_date: formatDateForInput(paymentDate),
            transaction_id: (rpcData as any)?.id || null,
          },
        })
        .eq('id', bill.id);

      if (billError) throw billError;

      // 3. Update liability balance if this is a liability bill
      if (bill.liability_id) {
        const { error: liabilityError } = await supabase.rpc('update_liability_balance', {
          p_liability_id: bill.liability_id,
          p_payment_amount: principalAmount,
        });

        if (liabilityError) {
          console.error('Error updating liability balance:', liabilityError);
        }

        // Check if liability is fully paid
        const { data: liability } = await supabase
          .from('liabilities')
          .select('current_balance')
          .eq('id', bill.liability_id)
          .single();

        if (liability && liability.current_balance <= 0) {
          await supabase
            .from('liabilities')
            .update({ status: 'paid_off' })
            .eq('id', bill.liability_id);
        }
      }

      await globalRefresh();

      Alert.alert('Success', 'Payment recorded successfully', [
        {
          text: 'OK',
          onPress: () => {
            handleClose();
            onSuccess?.();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error recording payment:', error);
      Alert.alert('Error', error.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setInterestAmount('');
    setInterestIncluded(false);
    setDueDate(new Date());
    setDescription('');
    setPaymentDate(new Date());
    setSelectedAccountId('');
    setSelectedFundBucket(null);
    setShowFundPicker(false);
    onClose();
  };

  if (!bill) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{bill.status === 'paid' ? 'Bill Details' : 'Pay Bill'}</Text>
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
              {/* Bill Info */}
              <View style={styles.billInfo}>
                <Text style={styles.billTitle}>{bill.title}</Text>
                {bill.payment_number && (
                  <Text style={styles.billNumber}>Payment #{bill.payment_number}</Text>
                )}
                {bill.status === 'paid' && bill.last_paid_date && (
                  <Text style={styles.billPaidDate}>
                    Paid on: {new Date(bill.last_paid_date).toLocaleDateString()}
                  </Text>
                )}
              </View>

              {/* Due Date (Deadline) - Editable */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Due Date (Deadline) *</Text>
                <TouchableOpacity 
                  style={[styles.dateButton, bill.status === 'paid' && styles.dateButtonDisabled]}
                  onPress={() => bill.status !== 'paid' && setShowDueDatePicker(true)}
                  disabled={bill.status === 'paid'}
                >
                  <Ionicons name="calendar-outline" size={20} color={bill.status === 'paid' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.6)'} />
                  <Text style={[styles.dateButtonText, bill.status === 'paid' && styles.dateButtonTextDisabled]}>
                    {formatDate(dueDate)}
                  </Text>
                  {bill.status !== 'paid' && (
                    <Ionicons name="chevron-down" size={16} color="rgba(0, 0, 0, 0.4)" />
                  )}
                </TouchableOpacity>
                {showDueDatePicker && (
                  <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                      if (Platform.OS === 'android') {
                        setShowDueDatePicker(false);
                      }
                      if (date) {
                        setDueDate(date);
                        if (Platform.OS === 'ios') {
                          setShowDueDatePicker(false);
                        }
                      }
                    }}
                  />
                )}
                <Text style={styles.helperText}>
                  Deadline can be changed. Calendar will update automatically.
                </Text>
              </View>

              {/* Payment Amount - Editable */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Amount *</Text>
                <View style={[styles.amountInputContainer, bill.status === 'paid' && styles.amountInputContainerDisabled]}>
                  <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : '$'}</Text>
                  <TextInput
                    style={[styles.amountInput, bill.status === 'paid' && styles.amountInputDisabled]}
                    placeholder="0.00"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    editable={bill.status !== 'paid'}
                  />
                </View>
              </View>

              {/* Interest Amount - Editable */}
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Interest Amount (Optional)</Text>
                  {bill.status !== 'paid' && (
                    <View style={styles.switchContainer}>
                      <Text style={styles.switchLabel}>Included</Text>
                      <Switch
                        value={interestIncluded}
                        onValueChange={setInterestIncluded}
                        trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  )}
                </View>
                <View style={[styles.amountInputContainer, bill.status === 'paid' && styles.amountInputContainerDisabled]}>
                  <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : '$'}</Text>
                  <TextInput
                    style={[styles.amountInput, bill.status === 'paid' && styles.amountInputDisabled]}
                    placeholder="0.00"
                    value={interestAmount}
                    onChangeText={setInterestAmount}
                    keyboardType="numeric"
                    editable={bill.status !== 'paid'}
                  />
                </View>
                <Text style={styles.helperText}>
                  {interestAmount && amount ? (
                    interestIncluded 
                      ? `Interest (${formatCurrency(parseFloat(interestAmount))}) is included. Principal: ${formatCurrency(parseFloat(amount) - parseFloat(interestAmount))}`
                      : `Interest will be added. Total: ${formatCurrency(parseFloat(amount) + parseFloat(interestAmount))}`
                  ) : (
                    interestIncluded 
                      ? 'Interest is part of the payment amount'
                      : 'Interest will be added to the payment amount'
                  )}
                </Text>
              </View>

              {/* Payment Date (When actually paying) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Date *</Text>
                <TouchableOpacity 
                  style={styles.dateButton} 
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.dateButtonText}>{formatDate(paymentDate)}</Text>
                  <Ionicons name="chevron-down" size={16} color="rgba(0, 0, 0, 0.4)" />
                </TouchableOpacity>
                <Text style={styles.helperText}>
                  Date when payment is actually made (can be different from due date)
                </Text>
                {showDatePicker && (
                  <DateTimePicker
                    value={paymentDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                      }
                      if (date) {
                        setPaymentDate(date);
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
                {accounts.length === 0 ? (
                  <Text style={styles.helperText}>No accounts available. Please create an account first.</Text>
                ) : (
                  <View style={styles.accountList}>
                    {accounts.map((account) => (
                      <TouchableOpacity
                        key={account.id}
                        style={[
                          styles.accountOption,
                          selectedAccountId === account.id && styles.accountOptionSelected,
                        ]}
                        onPress={() => setSelectedAccountId(account.id)}
                      >
                        <View style={styles.accountOptionLeft}>
                          <Ionicons
                            name={account.type === 'card' ? 'card-outline' : 'wallet-outline'}
                            size={20}
                            color={selectedAccountId === account.id ? '#000000' : 'rgba(0, 0, 0, 0.6)'}
                          />
                          <View>
                            <Text style={styles.accountName}>{account.name}</Text>
                            <Text style={styles.accountBalance}>{formatCurrency(account.balance)}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name={selectedAccountId === account.id ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={selectedAccountId === account.id ? '#10B981' : 'rgba(0, 0, 0, 0.3)'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Fund Selection - Only show if account is selected and bill is not paid */}
              {selectedAccountId && bill.status !== 'paid' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Fund Source *</Text>
                  <TouchableOpacity
                    style={styles.fundButton}
                    onPress={() => setShowFundPicker(true)}
                  >
                    {selectedFundBucket ? (
                      <View style={styles.fundButtonContent}>
                        <View style={styles.fundButtonLeft}>
                          <Ionicons
                            name={selectedFundBucket.type === 'borrowed' ? 'card-outline' : 'wallet-outline'}
                            size={20}
                            color={selectedFundBucket.type === 'borrowed' ? '#EF4444' : '#10B981'}
                          />
                          <View>
                            <Text style={styles.fundButtonName}>{selectedFundBucket.name}</Text>
                            <Text style={styles.fundButtonBalance}>
                              Available: {formatCurrency(selectedFundBucket.amount)}
                            </Text>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                      </View>
                    ) : (
                      <View style={styles.fundButtonContent}>
                        <Text style={styles.fundButtonPlaceholder}>Select fund source</Text>
                        <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.helperText}>
                    {bill.liability_id
                      ? 'Select Personal Fund or Liability Fund for this bill'
                      : 'Select which fund to pay from'}
                  </Text>
                  {selectedFundBucket && amount && parseFloat(amount) > 0 && (
                    <View style={styles.fundWarning}>
                      {(() => {
                        const totalAmount = interestIncluded
                          ? parseFloat(amount)
                          : parseFloat(amount) + parseFloat(interestAmount || '0');
                        if (totalAmount > selectedFundBucket.amount) {
                          return (
                            <Text style={styles.fundWarningText}>
                              ⚠️ Insufficient funds. Available: {formatCurrency(selectedFundBucket.amount)}, 
                              Required: {formatCurrency(totalAmount)}
                            </Text>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  )}
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
                  editable={bill.status !== 'paid'}
                />
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
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Due Date:</Text>
                    <Text style={styles.summaryValue}>{formatDate(dueDate)}</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              {bill.status !== 'paid' && (
                <>
                  <TouchableOpacity
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={saving || !amount}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.payButton, saving && styles.payButtonDisabled]}
                    onPress={handlePayment}
                    disabled={saving || !amount || !selectedAccountId || !selectedFundBucket}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.payButtonText}>
                        Pay {formatCurrency(
                          (() => {
                            const amountValue = parseFloat(amount) || 0;
                            const interestValue = parseFloat(interestAmount || '0');
                            if (interestIncluded || interestValue === 0) {
                              return amountValue;
                            } else {
                              return amountValue + interestValue;
                            }
                          })()
                        )}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
              {bill.status === 'paid' && (
                <View style={styles.paidBadge}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.paidBadgeText}>Paid</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Fund Picker Modal */}
      {selectedAccountId && bill && (
        <FundPicker
          visible={showFundPicker}
          onClose={() => setShowFundPicker(false)}
          accountId={selectedAccountId}
          onSelect={(bucket) => {
            // For liability bills, validate fund selection
            if (bill.liability_id) {
              // Allow Personal Fund or the correct Liability Fund
              if (bucket.type === 'personal' || (bucket.type === 'borrowed' && bucket.id === bill.liability_id)) {
                setSelectedFundBucket(bucket);
                setShowFundPicker(false);
              } else {
                Alert.alert(
                  'Invalid Selection',
                  'You can only pay from Personal Fund or the Liability Fund for this bill.'
                );
              }
            } else {
              // For non-liability bills, allow Personal Fund only (goal funds are excluded)
              if (bucket.type === 'personal') {
                setSelectedFundBucket(bucket);
                setShowFundPicker(false);
              } else {
                Alert.alert(
                  'Invalid Selection',
                  'For this bill, you can only pay from Personal Fund.'
                );
              }
            }
          }}
          amount={
            interestIncluded
              ? parseFloat(amount) || 0
              : (parseFloat(amount) || 0) + (parseFloat(interestAmount || '0') || 0)
          }
          excludeGoalFunds={true} // Goal funds cannot be spent
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
  scrollView: {
    flex: 1,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: 'bold',
    color: '#000000',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  editButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  editButtonTextActive: {
    color: '#10B981',
  },
  closeButton: {
    padding: 5,
  },
  billInfo: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  billTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  billNumber: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  billPaidDate: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#10B981',
    marginTop: 4,
  },
  billDue: {
    fontSize: 14,
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
    fontFamily: 'Poppins-SemiBold',
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
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
  amountInputContainerDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderColor: 'rgba(0, 0, 0, 0.05)',
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
  amountInputDisabled: {
    color: 'rgba(0, 0, 0, 0.4)',
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
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  dateButtonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  dateButtonTextDisabled: {
    color: 'rgba(0, 0, 0, 0.4)',
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
  payButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonDisabled: {
    opacity: 0.5,
  },
  payButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  paidBadge: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  paidBadgeText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
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
  helperText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 6,
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
});
