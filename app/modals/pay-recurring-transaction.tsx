import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import FundPicker, { FundBucket } from '@/components/FundPicker';
import { fetchScheduledPaymentById, ScheduledPayment, markScheduledPaymentPaid } from '@/utils/scheduledPayments';
import { fetchRecurringTransactionById, updateRecurringTransaction } from '@/utils/recurringTransactions';

interface PayRecurringTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  scheduledPaymentId: string;
  onSuccess?: () => void;
}

export default function PayRecurringTransactionModal({
  visible,
  onClose,
  scheduledPaymentId,
  onSuccess,
}: PayRecurringTransactionModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { globalRefresh, refreshAccounts, refreshAccountFunds, refreshTransactions, accounts } = useRealtimeData();

  const [scheduledPayment, setScheduledPayment] = useState<ScheduledPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Payment form state
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);

  // Filter out goals_savings and liability accounts
  const regularAccounts = useMemo(() => {
    return accounts.filter(
      (acc) =>
        acc.type !== 'goals_savings' &&
        acc.type !== 'liability' &&
        (acc.is_active === true || acc.is_active === undefined || acc.is_active === null)
    );
  }, [accounts]);

  useEffect(() => {
    if (visible && scheduledPaymentId && user) {
      setLoading(true);
      fetchScheduledPaymentById(scheduledPaymentId)
        .then((payment) => {
          setScheduledPayment(payment);
          if (payment) {
            setAmount(payment.amount.toString());
            setPaymentDate(new Date(payment.due_date));
            setSelectedAccountId(payment.linked_account_id || null);
            setDescription(payment.description || '');
          }
        })
        .catch((error) => {
          console.error('Error loading scheduled payment:', error);
          Alert.alert('Error', 'Failed to load scheduled payment');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [visible, scheduledPaymentId, user]);

  // Reset fund bucket when account changes
  useEffect(() => {
    if (selectedAccountId && selectedFundBucket) {
      setSelectedFundBucket(null);
    }
  }, [selectedAccountId]);

  const handlePay = async () => {
    if (!user || !scheduledPayment) return;

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid payment amount');
      return;
    }

    if (!selectedAccountId) {
      Alert.alert('Error', 'Please select a payment account');
      return;
    }

    if (!selectedFundBucket) {
      Alert.alert('Error', 'Please select a fund source');
      return;
    }

    try {
      setSaving(true);

      const bucketParam = {
        type: selectedFundBucket.type === 'borrowed' ? 'liability' : selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };

      // Create transaction using spend_from_account_bucket
      const { data: rpcData, error: transactionError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user.id,
        p_account_id: selectedAccountId,
        p_bucket: bucketParam,
        p_amount: amountValue,
        p_category: scheduledPayment.category_id || scheduledPayment.title,
        p_description: description.trim() || scheduledPayment.title,
        p_date: paymentDate.toISOString().split('T')[0],
        p_currency: scheduledPayment.currency || currency,
      });

      if (transactionError) throw transactionError;

      const transactionId = rpcData?.transaction_id;

      // Mark scheduled payment as paid
      await markScheduledPaymentPaid(scheduledPaymentId, transactionId);

      // Update recurring transaction stats if linked
      if (scheduledPayment.linked_recurring_transaction_id) {
        const recurringTx = await fetchRecurringTransactionById(scheduledPayment.linked_recurring_transaction_id);
        if (recurringTx) {
          await updateRecurringTransaction({
            id: recurringTx.id,
            completed_occurrences: (recurringTx.completed_occurrences || 0) + 1,
            total_paid: (recurringTx.total_paid || 0) + amountValue,
            last_transaction_date: paymentDate.toISOString().split('T')[0],
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      await Promise.all([
        refreshAccounts(),
        refreshAccountFunds(),
        refreshTransactions(),
      ]);

      Alert.alert('Success', 'Payment recorded successfully', [
        {
          text: 'OK',
          onPress: () => {
            globalRefresh();
            onSuccess?.();
            onClose();
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

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!visible) return null;

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Recurring Transaction</Text>
              <View style={styles.closeButton} />
            </View>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#000000" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  if (!scheduledPayment) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Recurring Transaction</Text>
              <View style={styles.closeButton} />
            </View>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Scheduled payment not found</Text>
              <TouchableOpacity style={styles.backButton} onPress={onClose}>
                <Text style={styles.backButtonText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Recurring Transaction</Text>
              <View style={styles.closeButton} />
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Payment Info */}
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.infoLabel}>Payment</Text>
                <Text style={styles.infoValue}>{scheduledPayment.title}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Due Date</Text>
                  <Text style={styles.infoBalance}>
                    {formatDate(new Date(scheduledPayment.due_date))}
                  </Text>
                </View>
              </GlassCard>

              {/* Account Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Account</Text>
                {regularAccounts.length === 0 ? (
                  <GlassCard padding={20} marginVertical={8}>
                    <Text style={styles.emptyText}>
                      No accounts available. Please create an account first.
                    </Text>
                  </GlassCard>
                ) : (
                  <View style={styles.accountList}>
                    {regularAccounts.map((acc) => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[
                          styles.accountItem,
                          selectedAccountId === acc.id && styles.accountItemActive,
                        ]}
                        onPress={() => setSelectedAccountId(acc.id)}
                      >
                        <View style={styles.accountInfo}>
                          <Text
                            style={[
                              styles.accountName,
                              selectedAccountId === acc.id && styles.accountNameActive,
                            ]}
                          >
                            {acc.name}
                          </Text>
                          <Text style={styles.accountBalance}>
                            {formatCurrency(Number(acc.balance || 0))}
                          </Text>
                        </View>
                        {selectedAccountId === acc.id && (
                          <Ionicons name="checkmark-circle" size={24} color="#000000" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Fund Source Selection */}
              {selectedAccountId && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Fund Source</Text>
                  {selectedFundBucket ? (
                    <TouchableOpacity
                      style={styles.fundBucketButton}
                      onPress={() => setShowFundPicker(true)}
                    >
                      <View style={styles.fundBucketInfo}>
                        <View
                          style={[
                            styles.fundBucketIcon,
                            { backgroundColor: (selectedFundBucket.color || '#F59E0B') + '20' },
                          ]}
                        >
                          <Ionicons
                            name={
                              selectedFundBucket.type === 'personal'
                                ? 'wallet-outline'
                                : selectedFundBucket.type === 'borrowed'
                                ? 'card-outline'
                                : 'layers-outline'
                            }
                            size={20}
                            color={selectedFundBucket.color || '#F59E0B'}
                          />
                        </View>
                        <View style={styles.fundBucketDetails}>
                          <Text style={styles.fundBucketName}>{selectedFundBucket.name}</Text>
                          <Text style={styles.fundBucketAmount}>
                            Available: {formatCurrencyAmount(selectedFundBucket.amount, currency)}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.selectFundButton}
                      onPress={() => setShowFundPicker(true)}
                    >
                      <Ionicons name="wallet-outline" size={20} color="#000000" />
                      <Text style={styles.selectFundText}>Select Fund Source</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Amount */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payment Amount</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>{currency === 'USD' ? '$' : '₹'}</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    placeholderTextColor="rgba(0, 0, 0, 0.4)"
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>
              </View>

              {/* Payment Date */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payment Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.dateButtonText}>{formatDate(paymentDate)}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={paymentDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                        if (event.type === 'set' && selectedDate) {
                          setPaymentDate(selectedDate);
                        }
                      } else {
                        if (selectedDate) {
                          setPaymentDate(selectedDate);
                        }
                        setShowDatePicker(false);
                      }
                    }}
                  />
                )}
              </View>

              {/* Description */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Description (Optional)</Text>
                <TextInput
                  style={styles.descriptionInput}
                  placeholder="Add a note..."
                  placeholderTextColor="rgba(0, 0, 0, 0.4)"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.payButton,
                  (saving || !amount || !selectedAccountId || !selectedFundBucket) &&
                    styles.payButtonDisabled,
                ]}
                onPress={handlePay}
                disabled={saving || !amount || !selectedAccountId || !selectedFundBucket}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.payButtonText}>Pay {formatCurrency(parseFloat(amount) || 0)}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Fund Picker Modal */}
            {showFundPicker && selectedAccountId && (
              <FundPicker
                visible={showFundPicker}
                accountId={selectedAccountId}
                onClose={() => setShowFundPicker(false)}
                onSelect={(bucket) => {
                  setSelectedFundBucket(bucket);
                  setShowFundPicker(false);
                }}
              />
            )}
          </View>
        </View>
      </View>
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: 'transparent',
  },
  modalContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
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
    width: 34,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 20,
  },
  backButton: {
    padding: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoBalance: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  accountList: {
    gap: 12,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  accountItemActive: {
    borderColor: '#F59E0B',
    borderWidth: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: 'rgba(0, 0, 0, 0.8)',
    marginBottom: 4,
  },
  accountNameActive: {
    color: '#000000',
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  fundBucketButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  fundBucketInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  fundBucketIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fundBucketDetails: {
    flex: 1,
  },
  fundBucketName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
    marginBottom: 4,
  },
  fundBucketAmount: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  selectFundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    gap: 8,
  },
  selectFundText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
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
    color: 'rgba(0, 0, 0, 0.6)',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    padding: 16,
    paddingLeft: 0,
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    gap: 12,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    backgroundColor: '#FFFFFF',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
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
  payButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
  },
  payButtonDisabled: {
    opacity: 0.5,
  },
  payButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
  },
});

