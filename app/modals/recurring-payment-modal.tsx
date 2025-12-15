import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import GlassCard from '@/components/GlassCard';
import FundPicker, { FundBucket } from '@/components/FundPicker';
import AccountSelector from '@/components/AccountSelector';
import { formatCurrencyAmount } from '@/utils/currency';
import {
  fetchRecurringTransactionById,
  RecurringTransaction,
} from '@/utils/recurringTransactions';
import {
  createScheduledPayment,
  CreateScheduledPaymentData,
  fetchScheduledPaymentById,
  markScheduledPaymentPaid,
} from '@/utils/scheduledPayments';

type RecurringPaymentModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  recurringTransactionId: string;
  cycleNumber?: number;
  expectedAmount?: number;
  expectedDate?: string;
  scheduledPaymentId?: string;
  prefillAmount?: number;
  prefillDate?: Date;
};

export default function RecurringPaymentModal({
  visible,
  onClose,
  onSuccess,
  recurringTransactionId,
  cycleNumber,
  expectedAmount,
  expectedDate,
  scheduledPaymentId,
  prefillAmount,
  prefillDate,
}: RecurringPaymentModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, refreshAccounts, refreshAccountFunds, refreshTransactions, globalRefresh } = useRealtimeData();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [recurring, setRecurring] = useState<RecurringTransaction | null>(null);
  const [scheduled, setScheduled] = useState<any | null>(null);

  const [totalAmount, setTotalAmount] = useState<string>(
    prefillAmount
      ? prefillAmount.toString()
      : expectedAmount
        ? expectedAmount.toString()
        : ''
  );
  const [paymentDate, setPaymentDate] = useState<Date>(
    prefillDate || (expectedDate ? new Date(expectedDate) : new Date())
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);

  // Template selection hint (subscriptions/utilities/income)
  const [template, setTemplate] = useState<'subscription' | 'utility' | 'income' | null>(null);

  const regularAccounts = useMemo(() => {
    return accounts.filter(
      (acc) =>
        acc.type !== 'goals_savings' &&
        acc.type !== 'liability' &&
        (acc.is_active === true || acc.is_active === undefined || acc.is_active === null)
    );
  }, [accounts]);

  useEffect(() => {
    const load = async () => {
      if (!user || !recurringTransactionId) return;
      setLoading(true);
      try {
        const rt = await fetchRecurringTransactionById(recurringTransactionId);
        if (rt) {
          setRecurring(rt);
          if (!totalAmount && (rt.amount || rt.estimated_amount)) {
            setTotalAmount((rt.amount || rt.estimated_amount || 0).toString());
          }
          if (!description) setDescription(rt.title || '');
          if (rt.account_id) setSelectedAccountId(rt.account_id);
        }

        // Load scheduled payment: explicit id or by cycle
        let sched = null;
        if (scheduledPaymentId) {
          sched = await fetchScheduledPaymentById(scheduledPaymentId);
        } else if (cycleNumber) {
          const { data } = await supabase
            .from('scheduled_transactions')
            .select('*')
            .eq('linked_recurring_transaction_id', recurringTransactionId)
            .eq('metadata->>cycle_number', cycleNumber.toString())
            .maybeSingle();
          sched = data;
        }
        if (sched) {
          setScheduled(sched);
          setTotalAmount((sched.actual_amount || sched.amount || 0).toString());
          setPaymentDate(new Date(sched.due_date));
          setSelectedAccountId(sched.linked_account_id || sched.account_id || null);
          setDescription(sched.title || sched.name || description);
        }
      } catch (err) {
        console.error('Error loading recurring payment modal:', err);
      } finally {
        setLoading(false);
      }
    };
    if (visible) load();
  }, [visible, recurringTransactionId, scheduledPaymentId, cycleNumber, description, totalAmount, user]);

  useEffect(() => {
    if (selectedAccountId && selectedFundBucket) {
      setSelectedFundBucket(null);
    }
  }, [selectedAccountId]);

  const isToday = useMemo(() => {
    const today = new Date();
    return (
      today.getFullYear() === paymentDate.getFullYear() &&
      today.getMonth() === paymentDate.getMonth() &&
      today.getDate() === paymentDate.getDate()
    );
  }, [paymentDate]);

  const applyTemplate = (type: 'subscription' | 'utility' | 'income') => {
    setTemplate(type);
    if (type === 'subscription' && recurring?.amount) {
      setTotalAmount(recurring.amount.toString());
    }
    if (type === 'utility' && recurring?.estimated_amount) {
      setTotalAmount(recurring.estimated_amount.toString());
    }
    if (type === 'income' && recurring?.amount) {
      setTotalAmount(recurring.amount.toString());
    }
  };

  const buildScheduledPayload = (): CreateScheduledPaymentData => {
    if (!user) throw new Error('Not authenticated');
    const amountNum = parseFloat(totalAmount || '0');
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('Enter a valid amount');
    }
    const dueDateString = paymentDate.toISOString().split('T')[0];
    return {
      title: description || recurring?.title || 'Recurring payment',
      category_id: (scheduled && scheduled.category_id) || recurring?.category_id || undefined,
      amount: amountNum,
      type: (recurring?.type as 'income' | 'expense') || 'expense',
      due_date: dueDateString,
      linked_account_id: selectedAccountId || recurring?.account_id || undefined,
      fund_type: (recurring?.fund_type || 'personal') as 'personal' | 'liability' | 'goal',
      linked_recurring_transaction_id: recurringTransactionId,
      recurring_transaction_id: recurringTransactionId,
      notes: `Cycle ${cycleNumber || 1} - ${description || recurring?.title || 'payment'}`,
    };
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = buildScheduledPayload();
      let schedId = scheduled?.id;
      if (schedId) {
        // update existing - use correct column names
        const { error } = await supabase
          .from('scheduled_transactions')
          .update({
            name: payload.title, // Map title to name column
            amount: payload.amount,
            type: payload.type,
            due_date: payload.due_date,
            account_id: payload.linked_account_id, // Map to account_id column
            fund_type: payload.fund_type,
            notes: payload.notes,
            status_changed_at: new Date().toISOString(),
          })
          .eq('id', schedId);
        if (error) throw error;
      } else {
        const created = await createScheduledPayment(payload);
        schedId = created.id;
      }
      Alert.alert('Saved', 'Payment scheduled');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const handlePayNow = async () => {
    if (!user) return;
    if (!selectedAccountId) {
      Alert.alert('Select account', 'Choose an account to pay from.');
      return;
    }
    if (!selectedFundBucket) {
      Alert.alert('Select fund', 'Choose a fund source.');
      return;
    }
    const amountNum = parseFloat(totalAmount || '0');
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Enter valid amount', 'Amount must be greater than zero.');
      return;
    }
    try {
      setSaving(true);
      // Ensure scheduled exists
      let schedId = scheduled?.id;
      if (!schedId) {
        const payload = buildScheduledPayload();
        const created = await createScheduledPayment(payload);
        schedId = created.id;
      }
      // Spend
      const bucketParam = {
        type: selectedFundBucket.type === 'borrowed' ? 'liability' : selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };
      const { data: rpcData, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user.id,
        p_account_id: selectedAccountId,
        p_bucket: bucketParam,
        p_amount: amountNum,
        p_category: scheduled?.category_id || recurring?.category_id || null,
        p_description: description || recurring?.title || 'Recurring payment',
        p_date: paymentDate.toISOString().split('T')[0],
        p_currency: recurring?.currency || currency,
      });
      if (rpcError) throw rpcError;
      const transactionId = rpcData as string | null;

      await markScheduledPaymentPaid(schedId, transactionId);

      await Promise.all([
        refreshAccounts(),
        refreshAccountFunds(),
        refreshTransactions(),
        globalRefresh(),
      ]);

      Alert.alert('Success', 'Payment recorded');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to pay');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#000" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="arrow-back" size={22} color="#000" />
                </TouchableOpacity>
                <Text style={styles.title}>
                  {scheduled ? 'Pay / Update' : 'Save / Pay'} {recurring?.title || 'Recurring'}
                </Text>
                <View style={{ width: 32 }} />
              </View>

              {/* Templates */}
              <GlassCard padding={16} marginVertical={10}>
                <Text style={styles.sectionLabel}>Quick Templates</Text>
                <View style={styles.templateRow}>
                  {(['subscription', 'utility', 'income'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.templateChip,
                        template === t && styles.templateChipActive,
                      ]}
                      onPress={() => applyTemplate(t)}
                    >
                      <Text style={[
                        styles.templateChipText,
                        template === t && styles.templateChipTextActive,
                      ]}>
                        {t === 'subscription' ? 'Subscription' : t === 'utility' ? 'Utility' : 'Income'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </GlassCard>

              {/* Amount */}
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.sectionLabel}>Total Amount</Text>
                <TextInput
                  style={styles.amountInput}
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                />
                {expectedAmount !== undefined && (
                  <Text style={styles.hintText}>
                    Expected: {formatCurrencyAmount(expectedAmount, currency)}
                  </Text>
                )}
              </GlassCard>

              {/* Date */}
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.sectionLabel}>Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="#000" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateText}>
                      {paymentDate.toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                    {isToday && <Text style={styles.dateSubtext}>Today</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(0,0,0,0.5)" />
                </TouchableOpacity>
                {Platform.OS === 'ios' && showDatePicker && (
                  <DateTimePicker
                    value={paymentDate}
                    mode="date"
                    display="spinner"
                    onChange={(event, date) => {
                      setShowDatePicker(false);
                      if (date) setPaymentDate(date);
                    }}
                    style={{ width: '100%' }}
                  />
                )}
                {Platform.OS === 'android' && showDatePicker && (
                  <DateTimePicker
                    value={paymentDate}
                    mode="date"
                    display="default"
                    onChange={(event, date) => {
                      setShowDatePicker(false);
                      if (date) setPaymentDate(date);
                    }}
                  />
                )}
              </GlassCard>

              {/* Description */}
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.sectionLabel}>Description</Text>
                <TextInput
                  style={styles.descriptionInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Description"
                  placeholderTextColor="rgba(0,0,0,0.4)"
                />
              </GlassCard>

              {/* Account */}
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.sectionLabel}>Source Account</Text>
                <AccountSelector
                  accounts={regularAccounts}
                  selectedAccountId={selectedAccountId || undefined}
                  onSelect={(acc) => {
                    setSelectedAccountId(acc.id);
                    setSelectedFundBucket(null);
                  }}
                  showBalance
                />
              </GlassCard>

              {/* Fund */}
              {selectedAccountId && (
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.sectionLabel}>Fund Source</Text>
                  <TouchableOpacity
                    style={styles.fundButton}
                    onPress={() => setShowFundPicker(true)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fundText}>
                        {selectedFundBucket ? selectedFundBucket.name : 'Select fund'}
                      </Text>
                      {selectedFundBucket && (
                        <Text style={styles.fundSubtext}>
                          {formatCurrencyAmount(selectedFundBucket.amount, currency)} available
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-down" size={18} color="rgba(0,0,0,0.5)" />
                  </TouchableOpacity>
                </GlassCard>
              )}
            </ScrollView>
          )}

          {/* Fund Picker */}
          {selectedAccountId && (
            <FundPicker
              visible={showFundPicker}
              onClose={() => setShowFundPicker(false)}
              accountId={selectedAccountId}
              onSelect={(bucket) => {
                setSelectedFundBucket(bucket);
                setShowFundPicker(false);
              }}
              amount={parseFloat(totalAmount || '0') || 0}
              excludeGoalFunds={true}
              excludeBorrowedFunds={false}
            />
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.secondaryButton, saving && styles.disabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.disabled]}
              onPress={handlePayNow}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Pay</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4B5563',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: '#000000',
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.7)',
    marginBottom: 8,
  },
  templateRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  templateChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  templateChipActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  templateChipText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: '#111827',
  },
  templateChipTextActive: {
    color: '#6366F1',
  },
  amountInput: {
    fontSize: 32,
    fontFamily: 'Archivo-Bold',
    color: '#000',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingVertical: 6,
  },
  hintText: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.5)',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  dateText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000',
  },
  dateSubtext: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.5)',
  },
  descriptionInput: {
    fontSize: 15,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
  },
  fundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  fundText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000',
  },
  fundSubtext: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.5)',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  secondaryText: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#000',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    borderRadius: 14,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    fontFamily: 'Poppins-Bold',
    color: '#FFF',
  },
  disabled: {
    opacity: 0.6,
  },
});

