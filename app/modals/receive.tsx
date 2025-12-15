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
import GlassCard from '@/components/GlassCard';
import { getParentCategories, getSubcategories } from '@/utils/categories';

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
  const {
    accounts: realtimeAccounts,
    globalRefresh,
    refreshAccounts,
    refreshTransactions,
    refreshAccountFunds,
    getFundsForAccount,
    accountFunds,
  } = useRealtimeData();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [mainCategory, setMainCategory] = useState<string>(''); // Parent category ID from database
  const [subcategory, setSubcategory] = useState<string>(''); // Subcategory ID from database
  const [account, setAccount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [parentCategories, setParentCategories] = useState<any[]>([]); // Main categories from database
  const [subcategories, setSubcategories] = useState<any[]>([]); // Subcategories for selected parent
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [selectedFundDestination, setSelectedFundDestination] = useState<FundBucket | null>(null);
  const [showFundDestinationPicker, setShowFundDestinationPicker] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showAmountInput, setShowAmountInput] = useState(false);


  // Fetch subcategories when a parent category is selected
  useEffect(() => {
    if (mainCategory && user) {
      loadSubcategories(mainCategory);
    } else {
      setSubcategories([]);
      setSubcategory('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainCategory, user]);

  // Fetch parent categories when modal opens
  useEffect(() => {
    if (visible && user) {
      loadParentCategories();
    }
  }, [visible, user]);

  // Fetch user accounts
  useEffect(() => {
    if (visible && user) {
      fetchAccounts();
    }
  }, [visible, user]);

  // Sync local accounts with realtime accounts
  useEffect(() => {
    if (realtimeAccounts && realtimeAccounts.length > 0) {
      setAccounts(realtimeAccounts);
    }
  }, [realtimeAccounts]);

  // Refresh account funds when modal opens to ensure funds are loaded
  useEffect(() => {
    if (visible) {
      refreshAccountFunds();
    }
  }, [visible, refreshAccountFunds]);

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
  }, [account, getFundsForAccount]);

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
  }, [account, getFundsForAccount]);

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

  const loadParentCategories = async () => {
    if (!user) return;
    
    try {
      const parents = await getParentCategories(user.id, 'income');
      setParentCategories(parents);
    } catch (error) {
      console.error('Error loading parent categories:', error);
      setParentCategories([]);
    }
  };

  const loadSubcategories = async (parentCategoryId: string) => {
    if (!user) return;
    
    try {
      const subs = await getSubcategories(user.id, parentCategoryId);
      setSubcategories(subs);
    } catch (error) {
      console.error('Error loading subcategories:', error);
      setSubcategories([]);
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

    if (!mainCategory) {
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
      
      if (!user || !mainCategory) {
        throw new Error('Please select a category');
      }

      // Get the selected parent category
      const selectedParent = parentCategories.find(cat => cat.id === mainCategory);
      if (!selectedParent) {
        throw new Error('Selected category not found');
      }

      // Determine which category to use
      let categoryId: string;
      let categoryName: string;

      if (subcategory) {
        // User selected a subcategory - use it
        const selectedSub = subcategories.find(sub => sub.id === subcategory);
        if (!selectedSub) {
          throw new Error('Selected subcategory not found');
        }
        categoryId = selectedSub.id;
        categoryName = selectedSub.name;
      } else {
        // User selected only parent category - use parent directly
        categoryId = selectedParent.id;
        categoryName = selectedParent.name;
      }
      
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
      
      const accountName = accountBefore?.name || 'Account';

      const { error } = await supabase.rpc('receive_to_account_bucket', {
        p_user_id: user?.id,
        p_account_id: account,
        p_bucket_type: bucketType,
        p_bucket_id: bucketId,
        p_amount: amountValue,
        p_category: categoryId, // Database category ID
        p_description: description.trim() || categoryName || 'Income received',
        p_date: date.toISOString().split('T')[0],
        p_currency: currency,
        p_metadata: {
          parent_category_id: mainCategory,
          parent_category_name: selectedParent.name,
          subcategory_id: subcategory || null,
          subcategory_name: subcategory ? subcategories.find(s => s.id === subcategory)?.name : null,
        },
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
      
      // Reset form but keep modal open
      setAmount('');
      setDescription('');
      setMainCategory('');
      setSubcategory('');
      setAccount('');
      setDate(new Date());
      setSubcategories([]);
      setErrors({});
      setSelectedFundDestination(null);
      setShowFundDestinationPicker(false);
      setShowNoteInput(false);
      setShowAmountInput(true);
      
      // Modal stays open - user can add another transaction
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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Receive</Text>
            <View style={styles.headerPlaceholder} />
          </View>

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
                placeholderTextColor="rgba(0, 0, 0, 0.3)"
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
            {/* Categories & Subcategories Section */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Select Category</Text>

              {/* Parent Categories Grid */}
              <View style={styles.categoryGrid}>
                {parentCategories.map((parentCat) => {
                  const isSelected = mainCategory === parentCat.id;
                  const hasSubcategories = subcategories.length > 0 && isSelected;
                  const isFullySelected = isSelected && (!hasSubcategories || subcategory);
                  
                  return (
                    <View key={parentCat.id} style={styles.categoryItemContainer}>
                      {/* Parent Category Button */}
                      <TouchableOpacity
                        style={[
                          styles.categoryCard,
                          isSelected && styles.categoryCardSelected,
                          isFullySelected && styles.categoryCardActive,
                        ]}
                        onPress={() => {
                          setMainCategory(parentCat.id);
                          setSubcategory(''); // Reset subcategory when changing parent category
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[
                          styles.categoryIconContainer, 
                          isFullySelected && styles.categoryIconContainerActive
                        ]}>
                          <Ionicons
                            name={(parentCat.icon as any) || 'folder-outline'}
                            size={20}
                            color={
                              isFullySelected 
                                ? '#FFFFFF' 
                                : isSelected
                                ? parentCat.color
                                : parentCat.color
                            }
                          />
                        </View>
                        <Text style={[
                          styles.categoryName, 
                          isFullySelected && styles.categoryNameActive
                        ]}>
                          {parentCat.name}
                        </Text>
                        {isFullySelected && (
                          <View style={styles.selectedIndicator}>
                            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                          </View>
                        )}
                        {isSelected && hasSubcategories && !subcategory && (
                          <View style={styles.selectedIndicator}>
                            <Ionicons name="chevron-down" size={16} color="rgba(0, 0, 0, 0.5)" />
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Subcategories (shown when parent category is selected) */}
                      {hasSubcategories && (
                        <View style={styles.subcategoryContainer}>
                          <View style={styles.subcategoryHeader}>
                            <View style={styles.subcategoryConnector} />
                            <Text style={styles.subcategoryLabel}>Select Subcategory (Optional)</Text>
                          </View>
                          <View style={styles.subcategoryGrid}>
                            {/* Option: Use parent category directly */}
                            <TouchableOpacity
                              style={[
                                styles.subcategoryCard,
                                !subcategory && styles.subcategoryCardActive
                              ]}
                              onPress={() => setSubcategory('')}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name="remove-outline"
                                size={14}
                                color={!subcategory ? '#FFFFFF' : 'rgba(0, 0, 0, 0.5)'}
                                style={styles.subcategoryIcon}
                              />
                              <Text style={[
                                styles.subcategoryName,
                                !subcategory && styles.subcategoryNameActive
                              ]}>
                                {parentCat.name}
                              </Text>
                              {!subcategory && (
                                <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                              )}
                            </TouchableOpacity>
                            
                            {/* Subcategory options */}
                            {subcategories.map((subcat) => {
                              const isSubSelected = subcategory === subcat.id;
                              return (
                                <TouchableOpacity
                                  key={subcat.id}
                                  style={[
                                    styles.subcategoryCard,
                                    isSubSelected && styles.subcategoryCardActive
                                  ]}
                                  onPress={() => setSubcategory(isSubSelected ? '' : subcat.id)}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons
                                    name={(subcat.icon as any) || 'ellipse-outline'}
                                    size={14}
                                    color={isSubSelected ? '#FFFFFF' : 'rgba(0, 0, 0, 0.5)'}
                                    style={styles.subcategoryIcon}
                                  />
                                  <Text style={[
                                    styles.subcategoryName,
                                    isSubSelected && styles.subcategoryNameActive
                                  ]}>
                                    {subcat.name}
                                  </Text>
                                  {isSubSelected && (
                                    <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Transaction Details */}
            <GlassCard padding={0} marginVertical={12} borderRadius={24}>
              {/* Date */}
              <TouchableOpacity 
                style={[styles.detailRow, styles.detailRowFirst]} 
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.detailIconContainer}>
                  <Ionicons name="calendar-outline" size={20} color="#000000" />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailText}>{formatDate(date)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.3)" />
              </TouchableOpacity>

              {/* Note */}
              <TouchableOpacity
                style={styles.detailRow}
                onPress={() => setShowNoteInput(!showNoteInput)}
                activeOpacity={0.7}
              >
                <View style={styles.detailIconContainer}>
                  <Ionicons name="create-outline" size={20} color="#000000" />
                </View>
                <View style={styles.detailContent}>
                  {showNoteInput ? (
                    <TextInput
                      style={styles.noteInput}
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Add a note..."
                      placeholderTextColor="rgba(0, 0, 0, 0.4)"
                      autoFocus
                      onBlur={() => {
                        if (!description.trim()) {
                          setShowNoteInput(false);
                        }
                      }}
                    />
                  ) : (
                    <>
                      <Text style={styles.detailLabel}>Note</Text>
                      <Text style={[styles.detailText, !description && styles.detailTextPlaceholder]}>
                        {description || 'Add a note...'}
                      </Text>
                    </>
                  )}
                </View>
                {!showNoteInput && <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.3)" />}
              </TouchableOpacity>

              {/* Account */}
              <TouchableOpacity 
                style={styles.detailRow}
                onPress={() => setShowAccountPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.detailIconContainer}>
                  <Ionicons name="business-outline" size={20} color="#000000" />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Account</Text>
                  <Text style={styles.detailText}>
                    {selectedAccount?.name || 'Select Account'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.3)" />
              </TouchableOpacity>
              
              {/* Fund Destination */}
              {account && accountHasFunds && accountHasOtherFunds && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => setShowFundDestinationPicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="wallet-outline" size={20} color="#000000" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Fund Destination</Text>
                    <Text style={styles.detailText}>
                      {selectedFundDestination?.name || 'Personal Funds'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.3)" />
                </TouchableOpacity>
              )}
              {account && (!accountHasFunds || !accountHasOtherFunds) && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="wallet-outline" size={20} color="#000000" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Fund Destination</Text>
                    <Text style={styles.detailText}>Personal Funds</Text>
                  </View>
                </View>
              )}
            </GlassCard>

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
                      <Ionicons name="checkmark" size={20} color="#000000" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      
      {/* Fund Destination Picker - Only show if account has funds and other funds besides personal */}
      {/* NOTE: Goal funds are EXCLUDED - income can only go to Personal Funds */}
      {accountHasFunds && accountHasOtherFunds && (
        <FundPicker
          visible={showFundDestinationPicker}
          onClose={() => setShowFundDestinationPicker(false)}
          accountId={account}
          amount={amountValue}
          excludeGoalFunds={true} // Goal funds cannot receive income - only Personal Funds can
          allowGoalFunds={false}
          excludeBorrowedFunds={true} // Exclude borrowed/liability funds (income cannot go to liability funds)
          onSelect={(bucket) => {
            // Only Personal, Reserved, and Sinking funds can receive income
            // Goal and Borrowed funds are excluded
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Archivo Black',
    color: '#000000',
    letterSpacing: 0.5,
  },
  headerPlaceholder: {
    width: 40,
  },
  amountContainer: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  amountText: {
    fontSize: 56,
    fontFamily: 'InstrumentSans-ExtraBold',
    color: '#000000',
    letterSpacing: -1,
  },
  amountInput: {
    fontSize: 56,
    fontFamily: 'InstrumentSans-ExtraBold',
    color: '#000000',
    textAlign: 'center',
    minWidth: 200,
    letterSpacing: -1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
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
    color: 'rgba(0, 0, 0, 0.6)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  viewAllText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryItemContainer: {
    width: '48%',
    marginBottom: 12,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    gap: 10,
    minHeight: 56,
  },
  categoryCardSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'rgba(0, 0, 0, 0.2)',
  },
  categoryCardActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  categoryIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconContainerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  categoryName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  categoryNameActive: {
    color: '#FFFFFF',
  },
  selectedIndicator: {
    marginLeft: 4,
  },
  subcategoryContainer: {
    marginTop: 8,
    marginLeft: 12,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0, 0, 0, 0.1)',
  },
  subcategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  subcategoryConnector: {
    width: 8,
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    marginRight: 8,
  },
  subcategoryLabel: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(0, 0, 0, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subcategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  subcategoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    gap: 6,
    marginBottom: 6,
  },
  subcategoryCardActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  subcategoryIcon: {
    marginRight: 2,
  },
  subcategoryName: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  subcategoryNameActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  detailRowFirst: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  detailIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  detailTextPlaceholder: {
    color: 'rgba(0, 0, 0, 0.4)',
  },
  noteInput: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    padding: 0,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.4,
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
    marginLeft: 20,
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
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  pickerTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    color: '#000000',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  pickerItemActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  pickerItemText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
});
