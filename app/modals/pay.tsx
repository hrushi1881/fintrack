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
import GlassCard from '@/components/GlassCard';
import { getParentCategories, getSubcategories } from '@/utils/categories';

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
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);
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
  }, [account, getFundsForAccount]);

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

  const loadParentCategories = async () => {
    if (!user) return;
    
    try {
      const parents = await getParentCategories(user.id, 'expense');
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
      // Determine which category ID to send to the RPC:
      // - If a subcategory is selected, use it
      // - Otherwise, use the parent category
      const selectedParent = parentCategories.find((cat) => cat.id === mainCategory);
      const selectedSub = subcategory
        ? subcategories.find((sub) => sub.id === subcategory)
        : null;
      const categoryId = subcategory || mainCategory || null;
      const categoryName = selectedSub?.name || selectedParent?.name || null;

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

      const { error } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user?.id,
        p_account_id: account,
        p_bucket: bucketParam,
        p_amount: amountValue,
        p_category: categoryId, // Database category ID (sub-category or parent)
        p_description: description.trim() || categoryName || 'Payment',
        p_date: date.toISOString().split('T')[0],
        p_currency: currency,
        p_metadata: {
          parent_category_id: mainCategory || null,
          parent_category_name: selectedParent?.name || null,
          subcategory_id: subcategory || null,
          subcategory_name: selectedSub?.name || null,
        },
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
      setMainCategory('');
      setSubcategory('');
      setAccount('');
      setDate(new Date());
      setSelectedFundBucket(null);
      setErrors({});
      setShowNoteInput(false);
      setShowAmountInput(true);
      setSubcategories([]);
      
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Pay</Text>
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

              {/* Fund Source */}
              {account && accountHasOtherFunds && (
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => setShowFundPicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="wallet-outline" size={20} color="#000000" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Fund Source</Text>
                    <Text style={styles.detailText}>
                      {selectedFundBucket?.name || 'Select Fund Source'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.3)" />
                </TouchableOpacity>
              )}
              {account && !accountHasOtherFunds && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="wallet-outline" size={20} color="#000000" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Fund Source</Text>
                    <Text style={styles.detailText}>Personal Funds</Text>
                  </View>
                </View>
              )}
            </GlassCard>

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
