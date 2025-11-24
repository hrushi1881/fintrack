import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { allocateLiabilityFunds } from '@/utils/liabilityFunds';
import { generateBillsFromCycles } from '@/utils/cycleBillGeneration';

type LiabilityType = 'loan' | 'credit_card' | 'emi' | 'line_of_credit' | 'other';

const LIABILITY_TYPES: Array<{
  key: LiabilityType;
  label: string;
  icon: string;
}> = [
  { key: 'loan', label: 'Loan', icon: 'business' },
  { key: 'credit_card', label: 'Credit Card', icon: 'card' },
  { key: 'emi', label: 'EMI', icon: 'calendar' },
  { key: 'line_of_credit', label: 'Line of Credit', icon: 'flash' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

export default function AddLiabilityModal() {
  const { accounts, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  
  // Simple liability fields
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<LiabilityType>('loan');
  const [currentBalance, setCurrentBalance] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // EMI-specific fields
  const [emiAmount, setEmiAmount] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly'>('monthly');
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  
  // Optional: Did you receive funds?
  const [receivedFunds, setReceivedFunds] = useState<boolean | null>(null);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

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
    if (!user) return;

    const balanceValue = parseFloat(currentBalance);
    if (isNaN(balanceValue) || balanceValue <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for this liability');
      return;
    }

    // EMI-specific validation
    if (selectedType === 'emi') {
      const emiAmountValue = parseFloat(emiAmount);
      if (isNaN(emiAmountValue) || emiAmountValue <= 0) {
        Alert.alert('Error', 'Please enter a valid EMI amount');
        return;
      }
      
      // Validate payment date is within start date range
      if (paymentDate < startDate) {
        Alert.alert('Error', 'Payment date cannot be before start date');
        return;
      }
      
      // Validate end date is after start date and payment date
      if (endDate) {
        if (endDate <= startDate) {
          Alert.alert('Error', 'End date must be after start date');
          return;
        }
        if (paymentDate > endDate) {
          Alert.alert('Error', 'Payment date cannot be after end date');
          return;
        }
      }
      
      // Validate EMI amount doesn't exceed balance
      if (emiAmountValue > balanceValue) {
        Alert.alert('Error', 'EMI amount cannot exceed current balance');
        return;
      }
    }

    // If received funds, validate those fields
    if (receivedFunds === true) {
      const receivedAmountValue = parseFloat(receivedAmount);
      if (isNaN(receivedAmountValue) || receivedAmountValue <= 0) {
        Alert.alert('Error', 'Please enter a valid received amount');
        return;
      }
      if (!selectedAccountId) {
        Alert.alert('Error', 'Please select an account');
        return;
      }
    }

    try {
      setLoading(true);

      // Prepare liability data
      const liabilityData: any = {
        user_id: user.id,
        title: name.trim(),
        liability_type: selectedType,
        current_balance: balanceValue,
        original_amount: balanceValue,
        start_date: formatDateForInput(startDate),
        status: 'active',
        currency: currency,
        is_deleted: false,
      };

      // Add payment fields for all liability types (needed for bill generation)
      if (selectedType === 'emi') {
        const emiAmountValue = parseFloat(emiAmount);
        liabilityData.periodical_payment = emiAmountValue;
        liabilityData.periodical_frequency = frequency;
        liabilityData.next_due_date = formatDateForInput(paymentDate);
        if (endDate) {
          liabilityData.targeted_payoff_date = formatDateForInput(endDate);
        }
        // Set linked account if provided
        if (selectedAccountId) {
          liabilityData.linked_account_id = selectedAccountId;
        }
      } else {
        // For non-EMI types, set default payment fields if not provided
        // These can be updated later via edit liability
        liabilityData.periodical_payment = balanceValue / 12; // Default: monthly payment estimate
        liabilityData.periodical_frequency = 'monthly';
        liabilityData.next_due_date = formatDateForInput(startDate);
      }

      // Set available_funds if user received funds
      if (receivedFunds && receivedAmount) {
        const receivedAmountValue = parseFloat(receivedAmount);
        if (!isNaN(receivedAmountValue) && receivedAmountValue > 0) {
          liabilityData.available_funds = receivedAmountValue;
          liabilityData.disbursed_amount = receivedAmountValue;
        }
      }

      // Create liability in database
      const { data: liability, error: liabilityError } = await supabase
        .from('liabilities')
        .insert(liabilityData)
        .select()
        .single();

      if (liabilityError) throw liabilityError;

      // Generate bills from cycles for all liability types that have payment information
      if (liability && liability.periodical_payment && liability.periodical_frequency) {
        try {
          // Map periodical_frequency to cycle frequency format
          // periodical_frequency can be: 'weekly' | 'monthly' | 'bi-weekly' | 'quarterly' | 'yearly'
          // cycle frequency expects: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
          let cycleFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' = 'monthly';
          
          if (liability.periodical_frequency === 'weekly') {
            cycleFrequency = 'weekly';
          } else if (liability.periodical_frequency === 'monthly') {
            cycleFrequency = 'monthly';
          } else if (liability.periodical_frequency === 'bi-weekly') {
            cycleFrequency = 'weekly'; // Use weekly with interval 2
          } else if (liability.periodical_frequency === 'quarterly') {
            cycleFrequency = 'quarterly';
          } else if (liability.periodical_frequency === 'yearly') {
            cycleFrequency = 'yearly';
          }
          
          // Calculate payment day from next_due_date or start_date
          const dueDate = liability.next_due_date ? new Date(liability.next_due_date) : startDate;
          const paymentDay = dueDate.getDate();

          // Calculate interval for bi-weekly
          const interval = liability.periodical_frequency === 'bi-weekly' ? 2 : 1;

          const billsResult = await generateBillsFromCycles({
            liabilityId: liability.id,
            userId: user.id,
            startDate: liability.start_date,
            endDate: liability.targeted_payoff_date || null,
            frequency: cycleFrequency,
            interval: interval,
            dueDay: paymentDay,
            paymentAmount: Number(liability.periodical_payment),
            interestRate: Number(liability.interest_rate_apy || 0),
            currency: liability.currency || currency,
            linkedAccountId: liability.linked_account_id || undefined,
            maxCycles: 12, // Generate first 12 cycles, more will be generated as needed
          });
          
          console.log(`✅ Generated ${billsResult.billsCreated} bills for liability`);
        } catch (error) {
          console.error('Error generating bills from cycles:', error);
          Alert.alert('Warning', 'Liability created but bills could not be generated. You can create them manually.');
        }
      }

      // If user received funds, allocate them to an account
      if (receivedFunds && receivedAmount && selectedAccountId && liability) {
        const receivedAmountValue = parseFloat(receivedAmount);
        if (!isNaN(receivedAmountValue) && receivedAmountValue > 0) {
          try {
            const allocationResult = await allocateLiabilityFunds(
              user.id,
              liability.id,
              selectedAccountId,
              receivedAmountValue,
              startDate
            );
            if (!allocationResult.success) {
              console.error('Error allocating liability funds:', allocationResult.error);
              Alert.alert('Warning', 'Liability created but funds could not be allocated');
            }
          } catch (error) {
            console.error('Error allocating liability funds:', error);
            Alert.alert('Warning', 'Liability created but funds could not be allocated');
          }
        }
      }

      await globalRefresh();

      Alert.alert(
        'Success',
        'Liability created! You can now create bills for payments.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Error creating liability:', error);
      Alert.alert('Error', error.message || 'Failed to create liability');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Liability</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.card}>
          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Home Loan, Car EMI"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Type */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Type *</Text>
            <View style={styles.typeGrid}>
              {LIABILITY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.key}
                  style={[
                    styles.typeButton,
                    selectedType === type.key && styles.typeButtonSelected,
                  ]}
                  onPress={() => setSelectedType(type.key)}
                >
                  <Ionicons
                    name={type.icon as any}
                    size={20}
                    color={selectedType === type.key ? '#10B981' : 'rgba(0, 0, 0, 0.6)'}
                  />
                  <Text style={[
                    styles.typeText,
                    selectedType === type.key && styles.typeTextSelected
                  ]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Current Balance */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Current Balance *</Text>
            <View style={styles.amountInputContainer}>
              <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : '$'}</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                value={currentBalance}
                onChangeText={setCurrentBalance}
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.helperText}>
              The amount you currently owe
            </Text>
          </View>

          {/* Start Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Start Date *</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
              <Text style={styles.dateButtonText}>{formatDate(startDate)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  if (Platform.OS === 'android') {
                    setShowDatePicker(false);
                  }
                  if (date && (Platform.OS === 'ios' || event.type === 'set')) {
                    setStartDate(date);
                    if (Platform.OS === 'ios') {
                      setShowDatePicker(false);
                    }
                  }
                }}
              />
            )}
          </View>

          {/* EMI-specific fields */}
          {selectedType === 'emi' && (
            <>
              {/* EMI Amount */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>EMI Amount *</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : '$'}</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    value={emiAmount}
                    onChangeText={setEmiAmount}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.helperText}>
                  The fixed amount to pay per {frequency === 'monthly' ? 'month' : 'week'}
                </Text>
              </View>

              {/* Frequency */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Frequency *</Text>
                <View style={styles.optionButtons}>
                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      frequency === 'monthly' && styles.optionButtonSelected,
                    ]}
                    onPress={() => setFrequency('monthly')}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      frequency === 'monthly' && styles.optionButtonTextSelected
                    ]}>Monthly</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      frequency === 'weekly' && styles.optionButtonSelected,
                    ]}
                    onPress={() => setFrequency('weekly')}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      frequency === 'weekly' && styles.optionButtonTextSelected
                    ]}>Weekly</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Payment Date (First Payment Date) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>First Payment Date *</Text>
                <TouchableOpacity 
                  style={styles.dateButton} 
                  onPress={() => setShowPaymentDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.dateButtonText}>{formatDate(paymentDate)}</Text>
                </TouchableOpacity>
                {showPaymentDatePicker && (
                  <DateTimePicker
                    value={paymentDate}
                    mode="date"
                    display="default"
                    onChange={(event, date) => {
                      if (Platform.OS === 'android') {
                        setShowPaymentDatePicker(false);
                      }
                      if (date && (Platform.OS === 'ios' || event.type === 'set')) {
                        setPaymentDate(date);
                        if (Platform.OS === 'ios') {
                          setShowPaymentDatePicker(false);
                        }
                      }
                    }}
                  />
                )}
                <Text style={styles.helperText}>
                  Date of the first payment (must be on or after start date)
                </Text>
              </View>

              {/* End Date (Optional) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>End Date (Optional)</Text>
                <TouchableOpacity 
                  style={styles.dateButton} 
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.dateButtonText}>
                    {endDate ? formatDate(endDate) : 'Select end date'}
                  </Text>
                </TouchableOpacity>
                {showEndDatePicker && (
                  <DateTimePicker
                    value={endDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(event, date) => {
                      if (Platform.OS === 'android') {
                        setShowEndDatePicker(false);
                      }
                      if (date && (Platform.OS === 'ios' || event.type === 'set')) {
                        setEndDate(date);
                        if (Platform.OS === 'ios') {
                          setShowEndDatePicker(false);
                        }
                      }
                    }}
                  />
                )}
                <Text style={styles.helperText}>
                  When the EMI will end (bills will be generated until this date)
                </Text>
              </View>
            </>
          )}

          {/* Did you receive funds? */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Did you receive funds?</Text>
            <Text style={styles.helperText} style={{ marginBottom: 12 }}>
              Example: Did a bank transfer money to your account?
            </Text>
            <View style={styles.optionButtons}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  receivedFunds === true && styles.optionButtonSelected,
                ]}
                onPress={() => setReceivedFunds(true)}
              >
                <Text style={[
                  styles.optionButtonText,
                  receivedFunds === true && styles.optionButtonTextSelected
                ]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  receivedFunds === false && styles.optionButtonSelected,
                ]}
                onPress={() => setReceivedFunds(false)}
              >
                <Text style={[
                  styles.optionButtonText,
                  receivedFunds === false && styles.optionButtonTextSelected
                ]}>No</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* If received funds */}
          {receivedFunds === true && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount Received *</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : '$'}</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    value={receivedAmount}
                    onChangeText={setReceivedAmount}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Which account received the money? *</Text>
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
                        <View>
                          <Text style={styles.accountName}>{account.name}</Text>
                          <Text style={styles.accountBalance}>{formatCurrency(account.balance)}</Text>
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
            </>
          )}
        </GlassCard>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleSave}
          disabled={
            loading || 
            !name.trim() || 
            !currentBalance ||
            (selectedType === 'emi' && (!emiAmount || parseFloat(emiAmount) <= 0))
          }
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createButtonText}>Create Liability</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: 'bold',
    color: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  card: {
    margin: 20,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 24,
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: '#FFFFFF',
  },
  typeButtonSelected: {
    borderColor: '#10B981',
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  typeText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  typeTextSelected: {
    color: '#10B981',
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
  optionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  optionButtonSelected: {
    borderColor: '#10B981',
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  optionButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  optionButtonTextSelected: {
    color: '#10B981',
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
    backgroundColor: '#FFFFFF',
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
});
