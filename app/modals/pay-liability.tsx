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
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import FundPicker, { FundBucket } from '@/components/FundPicker';
import { calculatePaymentBreakdown } from '@/utils/liabilityCalculations';
import { applyExtraPayment, ExtraPaymentOption } from '@/utils/liabilityPaymentAdjustments';

type LiabilityData = {
  id: string;
  title: string;
  liability_type: string;
  current_balance: number;
  original_amount?: number;
  interest_rate_apy?: number;
  periodical_payment?: number;
  start_date?: string;
  last_payment_date?: string;
  next_due_date?: string;
  metadata?: any;
};

interface PayLiabilityModalProps {
  visible: boolean;
  onClose: () => void;
  liabilityId: string;
  onSuccess?: () => void;
}

export default function PayLiabilityModal({ visible, onClose, liabilityId, onSuccess }: PayLiabilityModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { getAccountBreakdown, fetchLiabilityAllocations } = useLiabilities();
  const { globalRefresh, refreshAccounts, refreshAccountFunds, refreshTransactions, recalculateAllBalances } = useRealtimeData();
  
  const [liability, setLiability] = useState<LiabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // Payment form state
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);
  const [showExtraPaymentOptions, setShowExtraPaymentOptions] = useState(false);
  const [extraPaymentOption, setExtraPaymentOption] = useState<ExtraPaymentOption>('reducePrincipal');
  const [numberOfPaymentsToSkip, setNumberOfPaymentsToSkip] = useState('1');

  // Calculate payment breakdown
  const paymentBreakdown = useMemo(() => {
    if (!liability || !amount) return null;
    
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) return null;

    const currentBalance = Number(liability.current_balance || 0);
    const annualRate = Number(liability.interest_rate_apy || 0);
    const lastPaymentDate = liability.last_payment_date ? new Date(liability.last_payment_date) : undefined;

    return calculatePaymentBreakdown(
      paymentAmount,
      currentBalance,
      annualRate,
      paymentDate,
      lastPaymentDate
    );
  }, [liability, amount, paymentDate]);

  useEffect(() => {
    if (visible && liabilityId && user) {
      // Reset form when modal opens
      setAmount('');
      setSelectedAccountId(null);
      setSelectedFundBucket(null);
      setDescription('');
      setPaymentDate(new Date());
      setShowExtraPaymentOptions(false);
      setExtraPaymentOption('reducePrincipal');
      setNumberOfPaymentsToSkip('1');
      fetchLiability();
      fetchAccounts();
    }
  }, [visible, liabilityId, user]);

  const fetchAccounts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  // Auto-show fund picker when account is selected
  useEffect(() => {
    if (selectedAccountId && !selectedFundBucket && visible) {
      setShowFundPicker(true);
    }
  }, [selectedAccountId, visible]);

  // Reset fund bucket when account changes
  useEffect(() => {
    if (selectedAccountId && selectedFundBucket) {
      setSelectedFundBucket(null);
    }
  }, [selectedAccountId]);

  // Calculate regular accounts
  const regularAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];
    return accounts.filter((a) => 
      a.type !== 'liability' && 
      a.type !== 'goals_savings' && 
      a.is_active === true
    );
  }, [accounts]);

  const fetchLiability = async () => {
    if (!user || !liabilityId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('liabilities')
        .select('*')
        .eq('id', liabilityId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setLiability(data);
      
      // Pre-fill amount with monthly payment if available
      if (data.periodical_payment) {
        setAmount(data.periodical_payment.toString());
      }
    } catch (error) {
      console.error('Error fetching liability:', error);
      Alert.alert('Error', 'Failed to load liability');
    } finally {
      setLoading(false);
    }
  };

  // Check if payment is extra (more than regular payment)
  const isExtraPayment = useMemo(() => {
    if (!liability || !amount) return false;
    const amountNum = parseFloat(amount);
    const regularPayment = liability.periodical_payment || 0;
    return !isNaN(amountNum) && amountNum > regularPayment && regularPayment > 0;
  }, [liability, amount]);

  const extraAmount = useMemo(() => {
    if (!isExtraPayment || !liability || !amount) return 0;
    const amountNum = parseFloat(amount);
    const regularPayment = liability.periodical_payment || 0;
    return amountNum - regularPayment;
  }, [isExtraPayment, liability, amount]);

  const handlePayment = async () => {
    if (!user || !liability || !amount) return;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
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

    // If extra payment and option not selected, show options
    if (isExtraPayment && !showExtraPaymentOptions) {
      setShowExtraPaymentOptions(true);
      return;
    }

    try {
      setSaving(true);
      
      const regularPayment = liability.periodical_payment || 0;
      const regularAmount = isExtraPayment ? regularPayment : amountNum;
      const extraAmountValue = isExtraPayment ? extraAmount : 0;

      // First, record the regular payment
      if (selectedFundBucket.type === 'personal') {
        // Repay from personal funds using repay_liability
        const { error: repayErr } = await supabase.rpc('repay_liability', {
          p_user_id: user.id,
          p_account_id: selectedAccountId,
          p_liability_id: liability.id,
          p_amount: regularAmount,
          p_date: paymentDate.toISOString().split('T')[0],
          p_notes: description || null,
        });
        if (repayErr) throw repayErr;
      } else if (selectedFundBucket.type === 'borrowed' && selectedFundBucket.id === liability.id) {
        // Repay using liability portion funds from the same liability
        const { error: settleErr } = await supabase.rpc('settle_liability_portion', {
          p_user_id: user.id,
          p_account_id: selectedAccountId,
          p_liability_id: liability.id,
          p_amount: regularAmount,
          p_date: paymentDate.toISOString().split('T')[0],
          p_notes: description || null,
        });
        if (settleErr) throw settleErr;
      } else {
        Alert.alert('Error', 'Selected fund source is not valid for this liability payment');
        setSaving(false);
        return;
      }

      // If there's an extra payment, apply it with the selected option
      if (extraAmountValue > 0 && showExtraPaymentOptions) {
        const skipCount = extraPaymentOption === 'skipPayments' 
          ? parseInt(numberOfPaymentsToSkip) || 1 
          : undefined;
        
        const result = await applyExtraPayment(
          liability.id,
          user.id,
          extraAmountValue,
          extraPaymentOption,
          skipCount
        );

        if (!result.success) {
          Alert.alert('Warning', result.message || 'Extra payment could not be applied, but regular payment was recorded');
        }
      }

      // Wait for database commit
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh all data
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
              <Text style={styles.headerTitle}>Pay Liability</Text>
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

  if (!liability) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Liability</Text>
              <View style={styles.closeButton} />
            </View>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Liability not found</Text>
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
              <Text style={styles.headerTitle}>Pay Liability</Text>
              <View style={styles.closeButton} />
            </View>

            <ScrollView 
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Liability Info */}
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.infoLabel}>Liability</Text>
                <Text style={styles.infoValue}>{liability.title}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Current Balance</Text>
                  <Text style={styles.infoBalance}>
                    {formatCurrency(Number(liability.current_balance || 0))}
                  </Text>
                </View>
                {liability.interest_rate_apy && liability.interest_rate_apy > 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Interest Rate</Text>
                    <Text style={styles.infoBalance}>
                      {liability.interest_rate_apy.toFixed(2)}% annually
                    </Text>
                  </View>
                )}
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
                          <Text style={[
                            styles.accountName,
                            selectedAccountId === acc.id && styles.accountNameActive,
                          ]}>
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
                        <View style={[styles.fundBucketIcon, { backgroundColor: (selectedFundBucket.color || '#6366F1') + '20' }]}>
                          <Ionicons
                            name={
                              selectedFundBucket.type === 'personal'
                                ? 'wallet-outline'
                                : selectedFundBucket.type === 'borrowed'
                                ? 'card-outline'
                                : 'layers-outline'
                            }
                            size={20}
                            color={selectedFundBucket.color || '#6366F1'}
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
                {liability.periodical_payment && (
                  <TouchableOpacity
                    style={styles.suggestedAmountButton}
                    onPress={() => setAmount(liability.periodical_payment!.toString())}
                  >
                    <Text style={styles.suggestedAmountText}>
                      Use monthly payment: {formatCurrency(liability.periodical_payment)}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Payment Breakdown Preview */}
              {paymentBreakdown && (
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.breakdownTitle}>Payment Breakdown</Text>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Principal</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrency(paymentBreakdown.principal)}
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Interest</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrency(paymentBreakdown.interest)}
                    </Text>
                  </View>
                  <View style={styles.breakdownDivider} />
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabelTotal}>Total Payment</Text>
                    <Text style={styles.breakdownValueTotal}>
                      {formatCurrency(paymentBreakdown.totalAmount)}
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Remaining Balance</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrency(paymentBreakdown.remainingBalance)}
                    </Text>
                  </View>
                  {isExtraPayment && !showExtraPaymentOptions && (
                    <>
                      <View style={styles.breakdownDivider} />
                      <View style={styles.extraPaymentNotice}>
                        <Ionicons name="information-circle-outline" size={20} color="#F59E0B" />
                        <Text style={styles.extraPaymentText}>
                          You're paying {formatCurrency(extraAmount)} extra. Tap "Continue" to choose how to apply it.
                        </Text>
                      </View>
                    </>
                  )}
                </GlassCard>
              )}

              {/* Extra Payment Options */}
              {isExtraPayment && showExtraPaymentOptions && (
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.extraOptionsTitle}>Apply Extra Payment</Text>
                  <Text style={styles.extraOptionsSubtitle}>
                    You're paying {formatCurrency(extraAmount)} more than your regular payment of {formatCurrency(liability.periodical_payment || 0)}.
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.extraOptionButton,
                      extraPaymentOption === 'reducePayment' && styles.extraOptionButtonActive,
                    ]}
                    onPress={() => setExtraPaymentOption('reducePayment')}
                  >
                    <Ionicons
                      name={extraPaymentOption === 'reducePayment' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={extraPaymentOption === 'reducePayment' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                    />
                    <View style={styles.extraOptionContent}>
                      <Text style={styles.extraOptionTitle}>Reduce Monthly Payment</Text>
                      <Text style={styles.extraOptionDescription}>
                        Keep same end date, lower your monthly payment
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.extraOptionButton,
                      extraPaymentOption === 'reduceTerm' && styles.extraOptionButtonActive,
                    ]}
                    onPress={() => setExtraPaymentOption('reduceTerm')}
                  >
                    <Ionicons
                      name={extraPaymentOption === 'reduceTerm' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={extraPaymentOption === 'reduceTerm' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                    />
                    <View style={styles.extraOptionContent}>
                      <Text style={styles.extraOptionTitle}>Reduce Loan Term</Text>
                      <Text style={styles.extraOptionDescription}>
                        Keep same monthly payment, finish earlier
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.extraOptionButton,
                      extraPaymentOption === 'skipPayments' && styles.extraOptionButtonActive,
                    ]}
                    onPress={() => setExtraPaymentOption('skipPayments')}
                  >
                    <Ionicons
                      name={extraPaymentOption === 'skipPayments' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={extraPaymentOption === 'skipPayments' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                    />
                    <View style={styles.extraOptionContent}>
                      <Text style={styles.extraOptionTitle}>Skip Next Few Payments</Text>
                      <Text style={styles.extraOptionDescription}>
                        Pre-pay for upcoming payments
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {extraPaymentOption === 'skipPayments' && (
                    <View style={styles.skipPaymentsInput}>
                      <Text style={styles.skipPaymentsLabel}>Number of payments to skip:</Text>
                      <TextInput
                        style={styles.skipPaymentsTextInput}
                        placeholder="1"
                        placeholderTextColor="rgba(0, 0, 0, 0.4)"
                        keyboardType="number-pad"
                        value={numberOfPaymentsToSkip}
                        onChangeText={setNumberOfPaymentsToSkip}
                      />
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.extraOptionButton,
                      extraPaymentOption === 'reducePrincipal' && styles.extraOptionButtonActive,
                    ]}
                    onPress={() => setExtraPaymentOption('reducePrincipal')}
                  >
                    <Ionicons
                      name={extraPaymentOption === 'reducePrincipal' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={extraPaymentOption === 'reducePrincipal' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                    />
                    <View style={styles.extraOptionContent}>
                      <Text style={styles.extraOptionTitle}>Just Reduce Principal</Text>
                      <Text style={styles.extraOptionDescription}>
                        Everything stays the same, but you owe less
                      </Text>
                    </View>
                  </TouchableOpacity>
                </GlassCard>
              )}

              {/* Date */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payment Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="#000000" />
                  <Text style={styles.dateText}>{formatDate(paymentDate)}</Text>
                  <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={paymentDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (selectedDate) setPaymentDate(selectedDate);
                    }}
                  />
                )}
              </View>

              {/* Description */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Description (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Add notes about this payment"
                  placeholderTextColor="rgba(0, 0, 0, 0.4)"
                  multiline
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>
            </ScrollView>

            {/* Footer with Submit Button */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.submitButton, saving && styles.submitButtonDisabled]}
                onPress={handlePayment}
                disabled={saving || !selectedAccountId || !selectedFundBucket || !amount || (isExtraPayment && !showExtraPaymentOptions)}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {isExtraPayment && !showExtraPaymentOptions ? 'Continue' : 'Record Payment'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      
      {/* Fund Picker Modal */}
      {selectedAccountId && liability && (
        <FundPicker
          visible={showFundPicker}
          onClose={() => setShowFundPicker(false)}
          accountId={selectedAccountId}
          onSelect={(bucket) => {
            // Only allow personal or same liability bucket
            if (bucket.type === 'personal' || (bucket.type === 'borrowed' && bucket.id === liability.id)) {
              setSelectedFundBucket(bucket);
              setShowFundPicker(false);
            } else {
              Alert.alert('Invalid Selection', 'You can only pay from personal funds or funds from this liability.');
            }
          }}
          amount={parseFloat(amount) || 0}
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
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    flexShrink: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    flexGrow: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    flexShrink: 0,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 60,
    minHeight: 200,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    paddingVertical: 60,
    minHeight: 200,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 20,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  infoBalance: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  accountList: {
    gap: 8,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accountItemActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderColor: '#000000',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  accountNameActive: {
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  fundBucketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  fundBucketInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fundBucketIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fundBucketDetails: {
    flex: 1,
  },
  fundBucketName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  fundBucketAmount: {
    fontSize: 12,
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
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderStyle: 'dashed',
    gap: 8,
  },
  selectFundText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  currencySymbol: {
    fontSize: 24,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 24,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  suggestedAmountButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  suggestedAmountText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textDecorationLine: 'underline',
  },
  breakdownTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  breakdownLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  breakdownLabelTotal: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  breakdownValue: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  breakdownValueTotal: {
    fontSize: 18,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginVertical: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    gap: 12,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  submitButtonText: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  extraPaymentNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
  },
  extraPaymentText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    lineHeight: 18,
  },
  extraOptionsTitle: {
    fontSize: 18,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  extraOptionsSubtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 16,
  },
  extraOptionButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 8,
    gap: 12,
  },
  extraOptionButtonActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: '#000000',
  },
  extraOptionContent: {
    flex: 1,
    gap: 4,
  },
  extraOptionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  extraOptionDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  skipPaymentsInput: {
    marginTop: 8,
    marginLeft: 32,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 8,
  },
  skipPaymentsLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 8,
  },
  skipPaymentsTextInput: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
});
