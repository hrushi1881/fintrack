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
import InlineAccountSelector from '@/components/InlineAccountSelector';

interface PayModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedAccountId?: string;
}

// Subcategory mappings (simplified - will be replaced with database structure later)
const SUBCATEGORY_MAP: Record<string, Array<{ name: string; icon: string }>> = {
  Food: [
    { name: 'Dining', icon: 'restaurant' },
    { name: 'Lunch', icon: 'fast-food' },
    { name: 'Drinks', icon: 'wine' },
    { name: 'Groceries', icon: 'basket' },
    { name: 'Coffee', icon: 'cafe' },
  ],
  Transport: [
    { name: 'Taxi', icon: 'car' },
    { name: 'Public Transport', icon: 'bus' },
    { name: 'Fuel', icon: 'car-sport' },
    { name: 'Parking', icon: 'parking' },
  ],
  Bills: [
    { name: 'Electricity', icon: 'flash' },
    { name: 'Water', icon: 'water' },
    { name: 'Internet', icon: 'wifi' },
    { name: 'Phone', icon: 'call' },
  ],
  Shopping: [
    { name: 'Clothing', icon: 'shirt' },
    { name: 'Electronics', icon: 'phone-portrait' },
    { name: 'Home', icon: 'home' },
  ],
  Entertainment: [
    { name: 'Movies', icon: 'film' },
    { name: 'Music', icon: 'musical-notes' },
    { name: 'Games', icon: 'game-controller' },
  ],
  Health: [
    { name: 'Medicine', icon: 'medical' },
    { name: 'Doctor', icon: 'person' },
    { name: 'Gym', icon: 'fitness' },
  ],
};

