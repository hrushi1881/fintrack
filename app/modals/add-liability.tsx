import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';

type LiabilityType = 'loan' | 'emi' | 'one_time';

const LIABILITY_TYPES: Array<{
  key: LiabilityType;
  label: string;
  description: string;
  icon: string;
}> = [
  { key: 'loan', label: 'Loan', description: 'Personal, Student, Auto, Mortgage', icon: 'business' },
  { key: 'emi', label: 'EMI', description: 'Fixed monthly installments', icon: 'calendar' },
  { key: 'one_time', label: 'One-time Debt', description: 'Single payment debt', icon: 'flash' },
];

export default function AddLiabilityModal() {
  const { accounts, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  const { createLiability } = useLiabilities();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Form state
  const [selectedType, setSelectedType] = useState<LiabilityType | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [remainingAmount, setRemainingAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  // EMI specific
  const [emiAmount, setEmiAmount] = useState('');
  const [paymentDay, setPaymentDay] = useState('');
  const [totalInstallments, setTotalInstallments] = useState('');
  const [paidInstallments, setPaidInstallments] = useState('');
  
  // One-time specific
  const [borrowedFrom, setBorrowedFrom] = useState('');
  const [plannedPayback, setPlannedPayback] = useState<Date | null>(null);
  const [showPaybackPicker, setShowPaybackPicker] = useState(false);
  
  // Money flow
  const [willReceive, setWillReceive] = useState<boolean | null>(null);
  const [moneyLocation, setMoneyLocation] = useState<'in_accounts' | 'already_spent' | 'partial' | null>(null);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [allocationDescriptions, setAllocationDescriptions] = useState<Record<string, string>>({});
  
  // Historical payments
  const [addInitialPayments, setAddInitialPayments] = useState(false);
  const [payments, setPayments] = useState<Array<{
    id: string;
    date: string;
    accountId: string | null;
    amount: string;
    mode: 'data_only' | 'affect_balance';
  }>>([]);
  const [activePaymentPickerId, setActivePaymentPickerId] = useState<string | null>(null);

  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateForInput = (date: Date | null) => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  const canContinueStep2 = () => {
    if (!name.trim() || !remainingAmount.trim()) return false;
    const total = parseFloat(totalAmount || '0');
    const remaining = parseFloat(remainingAmount || '0');
    if (isNaN(remaining) || remaining <= 0) return false;
    if (totalAmount && (isNaN(total) || total < remaining)) return false;
    return true;
  };

  const allocatedSum = Object.values(allocations).reduce((sum, v) => sum + (parseFloat(v || '0') || 0), 0);
  const receivedAmt = parseFloat(receivedAmount || '0') || 0;
  const allocationValid = !receivedAmount || Math.abs(allocatedSum - receivedAmt) < 0.01;

  const addPaymentRow = () => {
    setPayments((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        date: '',
        accountId: accounts[0]?.id || null,
        amount: '',
        mode: 'data_only',
      },
    ]);
  };

  const updatePayment = (id: string, patch: Partial<typeof payments[0]>) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePayment = (id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      // Validate required fields
      if (!name.trim()) {
        Alert.alert('Error', 'Liability name is required');
        setLoading(false);
        return;
      }

      const remainingAmountValue = parseFloat(remainingAmount.trim());
      if (isNaN(remainingAmountValue) || remainingAmountValue <= 0) {
        Alert.alert('Error', 'Please enter a valid remaining amount');
        setLoading(false);
        return;
      }

      // Parse total amount if provided (optional)
      const totalAmountValue = totalAmount.trim() ? parseFloat(totalAmount.trim()) : null;
      if (totalAmountValue !== null && (isNaN(totalAmountValue) || totalAmountValue < remainingAmountValue)) {
        Alert.alert('Error', 'Total amount must be greater than or equal to remaining amount');
        setLoading(false);
        return;
      }

      // Parse interest rate if provided (optional)
      const interestRateValue = interestRate.trim() ? parseFloat(interestRate.trim()) : null;
      if (interestRateValue !== null && (isNaN(interestRateValue) || interestRateValue < 0)) {
        Alert.alert('Error', 'Please enter a valid interest rate');
        setLoading(false);
        return;
      }

      // Start date is required - use provided date or today's date
      const startDateValue = startDate ? formatDateForInput(startDate) : formatDateForInput(new Date());
      
      // Targeted payoff date is optional
      const targetedPayoffDateValue = endDate ? formatDateForInput(endDate) : null;

      // Prepare allocations if applicable
      const allocationArray: Array<{ accountId: string; amount: number; description?: string }> = [];
      if (willReceive && receivedAmount && moneyLocation !== 'already_spent') {
        const receivedAmountValue = parseFloat(receivedAmount.trim());
        if (isNaN(receivedAmountValue) || receivedAmountValue <= 0) {
          Alert.alert('Error', 'Please enter a valid received amount');
          setLoading(false);
          return;
        }

        allocationArray.push(...Object.entries(allocations)
          .filter(([_, amountStr]) => amountStr.trim() && parseFloat(amountStr.trim()) > 0)
          .map(([accountId, amountStr]) => {
            const allocationAmount = parseFloat(amountStr.trim());
            if (isNaN(allocationAmount) || allocationAmount <= 0) {
              return null;
            }
            return {
              accountId,
              amount: allocationAmount,
              description: allocationDescriptions[accountId]?.trim() || undefined,
            };
          })
          .filter((item): item is { accountId: string; amount: number; description?: string } => item !== null));

        const totalAllocated = allocationArray.reduce((sum, alloc) => sum + alloc.amount, 0);
        if (Math.abs(totalAllocated - receivedAmountValue) > 0.01) {
          Alert.alert('Error', `Allocated amount (${formatCurrencyAmount(totalAllocated, currency)}) must equal received amount (${formatCurrencyAmount(receivedAmountValue, currency)})`);
          setLoading(false);
          return;
        }
      }

      // Prepare initial payments if any
      const initialPaymentArray = addInitialPayments && payments.length > 0
        ? payments
            .filter((p) => p.amount.trim() && parseFloat(p.amount.trim()) > 0 && p.date)
            .map((p) => {
              const paymentAmount = parseFloat(p.amount.trim());
              if (isNaN(paymentAmount) || paymentAmount <= 0) {
                return null;
              }
              return {
                date: p.date || new Date().toISOString().split('T')[0],
                accountId: p.accountId,
                amount: paymentAmount,
                mode: p.mode,
              };
            })
            .filter((item): item is { date: string; accountId: string | null; amount: number; mode: 'data_only' | 'affect_balance' } => item !== null)
        : undefined;

      // Prepare input with type-specific fields
      const liabilityInput: any = {
        type: selectedType!,
        name: name.trim(),
        description: description.trim() || undefined,
        totalAmount: totalAmountValue,
        remainingAmount: remainingAmountValue,
        interestRate: interestRateValue,
        startDate: startDateValue, // Required - always provided
        endDate: targetedPayoffDateValue,
      };

      // Add type-specific fields
      if (selectedType === 'emi') {
        const emiAmountValue = emiAmount.trim() ? parseFloat(emiAmount.trim()) : null;
        const paymentDayValue = paymentDay.trim() ? parseInt(paymentDay.trim(), 10) : null;
        const totalInstallmentsValue = totalInstallments.trim() ? parseInt(totalInstallments.trim(), 10) : null;
        const paidInstallmentsValue = paidInstallments.trim() ? parseInt(paidInstallments.trim(), 10) : null;

        if (emiAmountValue !== null && (isNaN(emiAmountValue) || emiAmountValue <= 0)) {
          Alert.alert('Error', 'Please enter a valid EMI amount');
          setLoading(false);
          return;
        }
        if (paymentDayValue !== null && (isNaN(paymentDayValue) || paymentDayValue < 1 || paymentDayValue > 31)) {
          Alert.alert('Error', 'Payment day must be between 1 and 31');
          setLoading(false);
          return;
        }
        if (totalInstallmentsValue !== null && (isNaN(totalInstallmentsValue) || totalInstallmentsValue <= 0)) {
          Alert.alert('Error', 'Please enter a valid total installments count');
          setLoading(false);
          return;
        }
        if (paidInstallmentsValue !== null && (isNaN(paidInstallmentsValue) || paidInstallmentsValue < 0)) {
          Alert.alert('Error', 'Please enter a valid paid installments count');
          setLoading(false);
          return;
        }

        liabilityInput.emiAmount = emiAmountValue;
        liabilityInput.paymentDay = paymentDayValue;
        liabilityInput.totalInstallments = totalInstallmentsValue;
        liabilityInput.paidInstallments = paidInstallmentsValue;
      }
      if (selectedType === 'one_time') {
        liabilityInput.borrowedFrom = borrowedFrom.trim() || null;
        liabilityInput.plannedPayback = plannedPayback ? formatDateForInput(plannedPayback) : null;
      }

      // Create liability with allocations and payments
      const { id } = await createLiability(
        liabilityInput,
        allocationArray.length > 0 ? allocationArray : undefined,
        initialPaymentArray
      );

      await globalRefresh();
      Alert.alert('Success', 'Liability created successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error('Error creating liability:', error);
      Alert.alert('Error', error.message || 'Failed to create liability');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>Select the type of liability you want to add</Text>
      
      {LIABILITY_TYPES.map((type) => (
        <TouchableOpacity
          key={type.key}
          style={[
            styles.typeCard,
            selectedType === type.key && styles.typeCardActive
          ]}
          onPress={() => setSelectedType(type.key)}
        >
          <View style={[styles.typeIcon, selectedType === type.key && styles.typeIconActive]}>
            <Ionicons
              name={type.icon as any}
              size={28}
              color={selectedType === type.key ? '#10B981' : 'rgba(255,255,255,0.7)'}
            />
          </View>
          <View style={styles.typeInfo}>
            <Text style={[
              styles.typeLabel,
              selectedType === type.key && styles.typeLabelActive
            ]}>
              {type.label}
            </Text>
            <Text style={styles.typeDescription}>{type.description}</Text>
          </View>
          {selectedType === type.key && (
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>How much do you owe?</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Liability Name *</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., Student Loan, Personal Loan"
          placeholderTextColor="#9CA3AF"
          value={name}
          onChangeText={setName}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Amount Owed *</Text>
        <Text style={styles.inputHint}>How much do you currently owe on this liability?</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., 50000"
          placeholderTextColor="#9CA3AF"
          value={remainingAmount}
          onChangeText={(text) => {
            // Only allow numbers and decimal point
            const cleaned = text.replace(/[^0-9.]/g, '');
            setRemainingAmount(cleaned);
          }}
          keyboardType="numeric"
        />
        {remainingAmount && (isNaN(parseFloat(remainingAmount)) || parseFloat(remainingAmount) <= 0) && (
          <Text style={styles.errorText}>Please enter a valid positive amount</Text>
        )}
      </View>

      {/* Collapsible optional fields */}
      <TouchableOpacity
        style={styles.expandButton}
        onPress={() => setShowAdvanced(!showAdvanced)}
      >
        <Text style={styles.expandButtonText}>
          {showAdvanced ? 'Hide' : 'Show'} Advanced Options
        </Text>
        <Ionicons 
          name={showAdvanced ? "chevron-up" : "chevron-down"} 
          size={20} 
          color="rgba(255,255,255,0.7)" 
        />
      </TouchableOpacity>

      {showAdvanced && (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Original/Total Amount (Optional)</Text>
            <Text style={styles.inputHint}>Original borrowed amount if different from current owed</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Leave blank if unknown"
              placeholderTextColor="#9CA3AF"
              value={totalAmount}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.]/g, '');
                setTotalAmount(cleaned);
              }}
              keyboardType="numeric"
            />
            {totalAmount && remainingAmount && parseFloat(totalAmount) > 0 && parseFloat(remainingAmount) > 0 && parseFloat(totalAmount) < parseFloat(remainingAmount) && (
              <Text style={styles.errorText}>
                Total amount cannot be less than remaining amount
              </Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Interest Rate % APR (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., 12.5"
              placeholderTextColor="#9CA3AF"
              value={interestRate}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.]/g, '');
                setInterestRate(cleaned);
              }}
              keyboardType="numeric"
            />
            {interestRate && (isNaN(parseFloat(interestRate)) || parseFloat(interestRate) < 0) && (
              <Text style={styles.errorText}>Please enter a valid interest rate</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Add a note about this liability..."
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
            />
          </View>
          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>Start Date (Optional)</Text>
              <Text style={styles.inputHint}>Defaults to today if not selected</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowStartPicker(true)}
              >
                <Text style={[styles.dateButtonText, !startDate && styles.dateButtonPlaceholder]}>
                  {formatDate(startDate) || 'Select date (defaults to today)'}
                </Text>
                <Ionicons name="calendar" size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
              {showStartPicker && (
                <DateTimePicker
                  value={startDate || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    if (Platform.OS !== 'ios') setShowStartPicker(false);
                    if (date) setStartDate(date);
                  }}
                />
              )}
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.inputLabel}>Target Payoff Date (Optional)</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowEndPicker(true)}
              >
                <Text style={[styles.dateButtonText, !endDate && styles.dateButtonPlaceholder]}>
                  {formatDate(endDate) || 'Select date'}
                </Text>
                <Ionicons name="calendar" size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
              {showEndPicker && (
                <DateTimePicker
                  value={endDate || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    if (Platform.OS !== 'ios') setShowEndPicker(false);
                    if (date) setEndDate(date);
                  }}
                />
              )}
            </View>
          </View>

          {/* Type-specific fields */}
          {selectedType === 'emi' && (
            <View style={styles.typeSpecificSection}>
              <Text style={styles.sectionTitle}>EMI Details (Optional)</Text>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Monthly EMI Amount</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., 10000"
                    placeholderTextColor="#9CA3AF"
                    value={emiAmount}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9.]/g, '');
                      setEmiAmount(cleaned);
                    }}
                    keyboardType="numeric"
                  />
                  {emiAmount && (isNaN(parseFloat(emiAmount)) || parseFloat(emiAmount) <= 0) && (
                    <Text style={styles.errorText}>Please enter a valid amount</Text>
                  )}
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.inputLabel}>Payment Day (1-31)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., 10"
                    placeholderTextColor="#9CA3AF"
                    value={paymentDay}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9]/g, '');
                      if (cleaned === '' || (parseInt(cleaned, 10) >= 1 && parseInt(cleaned, 10) <= 31)) {
                        setPaymentDay(cleaned);
                      }
                    }}
                    keyboardType="numeric"
                  />
                  {paymentDay && (isNaN(parseInt(paymentDay, 10)) || parseInt(paymentDay, 10) < 1 || parseInt(paymentDay, 10) > 31) && (
                    <Text style={styles.errorText}>Must be between 1 and 31</Text>
                  )}
                </View>
              </View>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Total Installments</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., 12"
                    placeholderTextColor="#9CA3AF"
                    value={totalInstallments}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9]/g, '');
                      setTotalInstallments(cleaned);
                    }}
                    keyboardType="numeric"
                  />
                  {totalInstallments && (isNaN(parseInt(totalInstallments, 10)) || parseInt(totalInstallments, 10) <= 0) && (
                    <Text style={styles.errorText}>Please enter a valid number</Text>
                  )}
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.inputLabel}>Paid Installments</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., 3"
                    placeholderTextColor="#9CA3AF"
                    value={paidInstallments}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9]/g, '');
                      setPaidInstallments(cleaned);
                    }}
                    keyboardType="numeric"
                  />
                  {paidInstallments && (isNaN(parseInt(paidInstallments, 10)) || parseInt(paidInstallments, 10) < 0) && (
                    <Text style={styles.errorText}>Please enter a valid number</Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {selectedType === 'one_time' && (
            <View style={styles.typeSpecificSection}>
              <Text style={styles.sectionTitle}>One-time Debt Details (Optional)</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Borrowed From</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Rajesh, Friend"
                  placeholderTextColor="#9CA3AF"
                  value={borrowedFrom}
                  onChangeText={setBorrowedFrom}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Planned Payback Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowPaybackPicker(true)}
                >
                  <Text style={[styles.dateButtonText, !plannedPayback && styles.dateButtonPlaceholder]}>
                    {formatDate(plannedPayback) || 'Select date'}
                  </Text>
                  <Ionicons name="calendar" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                {showPaybackPicker && (
                  <DateTimePicker
                    value={plannedPayback || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                      if (Platform.OS !== 'ios') setShowPaybackPicker(false);
                      if (date) setPlannedPayback(date);
                    }}
                  />
                )}
              </View>
            </View>
          )}
        </>
      )}

    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>Did you receive money into your accounts?</Text>
      <Text style={styles.stepSubtext}>When you borrowed this money, did it go into your bank accounts or wallets that you track in this app?</Text>

      <View style={styles.inputGroup}>
        <View style={styles.yesNoRow}>
          <TouchableOpacity
            style={[styles.choiceChip, willReceive === true && styles.choiceChipActive]}
            onPress={() => {
              setWillReceive(true);
              setMoneyLocation('in_accounts');
            }}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={willReceive === true ? '#10B981' : 'rgba(255,255,255,0.7)'}
            />
            <Text style={[
              styles.choiceChipText,
              willReceive === true && styles.choiceChipTextActive
            ]}>
              Yes, I received it
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceChip, willReceive === false && styles.choiceChipActive]}
            onPress={() => {
              setWillReceive(false);
              setMoneyLocation('already_spent');
            }}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={willReceive === false ? '#10B981' : 'rgba(255,255,255,0.7)'}
            />
            <Text style={[
              styles.choiceChipText,
              willReceive === false && styles.choiceChipTextActive
            ]}>
              No, just track debt
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {willReceive === false && (
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#F59E0B" />
          <Text style={styles.infoText}>
            You can add historical payments later if you've already made some payments on this liability.
          </Text>
        </View>
      )}
    </View>
  );

  const renderStep4 = () => {
    if (willReceive === false) {
      // Skip allocation step if no money received
      return null;
    }
    
    if (moneyLocation === 'already_spent') {
      return (
        <View style={styles.stepContent}>
          <Text style={styles.stepDescription}>Add historical payments (optional)</Text>
          <Text style={styles.stepSubtext}>If you've already made some payments, add them here</Text>
          
          {payments.map((payment) => (
            <View key={payment.id} style={styles.paymentRow}>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setActivePaymentPickerId(payment.id)}
              >
                <Text style={[styles.dateButtonText, !payment.date && styles.dateButtonPlaceholder]}>
                  {payment.date ? formatDate(new Date(payment.date)) : 'Date'}
                </Text>
                <Ionicons name="calendar" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
              {activePaymentPickerId === payment.id && (
                <DateTimePicker
                  value={payment.date ? new Date(payment.date) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    if (Platform.OS !== 'ios') setActivePaymentPickerId(null);
                    if (date) updatePayment(payment.id, { date: date.toISOString().split('T')[0] });
                  }}
                />
              )}
              <TextInput
                style={[styles.textInput, { flex: 1, marginHorizontal: 8 }]}
                placeholder="Amount"
                placeholderTextColor="#9CA3AF"
                value={payment.amount}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9.]/g, '');
                  updatePayment(payment.id, { amount: cleaned });
                }}
                keyboardType="numeric"
              />
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    payment.mode === 'data_only' && styles.modeButtonActive
                  ]}
                  onPress={() => updatePayment(payment.id, { mode: 'data_only' })}
                >
                  <Text style={[
                    styles.modeButtonText,
                    payment.mode === 'data_only' && styles.modeButtonTextActive
                  ]}>
                    Data Only
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    payment.mode === 'affect_balance' && styles.modeButtonActive
                  ]}
                  onPress={() => updatePayment(payment.id, { mode: 'affect_balance' })}
                >
                  <Text style={[
                    styles.modeButtonText,
                    payment.mode === 'affect_balance' && styles.modeButtonTextActive
                  ]}>
                    Affect Balance
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removePayment(payment.id)}>
                <Ionicons name="trash" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
          
          <TouchableOpacity style={styles.addButton} onPress={addPaymentRow}>
            <Ionicons name="add-circle" size={20} color="#10B981" />
            <Text style={styles.addButtonText}>Add Payment</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepDescription}>Which accounts received the money?</Text>
        <Text style={styles.stepSubtext}>Distribute the borrowed amount across your accounts</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Total Amount Received *</Text>
          <Text style={styles.inputHint}>How much money did you actually receive from this liability?</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., 100000"
            placeholderTextColor="#9CA3AF"
            value={receivedAmount}
            onChangeText={(text) => {
              // Only allow numbers and decimal point
              const cleaned = text.replace(/[^0-9.]/g, '');
              setReceivedAmount(cleaned);
            }}
            keyboardType="numeric"
          />
          {receivedAmount && (isNaN(parseFloat(receivedAmount)) || parseFloat(receivedAmount) <= 0) && (
            <Text style={styles.errorText}>Please enter a valid positive amount</Text>
          )}
        </View>

        <View style={styles.allocationHeader}>
          <Text style={styles.sectionTitle}>Allocate to Accounts</Text>
          <Text style={styles.allocationHint}>Distribute the received amount across your accounts</Text>
        </View>

        {accounts.filter(a => a.type !== 'liability').map((account) => (
          <View key={account.id} style={styles.allocationCard}>
            <View style={styles.allocationTopRow}>
              <View style={styles.allocationInfo}>
                <Text style={styles.allocationAccountName}>{account.name}</Text>
                <Text style={styles.allocationBalance}>
                  Current: {formatCurrencyAmount(parseFloat(account.balance || '0'), currency)}
                </Text>
              </View>
              <TextInput
                style={[styles.textInput, styles.allocationAmountInput]}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                value={allocations[account.id] || ''}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9.]/g, '');
                  setAllocations((prev) => ({ ...prev, [account.id]: cleaned }));
                }}
                keyboardType="numeric"
              />
            </View>
            <TextInput
              style={[styles.textInput, styles.allocationDescriptionInput, { marginTop: 8 }]}
              placeholder="Description (optional)"
              placeholderTextColor="#9CA3AF"
              value={allocationDescriptions[account.id] || ''}
              onChangeText={(v) => setAllocationDescriptions((prev) => ({ ...prev, [account.id]: v }))}
            />
          </View>
        ))}

        {!allocationValid && (
          <Text style={styles.errorText}>
            Allocated ({formatCurrencyAmount(allocatedSum, currency)}) must equal received ({formatCurrencyAmount(receivedAmt, currency)})
          </Text>
        )}

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/modals/add-account')}
        >
          <Ionicons name="add-circle" size={20} color="#10B981" />
          <Text style={styles.addButtonText}>Add New Account</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <View style={styles.summaryCard}>
        <Ionicons name="checkmark-circle" size={48} color="#10B981" />
        <Text style={styles.summaryTitle}>Ready to Create</Text>
        <Text style={styles.summaryDescription}>
          Review your liability details and tap "Create Liability" to save.
        </Text>
      </View>

      <View style={styles.summaryDetails}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Name:</Text>
          <Text style={styles.summaryValue}>{name || 'N/A'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Type:</Text>
          <Text style={styles.summaryValue}>
            {selectedType === 'loan' ? 'Loan' : selectedType === 'emi' ? 'EMI' : 'One-time Debt'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Amount Owed:</Text>
          <Text style={styles.summaryValue}>
            {formatCurrencyAmount(parseFloat(remainingAmount) || 0, currency)}
          </Text>
        </View>
        {willReceive && receivedAmount && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount Received:</Text>
            <Text style={styles.summaryValue}>
              {formatCurrencyAmount(parseFloat(receivedAmount), currency)}
            </Text>
          </View>
        )}
        {!willReceive && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Money Status:</Text>
            <Text style={styles.summaryValue}>Just tracking debt (no funds allocated)</Text>
          </View>
        )}
      </View>

      {/* Optional: Target payoff date for loans */}
      {selectedType === 'loan' && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Target Payoff Date (Optional)</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowEndPicker(true)}
          >
            <Text style={[styles.dateButtonText, !endDate && styles.dateButtonPlaceholder]}>
              {formatDate(endDate) || 'Set target date (optional)'}
            </Text>
            <Ionicons name="calendar" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          {showEndPicker && (
            <DateTimePicker
              value={endDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                if (Platform.OS !== 'ios') setShowEndPicker(false);
                if (date) setEndDate(date);
              }}
            />
          )}
        </View>
      )}
    </View>
  );

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Select Type';
      case 2: return 'Amount Owed';
      case 3: return 'Money Received?';
      case 4: return willReceive ? 'Allocate Funds' : 'Historical Payments';
      case 5: return 'Done';
      default: return 'Add Liability';
    }
  };

  // Calculate total steps dynamically
  const getTotalSteps = () => {
    if (willReceive === false) {
      return 4; // Skip allocation step
    }
    return 5;
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return selectedType !== null;
      case 2: return canContinueStep2();
      case 3: return willReceive !== null;
      case 4: 
        if (willReceive === false) return true; // Skip if no money received
        return moneyLocation === 'already_spent' || allocationValid;
      case 5: return true;
      default: return false;
    }
  };

  return (
    <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{getStepTitle()}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Step indicator */}
        <View style={styles.stepsContainer}>
          {[1, 2, 3, ...(willReceive === false ? [] : [4]), 5].map((step, index, arr) => (
            <View key={step} style={styles.stepIndicator}>
              <View style={[
                styles.stepDot,
                step === currentStep && styles.stepDotActive,
                step < currentStep && styles.stepDotCompleted
              ]} />
              {index < arr.length - 1 && (
                <View style={[
                  styles.stepLine,
                  step < currentStep && styles.stepLineCompleted
                ]} />
              )}
            </View>
          ))}
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
          {(currentStep === 5 || (currentStep === 4 && willReceive === false)) && renderStep5()}

          {/* Navigation buttons */}
          <View style={styles.navButtons}>
            {currentStep > 1 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  const prevStep = currentStep === 5 && willReceive === false ? 3 : currentStep - 1;
                  setCurrentStep(prevStep);
                }}
              >
                <Ionicons name="arrow-back" size={20} color="white" />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextButton, (!canProceed() || loading) && styles.nextButtonDisabled]}
              disabled={!canProceed() || loading}
              onPress={() => {
                if (currentStep === 5 || (currentStep === 4 && willReceive === false)) {
                  handleSave();
                } else if (currentStep === 3 && willReceive === false) {
                  setCurrentStep(5); // Skip allocation step
                } else {
                  setCurrentStep(currentStep + 1);
                }
              }}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (currentStep === 5 || (currentStep === 4 && willReceive === false)) ? (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="white" />
                  <Text style={styles.nextButtonText}>Create Liability</Text>
                </>
              ) : (
                <>
                  <Text style={styles.nextButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={20} color="white" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 4,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  stepDotActive: {
    backgroundColor: '#10B981',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepDotCompleted: {
    backgroundColor: '#10B981',
  },
  stepLine: {
    width: 20,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 2,
  },
  stepLineCompleted: {
    backgroundColor: '#10B981',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContent: {
    gap: 16,
    paddingBottom: 20,
  },
  stepDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeCardActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  typeIconActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  typeInfo: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  typeLabelActive: {
    color: '#10B981',
  },
  typeDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: 'white',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateButtonText: {
    color: 'white',
    fontSize: 16,
  },
  dateButtonPlaceholder: {
    color: '#9CA3AF',
  },
  typeSpecificSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    marginBottom: 12,
  },
  yesNoRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  choiceChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  choiceChipActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  choiceChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  choiceChipTextActive: {
    color: '#10B981',
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  choiceCardActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  choiceCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  choiceCardText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  choiceCardTextActive: {
    color: '#10B981',
  },
  allocationHeader: {
    marginBottom: 12,
  },
  allocationHint: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 4,
  },
  allocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  allocationInfo: {
    flex: 1,
  },
  allocationAccountName: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  allocationBalance: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  allocationInput: {
    width: 120,
    margin: 0,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  modeButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modeButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  modeButtonText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#10B981',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  addButtonText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  allocationCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  allocationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  allocationInfo: {
    flex: 1,
  },
  allocationAccountName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  allocationBalance: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  allocationAmountInput: {
    width: 120,
    margin: 0,
    textAlign: 'right',
  },
  allocationDescriptionInput: {
    marginTop: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 20,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  inputHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  stepSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 20,
    lineHeight: 20,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  expandButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  summaryCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 8,
  },
  summaryDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
  summaryDetails: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 20,
    paddingBottom: 40,
  },
  backButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});