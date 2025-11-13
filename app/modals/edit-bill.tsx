import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Bill } from '@/types';
import GlassCard from '@/components/GlassCard';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { fetchCategories } from '@/utils/categories';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface EditBillModalProps {
  visible: boolean;
  onClose: () => void;
  bill: Bill | null;
  onSuccess?: () => void;
}

export default function EditBillModal({
  visible,
  onClose,
  bill,
  onSuccess,
}: EditBillModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, globalRefresh } = useRealtimeData();

  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [interestIncluded, setInterestIncluded] = useState(false);
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('upcoming');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  useEffect(() => {
    if (bill) {
      setAmount(bill.amount?.toString() || '');
      setInterestAmount(bill.interest_amount?.toString() || '');
      setInterestIncluded(bill.interest_included || false);
      setDueDate(new Date(bill.due_date));
      setDescription(bill.description || '');
      setStatus(bill.status || 'upcoming');
    }
  }, [bill]);

  const formatCurrency = (value: number) => formatCurrencyAmount(value, currency);
  const formatDate = (date: Date) => date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];

  const handleSave = async () => {
    if (!user || !bill) return;

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      setSaving(true);

      const interestValue = parseFloat(interestAmount) || 0;
      let totalAmount = amountValue;
      let principalAmount = amountValue;

      if (interestIncluded && interestValue > 0) {
        totalAmount = amountValue;
        principalAmount = Math.max(0, amountValue - interestValue);
      } else if (!interestIncluded && interestValue > 0) {
        totalAmount = amountValue + interestValue;
        principalAmount = amountValue;
      }

      // Update bill with new deadline and amounts
      const { error } = await supabase
        .from('bills')
        .update({
          amount: totalAmount,
          principal_amount: principalAmount,
          interest_amount: interestValue,
          interest_included: interestIncluded,
          due_date: formatDateForInput(dueDate), // Update deadline
          original_due_date: bill.original_due_date || formatDateForInput(dueDate), // Keep original or update
          description: description || null,
          status: status === 'upcoming' ? 'upcoming' : status, // Don't change paid status when editing
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

      if (error) throw error;

      Alert.alert('Success', 'Bill updated successfully', [
        {
          text: 'OK',
          onPress: () => {
            onSuccess?.();
            handleClose();
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

  const handleMarkAsPaid = async () => {
    if (!user || !bill) return;

    // Show payment modal to get account and payment date
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(bill.linked_account_id || accounts[0].id);
    }

    Alert.alert(
      'Mark as Paid',
      'Mark this bill as paid? This will create a transaction and update the liability balance.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Paid',
          onPress: async () => {
            try {
              setSaving(true);

              // Get payment account
              const paymentAccountId = selectedAccountId || bill.linked_account_id || accounts[0]?.id;
              if (!paymentAccountId) {
                Alert.alert('Error', 'Please select an account to pay from');
                return;
              }

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

              const paymentDate = new Date();
              const paymentAmount = bill.amount || 0;

              // 1. Create expense transaction via RPC
              const { data: rpcData, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
                p_account_id: paymentAccountId,
                p_bucket_type: 'personal',
                p_bucket_id: 'personal',
                p_amount: paymentAmount,
                p_category: billCategoryId,
                p_description: description || `Payment for ${bill.title}`,
                p_date: formatDateForInput(paymentDate),
                p_currency: currency,
              });

              if (rpcError) {
                console.error('Error creating transaction:', rpcError);
                // Continue even if transaction creation fails
              }

              // 2. Update bill status
              const { error: billError } = await supabase
                .from('bills')
                .update({
                  status: 'paid',
                  last_paid_date: formatDateForInput(paymentDate),
                  updated_at: new Date().toISOString(),
                  metadata: {
                    ...bill.metadata,
                    paid_amount: paymentAmount,
                    principal_paid: bill.principal_amount || paymentAmount,
                    interest_paid: bill.interest_amount || 0,
                    paid_date: formatDateForInput(paymentDate),
                  },
                })
                .eq('id', bill.id);

              if (billError) throw billError;

              // 3. Update liability balance if this is a liability bill
              if (bill.liability_id && bill.principal_amount) {
                const { error: liabilityError } = await supabase.rpc('update_liability_balance', {
                  p_liability_id: bill.liability_id,
                  p_payment_amount: bill.principal_amount,
                });

                if (liabilityError) console.error('Error updating liability:', liabilityError);

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

              Alert.alert('Success', 'Bill marked as paid', [
                {
                  text: 'OK',
                  onPress: () => {
                    onSuccess?.();
                    handleClose();
                  },
                },
              ]);
            } catch (error: any) {
              console.error('Error marking bill as paid:', error);
              Alert.alert('Error', error.message || 'Failed to mark bill as paid');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleMarkAsSkipped = async () => {
    if (!user || !bill) return;

    Alert.alert('Skip Payment', 'Mark this bill as skipped? You can edit it later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);

            const { error } = await supabase
              .from('bills')
              .update({
                status: 'skipped',
                updated_at: new Date().toISOString(),
              })
              .eq('id', bill.id);

            if (error) throw error;

            Alert.alert('Success', 'Bill marked as skipped', [
              {
                text: 'OK',
                onPress: () => {
                  onSuccess?.();
                  handleClose();
                },
              },
            ]);
          } catch (error: any) {
            console.error('Error skipping bill:', error);
            Alert.alert('Error', error.message || 'Failed to skip bill');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleDelete = async () => {
    if (!user || !bill) return;

    Alert.alert('Delete Bill', 'Are you sure you want to delete this bill? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);

            const { error } = await supabase
              .from('bills')
              .update({ is_deleted: true })
              .eq('id', bill.id);

            if (error) throw error;

            Alert.alert('Success', 'Bill deleted successfully', [
              {
                text: 'OK',
                onPress: () => {
                  onSuccess?.();
                  handleClose();
                },
              },
            ]);
          } catch (error: any) {
            console.error('Error deleting bill:', error);
            Alert.alert('Error', error.message || 'Failed to delete bill');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleClose = () => {
    onClose();
  };

  if (!bill) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <GlassCard style={styles.glassCardOverride}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Edit Bill</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollViewContent}>
              {/* Bill Info */}
              <View style={styles.billInfo}>
                <Text style={styles.billTitle}>{bill.title}</Text>
                <Text style={styles.billNumber}>
                  {bill.payment_number ? `Payment #${bill.payment_number}` : 'Bill'}
                </Text>
              </View>

              {/* Amount */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Amount *</Text>
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
              </View>

              {/* Interest */}
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
                  <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : '$'}</Text>
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
                      ? `Interest (${formatCurrency(parseFloat(interestAmount))}) is included. Principal: ${formatCurrency(parseFloat(amount) - parseFloat(interestAmount))}`
                      : `Interest will be added. Total: ${formatCurrency(parseFloat(amount) + parseFloat(interestAmount))}`
                  ) : (
                    interestIncluded
                      ? 'Interest is part of the payment amount'
                      : 'Interest will be added to the payment amount'
                  )}
                </Text>
              </View>

              {/* Due Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Due Date *</Text>
                <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.dateButtonText}>{formatDate(dueDate)}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display="default"
                    onChange={(event, date) => {
                      setShowDatePicker(false);
                      if (date) {
                        setDueDate(date);
                      }
                    }}
                  />
                )}
              </View>

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

              {/* Quick Actions */}
              {bill.status !== 'paid' && (
                <View style={styles.quickActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={handleMarkAsPaid}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#10B981" />
                    <Text style={styles.actionButtonText}>Mark as Paid</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={handleMarkAsSkipped}>
                    <Ionicons name="close-circle-outline" size={20} color="#F59E0B" />
                    <Text style={styles.actionButtonText}>Skip Payment</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Delete */}
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text style={styles.deleteButtonText}>Delete Bill</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving || !amount}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </GlassCard>
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
    backgroundColor: 'transparent',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  glassCardOverride: {
    borderRadius: 30,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 0,
    margin: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
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
  scrollViewContent: {
    paddingVertical: 20,
  },
  billInfo: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    marginBottom: 20,
    alignItems: 'center',
  },
  billTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  billNumber: {
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
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: '#FFFFFF',
  },
  actionButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  deleteButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#EF4444',
  },
  accountList: {
    gap: 12,
    marginTop: 8,
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
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
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
  saveButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
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
});
