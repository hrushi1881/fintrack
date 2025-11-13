import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import DateTimePicker from '@react-native-community/datetimepicker';
import FundPicker, { FundBucket } from '@/components/FundPicker';

interface ReceiveModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedAccountId?: string;
}

// Subcategory mappings for income
const INCOME_SUBCATEGORY_MAP: Record<string, Array<{ name: string; icon: string }>> = {
  Salary: [
    { name: 'Monthly', icon: 'calendar' },
    { name: 'Bonus', icon: 'gift' },
    { name: 'Overtime', icon: 'time' },
  ],
  Business: [
    { name: 'Sales', icon: 'storefront' },
    { name: 'Services', icon: 'briefcase' },
    { name: 'Freelance', icon: 'laptop' },
  ],
  Investment: [
    { name: 'Dividends', icon: 'trending-up' },
    { name: 'Interest', icon: 'cash' },
    { name: 'Capital Gains', icon: 'bar-chart' },
  ],
  Other: [
    { name: 'Gift', icon: 'gift' },
    { name: 'Refund', icon: 'arrow-undo' },
    { name: 'Rebate', icon: 'receipt' },
  ],
};

export default function ReceiveModal({ visible, onClose, onSuccess, preselectedAccountId }: ReceiveModalProps) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { currency } = useSettings();
  const {
    accounts: realtimeAccounts,
    globalRefresh,
    refreshAccounts,
    refreshTransactions,
    refreshAccountFunds,
    recalculateAllBalances,
    getFundsForAccount,
    accountFunds,
  } = useRealtimeData();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [account, setAccount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [selectedFundDestination, setSelectedFundDestination] = useState<FundBucket | null>(null);
  const [showFundDestinationPicker, setShowFundDestinationPicker] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showAmountInput, setShowAmountInput] = useState(false);

  // Get frequently used categories (top 3 by transaction count)
  const frequentlyUsedCategories = useMemo(() => {
    return [...categories]
      .sort((a, b) => (b.transaction_count || 0) - (a.transaction_count || 0))
      .slice(0, 3);
  }, [categories]);

  // Get subcategories for selected category
  const availableSubcategories = useMemo(() => {
    if (!category) return [];
    const selectedCategory = categories.find((cat) => cat.id === category);
    if (!selectedCategory) return [];
    return INCOME_SUBCATEGORY_MAP[selectedCategory.name] || [];
  }, [category, categories]);

  // Fetch user accounts and income categories
  useEffect(() => {
    if (visible && user) {
      fetchAccounts();
      fetchCategories();
    }
  }, [visible, user]);

  // Sync local accounts with realtime accounts
  useEffect(() => {
    if (realtimeAccounts && realtimeAccounts.length > 0) {
      setAccounts(realtimeAccounts);
    }
  }, [realtimeAccounts]);

  // Set preselected account
  useEffect(() => {
    if (visible && preselectedAccountId) {
      setAccount(preselectedAccountId);
    }
  }, [visible, preselectedAccountId]);

  // Check if account has any funds in account_funds table
  const accountHasFunds = useMemo(() => {
    if (!account) return false;
    const funds = getFundsForAccount(account, { includeLocked: true });
    // Check if account has ANY funds (personal, borrowed, goal, reserved, sinking)
    return funds.length > 0;
  }, [account, getFundsForAccount, accountFunds]);

  // Check if account has any non-personal funds (goal, reserved, sinking) - for income allocation
  // Note: Income cannot be allocated to liability/borrowed funds
  const accountHasOtherFunds = useMemo(() => {
    if (!account) return false;
    const funds = getFundsForAccount(account, { includeLocked: true });
    // Check if account has any non-personal, non-liability funds (goal, reserved, sinking) with balance > 0
    return funds.some(
      (fund) =>
        fund.fund_type !== 'personal' &&
        fund.fund_type !== 'borrowed' &&
        (typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0) > 0
    );
  }, [account, getFundsForAccount, accountFunds]);

  // Handle fund selection when account changes
  useEffect(() => {
    if (!account) {
      setSelectedFundDestination(null);
      setShowFundDestinationPicker(false);
      return;
    }

    // Reset fund destination when account changes
    setSelectedFundDestination(null);

    // Check if account has any funds in account_funds table
    if (!accountHasFunds) {
      // No funds in account_funds: account might be new or not initialized
      // Default to personal fund (RPC will handle creating it if needed)
      setSelectedFundDestination(null);
      setShowFundDestinationPicker(false);
    } else if (!accountHasOtherFunds) {
      // Has funds but only personal: default to personal fund, don't show picker
      setSelectedFundDestination(null);
      setShowFundDestinationPicker(false);
    } else {
      // Has other funds: allow user to choose, but don't auto-open picker
      setShowFundDestinationPicker(false);
    }
  }, [account, accountHasFunds, accountHasOtherFunds]);

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
        .order('transaction_count', { ascending: false })
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const amountValue = parseFloat(amount);
      const selectedCategory = categories.find((cat) => cat.id === category);
      const categoryName = selectedCategory?.name || '';
      
      // Determine fund destination
      let bucketType = 'personal';
      let bucketId: string | null = null;
      
      // If user selected a fund destination, use it
      if (selectedFundDestination && selectedFundDestination.type !== 'personal') {
        // Map fund types: 'goal' -> 'goal', 'reserved' -> 'reserved', 'sinking' -> 'sinking'
        // Note: 'borrowed' funds are excluded from income allocation
        if (selectedFundDestination.type === 'goal') {
          bucketType = 'goal';
          bucketId = selectedFundDestination.id;
        } else if (selectedFundDestination.type === 'reserved') {
          bucketType = 'reserved';
          bucketId = selectedFundDestination.id;
        } else if (selectedFundDestination.type === 'sinking') {
          bucketType = 'sinking';
          bucketId = selectedFundDestination.id;
        }
      }
      
      const { data: accountBefore } = await supabase
        .from('accounts')
        .select('balance, name')
        .eq('id', account)
        .single();
      
      const balanceBefore = accountBefore?.balance || 0;
      const accountName = accountBefore?.name || 'Account';

      const { data: rpcData, error } = await supabase.rpc('receive_to_account_bucket', {
        p_user_id: user?.id,
        p_account_id: account,
        p_bucket_type: bucketType,
        p_bucket_id: bucketId,
        p_amount: amountValue,
        p_category: categoryName,
        p_description: description.trim() || categoryName || 'Income received',
        p_date: date.toISOString().split('T')[0],
        p_notes: `Income received on ${date.toLocaleDateString()}`,
        p_currency: currency,
      });

      if (error) {
        console.error('❌ RPC Error:', error);
        Alert.alert('Error', error.message || 'Failed to record income. Please try again.');
        throw error;
      }

      console.log('✅ Income RPC successful, refreshing data...');
      
      // Wait for database commit - increased delay for reliability
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh all data in parallel for faster updates
      await Promise.all([
        refreshAccounts(),
        refreshAccountFunds(),
        refreshTransactions(),
      ]);
      
      console.log('✅ Data refreshed after income');

      const displayCategoryName = categoryName || 'Other';
      let descriptionText = displayCategoryName;
      if (subcategory) {
        descriptionText += ` - ${subcategory}`;
      }

      showNotification({
        type: 'success',
        title: 'Received',
        amount: amountValue,
        currency: currency,
        description: descriptionText,
        account: accountName,
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      });
      
      // Final global refresh to sync everything
      await globalRefresh();
      onSuccess?.();
      
      // Reset form
      setAmount('');
      setDescription('');
      setCategory('');
      setSubcategory('');
      setAccount('');
      setDate(new Date());
      setErrors({});
      setSelectedFundDestination(null);
      setShowFundDestinationPicker(false);
      setShowNoteInput(false);
      onClose();
    } catch (error) {
      console.error('Error creating transaction:', error);
      Alert.alert('Error', 'Failed to record income. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAccount = accounts.find((acc) => acc.id.toString() === account);
  const amountValue = parseFloat(amount) || 0;

  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return;
    }
    if (parts[1] && parts[1].length > 2) {
      return;
    }
    setAmount(cleaned);
  };

  // Reset subcategory when category changes
  useEffect(() => {
    setSubcategory('');
  }, [category]);

  // Initialize amount input state when modal opens
  useEffect(() => {
    if (visible && !amount) {
      setShowAmountInput(true);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Amount Display */}
          <TouchableOpacity
            style={styles.amountContainer}
            onPress={() => setShowAmountInput(true)}
            activeOpacity={0.7}
          >
            {showAmountInput ? (
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0.00"
                placeholderTextColor="#9AA88B"
                keyboardType="decimal-pad"
                autoFocus
                onSubmitEditing={() => {
                  if (amount.trim()) {
                    setShowAmountInput(false);
                  }
                }}
                onBlur={() => {
                  if (amount.trim()) {
                    setShowAmountInput(false);
                  }
                }}
              />
            ) : (
              <Text style={styles.amountText}>
                {amount ? formatCurrencyAmount(amountValue, currency) : formatCurrencyAmount(0, currency)}
              </Text>
            )}
          </TouchableOpacity>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Suggestions Section */}
            {frequentlyUsedCategories.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Suggestions</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                  {frequentlyUsedCategories.map((cat) => (
              <TouchableOpacity 
                      key={cat.id}
                      style={[styles.pillButton, category === cat.id && styles.pillButtonActive]}
                      onPress={() => setCategory(cat.id)}
                    >
                      <Ionicons
                        name={(cat.icon as any) || 'folder-outline'}
                        size={16}
                        color={category === cat.id ? '#4F6F3E' : '#6B7D5D'}
                      />
                      <Text style={[styles.pillText, category === cat.id && styles.pillTextActive]}>
                        {cat.name}
                </Text>
              </TouchableOpacity>
                  ))}
                </ScrollView>
            </View>
            )}

            {/* Categories Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Categories</Text>
                <TouchableOpacity onPress={() => {}}>
                  <Text style={styles.viewAllText}>View All →</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.pillButton, category === cat.id && styles.pillButtonActive]}
                    onPress={() => setCategory(cat.id)}
                  >
                    <Ionicons
                      name={(cat.icon as any) || 'folder-outline'}
                      size={16}
                      color={category === cat.id ? '#4F6F3E' : '#6B7D5D'}
                    />
                    <Text style={[styles.pillText, category === cat.id && styles.pillTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Sub-categories Section */}
            {availableSubcategories.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Sub-categories</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                  {availableSubcategories.map((subcat, index) => (
                  <TouchableOpacity
                      key={index}
                      style={[styles.pillButton, subcategory === subcat.name && styles.pillButtonActive]}
                      onPress={() => setSubcategory(subcategory === subcat.name ? '' : subcat.name)}
                  >
                      <Ionicons
                        name={subcat.icon as any}
                        size={16}
                        color={subcategory === subcat.name ? '#4F6F3E' : '#6B7D5D'}
                      />
                      <Text style={[styles.pillText, subcategory === subcat.name && styles.pillTextActive]}>
                        {subcat.name}
                      </Text>
                  </TouchableOpacity>
                ))}
                </ScrollView>
              </View>
            )}

            {/* Transaction Details */}
            <View style={styles.detailsSection}>
              {/* Date */}
              <TouchableOpacity style={styles.detailRow} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={20} color="#1F3A24" />
                <Text style={styles.detailText}>{formatDate(date)}</Text>
                <Ionicons name="chevron-forward" size={18} color="#9AA88B" />
              </TouchableOpacity>

              {/* Note */}
                  <TouchableOpacity
                style={styles.detailRow}
                onPress={() => setShowNoteInput(!showNoteInput)}
              >
                <Ionicons name="create-outline" size={20} color="#1F3A24" />
                {showNoteInput ? (
                  <TextInput
                    style={styles.noteInput}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g., Salary from company"
                    placeholderTextColor="#9AA88B"
                    autoFocus
                    onBlur={() => {
                      if (!description.trim()) {
                        setShowNoteInput(false);
                      }
                    }}
                  />
                ) : (
                  <Text style={[styles.detailText, !description && styles.detailTextPlaceholder]}>
                    {description || 'e.g., Salary from company'}
                    </Text>
                )}
                {!showNoteInput && <Ionicons name="chevron-forward" size={18} color="#9AA88B" />}
              </TouchableOpacity>

              {/* Account */}
              <TouchableOpacity 
                style={styles.detailRow}
                onPress={() => setShowAccountPicker(true)}
              >
                <Ionicons name="business-outline" size={20} color="#1F3A24" />
                <Text style={styles.detailText}>
                  {selectedAccount?.name || 'Select Account'}
                  </Text>
                <Ionicons name="chevron-forward" size={18} color="#9AA88B" />
              </TouchableOpacity>
              
              {/* Fund Destination - Show picker if account has other funds besides personal */}
              {account && accountHasFunds && accountHasOtherFunds && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => setShowFundDestinationPicker(true)}
                >
                  <Ionicons name="wallet-outline" size={20} color="#1F3A24" />
                  <Text style={styles.detailText}>
                    {selectedFundDestination?.name || 'Personal Funds'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#9AA88B" />
                </TouchableOpacity>
              )}
              {account && (!accountHasFunds || !accountHasOtherFunds) && (
                <View style={styles.detailRow}>
                  <Ionicons name="wallet-outline" size={20} color="#1F3A24" />
                  <Text style={styles.detailText}>Personal Funds</Text>
                </View>
              )}
            </View>

            {errors.account && <Text style={styles.errorText}>{errors.account}</Text>}
            {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, isLoading && styles.confirmButtonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              <Text style={styles.confirmButtonText}>{isLoading ? 'Processing...' : 'Confirm'}</Text>
            </TouchableOpacity>
                </View>
                
          {/* Date Picker */}
          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              onChange={onDateChange}
              maximumDate={new Date()}
            />
          )}
                </View>

        {/* Account Picker Modal */}
        <Modal
          visible={showAccountPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowAccountPicker(false)}
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Select Account</Text>
                <TouchableOpacity onPress={() => setShowAccountPicker(false)}>
                  <Ionicons name="close" size={24} color="#1F3A24" />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.pickerItem, account === acc.id.toString() && styles.pickerItemActive]}
                    onPress={() => {
                      setAccount(acc.id.toString());
                      setShowAccountPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>{acc.name}</Text>
                    {account === acc.id.toString() && (
                      <Ionicons name="checkmark" size={20} color="#4F6F3E" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      
      {/* Fund Destination Picker - Only show if account has funds and other funds besides personal */}
      {accountHasFunds && accountHasOtherFunds && (
        <FundPicker
          visible={showFundDestinationPicker}
          onClose={() => setShowFundDestinationPicker(false)}
          accountId={account}
          amount={amountValue}
          excludeGoalFunds={false} // Allow goal funds for income allocation
          allowGoalFunds={true} // Allow goal funds for income allocation
          excludeBorrowedFunds={true} // Exclude borrowed/liability funds (income cannot go to liability funds)
          onSelect={(bucket) => {
            // All fund types are allowed (borrowed funds are already excluded by excludeBorrowedFunds)
            setSelectedFundDestination(bucket);
            setShowFundDestinationPicker(false);
          }}
        />
      )}
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
  amountContainer: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
  },
  amountText: {
    fontSize: 48,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
  },
  amountInput: {
    fontSize: 48,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
    textAlign: 'center',
    minWidth: 200,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#637050',
    marginBottom: 12,
  },
  viewAllText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: '#4F6F3E',
  },
  pillScroll: {
    marginHorizontal: -4,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5ECD6',
    marginRight: 8,
  },
  pillButtonActive: {
    backgroundColor: '#F7F9F2',
    borderColor: '#4F6F3E',
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#6B7D5D',
  },
  pillTextActive: {
    color: '#4F6F3E',
    fontFamily: 'Poppins-SemiBold',
  },
  detailsSection: {
    marginTop: 8,
    gap: 1,
    backgroundColor: '#F7F9F2',
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  detailText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-Regular',
    color: '#1F3A24',
  },
  detailTextPlaceholder: {
    color: '#9AA88B',
  },
  noteInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-Regular',
    color: '#1F3A24',
    padding: 0,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5ECD6',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5ECD6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#4F6F3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#B83228',
    marginTop: 8,
    marginLeft: 16,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECD6',
  },
  pickerTitle: {
    fontSize: 18,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F9F2',
  },
  pickerItemActive: {
    backgroundColor: '#F7F9F2',
  },
  pickerItemText: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: '#1F3A24',
  },
});
