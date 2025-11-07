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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useSettings } from '../../contexts/SettingsContext';
import { useLiabilities } from '../../contexts/LiabilitiesContext';
import { Bill, BillPayment } from '../../types';
import { markBillAsPaid, fetchBillById } from '../../utils/bills';
import { formatCurrencyAmount } from '../../utils/currency';
import { supabase } from '../../lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import FundPicker, { FundBucket } from '../../components/FundPicker';

export default function MarkBillPaidModal() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { accounts, globalRefresh, refreshAccounts } = useRealtimeData();
  const { currency } = useSettings();
  const { getAccountBreakdown } = useLiabilities();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    account_id: '',
    notes: '',
    generate_next: true,
  });
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  useEffect(() => {
    loadBillData();
  }, [id, user]);

  // Reset fund bucket when account changes
  useEffect(() => {
    if (formData.account_id && selectedFundBucket) {
      setSelectedFundBucket(null);
    }
  }, [formData.account_id]);

  // Auto-show fund picker when account is selected
  useEffect(() => {
    if (formData.account_id && !selectedFundBucket) {
      setShowFundPicker(true);
    }
  }, [formData.account_id]);

  const loadBillData = async () => {
    try {
      setLoading(true);
      const billData = await fetchBillById(id as string);
      if (billData) {
        setBill(billData);
        setFormData(prev => ({
          ...prev,
          amount: billData.amount?.toString() || '',
        }));
      }
    } catch (error) {
      console.error('Error loading bill data:', error);
      Alert.alert('Error', 'Failed to load bill data');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!bill || !user) return;

    if (!formData.amount.trim()) {
      Alert.alert('Error', 'Please enter a payment amount');
      return;
    }

    if (!formData.account_id) {
      Alert.alert('Error', 'Please select an account to pay from');
      return;
    }

    if (!selectedFundBucket) {
      Alert.alert('Error', 'Please select a fund source');
      return;
    }

    try {
      setSubmitting(true);
      const amountValue = parseFloat(formData.amount);

      // Use spend_from_account_bucket RPC (expects p_bucket as JSONB)
      const bucketParam = {
        type: selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };

      // Ensure category_id is a valid UUID string or null
      const categoryId = bill.category_id && typeof bill.category_id === 'string' 
        ? bill.category_id.trim() 
        : null;

      const { data: transactionData, error: bucketError } = await supabase.rpc(
        'spend_from_account_bucket',
        {
          p_user_id: user.id,
          p_account_id: formData.account_id,
          p_bucket: bucketParam,
          p_amount: amountValue,
          p_category: categoryId || null,
          p_description: `Payment for ${bill.title}`,
          p_date: formData.payment_date,
          p_currency: bill.currency,
        }
      );

      if (bucketError) {
        console.error('❌ RPC Error in mark-bill-paid:', bucketError);
        throw bucketError;
      }

      console.log('✅ Bill payment RPC success, refreshing accounts...');
      // Force immediate account refresh
      await refreshAccounts();
      
      // Small delay to ensure database has committed and state has updated
      await new Promise(resolve => setTimeout(resolve, 200));

      // Create bill payment record
      const { data: payment, error: paymentError } = await supabase
        .from('bill_payments')
        .insert({
          bill_id: bill.id,
          user_id: user.id,
          amount: amountValue,
          currency: bill.currency,
          payment_date: formData.payment_date,
          actual_due_date: bill.due_date,
          account_id: formData.account_id,
          payment_status: 'completed',
          notes: formData.notes,
          transaction_id: transactionData?.id || null,
        })
        .select()
        .single();

      if (paymentError) {
        console.error('Error creating bill payment:', paymentError);
        throw paymentError;
      }

      // Handle bill recurrence if needed
      if (formData.generate_next && bill.recurrence_pattern) {
        // The markBillAsPaid utility might handle this, but for now we'll skip
        // as this is handled by the recurrence system
      }

      globalRefresh();
      router.back();
    } catch (error: any) {
      console.error('Error marking bill as paid:', error);
      Alert.alert('Error', error.message || 'Failed to mark bill as paid. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading bill details...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!bill) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Bill not found</Text>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pay Bill</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Bill Info */}
          <View style={styles.billInfoCard}>
            <View style={styles.billHeader}>
              <View style={[styles.billIcon, { backgroundColor: bill.color + '20' }]}>
                <Ionicons name={bill.icon as any} size={24} color={bill.color} />
              </View>
              <View style={styles.billInfo}>
                <Text style={styles.billTitle}>{bill.title}</Text>
                <Text style={styles.billDueDate}>Due: {formatDate(bill.due_date)}</Text>
              </View>
              <View style={styles.billAmount}>
                <Text style={styles.amountText}>
                  {bill.amount ? formatCurrency(bill.amount) : 'Variable'}
                </Text>
              </View>
            </View>
          </View>

          {/* Payment Form */}
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Payment Details</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Amount *</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>
                  {formatCurrencyAmount(0, currency).charAt(0) || currency.charAt(0) || '$'}
                </Text>
                <TextInput
                  style={styles.amountInput}
                  value={formData.amount}
                  onChangeText={(value) => handleInputChange('amount', value)}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>
              {bill.amount && (
                <Text style={styles.originalAmountText}>
                  Original amount: {formatCurrency(bill.amount)}
                </Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Date</Text>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateButtonText}>
                  {formatDate(formData.payment_date)}
                </Text>
                <Ionicons name="calendar" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Account *</Text>
              <TouchableOpacity 
                style={styles.pickerButton}
                onPress={() => setShowAccountPicker(!showAccountPicker)}
              >
                <Text style={styles.pickerButtonText}>
                  {formData.account_id ? accounts.find(a => a.id === formData.account_id)?.name : 'Select account'}
                </Text>
                <Ionicons name={showAccountPicker ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
              </TouchableOpacity>
              
              {showAccountPicker && (
                <View style={styles.accountPickerContainer}>
                  <ScrollView style={styles.accountPickerScroll} showsVerticalScrollIndicator={false}>
                    {accounts
                      .filter(acc => acc.type !== 'liability' && acc.type !== 'goals_savings')
                      .map((account) => (
                        <TouchableOpacity
                          key={account.id}
                          style={[
                            styles.accountOption,
                            formData.account_id === account.id && styles.selectedAccountOption
                          ]}
                          onPress={() => {
                            handleInputChange('account_id', account.id);
                            setShowAccountPicker(false);
                            setShowFundPicker(true);
                          }}
                        >
                          <View style={styles.accountOptionInfo}>
                            <Text style={[
                              styles.accountOptionName,
                              formData.account_id === account.id && styles.selectedAccountOptionText
                            ]}>
                              {account.name}
                            </Text>
                            <Text style={[
                              styles.accountOptionBalance,
                              formData.account_id === account.id && styles.selectedAccountOptionText
                            ]}>
                              {formatCurrency(account.balance)}
                            </Text>
                          </View>
                          {formData.account_id === account.id && (
                            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                          )}
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              )}

              {formData.account_id && selectedFundBucket && (
                <View style={styles.selectedFundInfo}>
                  <Ionicons 
                    name={
                      selectedFundBucket.type === 'personal' ? 'wallet' :
                      selectedFundBucket.type === 'liability' ? 'card' :
                      'flag'
                    } 
                    size={16} 
                    color="#10B981" 
                  />
                  <Text style={styles.selectedFundText}>
                    Using: {selectedFundBucket.name}
                  </Text>
                  <TouchableOpacity onPress={() => setShowFundPicker(true)}>
                    <Text style={styles.changeFundText}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={formData.notes}
                onChangeText={(value) => handleInputChange('notes', value)}
                placeholder="Add payment notes..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          {/* Options */}
          <View style={styles.optionsCard}>
            <Text style={styles.sectionTitle}>Options</Text>
            
            {bill.bill_type !== 'one_time' && (
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => handleInputChange('generate_next', !formData.generate_next)}
              >
                <View style={styles.optionInfo}>
                  <Text style={styles.optionLabel}>Generate Next Bill</Text>
                  <Text style={styles.optionDescription}>
                    Create the next occurrence of this recurring bill
                  </Text>
                </View>
                <View style={[
                  styles.checkbox,
                  formData.generate_next && styles.checkedCheckbox
                ]}>
                  {formData.generate_next && (
                    <Ionicons name="checkmark" size={16} color="white" />
                  )}
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Payment Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Bill:</Text>
              <Text style={styles.summaryValue}>{bill.title}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount:</Text>
              <Text style={styles.summaryValue}>
                {formData.amount ? formatCurrency(parseFloat(formData.amount)) : '$0.00'}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Date:</Text>
              <Text style={styles.summaryValue}>{formatDate(formData.payment_date)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Account:</Text>
              <Text style={styles.summaryValue}>
                {accounts.find(a => a.id === formData.account_id)?.name}
              </Text>
            </View>
            {bill.bill_type !== 'one_time' && formData.generate_next && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Next Bill:</Text>
                <Text style={styles.summaryValue}>Will be generated</Text>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={() => router.back()}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.submitButton, submitting && styles.disabledButton]} 
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Processing...' : 'Pay Bill'}
              </Text>
              <Ionicons name="checkmark" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={new Date(formData.payment_date)}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              handleInputChange('payment_date', selectedDate.toISOString().split('T')[0]);
            }
          }}
        />
      )}

      {/* FundPicker Modal */}
      <FundPicker
        visible={showFundPicker}
        onClose={() => setShowFundPicker(false)}
        accountId={formData.account_id}
        amount={formData.amount ? parseFloat(formData.amount) : 0}
        onSelect={(bucket) => {
          setSelectedFundBucket(bucket);
          setShowFundPicker(false);
        }}
      />
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
    paddingTop: 20,
    paddingBottom: 20,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  headerTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
  placeholder: {
    width: 48,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'white',
    fontSize: 18,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
  },
  billInfoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  billInfo: {
    flex: 1,
  },
  billTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  billDueDate: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  billAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  formCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
    paddingVertical: 16,
  },
  originalAmountText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  dateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonText: {
    color: 'white',
    fontSize: 16,
  },
  pickerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerButtonText: {
    color: 'white',
    fontSize: 16,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  optionsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  optionInfo: {
    flex: 1,
    marginRight: 12,
  },
  optionLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkedCheckbox: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  summaryValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  accountPickerContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 200,
  },
  accountPickerScroll: {
    maxHeight: 200,
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedAccountOption: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  accountOptionInfo: {
    flex: 1,
  },
  accountOptionName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  selectedAccountOptionText: {
    color: '#10B981',
  },
  accountOptionBalance: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  accountOptionDetail: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  selectedFundInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    gap: 8,
  },
  selectedFundText: {
    flex: 1,
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  changeFundText: {
    fontSize: 14,
    color: '#10B981',
    textDecorationLine: 'underline',
  },
});
