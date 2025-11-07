import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import DateTimePicker from '@react-native-community/datetimepicker';
import FundPicker, { FundBucket } from '@/components/FundPicker';

interface PayModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedAccountId?: string;
}

export default function PayModal({ visible, onClose, onSuccess, preselectedAccountId }: PayModalProps) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { currency } = useSettings();
  const { globalRefresh, refreshAccounts } = useRealtimeData();
  const { getAccountBreakdown } = useLiabilities();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  // Fund selection state
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);

  // Fetch user accounts
  useEffect(() => {
    if (visible && user) {
      fetchAccounts();
      fetchCategories();
    }
  }, [visible, user]);

  // Set preselected account when modal opens
  useEffect(() => {
    if (visible && preselectedAccountId) {
      setAccount(preselectedAccountId);
      setSelectedFundBucket(null); // Reset fund bucket when account changes
    }
  }, [visible, preselectedAccountId]);

  // When account is selected, show fund picker if not already selected
  useEffect(() => {
    if (visible && account && !selectedFundBucket) {
      // Auto-show fund picker when account is selected
      setShowFundPicker(true);
    }
  }, [visible, account]);

  // Reset fund bucket when account changes
  useEffect(() => {
    if (account && selectedFundBucket) {
      // Keep fund bucket only if it's still valid for the account
      // For now, reset it when account changes
      setSelectedFundBucket(null);
    }
  }, [account]);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user?.id)
        .contains('activity_types', ['expense'])
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };



  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!amount.trim()) {
      newErrors.amount = 'Amount is required';
    } else if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      newErrors.amount = 'Please enter a valid amount';
    }

    if (!account) {
      newErrors.account = 'Please select an account';
    }

    if (!selectedFundBucket) {
      newErrors.fundBucket = 'Please select a fund source';
    }

    if (!category) {
      newErrors.category = 'Please select a category';
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const amountValue = parseFloat(amount);
      
      // Get category name from category ID
      const selectedCategory = categories.find(cat => cat.id === category);
      const categoryName = selectedCategory?.name || null;

      if (!selectedFundBucket) {
        throw new Error('No fund source selected');
      }

      // Use spend_from_account_bucket RPC (expects p_bucket as JSONB)
      const bucketParam = {
        type: selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };

      // Get category ID for the RPC (it expects category_id, not category name)
      const selectedCategoryId = categories.find(cat => cat.id === category)?.id || null;

      console.log('📤 Calling spend_from_account_bucket RPC:', {
        p_user_id: user?.id,
        p_account_id: account,
        p_bucket: bucketParam,
        p_amount: amountValue,
        p_category: selectedCategoryId,
      });

      const { data: rpcData, error } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user?.id,
        p_account_id: account,
        p_bucket: bucketParam,
        p_amount: amountValue,
        p_category: selectedCategoryId,
        p_description: description.trim(),
        p_date: date.toISOString().split('T')[0],
        p_currency: currency
      });

      if (error) {
        console.error('❌ RPC Error:', error);
        throw error;
      }

      console.log('✅ RPC Success, refreshing account data...');
      
      // Force immediate account refresh to get updated balance
      await refreshAccounts();
      
      // Small delay to ensure database has committed and state has updated
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get account name for notification (fetch fresh account data directly from DB)
      const { data: freshAccountData } = await supabase
        .from('accounts')
        .select('name, balance')
        .eq('id', account)
        .single();
      
      const accountName = freshAccountData?.name || 'Account';

      // Category name already retrieved above
      const displayCategoryName = categoryName || 'Uncategorized';

      // Build notification description based on fund source
      let descriptionText = displayCategoryName;
      if (selectedFundBucket.type === 'liability') {
        descriptionText += ` (from ${selectedFundBucket.name})`;
      } else if (selectedFundBucket.type === 'goal') {
        descriptionText += ` (from ${selectedFundBucket.name})`;
      }

      // Show success notification
      showNotification({
        type: 'success',
        title: 'Paid',
        amount: amountValue,
        currency: currency,
        description: descriptionText,
        account: accountName,
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      });

      // Global refresh to update all data (accounts already refreshed above)
      await globalRefresh();

      // Additional delay to ensure all UI components have refreshed
      await new Promise(resolve => setTimeout(resolve, 200));

      onSuccess?.(); // Call success callback for immediate UI update
      
      // Reset form
      setAmount('');
      setDescription('');
      setCategory('');
      setAccount('');
      setDate(new Date());
      setSelectedFundBucket(null);
      setErrors({});
      onClose();

    } catch (error) {
      console.error('Error creating transaction:', error);
      Alert.alert('Error', 'Failed to record payment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAccount = accounts.find(acc => acc.id.toString() === account);
  const amountValue = parseFloat(amount) || 0;
  const beforeBalance = selectedAccount?.balance || 0;
  const afterBalance = beforeBalance - amountValue;
  const totalBeforeBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const totalAfterBalance = totalBeforeBalance - amountValue;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Money</Text>
              <TouchableOpacity 
                style={[styles.saveButton, isLoading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                <Text style={styles.saveText}>
                  {isLoading ? 'Recording...' : 'Record Payment'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountInput}>
                <Text style={styles.currencySymbol}>{formatCurrencyAmount(0, currency).charAt(0)}</Text>
                <TextInput
                  style={[styles.amountTextInput, errors.amount && styles.errorInput]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  keyboardType="numeric"
                />
              </View>
              {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
            </View>

            {/* Description Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, errors.description && styles.errorInput]}
                value={description}
                onChangeText={setDescription}
                placeholder="What did you pay for?"
                placeholderTextColor="#6B7280"
                multiline
              />
              {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
            </View>

            {/* Category Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryGrid}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryButton,
                      category === cat.id && styles.selectedCategory
                    ]}
                    onPress={() => setCategory(cat.id)}
                  >
                    <Text style={[
                      styles.categoryText,
                      category === cat.id && styles.selectedCategoryText
                    ]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Account Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>From Account</Text>
              <View style={styles.accountList}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountButton,
                      account === acc.id.toString() && styles.selectedAccount
                    ]}
                    onPress={() => {
                      setAccount(acc.id.toString());
                      setSelectedFundBucket(null); // Reset fund bucket when account changes
                    }}
                  >
                    <View style={styles.accountInfo}>
                      <Text style={[
                        styles.accountName,
                        account === acc.id.toString() && styles.selectedAccountText
                      ]}>
                        {acc.name}
                      </Text>
                      <Text style={[
                        styles.accountBalance,
                        account === acc.id.toString() && styles.selectedAccountText
                      ]}>
                        {formatCurrencyAmount(acc.balance, currency)}
                      </Text>
                    </View>
                    {account === acc.id.toString() && (
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              {errors.account && <Text style={styles.errorText}>{errors.account}</Text>}
            </View>

            {/* Selected Fund Source */}
            {account && (
              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>Fund Source</Text>
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
                              ? 'person'
                              : selectedFundBucket.type === 'liability'
                              ? 'card'
                              : 'flag'
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
                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.selectFundButton}
                    onPress={() => setShowFundPicker(true)}
                  >
                    <Ionicons name="wallet-outline" size={20} color="#10B981" />
                    <Text style={styles.selectFundText}>Select Fund Source</Text>
                  </TouchableOpacity>
                )}
                {errors.fundBucket && <Text style={styles.errorText}>{errors.fundBucket}</Text>}
              </View>
            )}

            {/* Date Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateText}>{formatDate(date)}</Text>
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  onChange={onDateChange}
                />
              )}
            </View>

            {/* Balance Impact */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceTitle}>Balance Impact</Text>
              
              <View style={styles.balanceRow}>
                <View style={styles.balanceBox}>
                  <Text style={styles.balanceLabel}>Account Balance</Text>
                  <Text style={styles.balanceBefore}>${beforeBalance.toLocaleString()}</Text>
                  <Text style={styles.balanceAfter}>${afterBalance.toLocaleString()}</Text>
                </View>
                
                <View style={styles.balanceBox}>
                  <Text style={styles.balanceLabel}>Total Balance</Text>
                  <Text style={styles.balanceBefore}>${totalBeforeBalance.toLocaleString()}</Text>
                  <Text style={styles.balanceAfter}>${totalAfterBalance.toLocaleString()}</Text>
                </View>
              </View>
            </View>

          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      {/* Fund Picker Modal */}
      <FundPicker
        visible={showFundPicker}
        onClose={() => setShowFundPicker(false)}
        accountId={account}
        onSelect={(bucket) => {
          setSelectedFundBucket(bucket);
          setShowFundPicker(false);
        }}
        amount={parseFloat(amount) || 0}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  headerTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorInput: {
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  dateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: 'white',
    fontSize: 16,
  },
  inputCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold',
    marginRight: 8,
  },
  amountTextInput: {
    flex: 1,
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  selectedCategory: {
    backgroundColor: '#10B981',
  },
  categoryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  selectedCategoryText: {
    color: 'white',
    fontWeight: 'bold',
  },
  accountList: {
    gap: 8,
  },
  accountButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedAccount: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  accountBalance: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  accountBreakdown: {
    marginTop: 4,
    gap: 2,
  },
  accountBalanceText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  personalFundsText: {
    fontSize: 11,
    color: '#10B981',
    marginTop: 2,
  },
  liabilityFundsText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 2,
  },
  selectedAccountText: {
    color: '#10B981',
  },
  balanceCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
  },
  balanceTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  balanceBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 8,
  },
  balanceBefore: {
    color: '#6B7280',
    fontSize: 14,
    textDecorationLine: 'line-through',
    marginBottom: 4,
  },
  balanceAfter: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sourceToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
  },
  sourceButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectedSource: {
    backgroundColor: '#10B981',
  },
  sourceText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  selectedSourceText: {
    color: 'white',
    fontWeight: 'bold',
  },
  liabilityList: {
    gap: 8,
  },
  liabilityButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedLiability: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  liabilityInfo: {
    flex: 1,
  },
  liabilityName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  liabilityBalance: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  selectedLiabilityText: {
    color: '#10B981',
  },
  liabilityPortionText: {
    color: '#F59E0B',
    fontSize: 12,
    marginTop: 2,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkboxLabel: {
    color: 'white',
    fontSize: 14,
    marginLeft: 8,
  },
  dateButtonText: {
    color: 'white',
    fontSize: 16,
  },
  dateButtonPlaceholder: {
    color: 'rgba(255,255,255,0.7)',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  activeSegment: {
    backgroundColor: '#10B981',
  },
  segmentDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  fundBucketButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  fundBucketAmount: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  selectFundButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
    borderStyle: 'dashed',
  },
  selectFundText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  segmentText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  activeSegmentText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
