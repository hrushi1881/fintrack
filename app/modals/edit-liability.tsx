import React, { useState, useEffect } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import {
  calculateLiabilityUpdateImpact,
  recalculateLiabilitySchedules,
  calculateMonthlyPayment,
  calculateMonthsBetween,
  RecalculateSchedulesOptions,
} from '@/utils/liabilityRecalculation';
import { calculateRemainingPayments } from '@/utils/liabilityCalculations';
import { supabase } from '@/lib/supabase';

interface EditLiabilityModalProps {
  visible: boolean;
  onClose: () => void;
  liability: {
    id: string;
    title: string;
    current_balance: number;
    original_amount?: number;
    interest_rate_apy?: number;
    periodical_payment?: number;
    start_date?: string;
    targeted_payoff_date?: string;
  } | null;
  onSuccess?: () => void;
}

type EditField = 'amount' | 'rate' | 'payment' | 'endDate' | null;

export default function EditLiabilityModal({
  visible,
  onClose,
  liability,
  onSuccess,
}: EditLiabilityModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { fetchLiabilities } = useLiabilities();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<EditField>(null);
  
  // Form state
  const [totalAmount, setTotalAmount] = useState('');
  const [availableFunds, setAvailableFunds] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Impact analysis
  const [impact, setImpact] = useState<any>(null);
  const [recalculationOption, setRecalculationOption] = useState<'keepPayment' | 'keepEndDate' | 'custom'>('keepPayment');
  
  // Initialize form with liability data
  useEffect(() => {
    if (liability && visible) {
      setTotalAmount(liability.original_amount?.toString() || liability.current_balance.toString());
      // Initialize available_funds: if it exists, use it; otherwise calculate from original_amount - disbursed_amount
      const calculatedAvailable = liability.available_funds !== null && liability.available_funds !== undefined
        ? liability.available_funds
        : (liability.original_amount || 0) - (liability.disbursed_amount || 0);
      setAvailableFunds(Math.max(0, calculatedAvailable).toString());
      setInterestRate(liability.interest_rate_apy?.toString() || '0');
      setMonthlyPayment(liability.periodical_payment?.toString() || '0');
      if (liability.targeted_payoff_date) {
        setEndDate(new Date(liability.targeted_payoff_date));
      }
      setImpact(null);
      setEditingField(null);
    }
  }, [liability, visible]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  // Calculate impact when fields change
  useEffect(() => {
    if (!liability || !editingField) {
      setImpact(null);
      return;
    }
    
    // Add a small delay to avoid excessive calculations while user is typing
    const timeoutId = setTimeout(() => {
      const currentBalance = liability.current_balance;
      const currentPayment = liability.periodical_payment || 0;
      const currentRate = liability.interest_rate_apy || 0;
      const currentEndDate = liability.targeted_payoff_date 
        ? new Date(liability.targeted_payoff_date)
        : new Date(new Date().setFullYear(new Date().getFullYear() + 10));
      
      let newTotalAmount: number | undefined;
      let newRate: number | undefined;
      let newPayment: number | undefined;
      const newEndDateValue = endDate;
      
      // Parse values
      if (editingField === 'amount' && totalAmount) {
        newTotalAmount = parseFloat(totalAmount);
        if (isNaN(newTotalAmount)) return;
      }
      if (editingField === 'rate' && interestRate) {
        newRate = parseFloat(interestRate);
        if (isNaN(newRate)) return;
      }
      if (editingField === 'payment' && monthlyPayment) {
        newPayment = parseFloat(monthlyPayment);
        if (isNaN(newPayment)) return;
      }
      
      // Validation
      if (newTotalAmount !== undefined && newTotalAmount < currentBalance) {
        setImpact({
          error: `Cannot reduce total amount below current balance (${formatCurrencyAmount(currentBalance, currency)}).`,
        });
        return;
      }
      
      // Determine options based on editing field
      let options: RecalculateSchedulesOptions | undefined;
      
      if (editingField === 'amount' || editingField === 'rate') {
        // When changing amount or rate, offer options
        if (recalculationOption === 'keepPayment') {
          options = { keepPaymentSame: true };
        } else if (recalculationOption === 'keepEndDate') {
          options = { keepEndDateSame: true, customEndDate: newEndDateValue };
        }
      } else if (editingField === 'payment') {
        if (newPayment !== undefined) {
          options = { customPayment: newPayment };
        }
      } else if (editingField === 'endDate') {
        options = { keepEndDateSame: true, customEndDate: newEndDateValue };
      }
      
      // Only calculate if we have valid values
      if (
        (editingField === 'amount' && newTotalAmount === undefined) ||
        (editingField === 'rate' && newRate === undefined) ||
        (editingField === 'payment' && newPayment === undefined)
      ) {
        return;
      }
      
      try {
        const impactResult = calculateLiabilityUpdateImpact(
          currentBalance,
          currentPayment,
          currentRate,
          currentEndDate,
          newTotalAmount,
          newRate,
          newEndDateValue,
          newPayment,
          options
        );
        
        setImpact(impactResult);
      } catch (error: any) {
        console.error('Error calculating impact:', error);
        setImpact({
          error: error.message || 'Could not calculate impact',
        });
      }
    }, 300); // Debounce for 300ms
    
    return () => clearTimeout(timeoutId);
  }, [totalAmount, interestRate, monthlyPayment, endDate, editingField, recalculationOption, liability, currency]);

  const handleSave = async () => {
    if (!liability || !user) return;

    try {
      setSaving(true);
      
      // Validate changes
      const newTotalAmount = totalAmount ? parseFloat(totalAmount) : liability.original_amount;
      const newRate = interestRate ? parseFloat(interestRate) : liability.interest_rate_apy || 0;
      const newPayment = monthlyPayment ? parseFloat(monthlyPayment) : liability.periodical_payment || 0;
      const newEndDate = endDate;
      
      // Validate amount
      if (newTotalAmount && newTotalAmount < liability.current_balance) {
        Alert.alert('Invalid Amount', `Cannot reduce total amount below current balance (${formatCurrencyAmount(liability.current_balance, currency)}).`);
        return;
      }
      
      // Determine effective values
      // Use current balance (what we actually owe), not total amount
      // Total amount is just a reference, but we pay off the current balance
      const effectiveBalance = liability.current_balance;
      const effectiveRate = newRate !== undefined ? newRate : (liability.interest_rate_apy || 0);
      const startDate = liability.start_date ? new Date(liability.start_date) : new Date();
      
      // Calculate final values based on editing field and options
      let finalPayment: number;
      let finalEndDate: Date;
      
      if (editingField === 'amount') {
        // When changing total amount, we don't change current balance
        // Just update the reference amount
        // Use existing payment and rate, calculate new term
        if (recalculationOption === 'keepPayment') {
          finalPayment = liability.periodical_payment || 0;
          const monthsRemaining = calculateRemainingPayments(effectiveBalance, finalPayment, effectiveRate);
          finalEndDate = new Date();
          finalEndDate.setMonth(finalEndDate.getMonth() + monthsRemaining);
        } else if (recalculationOption === 'keepEndDate') {
          finalEndDate = newEndDate;
          const monthsFromNow = calculateMonthsBetween(new Date(), finalEndDate);
          finalPayment = calculateMonthlyPayment(effectiveBalance, effectiveRate, monthsFromNow);
        } else {
          // Default: keep payment same
          finalPayment = liability.periodical_payment || 0;
          const monthsRemaining = calculateRemainingPayments(effectiveBalance, finalPayment, effectiveRate);
          finalEndDate = new Date();
          finalEndDate.setMonth(finalEndDate.getMonth() + monthsRemaining);
        }
      } else if (editingField === 'rate') {
        // When changing rate, calculate new payment or term
        if (recalculationOption === 'keepPayment') {
          finalPayment = liability.periodical_payment || 0;
          const monthsRemaining = calculateRemainingPayments(effectiveBalance, finalPayment, effectiveRate);
          finalEndDate = new Date();
          finalEndDate.setMonth(finalEndDate.getMonth() + monthsRemaining);
        } else if (recalculationOption === 'keepEndDate') {
          finalEndDate = liability.targeted_payoff_date ? new Date(liability.targeted_payoff_date) : newEndDate;
          const monthsFromNow = calculateMonthsBetween(new Date(), finalEndDate);
          finalPayment = calculateMonthlyPayment(effectiveBalance, effectiveRate, monthsFromNow);
        } else {
          // Default: keep payment same
          finalPayment = liability.periodical_payment || 0;
          const monthsRemaining = calculateRemainingPayments(effectiveBalance, finalPayment, effectiveRate);
          finalEndDate = new Date();
          finalEndDate.setMonth(finalEndDate.getMonth() + monthsRemaining);
        }
      } else if (editingField === 'payment') {
        // When changing payment, calculate new term
        finalPayment = newPayment || liability.periodical_payment || 0;
        const monthsRemaining = calculateRemainingPayments(effectiveBalance, finalPayment, effectiveRate);
        finalEndDate = new Date();
        finalEndDate.setMonth(finalEndDate.getMonth() + monthsRemaining);
      } else if (editingField === 'endDate') {
        // When changing end date, calculate new payment
        finalEndDate = newEndDate;
        const monthsFromNow = calculateMonthsBetween(new Date(), finalEndDate);
        finalPayment = calculateMonthlyPayment(effectiveBalance, effectiveRate, monthsFromNow);
      } else {
        // No changes, use existing values
        finalPayment = liability.periodical_payment || 0;
        finalEndDate = liability.targeted_payoff_date 
          ? new Date(liability.targeted_payoff_date)
          : new Date(new Date().setFullYear(new Date().getFullYear() + 10));
      }
      
      // Update liability in database
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };
      
      if (newTotalAmount !== undefined && newTotalAmount !== liability.original_amount) {
        updateData.original_amount = newTotalAmount;
      }
      
      // Update available_funds if it was changed
      const newAvailableFunds = availableFunds ? parseFloat(availableFunds) : null;
      const currentAvailableFunds = liability.available_funds !== null && liability.available_funds !== undefined
        ? liability.available_funds
        : (liability.original_amount || 0) - (liability.disbursed_amount || 0);
      
      if (newAvailableFunds !== null && newAvailableFunds !== currentAvailableFunds) {
        // Validate: available_funds <= original_amount
        const finalTotal = newTotalAmount || liability.original_amount || liability.current_balance;
        if (newAvailableFunds > finalTotal) {
          Alert.alert('Invalid Amount', `Available funds (${formatCurrencyAmount(newAvailableFunds, currency)}) cannot exceed total amount (${formatCurrencyAmount(finalTotal, currency)})`);
          return;
        }
        updateData.available_funds = newAvailableFunds;
      }
      if (newRate !== undefined && newRate !== (liability.interest_rate_apy || 0)) {
        updateData.interest_rate_apy = newRate;
      }
      if (finalPayment > 0 && finalPayment !== (liability.periodical_payment || 0)) {
        updateData.periodical_payment = finalPayment;
      }
      if (finalEndDate) {
        updateData.targeted_payoff_date = formatDateForInput(finalEndDate);
      }
      
      // Update liability
      const { error: updateError } = await supabase
        .from('liabilities')
        .update(updateData)
        .eq('id', liability.id)
        .eq('user_id', user.id);
      
      if (updateError) throw updateError;
      
      // Recalculate schedules if terms changed
      if (editingField && (editingField === 'amount' || editingField === 'rate' || editingField === 'payment' || editingField === 'endDate')) {
        await recalculateLiabilitySchedules(
          liability.id,
          effectiveBalance,
          finalPayment,
          effectiveRate,
          startDate,
          finalEndDate,
          user.id
        );
      }
      
      // Refresh liabilities
      await fetchLiabilities();
      
      Alert.alert('Success', 'Liability updated successfully', [
        { text: 'OK', onPress: () => {
          onSuccess?.();
          onClose();
        }}
      ]);
    } catch (error: any) {
      console.error('Error updating liability:', error);
      Alert.alert('Error', error.message || 'Failed to update liability');
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !liability) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Liability</Text>
            <View style={styles.closeButton} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Current Status */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.sectionTitle}>Current Status</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>Current Balance</Text>
                  <Text style={styles.statusValue}>
                    {formatCurrencyAmount(liability.current_balance, currency)}
                  </Text>
                </View>
                <View style={styles.statusDivider} />
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>Monthly Payment</Text>
                  <Text style={styles.statusValue}>
                    {formatCurrencyAmount(liability.periodical_payment || 0, currency)}
                  </Text>
                </View>
              </View>
            </GlassCard>

            {/* Edit Total Amount */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.editFieldButton}
                onPress={() => setEditingField(editingField === 'amount' ? null : 'amount')}
              >
                <View style={styles.editFieldHeader}>
                  <View style={styles.editFieldInfo}>
                    <Ionicons name="cash-outline" size={20} color="#000000" />
                    <View style={styles.editFieldDetails}>
                      <Text style={styles.editFieldTitle}>Total Amount</Text>
                      <Text style={styles.editFieldValue}>
                        {formatCurrencyAmount(liability.original_amount || liability.current_balance, currency)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={editingField === 'amount' ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="rgba(0, 0, 0, 0.4)"
                  />
                </View>
              </TouchableOpacity>

              {editingField === 'amount' && (
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.inputLabel}>Total Amount</Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.currencySymbol}>{currency === 'USD' ? '$' : '₹'}</Text>
                    <TextInput
                      style={styles.amountInput}
                      placeholder={liability.original_amount?.toString() || liability.current_balance.toString()}
                      placeholderTextColor="rgba(0, 0, 0, 0.4)"
                      keyboardType="decimal-pad"
                      value={totalAmount}
                      onChangeText={(value) => {
                        setTotalAmount(value);
                        // Intelligent adjustment: when total amount changes, adjust available funds
                        // Keep used funds constant: used = total - available
                        const newTotal = parseFloat(value) || 0;
                        const currentTotal = liability.original_amount || liability.current_balance || 0;
                        const currentAvailable = parseFloat(availableFunds) || 0;
                        const usedFunds = currentTotal - currentAvailable; // Used funds remain constant
                        const newAvailable = Math.max(0, newTotal - usedFunds);
                        setAvailableFunds(newAvailable.toString());
                      }}
                    />
                  </View>
                  <Text style={styles.inputHint}>
                    Minimum: {formatCurrencyAmount(liability.current_balance, currency)} (current balance)
                  </Text>

                  <Text style={[styles.inputLabel, { marginTop: 20 }]}>Available Funds</Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.currencySymbol}>{currency === 'USD' ? '$' : '₹'}</Text>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="0.00"
                      placeholderTextColor="rgba(0, 0, 0, 0.4)"
                      keyboardType="decimal-pad"
                      value={availableFunds}
                      onChangeText={(value) => {
                        const newAvailable = parseFloat(value) || 0;
                        const total = parseFloat(totalAmount) || liability.original_amount || liability.current_balance || 0;
                        // Ensure available funds <= total amount
                        if (newAvailable <= total) {
                          setAvailableFunds(value);
                        } else {
                          // Auto-adjust to total if user enters more
                          setAvailableFunds(total.toString());
                          Alert.alert('Invalid Amount', `Available funds cannot exceed total amount (${formatCurrencyAmount(total, currency)})`);
                        }
                      }}
                    />
                  </View>
                  <Text style={styles.inputHint}>
                    Maximum: {formatCurrencyAmount(parseFloat(totalAmount) || liability.original_amount || liability.current_balance || 0, currency)} (total amount)
                    {'\n'}
                    Used Funds: {formatCurrencyAmount(
                      (parseFloat(totalAmount) || liability.original_amount || liability.current_balance || 0) - (parseFloat(availableFunds) || 0),
                      currency
                    )}
                  </Text>

                  {/* Recalculation Options */}
                  <Text style={styles.optionLabel}>How should we adjust?</Text>
                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      recalculationOption === 'keepPayment' && styles.optionButtonActive,
                    ]}
                    onPress={() => setRecalculationOption('keepPayment')}
                  >
                    <Ionicons
                      name={recalculationOption === 'keepPayment' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={recalculationOption === 'keepPayment' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                    />
                    <View style={styles.optionContent}>
                      <Text style={styles.optionTitle}>Keep Same Monthly Payment</Text>
                      <Text style={styles.optionDescription}>
                        Payment stays the same, term adjusts automatically
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      recalculationOption === 'keepEndDate' && styles.optionButtonActive,
                    ]}
                    onPress={() => setRecalculationOption('keepEndDate')}
                  >
                    <Ionicons
                      name={recalculationOption === 'keepEndDate' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={recalculationOption === 'keepEndDate' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                    />
                    <View style={styles.optionContent}>
                      <Text style={styles.optionTitle}>Keep Same End Date</Text>
                      <Text style={styles.optionDescription}>
                        End date stays the same, payment adjusts automatically
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Impact Analysis */}
                  {impact && !impact.error && (
                    <GlassCard padding={16} marginVertical={12}>
                      <Text style={styles.impactTitle}>Impact Analysis</Text>
                      <View style={styles.impactRow}>
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Monthly Payment</Text>
                          <Text style={styles.impactValue}>
                            {impact.paymentChange !== 0 && (
                              <Text style={impact.paymentChange > 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.paymentChange > 0 ? '+' : ''}{formatCurrencyAmount(impact.paymentChange, currency)}
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {formatCurrencyAmount(impact.newPayment, currency)}
                            </Text>
                          </Text>
                        </View>
                        <View style={styles.impactDivider} />
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Term</Text>
                          <Text style={styles.impactValue}>
                            {impact.termChangeMonths !== 0 && (
                              <Text style={impact.termChangeMonths < 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.termChangeMonths > 0 ? '+' : ''}{impact.termChangeMonths} months
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {impact.newTermMonths} months
                            </Text>
                          </Text>
                        </View>
                      </View>
                      <View style={styles.impactRow}>
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Total Interest</Text>
                          <Text style={styles.impactValue}>
                            {impact.interestChange !== 0 && (
                              <Text style={impact.interestChange < 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.interestChange > 0 ? '+' : ''}{formatCurrencyAmount(impact.interestChange, currency)}
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {formatCurrencyAmount(impact.newTotalInterest, currency)}
                            </Text>
                          </Text>
                        </View>
                      </View>
                    </GlassCard>
                  )}

                  {impact?.error && (
                    <GlassCard padding={16} marginVertical={12}>
                      <View style={styles.errorBox}>
                        <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
                        <Text style={styles.errorText}>{impact.error}</Text>
                      </View>
                    </GlassCard>
                  )}
                </GlassCard>
              )}
            </View>

            {/* Edit Interest Rate */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.editFieldButton}
                onPress={() => setEditingField(editingField === 'rate' ? null : 'rate')}
              >
                <View style={styles.editFieldHeader}>
                  <View style={styles.editFieldInfo}>
                    <Ionicons name="trending-up-outline" size={20} color="#000000" />
                    <View style={styles.editFieldDetails}>
                      <Text style={styles.editFieldTitle}>Interest Rate</Text>
                      <Text style={styles.editFieldValue}>
                        {(liability.interest_rate_apy || 0).toFixed(2)}% annually
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={editingField === 'rate' ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="rgba(0, 0, 0, 0.4)"
                  />
                </View>
              </TouchableOpacity>

              {editingField === 'rate' && (
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.inputLabel}>New Interest Rate (%)</Text>
                  <View style={styles.amountInputContainer}>
                    <TextInput
                      style={styles.amountInput}
                      placeholder={(liability.interest_rate_apy || 0).toString()}
                      placeholderTextColor="rgba(0, 0, 0, 0.4)"
                      keyboardType="decimal-pad"
                      value={interestRate}
                      onChangeText={setInterestRate}
                    />
                    <Text style={styles.percentageSymbol}>%</Text>
                  </View>
                  <Text style={styles.inputHint}>Annual percentage rate (APY)</Text>

                  {/* Recalculation Options */}
                  <Text style={styles.optionLabel}>How should we adjust?</Text>
                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      recalculationOption === 'keepPayment' && styles.optionButtonActive,
                    ]}
                    onPress={() => setRecalculationOption('keepPayment')}
                  >
                    <Ionicons
                      name={recalculationOption === 'keepPayment' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={recalculationOption === 'keepPayment' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                    />
                    <View style={styles.optionContent}>
                      <Text style={styles.optionTitle}>Keep Same Monthly Payment</Text>
                      <Text style={styles.optionDescription}>
                        Payment stays the same, term adjusts automatically
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      recalculationOption === 'keepEndDate' && styles.optionButtonActive,
                    ]}
                    onPress={() => setRecalculationOption('keepEndDate')}
                  >
                    <Ionicons
                      name={recalculationOption === 'keepEndDate' ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={recalculationOption === 'keepEndDate' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                    />
                    <View style={styles.optionContent}>
                      <Text style={styles.optionTitle}>Keep Same End Date</Text>
                      <Text style={styles.optionDescription}>
                        End date stays the same, payment adjusts automatically
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Impact Analysis */}
                  {impact && !impact.error && (
                    <GlassCard padding={16} marginVertical={12}>
                      <Text style={styles.impactTitle}>Impact Analysis</Text>
                      <View style={styles.impactRow}>
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Monthly Payment</Text>
                          <Text style={styles.impactValue}>
                            {impact.paymentChange !== 0 && (
                              <Text style={impact.paymentChange > 0 ? styles.impactNegative : styles.impactPositive}>
                                {impact.paymentChange > 0 ? '+' : ''}{formatCurrencyAmount(impact.paymentChange, currency)}
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {formatCurrencyAmount(impact.newPayment, currency)}
                            </Text>
                          </Text>
                        </View>
                        <View style={styles.impactDivider} />
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Term</Text>
                          <Text style={styles.impactValue}>
                            {impact.termChangeMonths !== 0 && (
                              <Text style={impact.termChangeMonths < 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.termChangeMonths > 0 ? '+' : ''}{impact.termChangeMonths} months
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {impact.newTermMonths} months
                            </Text>
                          </Text>
                        </View>
                      </View>
                      <View style={styles.impactRow}>
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Total Interest</Text>
                          <Text style={styles.impactValue}>
                            {impact.interestChange !== 0 && (
                              <Text style={impact.interestChange < 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.interestChange > 0 ? '+' : ''}{formatCurrencyAmount(impact.interestChange, currency)}
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {formatCurrencyAmount(impact.newTotalInterest, currency)}
                            </Text>
                          </Text>
                        </View>
                      </View>
                    </GlassCard>
                  )}
                </GlassCard>
              )}
            </View>

            {/* Edit Monthly Payment */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.editFieldButton}
                onPress={() => setEditingField(editingField === 'payment' ? null : 'payment')}
              >
                <View style={styles.editFieldHeader}>
                  <View style={styles.editFieldInfo}>
                    <Ionicons name="calendar-outline" size={20} color="#000000" />
                    <View style={styles.editFieldDetails}>
                      <Text style={styles.editFieldTitle}>Monthly Payment</Text>
                      <Text style={styles.editFieldValue}>
                        {formatCurrencyAmount(liability.periodical_payment || 0, currency)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={editingField === 'payment' ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="rgba(0, 0, 0, 0.4)"
                  />
                </View>
              </TouchableOpacity>

              {editingField === 'payment' && (
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.inputLabel}>New Monthly Payment</Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.currencySymbol}>{currency === 'USD' ? '$' : '₹'}</Text>
                    <TextInput
                      style={styles.amountInput}
                      placeholder={(liability.periodical_payment || 0).toString()}
                      placeholderTextColor="rgba(0, 0, 0, 0.4)"
                      keyboardType="decimal-pad"
                      value={monthlyPayment}
                      onChangeText={setMonthlyPayment}
                    />
                  </View>

                  {/* Impact Analysis */}
                  {impact && !impact.error && (
                    <GlassCard padding={16} marginVertical={12}>
                      <Text style={styles.impactTitle}>Impact Analysis</Text>
                      <View style={styles.impactRow}>
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Term</Text>
                          <Text style={styles.impactValue}>
                            {impact.termChangeMonths !== 0 && (
                              <Text style={impact.termChangeMonths < 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.termChangeMonths > 0 ? '+' : ''}{impact.termChangeMonths} months
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {impact.newTermMonths} months
                            </Text>
                          </Text>
                        </View>
                        <View style={styles.impactDivider} />
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Total Interest</Text>
                          <Text style={styles.impactValue}>
                            {impact.interestChange !== 0 && (
                              <Text style={impact.interestChange < 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.interestChange > 0 ? '+' : ''}{formatCurrencyAmount(impact.interestChange, currency)}
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {formatCurrencyAmount(impact.newTotalInterest, currency)}
                            </Text>
                          </Text>
                        </View>
                      </View>
                      <View style={styles.impactRow}>
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>New End Date</Text>
                          <Text style={styles.impactValue}>
                            <Text style={styles.impactNew}>
                              {formatDate(impact.newEndDate)}
                            </Text>
                          </Text>
                        </View>
                      </View>
                    </GlassCard>
                  )}
                </GlassCard>
              )}
            </View>

            {/* Edit End Date */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.editFieldButton}
                onPress={() => setEditingField(editingField === 'endDate' ? null : 'endDate')}
              >
                <View style={styles.editFieldHeader}>
                  <View style={styles.editFieldInfo}>
                    <Ionicons name="calendar-outline" size={20} color="#000000" />
                    <View style={styles.editFieldDetails}>
                      <Text style={styles.editFieldTitle}>End Date</Text>
                      <Text style={styles.editFieldValue}>
                        {liability.targeted_payoff_date
                          ? formatDate(new Date(liability.targeted_payoff_date))
                          : 'Not set'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={editingField === 'endDate' ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="rgba(0, 0, 0, 0.4)"
                  />
                </View>
              </TouchableOpacity>

              {editingField === 'endDate' && (
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.inputLabel}>New End Date</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={20} color="#000000" />
                    <Text style={styles.dateText}>{formatDate(endDate)}</Text>
                    <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={endDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={new Date()}
                      onChange={(event, selectedDate) => {
                        setShowDatePicker(Platform.OS === 'ios');
                        if (selectedDate) {
                          setEndDate(selectedDate);
                        }
                      }}
                    />
                  )}

                  {/* Impact Analysis */}
                  {impact && !impact.error && (
                    <GlassCard padding={16} marginVertical={12}>
                      <Text style={styles.impactTitle}>Impact Analysis</Text>
                      <View style={styles.impactRow}>
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Monthly Payment</Text>
                          <Text style={styles.impactValue}>
                            {impact.paymentChange !== 0 && (
                              <Text style={impact.paymentChange > 0 ? styles.impactNegative : styles.impactPositive}>
                                {impact.paymentChange > 0 ? '+' : ''}{formatCurrencyAmount(impact.paymentChange, currency)}
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {formatCurrencyAmount(impact.newPayment, currency)}
                            </Text>
                          </Text>
                        </View>
                        <View style={styles.impactDivider} />
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Term</Text>
                          <Text style={styles.impactValue}>
                            {impact.termChangeMonths !== 0 && (
                              <Text style={impact.termChangeMonths < 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.termChangeMonths > 0 ? '+' : ''}{impact.termChangeMonths} months
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {impact.newTermMonths} months
                            </Text>
                          </Text>
                        </View>
                      </View>
                      <View style={styles.impactRow}>
                        <View style={styles.impactItem}>
                          <Text style={styles.impactLabel}>Total Interest</Text>
                          <Text style={styles.impactValue}>
                            {impact.interestChange !== 0 && (
                              <Text style={impact.interestChange < 0 ? styles.impactPositive : styles.impactNegative}>
                                {impact.interestChange > 0 ? '+' : ''}{formatCurrencyAmount(impact.interestChange, currency)}
                              </Text>
                            )}
                            {'\n'}
                            <Text style={styles.impactNew}>
                              {formatCurrencyAmount(impact.newTotalInterest, currency)}
                            </Text>
                          </Text>
                        </View>
                      </View>
                    </GlassCard>
                  )}
                </GlassCard>
              )}
            </View>

            {/* Save Button */}
            {editingField && (
              <TouchableOpacity
                style={[styles.saveButton, (saving || impact?.error) && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving || impact?.error}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
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
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  statusItem: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  statusDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  editFieldButton: {
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  editFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editFieldInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  editFieldDetails: {
    flex: 1,
    gap: 4,
  },
  editFieldTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  editFieldValue: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    marginTop: 12,
  },
  currencySymbol: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginRight: 8,
  },
  percentageSymbol: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginLeft: 8,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  inputHint: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 8,
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
    marginTop: 12,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  optionLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 12,
  },
  optionButton: {
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
  optionButtonActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: '#000000',
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  optionDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  impactTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  impactItem: {
    flex: 1,
  },
  impactLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  impactValue: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    lineHeight: 20,
  },
  impactNew: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  impactPositive: {
    color: '#10B981',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  impactNegative: {
    color: '#EF4444',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  impactDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#EF4444',
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  saveButtonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  saveButtonText: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

