import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import DateTimePicker from '@react-native-community/datetimepicker';

interface ReceiveModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedAccountId?: string;
}

export default function ReceiveModal({ visible, onClose, onSuccess, preselectedAccountId }: ReceiveModalProps) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { currency } = useSettings();
  const { globalRefresh } = useRealtimeData();
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

  // Fetch user accounts and income categories
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
    }
  }, [visible, preselectedAccountId]);

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
        .contains('activity_types', ['income'])
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
      
      // Create transaction using our helper function
      const { data, error } = await supabase.rpc('create_transaction', {
        p_user_id: user?.id,
        p_account_id: account,
        p_amount: amountValue,
        p_type: 'income',
        p_category: category,
        p_description: description.trim(),
        p_date: date.toISOString().split('T')[0],
        p_notes: `Income received on ${date}`
      });

      if (error) throw error;

      // Get account name for notification
      const selectedAccount = accounts.find(acc => acc.id === account);
      const accountName = selectedAccount?.name || 'Account';

      // Get category name for notification
      const selectedCategory = categories.find(cat => cat.id === category);
      const categoryName = selectedCategory?.name || 'Other';

      // Show success notification
      showNotification({
        type: 'success',
        title: 'Received',
        amount: amountValue,
        currency: currency,
        description: categoryName,
        account: accountName,
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      });

      // Global refresh to update all data
      await globalRefresh();

      onSuccess?.(); // Call success callback for immediate UI update
      
      // Reset form
      setAmount('');
      setDescription('');
      setCategory('');
      setAccount('');
      setDate(new Date());
      setErrors({});
      onClose();

    } catch (error) {
      console.error('Error creating transaction:', error);
      Alert.alert('Error', 'Failed to record income. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAccount = accounts.find(acc => acc.id.toString() === account);
  const amountValue = parseFloat(amount) || 0;
  const beforeBalance = selectedAccount?.balance || 0;
  const afterBalance = beforeBalance + amountValue;
  const totalBeforeBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const totalAfterBalance = totalBeforeBalance + amountValue;

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
              <Text style={styles.headerTitle}>Receive Money</Text>
              <TouchableOpacity 
                style={[styles.saveButton, isLoading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                <Text style={styles.saveText}>
                  {isLoading ? 'Recording...' : 'Record Income'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountInput}>
                <Text style={styles.currencySymbol}>$</Text>
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
                placeholder="What did you receive?"
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
                      category === cat.name && styles.selectedCategory
                    ]}
                    onPress={() => setCategory(cat.name)}
                  >
                    <Text style={[
                      styles.categoryText,
                      category === cat.name && styles.selectedCategoryText
                    ]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Account Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>To Account</Text>
              <View style={styles.accountList}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountButton,
                      account === acc.id && styles.selectedAccount
                    ]}
                    onPress={() => setAccount(acc.id)}
                  >
                    <View style={styles.accountInfo}>
                      <Text style={[
                        styles.accountName,
                        account === acc.id && styles.selectedAccountText
                      ]}>
                        {acc.name}
                      </Text>
                      <Text style={[
                        styles.accountBalance,
                        account === acc.id && styles.selectedAccountText
                      ]}>
                        ${acc.balance.toLocaleString()}
                      </Text>
                    </View>
                    {account === acc.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <View style={styles.dateButtonContent}>
                  <Ionicons name="calendar" size={20} color="#10B981" />
                  <Text style={styles.dateText}>
                    {date.toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
              
              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setDate(selectedDate);
                    }
                  }}
                  maximumDate={new Date()}
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
  dateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  dateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: 'white',
    fontSize: 16,
    flex: 1,
    marginLeft: 12,
  },
  disabledButton: {
    backgroundColor: '#6B7280',
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
    marginLeft: 4,
  },
});
