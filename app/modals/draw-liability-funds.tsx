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

interface DrawLiabilityFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  liabilityId: string;
}

interface Distribution {
  accountId: string;
  amount: string;
}

export default function DrawLiabilityFundsModal({
  visible,
  onClose,
  onSuccess,
  liabilityId,
}: DrawLiabilityFundsModalProps) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { currency } = useSettings();
  const { globalRefresh, refreshAccounts } = useRealtimeData();
  const [liability, setLiability] = useState<any>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([{ accountId: '', amount: '' }]);
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<string>('');
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (visible && liabilityId && user) {
      fetchLiability();
      fetchAccounts();
      fetchCategories();
    }
  }, [visible, liabilityId, user]);

  useEffect(() => {
    if (visible) {
      setDistributions([{ accountId: '', amount: '' }]);
      setDate(new Date());
      setNotes('');
      setCategory('');
      setErrors({});
    }
  }, [visible]);

  // Auto-select first liability category when categories are loaded
  useEffect(() => {
    if (categories.length > 0 && !category) {
      setCategory(categories[0].id);
    }
  }, [categories, category]);

  const fetchLiability = async () => {
    try {
      const { data, error } = await supabase
        .from('liabilities')
        .select('*')
        .eq('id', liabilityId)
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      setLiability(data);
    } catch (error) {
      console.error('Error fetching liability:', error);
      Alert.alert('Error', 'Failed to load liability details');
    }
  };

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .neq('type', 'liability')
        .neq('type', 'goals_savings')
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
        .contains('activity_types', ['liability'])
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
      
      // Auto-select first category if available
      if (data && data.length > 0) {
        setCategory(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const calculateAvailable = () => {
    if (!liability) return 0;
    const original = parseFloat(liability.original_amount || '0');
    const disbursed = parseFloat(liability.disbursed_amount || '0');
    return Math.max(0, original - disbursed);
  };

  const calculateTotalDistribution = () => {
    return distributions.reduce((sum, dist) => {
      const amt = parseFloat(dist.amount || '0');
      return sum + amt;
    }, 0);
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    const totalDistributed = calculateTotalDistribution();
    const available = calculateAvailable();

    if (distributions.length === 0 || distributions.every(d => !d.accountId || !d.amount)) {
      newErrors.distributions = 'Please add at least one account distribution';
    }

    if (!category || category.trim() === '') {
      newErrors.category = 'Please select a category';
    }

    distributions.forEach((dist, index) => {
      if (!dist.accountId) {
        newErrors[`account_${index}`] = 'Please select an account';
      }
      if (!dist.amount || isNaN(parseFloat(dist.amount)) || parseFloat(dist.amount) <= 0) {
        newErrors[`amount_${index}`] = 'Please enter a valid amount';
      }
    });

    if (totalDistributed <= 0) {
      newErrors.total = 'Total distribution must be greater than 0';
    }

    // Warn if overdrawing, but don't block (we'll confirm before submit)
    if (totalDistributed > available && available > 0) {
      newErrors.total = `⚠️ Overdrawing by ${formatCurrencyAmount(totalDistributed - available, currency)}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddAccount = () => {
    setDistributions([...distributions, { accountId: '', amount: '' }]);
  };

  const handleRemoveAccount = (index: number) => {
    if (distributions.length > 1) {
      const newDistributions = distributions.filter((_, i) => i !== index);
      setDistributions(newDistributions);
    }
  };

  const handleDistributionChange = (index: number, field: 'accountId' | 'amount', value: string) => {
    const newDistributions = [...distributions];
    newDistributions[index] = { ...newDistributions[index], [field]: value };
    setDistributions(newDistributions);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const totalDistributed = calculateTotalDistribution();
    const available = calculateAvailable();
    const isOverdraw = totalDistributed > available && available > 0;
    const overdrawAmount = isOverdraw ? totalDistributed - available : 0;

    // If overdrawing, confirm first
    if (isOverdraw) {
      Alert.alert(
        'Overdraw Limit',
        `You're trying to draw ${formatCurrencyAmount(totalDistributed, currency)}, but only ${formatCurrencyAmount(available, currency)} is available.\n\nDo you want to raise your total loan limit by ${formatCurrencyAmount(overdrawAmount, currency)}?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Yes, Raise Limit',
            onPress: () => executeDraw(totalDistributed, overdrawAmount),
          },
        ]
      );
      return;
    }

    // Normal draw within limit
    executeDraw(totalDistributed, 0);
  };

  const executeDraw = async (totalDistributed: number, overdrawAmount: number) => {
    setIsLoading(true);

    try {
      const distributionsArray = distributions
        .filter(d => d.accountId && d.amount)
        .map(d => ({
          account_id: d.accountId,
          amount: parseFloat(d.amount),
        }));

      const { error } = await supabase.rpc('draw_liability_funds', {
        p_user_id: user?.id,
        p_liability_id: liabilityId,
        p_distributions: distributionsArray,
        p_date: date.toISOString().split('T')[0],
        p_notes: notes.trim() || null,
        p_category_id: category || null,
      });

      if (error) throw error;

      // Force immediate account refresh to get updated balances
      await refreshAccounts();
      
      // Small delay to ensure database has committed and state has updated
      await new Promise(resolve => setTimeout(resolve, 200));

      // If limit was increased, ask to update terms
      if (overdrawAmount > 0) {
        Alert.alert(
          'Limit Increased',
          `Limit increased by ${formatCurrencyAmount(overdrawAmount, currency)}.\n\nDo you want to update target date, monthly payment, interest rate, or installment amount?`,
          [
            {
              text: 'Not Now',
              style: 'cancel',
              onPress: () => {
                showSuccessNotification(totalDistributed, distributionsArray.length);
                handleDrawComplete();
              },
            },
            {
              text: 'Update Terms',
              onPress: () => {
                // Navigate to edit liability or show inline edit
                // For now, just show notification and close
                showSuccessNotification(totalDistributed, distributionsArray.length);
                handleDrawComplete();
                // TODO: Navigate to edit liability modal or show inline edit form
              },
            },
          ]
        );
      } else {
        showSuccessNotification(totalDistributed, distributionsArray.length);
        handleDrawComplete();
      }

    } catch (error: any) {
      console.error('Error drawing funds:', error);
      Alert.alert('Error', error.message || 'Failed to draw funds. Please try again.');
      setIsLoading(false);
    }
  };

  const showSuccessNotification = (amount: number, accountCount: number) => {
    showNotification({
      type: 'success',
      title: 'Funds Drawn',
      amount: amount,
      currency: currency,
      description: liability?.title || 'Liability',
      account: `${accountCount} account(s)`,
      date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    });
  };

  const handleDrawComplete = async () => {
    // Ensure accounts are refreshed before closing
    await refreshAccounts();
    await globalRefresh();
    
    // Small delay to ensure state has updated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    onSuccess?.();
    
    setDistributions([{ accountId: '', amount: '' }]);
    setDate(new Date());
    setNotes('');
    setErrors({});
    setIsLoading(false);
    onClose();
  };

  const available = calculateAvailable();
  const totalDistributed = calculateTotalDistribution();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <LinearGradient
        colors={['#6366F1', '#6366F1', '#6366F1']}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Draw Funds</Text>
              <TouchableOpacity 
                style={[styles.saveButton, isLoading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                <Text style={styles.saveText}>
                  {isLoading ? 'Drawing...' : 'Draw Funds'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Liability Info */}
            {liability && (
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Liability</Text>
                <Text style={styles.infoValue}>{liability.title}</Text>
                <View style={styles.infoRow}>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoBoxLabel}>Available</Text>
                    <Text style={styles.infoBoxValue}>
                      {formatCurrencyAmount(available, currency)}
                    </Text>
                  </View>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoBoxLabel}>Total Owed</Text>
                    <Text style={styles.infoBoxValue}>
                      {formatCurrencyAmount(parseFloat(liability.original_amount || '0'), currency)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Date Selection */}
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

            {/* Distributions */}
            <View style={styles.inputCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.inputLabel}>Distribute to Accounts</Text>
                <TouchableOpacity onPress={handleAddAccount} style={styles.addButton}>
                  <Ionicons name="add-circle" size={24} color="#10B981" />
                </TouchableOpacity>
              </View>

              {distributions.map((dist, index) => (
                <View key={index} style={styles.distributionRow}>
                  <View style={styles.distributionAccount}>
                    <Text style={styles.distributionLabel}>Account</Text>
                    <View style={styles.accountSelector}>
                      {accounts.map((acc) => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[
                            styles.accountOption,
                            dist.accountId === acc.id && styles.selectedAccountOption
                          ]}
                          onPress={() => handleDistributionChange(index, 'accountId', acc.id)}
                        >
                          <Text style={[
                            styles.accountOptionText,
                            dist.accountId === acc.id && styles.selectedAccountOptionText
                          ]}>
                            {acc.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {errors[`account_${index}`] && (
                      <Text style={styles.errorText}>{errors[`account_${index}`]}</Text>
                    )}
                  </View>

                  <View style={styles.distributionAmount}>
                    <Text style={styles.distributionLabel}>Amount</Text>
                    <TextInput
                      style={[styles.amountInput, errors[`amount_${index}`] && styles.errorInput]}
                      value={dist.amount}
                      onChangeText={(value) => handleDistributionChange(index, 'amount', value)}
                      placeholder="0.00"
                      placeholderTextColor="#6B7280"
                      keyboardType="numeric"
                    />
                    {errors[`amount_${index}`] && (
                      <Text style={styles.errorText}>{errors[`amount_${index}`]}</Text>
                    )}
                  </View>

                  {distributions.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveAccount(index)}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {errors.total && (
                <Text style={styles.errorText}>{errors.total}</Text>
              )}
            </View>

            {/* Total Distribution */}
            {totalDistributed > 0 && (
              <View style={[
                styles.totalCard,
                totalDistributed > available && available > 0 && styles.totalCardWarning
              ]}>
                <Text style={styles.totalLabel}>Total Distribution</Text>
                <Text style={styles.totalValue}>
                  {formatCurrencyAmount(totalDistributed, currency)}
                </Text>
                {available > 0 ? (
                  <>
                    {totalDistributed > available ? (
                      <Text style={styles.totalWarning}>
                        ⚠️ Overdrawing by {formatCurrencyAmount(totalDistributed - available, currency)}
                      </Text>
                    ) : (
                      <Text style={styles.totalRemaining}>
                        Remaining: {formatCurrencyAmount(available - totalDistributed, currency)}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.totalWarning}>
                    ⚠️ No funds available to draw
                  </Text>
                )}
              </View>
            )}

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
              {categories.length === 0 && (
                <Text style={styles.hintText}>No liability categories found. Please create one.</Text>
              )}
              {errors.category && (
                <Text style={styles.errorText}>{errors.category}</Text>
              )}
            </View>

            {/* Notes */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any notes about this withdrawal..."
                placeholderTextColor="#6B7280"
                multiline
              />
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
  disabledButton: {
    backgroundColor: '#6B7280',
    opacity: 0.6,
  },
  infoCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
  },
  infoBoxLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  infoBoxValue: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: 'bold',
  },
  inputCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  addButton: {
    padding: 4,
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
  distributionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  distributionAccount: {
    flex: 2,
  },
  distributionAmount: {
    flex: 1,
  },
  distributionLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  accountSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accountOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 4,
  },
  selectedAccountOption: {
    backgroundColor: '#10B981',
  },
  accountOptionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  selectedAccountOptionText: {
    color: 'white',
    fontWeight: 'bold',
  },
  amountInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    color: 'white',
    fontSize: 16,
  },
  removeButton: {
    padding: 12,
    justifyContent: 'center',
  },
  totalCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  totalLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 24,
    color: '#10B981',
    fontWeight: 'bold',
  },
  totalRemaining: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  totalCardWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: '#F59E0B',
  },
  totalWarning: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 4,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
    minHeight: 80,
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  categoryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  selectedCategory: {
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
    borderColor: '#6366F1',
    borderWidth: 2,
  },
  categoryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  selectedCategoryText: {
    color: '#6366F1',
    fontWeight: 'bold',
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