export default function PayModal({ visible, onClose, onSuccess, preselectedAccountId }: PayModalProps) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { currency } = useSettings();
  const {
    accounts: realtimeAccounts,
    accountFunds,
    getFundsForAccount,
    globalRefresh,
    refreshAccounts,
    refreshTransactions,
    refreshAccountFunds,
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
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);
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
    return SUBCATEGORY_MAP[selectedCategory.name] || [];
  }, [category, categories]);

  // Fetch user accounts
  useEffect(() => {
    if (visible && user) {
      fetchAccounts();
      fetchCategories();
      // Also refresh accounts and account funds from realtime data
      refreshAccounts();
      refreshAccountFunds();
    }
  }, [visible, user, refreshAccounts, refreshAccountFunds]);

  // Sync local accounts with realtime accounts (use realtimeAccounts as primary source)
  useEffect(() => {
    if (realtimeAccounts && realtimeAccounts.length > 0) {
      setAccounts(realtimeAccounts);
    } else if (realtimeAccounts && realtimeAccounts.length === 0 && accounts.length === 0) {
      // If realtimeAccounts is empty, keep trying to fetch
      fetchAccounts();
    }
  }, [realtimeAccounts]);

  // Set preselected account and auto-select first account if none selected
  useEffect(() => {
    if (visible) {
      const availableAccounts = (realtimeAccounts || accounts || []).filter((acc) => 
        acc.type !== 'goals_savings' && 
        acc.type !== 'liability' &&
        (acc.is_active === true || acc.is_active === undefined || acc.is_active === null)
      );
      
      if (preselectedAccountId && availableAccounts.some(acc => acc.id === preselectedAccountId)) {
      setAccount(preselectedAccountId);
        setSelectedFundBucket(null);
      } else if (availableAccounts.length > 0 && !account) {
        // Auto-select first available account if none preselected
        setAccount(availableAccounts[0].id);
      }
    }
  }, [visible, preselectedAccountId, realtimeAccounts, accounts, account]);

  // Check if account has any funds in account_funds table
  // If account has funds, show picker; otherwise default to personal fund (will be created by RPC if needed)
  const accountHasFunds = useMemo(() => {
    if (!account) return false;
    const funds = getFundsForAccount(account, { includeLocked: true });
    // Check if account has ANY funds (borrowed, goal, reserved, sinking) - personal is calculated, not stored
    return funds.length > 0;
  }, [account, getFundsForAccount, accountFunds]);

  // Check if account has any non-personal funds (for showing fund picker)
  // Personal funds are always available (calculated), so we check for borrowed/liability funds
  const accountHasOtherFunds = useMemo(() => {
    if (!account) return false;
    const funds = getFundsForAccount(account, { includeLocked: true });
    // Check if account has any borrowed/liability funds with balance > 0 (for payments)
    // Goal funds are excluded from payments, so we only check for borrowed funds
    return funds.some(
      (fund) =>
        (fund.fund_type === 'borrowed' || fund.fund_type === 'liability') &&
        (typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0) > 0
    );
  }, [account, getFundsForAccount, accountFunds]);

  // Handle fund selection when account changes
  useEffect(() => {
    if (!account) {
      setSelectedFundBucket(null);
      setShowFundPicker(false);
      return;
    }

    // Always default to Personal Funds when account changes
    // User can change it via the fund picker if other funds exist
    const personalFund = {
      type: 'personal' as const,
      id: 'personal',
      name: 'Personal Funds',
      amount: 0,
      spendable: true,
    };
    
    setSelectedFundBucket(personalFund);
    setShowFundPicker(false);
  }, [account, accountHasFunds, accountHasOtherFunds]);


  // Initialize amount input state when modal opens
  useEffect(() => {
    if (visible && !amount) {
      setShowAmountInput(true);
    }
  }, [visible]);

  // Reset fund bucket when account changes
  useEffect(() => {
    if (account && selectedFundBucket) {
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

    // Only require fund selection if account has other funds besides personal
    // Otherwise, default to personal fund (already set)
    if (!selectedFundBucket) {
      if (accountHasFunds && accountHasOtherFunds) {
        // Account has funds and other funds exist: require selection
        newErrors.fundBucket = 'Please select a fund source';
      } else {
        // No funds or only personal funds: default to personal fund
        setSelectedFundBucket({
          type: 'personal',
          id: 'personal',
          name: 'Personal Funds',
          amount: 0,
          spendable: true,
        });
      }
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
      const categoryName = selectedCategory?.name || null;
      const categoryId = selectedCategory?.id || null;

      // Always default to Personal Funds if no fund bucket is selected
      // This should rarely happen since we auto-select Personal Funds when account changes
      let fundBucket = selectedFundBucket;
      if (!fundBucket) {
        fundBucket = {
          type: 'personal',
          id: 'personal',
          name: 'Personal Funds',
          amount: 0,
          spendable: true,
        };
      }

      const bucketParam = {
        type: fundBucket.type === 'borrowed' ? 'liability' : fundBucket.type,
        id: fundBucket.type !== 'personal' ? fundBucket.id : null,
      };

      const selectedAccountObj = accounts.find((acc) => acc.id.toString() === account);
      const accountName = selectedAccountObj?.name || 'Account';

      const { data: rpcData, error } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user?.id,
        p_account_id: account,
        p_bucket: bucketParam,
        p_amount: amountValue,
        p_category: categoryId || categoryName, // Pass UUID if available, fallback to name
        p_description: description.trim() || categoryName || 'Payment',
        p_date: date.toISOString().split('T')[0],
        p_currency: currency,
      });

      if (error) {
        console.error('❌ RPC Error:', error);
        Alert.alert('Error', error.message || 'Failed to record payment. Please try again.');
        throw error;
      }

      console.log('✅ Payment RPC successful, refreshing data...');
      
      // Wait for database commit - increased delay for reliability
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh all data in parallel for faster updates
      await Promise.all([
        refreshAccounts(),
        refreshAccountFunds(),
        refreshTransactions(),
      ]);
      
      console.log('✅ Data refreshed after payment');

      const displayCategoryName = categoryName || 'Uncategorized';
      let descriptionText = displayCategoryName;
      if (subcategory) {
        descriptionText += ` - ${subcategory}`;
      }
      if (fundBucket.type === 'borrowed') {
        descriptionText += ` (from ${fundBucket.name})`;
      } else if (fundBucket.type === 'goal') {
        descriptionText += ` (from ${fundBucket.name})`;
      }

      showNotification({
        type: 'success',
        title: 'Paid',
        amount: amountValue,
        currency: currency,
        description: descriptionText,
        account: accountName,
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      });

      // Final global refresh to sync everything
      await globalRefresh();
      onSuccess?.();
      
      // Reset form but keep modal open
      setAmount('');
      setDescription('');
      setCategory('');
      setSubcategory('');
      setAccount('');
      setDate(new Date());
      setSelectedFundBucket(null);
      setErrors({});
      setShowNoteInput(false);
      setShowAmountInput(true);
      
      // Modal stays open - user can add another transaction
    } catch (error) {
      console.error('Error creating transaction:', error);
      Alert.alert('Error', 'Failed to record payment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAccount = accounts.find((acc) => acc.id.toString() === account);
  const amountValue = parseFloat(amount) || 0;
  const selectedCategoryObj = categories.find((cat) => cat.id === category);

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
    // Remove any non-numeric characters except decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    // Allow only one decimal point
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return;
    }
    // Limit decimal places to 2
    if (parts[1] && parts[1].length > 2) {
      return;
    }
    setAmount(cleaned);
  };

  // Reset subcategory when category changes
  useEffect(() => {
    setSubcategory('');
  }, [category]);

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

            {/* Account Selection */}
            <InlineAccountSelector
              accounts={(realtimeAccounts && realtimeAccounts.length > 0 ? realtimeAccounts : accounts || []).filter((acc) => 
                acc.type !== 'goals_savings' && 
                acc.type !== 'liability' &&
                (acc.is_active === true || acc.is_active === undefined || acc.is_active === null)
              )}
              selectedAccountId={account}
              onSelect={(acc) => setAccount(acc.id)}
              label="Pay From Account"
              showBalance={true}
            />

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
                    placeholder="e.g., Lunch with team"
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
                    {description || 'e.g., Lunch with team'}
                        </Text>
                )}
                {!showNoteInput && <Ionicons name="chevron-forward" size={18} color="#9AA88B" />}
                  </TouchableOpacity>

              {/* Fund Source - Always show picker if account has other funds (borrowed/liability) */}
              {account && accountHasOtherFunds && (
                  <TouchableOpacity
                  style={styles.detailRow}
                    onPress={() => setShowFundPicker(true)}
                  >
                  <Ionicons name="wallet-outline" size={20} color="#1F3A24" />
                  <Text style={styles.detailText}>
                    {selectedFundBucket?.name || 'Select Fund Source'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#9AA88B" />
                  </TouchableOpacity>
                )}
              {/* Show static "Personal Funds" only if no other funds exist */}
              {account && !accountHasOtherFunds && (
                <View style={styles.detailRow}>
                  <Ionicons name="wallet-outline" size={20} color="#1F3A24" />
                  <Text style={styles.detailText}>Personal Funds</Text>
              </View>
            )}
            </View>

            {errors.account && <Text style={styles.errorText}>{errors.account}</Text>}
            {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}
            {errors.fundBucket && <Text style={styles.errorText}>{errors.fundBucket}</Text>}
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


        {/* Fund Picker Modal - Show if account has other funds (borrowed/liability) */}
        {account && accountHasOtherFunds && (
      <FundPicker
        visible={showFundPicker}
        onClose={() => setShowFundPicker(false)}
        accountId={account}
            amount={amountValue}
            excludeGoalFunds={true} // Goal funds cannot be used for payments
            allowGoalFunds={false}
            excludeBorrowedFunds={false} // Allow borrowed funds for payments
        onSelect={(bucket) => {
          setSelectedFundBucket(bucket);
          setShowFundPicker(false);
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
