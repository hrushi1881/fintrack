import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  account_id: string;
  category_id: string;
  notes?: string;
  location?: string;
  reference_number?: string;
  tags?: string[];
  account?: {
    name: string;
    color: string;
    icon: string;
  };
  category?: {
    name: string;
  };
}

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  color: string;
  icon: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

interface EditTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  onSuccess: () => void;
}

export default function EditTransactionModal({ visible, onClose, transaction, onSuccess }: EditTransactionModalProps) {
  const { user } = useAuth();
  const { globalRefresh } = useRealtimeData();
  const [formData, setFormData] = useState({
    amount: '',
    type: 'expense',
    description: '',
    date: new Date(),
    account_id: '',
    category_id: '',
    notes: '',
    location: '',
    reference_number: '',
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (transaction && visible) {
      setFormData({
        amount: Math.abs(transaction.amount).toString(),
        type: transaction.type,
        description: transaction.description,
        date: new Date(transaction.date),
        account_id: transaction.account_id,
        category_id: transaction.category_id,
        notes: transaction.notes || '',
        location: transaction.location || '',
        reference_number: transaction.reference_number || '',
      });
    }
  }, [transaction, visible]);

  useEffect(() => {
    if (visible && user) {
      fetchAccounts();
      fetchCategories();
    }
  }, [visible, user]);

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
        .contains('activity_types', ['income', 'expense'])
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

    if (!formData.amount.trim()) {
      newErrors.amount = 'Amount is required';
    } else if (isNaN(parseFloat(formData.amount)) || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Please enter a valid amount';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.account_id) {
      newErrors.account_id = 'Please select an account';
    }

    if (!formData.category_id) {
      newErrors.category_id = 'Please select a category';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm() || !transaction) return;

    setIsLoading(true);

    try {
      const amount = parseFloat(formData.amount);
      const finalAmount = formData.type === 'expense' ? -amount : amount;

      const { error } = await supabase
        .from('transactions')
        .update({
          amount: finalAmount,
          type: formData.type,
          description: formData.description.trim(),
          date: formData.date.toISOString().split('T')[0],
          account_id: formData.account_id,
          category_id: formData.category_id,
          notes: formData.notes.trim() || null,
          location: formData.location.trim() || null,
          reference_number: formData.reference_number.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)
        .eq('user_id', user?.id);

      if (error) throw error;

      Alert.alert('Success', 'Transaction updated successfully!', [
        { text: 'OK', onPress: async () => {
          // Global refresh to update all data
          await globalRefresh();
          onSuccess();
          onClose();
        }}
      ]);

    } catch (error) {
      console.error('Error updating transaction:', error);
      Alert.alert('Error', 'Failed to update transaction. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (!transaction) return;

    Alert.alert(
      'Delete Transaction',
      `Are you sure you want to delete "${transaction.description}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('transactions')
                .update({ is_active: false })
                .eq('id', transaction.id)
                .eq('user_id', user?.id);

              if (error) throw error;

              Alert.alert('Success', 'Transaction deleted successfully!', [
                { text: 'OK', onPress: async () => {
                  // Global refresh to update all data
                  await globalRefresh();
                  onSuccess();
                  onClose();
                }}
              ]);
            } catch (error) {
              console.error('Error deleting transaction:', error);
              Alert.alert('Error', 'Failed to delete transaction. Please try again.');
            }
          }
        }
      ]
    );
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFormData({ ...formData, date: selectedDate });
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, 'INR'); // TODO: Get from user settings
  };

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);

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
              <Text style={styles.headerTitle}>Edit Transaction</Text>
              <TouchableOpacity
                style={[styles.saveButton, isLoading && styles.disabledButton]}
                onPress={handleSave}
                disabled={isLoading}
              >
                <Text style={styles.saveText}>
                  {isLoading ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Transaction Type */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Transaction Type</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    formData.type === 'income' && styles.selectedType
                  ]}
                  onPress={() => setFormData({ ...formData, type: 'income' })}
                >
                  <Ionicons 
                    name="arrow-down" 
                    size={20} 
                    color={formData.type === 'income' ? 'white' : '#6B7280'} 
                  />
                  <Text style={[
                    styles.typeText,
                    formData.type === 'income' && styles.selectedTypeText
                  ]}>
                    Income
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    formData.type === 'expense' && styles.selectedType
                  ]}
                  onPress={() => setFormData({ ...formData, type: 'expense' })}
                >
                  <Ionicons 
                    name="arrow-up" 
                    size={20} 
                    color={formData.type === 'expense' ? 'white' : '#6B7280'} 
                  />
                  <Text style={[
                    styles.typeText,
                    formData.type === 'expense' && styles.selectedTypeText
                  ]}>
                    Expense
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Amount */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountInput}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={[styles.amountTextInput, errors.amount && styles.errorInput]}
                  value={formData.amount}
                  onChangeText={(text) => setFormData({ ...formData, amount: text })}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  keyboardType="numeric"
                />
              </View>
              {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
            </View>

            {/* Description */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, errors.description && styles.errorInput]}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Enter transaction description"
                placeholderTextColor="#6B7280"
              />
              {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
            </View>

            {/* Account Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Account</Text>
              <TouchableOpacity
                style={[styles.selectorButton, errors.account_id && styles.errorInput]}
                onPress={() => {
                  // In a real app, you'd show a modal with account selection
                  Alert.alert('Select Account', 'Account selection will be implemented');
                }}
              >
                <View style={styles.selectorContent}>
                  {selectedAccount ? (
                    <>
                      <View style={[styles.accountIcon, { backgroundColor: selectedAccount.color }]}>
                        <Ionicons name={selectedAccount.icon as any} size={20} color="white" />
                      </View>
                      <Text style={styles.selectorText}>{selectedAccount.name}</Text>
                    </>
                  ) : (
                    <Text style={styles.selectorPlaceholder}>Select an account</Text>
                  )}
                </View>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
              {errors.account_id && <Text style={styles.errorText}>{errors.account_id}</Text>}
            </View>

            {/* Category Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Category</Text>
              <TouchableOpacity
                style={[styles.selectorButton, errors.category_id && styles.errorInput]}
                onPress={() => {
                  // In a real app, you'd show a modal with category selection
                  Alert.alert('Select Category', 'Category selection will be implemented');
                }}
              >
                <View style={styles.selectorContent}>
                  {selectedCategory ? (
                    <Text style={styles.selectorText}>{selectedCategory.name}</Text>
                  ) : (
                    <Text style={styles.selectorPlaceholder}>Select a category</Text>
                  )}
                </View>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
              {errors.category_id && <Text style={styles.errorText}>{errors.category_id}</Text>}
            </View>

            {/* Date */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar" size={20} color="#6B7280" />
                <Text style={styles.dateText}>
                  {formData.date.toLocaleDateString()}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={formData.date}
                  mode="date"
                  display="default"
                  onChange={onDateChange}
                />
              )}
            </View>

            {/* Notes */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                placeholder="Add notes about this transaction"
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Location */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Location (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={formData.location}
                onChangeText={(text) => setFormData({ ...formData, location: text })}
                placeholder="Where did this transaction occur?"
                placeholderTextColor="#6B7280"
              />
            </View>

            {/* Reference Number */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Reference Number (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={formData.reference_number}
                onChangeText={(text) => setFormData({ ...formData, reference_number: text })}
                placeholder="Transaction reference number"
                placeholderTextColor="#6B7280"
              />
            </View>

            {/* Delete Button */}
            <View style={styles.deleteSection}>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash" size={20} color="#EF4444" />
                <Text style={styles.deleteButtonText}>Delete Transaction</Text>
              </TouchableOpacity>
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
    paddingVertical: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
  inputCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
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
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  currencySymbol: {
    fontSize: 20,
    color: 'white',
    marginRight: 8,
    fontWeight: 'bold',
  },
  amountTextInput: {
    flex: 1,
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
  },
  selectedType: {
    backgroundColor: '#10B981',
  },
  typeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  selectedTypeText: {
    color: 'white',
    fontWeight: 'bold',
  },
  selectorButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  selectorText: {
    color: 'white',
    fontSize: 16,
    flex: 1,
  },
  selectorPlaceholder: {
    color: '#6B7280',
    fontSize: 16,
    flex: 1,
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
    flex: 1,
    marginLeft: 12,
  },
  deleteSection: {
    marginTop: 20,
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});



