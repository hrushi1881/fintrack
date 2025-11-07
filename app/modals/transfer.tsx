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

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedAccountId?: string;
}

type TransferType = 'between_accounts' | 'liability_to_personal';

export default function TransferModal({ visible, onClose, onSuccess, preselectedAccountId }: TransferModalProps) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { currency } = useSettings();
  const { globalRefresh, refreshAccounts } = useRealtimeData();
  const { convertLiabilityToPersonal } = useLiabilities();
  
  const [transferType, setTransferType] = useState<TransferType>('between_accounts');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  // Fund selection state
  const [fromFundBucket, setFromFundBucket] = useState<FundBucket | null>(null);
  const [showFromFundPicker, setShowFromFundPicker] = useState(false);
  
  // Conversion-specific state
  const [conversionStep, setConversionStep] = useState<'account' | 'details' | 'confirm'>('account');
  const [selectedConversionAccount, setSelectedConversionAccount] = useState<string | null>(null);
  const [selectedConversionFundBucket, setSelectedConversionFundBucket] = useState<FundBucket | null>(null);
  const [showConversionFundPicker, setShowConversionFundPicker] = useState(false);
  const [conversionAmount, setConversionAmount] = useState('');
  const [conversionNotes, setConversionNotes] = useState('');
  

  // Fetch user accounts
  useEffect(() => {
    if (visible && user) {
      fetchAccounts();
    }
  }, [visible, user]);

  // Set preselected account when modal opens
  useEffect(() => {
    if (visible && preselectedAccountId && transferType === 'between_accounts') {
      setFromAccount(preselectedAccountId);
    }
  }, [visible, preselectedAccountId, transferType]);

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

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (transferType === 'between_accounts') {
      if (!amount.trim()) {
        newErrors.amount = 'Amount is required';
      } else if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        newErrors.amount = 'Please enter a valid amount';
      }

      if (!fromAccount) {
        newErrors.fromAccount = 'Please select source account';
      }
      if (fromAccount && !fromFundBucket) {
        newErrors.fromFundBucket = 'Please select fund source';
      }
      if (!toAccount) {
        newErrors.toAccount = 'Please select destination account';
      }
      if (fromAccount === toAccount) {
        newErrors.toAccount = 'Source and destination accounts must be different';
      }

      if (!description.trim()) {
        newErrors.description = 'Description is required';
      }
    } else {
      // Conversion validation
      if (conversionStep === 'details') {
        if (!conversionAmount.trim()) {
          newErrors.conversionAmount = 'Amount is required';
        } else {
          const amt = parseFloat(conversionAmount);
          if (isNaN(amt) || amt <= 0) {
            newErrors.conversionAmount = 'Please enter a valid amount';
          } else if (selectedConversionFundBucket && selectedConversionFundBucket.type === 'liability') {
            // Validation will be handled by FundPicker showing available amounts
            // Additional validation can be added here if needed
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (transferType === 'between_accounts') {
        // Regular transfer
        const amountValue = parseFloat(amount);
        
        if (!fromFundBucket) {
          throw new Error('No fund source selected');
        }

        // If transferring from a specific fund bucket, use spend_from_account_bucket
        // Then add the amount to the destination account as personal funds
        if (fromFundBucket.type !== 'personal') {
          // Spend from the fund bucket first
          const bucketParam = {
            type: fromFundBucket.type,
            id: fromFundBucket.type !== 'personal' ? fromFundBucket.id : null,
          };

          // Spend from bucket
          const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
            p_user_id: user?.id,
            p_account_id: fromAccount,
            p_bucket: bucketParam,
            p_amount: amountValue,
            p_category: null, // Transfer doesn't need a category
            p_description: description.trim(),
            p_date: date.toISOString().split('T')[0],
            p_currency: currency
          });

          if (spendError) throw spendError;

          // Add to destination account as personal funds using receive_to_account_bucket
          const { error: addError } = await supabase.rpc('receive_to_account_bucket', {
            p_user_id: user?.id,
            p_account_id: toAccount,
            p_bucket_type: 'personal',
            p_bucket_id: null,
            p_amount: amountValue,
            p_category: 'Transfer', // Category name for transfer
            p_description: description.trim() || `Transfer from ${accounts.find(acc => acc.id === fromAccount)?.name || 'account'}`,
            p_date: date.toISOString().split('T')[0],
            p_notes: `Transfer from ${accounts.find(acc => acc.id === fromAccount)?.name || 'account'}`,
            p_currency: currency
          });

          if (addError) throw addError;
        } else {
          // Regular personal fund transfer - use spend and receive RPCs for proper balance updates
          // Spend from source account
          const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
            p_user_id: user?.id,
            p_account_id: fromAccount,
            p_bucket: { type: 'personal', id: null },
            p_amount: amountValue,
            p_category: null, // Transfer doesn't need category
            p_description: description.trim() || `Transfer to ${accounts.find(acc => acc.id === toAccount)?.name || 'account'}`,
            p_date: date.toISOString().split('T')[0],
            p_currency: currency
          });
          if (spendError) throw spendError;

          // Receive into destination account
          const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
            p_user_id: user?.id,
            p_account_id: toAccount,
            p_bucket_type: 'personal',
            p_bucket_id: null,
            p_amount: amountValue,
            p_category: 'Transfer',
            p_description: description.trim() || `Transfer from ${accounts.find(acc => acc.id === fromAccount)?.name || 'account'}`,
            p_date: date.toISOString().split('T')[0],
            p_notes: `Transfer from ${accounts.find(acc => acc.id === fromAccount)?.name || 'account'}`,
            p_currency: currency
          });
          if (receiveError) throw receiveError;
        }

        // Force immediate account refresh to get updated balances
        await refreshAccounts();
        
        // Small delay to ensure database has committed and state has updated
        await new Promise(resolve => setTimeout(resolve, 200));

        // Fetch fresh account data directly from DB for notifications
        const { data: fromAccountData } = await supabase
          .from('accounts')
          .select('name')
          .eq('id', fromAccount)
          .single();
        const { data: toAccountData } = await supabase
          .from('accounts')
          .select('name')
          .eq('id', toAccount)
          .single();
        
        const fromAccountName = fromAccountData?.name || 'Account';
        const toAccountName = toAccountData?.name || 'Account';

        showNotification({
          type: 'success',
          title: 'Transferred',
          amount: amountValue,
          currency: currency,
          description: 'Transfer',
          account: `${fromAccountName} → ${toAccountName}`,
          date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
      } else {
        // Conversion flow
        if (conversionStep === 'details') {
          // Proceed to confirmation
          setConversionStep('confirm');
          setIsLoading(false);
          return;
        } else if (conversionStep === 'confirm') {
          // Execute conversion
          if (!selectedConversionAccount || !selectedConversionFundBucket || !conversionAmount) {
            throw new Error('Missing conversion details');
          }

          if (selectedConversionFundBucket.type !== 'liability') {
            throw new Error('Can only convert liability funds to personal');
          }

          const amountValue = parseFloat(conversionAmount);
          await convertLiabilityToPersonal(
            selectedConversionAccount,
            selectedConversionFundBucket.id,
            amountValue,
            conversionNotes || undefined
          );

          showNotification({
            type: 'success',
            title: 'Converted',
            amount: amountValue,
            currency: currency,
            description: 'Liability → Personal Funds',
          });
        }
      }

      // Global refresh to update all data
      await globalRefresh();

      onSuccess?.();
      
      // Reset form
      setAmount('');
      setDescription('');
      setFromAccount('');
      setToAccount('');
      setFromFundBucket(null);
      setDate(new Date());
      setErrors({});
      setTransferType('between_accounts');
      setConversionStep('account');
      setSelectedConversionAccount(null);
      setSelectedConversionFundBucket(null);
      setConversionAmount('');
      setConversionNotes('');
      
      onClose();

    } catch (error: any) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'Failed to complete operation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConversionContinue = async () => {
    if (conversionStep === 'account' && selectedConversionAccount) {
      // Show FundPicker to select liability fund
      setShowConversionFundPicker(true);
    } else if (conversionStep === 'details') {
      if (validateForm()) {
        setConversionStep('confirm');
      }
    }
  };

  // Handle fund bucket selection from FundPicker for conversion
  useEffect(() => {
    if (selectedConversionFundBucket && selectedConversionFundBucket.type === 'liability' && conversionStep === 'account') {
      setConversionStep('details');
    }
  }, [selectedConversionFundBucket]);

  const fromAccountData = accounts.find(acc => acc.id === fromAccount);
  const toAccountData = accounts.find(acc => acc.id === toAccount);
  const amountValue = parseFloat(amount) || 0;

  // Calculate balances
  const fromBeforeBalance = fromAccountData?.balance || 0;
  const fromAfterBalance = fromBeforeBalance - amountValue;
  const toBeforeBalance = toAccountData?.balance || 0;
  const toAfterBalance = toBeforeBalance + amountValue;

  // Filter accounts for "To Account" (exclude selected "From Account")
  const availableToAccounts = accounts.filter(acc => acc.id !== fromAccount);

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
              <Text style={styles.headerTitle}>
                {transferType === 'liability_to_personal' ? 'Convert to Personal Funds' : 'Transfer Money'}
              </Text>
              <TouchableOpacity 
                style={[styles.saveButton, isLoading && styles.disabledButton]}
                onPress={transferType === 'liability_to_personal' && conversionStep !== 'confirm' ? handleConversionContinue : handleSubmit}
                disabled={isLoading}
              >
                <Text style={styles.saveText}>
                  {isLoading ? 'Processing...' : 
                   transferType === 'liability_to_personal' && conversionStep !== 'confirm' ? 'Continue' :
                   transferType === 'liability_to_personal' && conversionStep === 'confirm' ? 'Convert' :
                   'Transfer'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Transfer Type Selection (only show if not in conversion flow) */}
            {transferType === 'between_accounts' && (
              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>Transfer Type</Text>
                <View style={styles.transferTypeToggle}>
                  <TouchableOpacity
                    style={[
                      styles.transferTypeButton,
                      transferType === 'between_accounts' && styles.selectedTransferType
                    ]}
                    onPress={() => setTransferType('between_accounts')}
                  >
                    <Ionicons name="swap-horizontal" size={24} color={transferType === 'between_accounts' ? 'white' : 'rgba(255,255,255,0.7)'} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.transferTypeText, transferType === 'between_accounts' && styles.selectedTransferTypeText]}>
                        Between Accounts
                      </Text>
                      <Text style={[styles.transferTypeSubtext, transferType === 'between_accounts' && styles.selectedTransferTypeSubtext]}>
                        Move money from one account to another
                      </Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.transferTypeButton,
                      transferType === 'liability_to_personal' && styles.selectedTransferType
                    ]}
                    onPress={() => {
                      setTransferType('liability_to_personal');
                      setConversionStep('account');
                      loadLiabilityAccounts();
                    }}
                  >
                    <Ionicons name="arrow-forward-circle" size={24} color={transferType === 'liability_to_personal' ? 'white' : 'rgba(255,255,255,0.7)'} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.transferTypeText, transferType === 'liability_to_personal' && styles.selectedTransferTypeText]}>
                        Liability → Personal Funds
                      </Text>
                      <Text style={[styles.transferTypeSubtext, transferType === 'liability_to_personal' && styles.selectedTransferTypeSubtext]}>
                        Convert borrowed money to personal (doesn't reduce loan debt)
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Conversion Flow UI */}
            {transferType === 'liability_to_personal' && (
              <>
                {/* Step 1: Select Account */}
                {conversionStep === 'account' && (
                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Which account has liability funds?</Text>
                    <View style={styles.accountList}>
                      {accounts.map((acc) => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[
                            styles.accountButton,
                            selectedConversionAccount === acc.id && styles.selectedAccount
                          ]}
                          onPress={async () => {
                            setSelectedConversionAccount(acc.id);
                            const breakdown = await getAccountBreakdown(acc.id);
                            setAccountBreakdown(breakdown);
                          }}
                        >
                          <View style={styles.accountInfo}>
                            <Text style={[styles.accountName, selectedConversionAccount === acc.id && styles.selectedAccountText]}>
                              {acc.name}
                            </Text>
                            <Text style={[styles.accountBalance, selectedConversionAccount === acc.id && styles.selectedAccountText]}>
                              {formatCurrencyAmount(acc.balance, currency)}
                            </Text>
                          </View>
                          {selectedConversionAccount === acc.id && (
                            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Step 2: Conversion Details */}
                {conversionStep === 'details' && selectedConversionAccount && selectedConversionFundBucket && selectedConversionFundBucket.type === 'liability' && (
                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>How much to convert?</Text>
                    <View style={styles.amountInput}>
                      <Text style={styles.currencySymbol}>{currency === 'USD' ? '$' : '₹'}</Text>
                      <TextInput
                        style={[styles.amountTextInput, errors.conversionAmount && styles.errorInput]}
                        value={conversionAmount}
                        onChangeText={setConversionAmount}
                        placeholder="0.00"
                        placeholderTextColor="#6B7280"
                        keyboardType="numeric"
                      />
                    </View>
                    {errors.conversionAmount && <Text style={styles.errorText}>{errors.conversionAmount}</Text>}
                    
                    {selectedConversionFundBucket && (
                      <View style={styles.selectedFundInfo}>
                        <Ionicons name="card" size={16} color="#10B981" />
                        <Text style={styles.selectedFundText}>
                          Converting from: {selectedConversionFundBucket.name}
                        </Text>
                        <TouchableOpacity onPress={() => setShowConversionFundPicker(true)}>
                          <Text style={styles.changeFundText}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={{ marginTop: 16 }}>
                      <Text style={styles.inputLabel}>Notes (Optional)</Text>
                      <TextInput
                        style={styles.textInput}
                        value={conversionNotes}
                        onChangeText={setConversionNotes}
                        placeholder="e.g., Earned enough to cover this"
                        placeholderTextColor="#6B7280"
                        multiline
                      />
                    </View>

                    {/* Preview Note */}
                    {conversionAmount && (
                      <View style={styles.warningBox}>
                        <Ionicons name="information-circle" size={20} color="#F59E0B" />
                        <Text style={styles.warningText}>
                          Your account balance won't change. Your loan debt stays the same. This only changes how you track what's "yours" vs "borrowed".
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Step 4: Confirmation */}
                {conversionStep === 'confirm' && (
                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Confirm Conversion</Text>
                    <Text style={styles.confirmationText}>
                      Convert {formatCurrencyAmount(parseFloat(conversionAmount) || 0, currency)} from liability funds to personal funds?
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Regular Transfer UI */}
            {transferType === 'between_accounts' && (
              <>
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
                  placeholder="What is this transfer for?"
                  placeholderTextColor="#6B7280"
                  multiline
                />
                {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
              </View>

              {/* From Account Selection */}
              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>From Account</Text>
                <View style={styles.accountList}>
                  {accounts.map((acc) => (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.accountButton,
                        fromAccount === acc.id && styles.selectedAccount
                      ]}
                      onPress={() => {
                        setFromAccount(acc.id);
                        setFromFundBucket(null);
                        // Reset toAccount if it's the same as fromAccount
                        if (toAccount === acc.id) {
                          setToAccount('');
                        }
                      }}
                    >
                      <View style={styles.accountInfo}>
                        <Text style={[
                          styles.accountName,
                          fromAccount === acc.id && styles.selectedAccountText
                        ]}>
                          {acc.name}
                        </Text>
                        <Text style={[
                          styles.accountBalance,
                          fromAccount === acc.id && styles.selectedAccountText
                        ]}>
                          {formatCurrencyAmount(acc.balance, currency)}
                        </Text>
                      </View>
                      {fromAccount === acc.id && (
                        <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                {errors.fromAccount && <Text style={styles.errorText}>{errors.fromAccount}</Text>}
              </View>

              {/* Selected Fund Source */}
              {fromAccount && (
                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>Fund Source</Text>
                  {fromFundBucket ? (
                    <TouchableOpacity
                      style={styles.fundBucketButton}
                      onPress={() => setShowFromFundPicker(true)}
                    >
                      <View style={styles.fundBucketInfo}>
                        <View style={[styles.fundBucketIcon, { backgroundColor: (fromFundBucket.color || '#6366F1') + '20' }]}>
                          <Ionicons
                            name={
                              fromFundBucket.type === 'personal'
                                ? 'person'
                                : fromFundBucket.type === 'liability'
                                ? 'card'
                                : 'flag'
                            }
                            size={20}
                            color={fromFundBucket.color || '#6366F1'}
                          />
                        </View>
                        <View style={styles.fundBucketDetails}>
                          <Text style={styles.fundBucketName}>{fromFundBucket.name}</Text>
                          <Text style={styles.fundBucketAmount}>
                            Available: {formatCurrencyAmount(fromFundBucket.amount, currency)}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.selectFundButton}
                      onPress={() => setShowFromFundPicker(true)}
                    >
                      <Ionicons name="wallet-outline" size={20} color="#10B981" />
                      <Text style={styles.selectFundText}>Select Fund Source</Text>
                    </TouchableOpacity>
                  )}
                  {errors.fromFundBucket && <Text style={styles.errorText}>{errors.fromFundBucket}</Text>}
                </View>
              )}

              {/* To Account Selection */}
              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>To Account</Text>
                {fromAccount ? (
                  <View style={styles.accountList}>
                    {/* Show accounts with liability portions first */}
                    {accountsWithLiabilities
                      .filter(acc => acc.id !== fromAccount)
                      .map((acc) => {
                        const breakdown = accountBreakdowns[acc.id];
                        return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[
                          styles.accountButton,
                          toAccount === acc.id && styles.selectedAccount
                        ]}
                        onPress={() => setToAccount(acc.id)}
                      >
                        <View style={styles.accountInfo}>
                          <Text style={[
                            styles.accountName,
                            toAccount === acc.id && styles.selectedAccountText
                          ]}>
                            {acc.name}
                          </Text>
                              {breakdown ? (
                                <View>
                                  <Text style={[
                                    styles.accountBalance,
                                    toAccount === acc.id && styles.selectedAccountText
                                  ]}>
                                    Total: {formatCurrencyAmount(breakdown.total, currency)}
                                  </Text>
                                  <Text style={styles.accountBreakdown}>
                                    💵 Personal: {formatCurrencyAmount(breakdown.personal, currency)} • 🏦 Liability: {formatCurrencyAmount(breakdown.totalLiability, currency)}
                                  </Text>
                                </View>
                              ) : (
                                <Text style={[
                                  styles.accountBalance,
                                  toAccount === acc.id && styles.selectedAccountText
                                ]}>
                                  {formatCurrencyAmount(acc.balance, currency)}
                                </Text>
                              )}
                            </View>
                            {toAccount === acc.id && (
                              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    {/* Show regular accounts without liability portions */}
                    {availableToAccounts
                      .filter(acc => !accountsWithLiabilities.find(aw => aw.id === acc.id))
                      .map((acc) => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[
                            styles.accountButton,
                            toAccount === acc.id && styles.selectedAccount
                          ]}
                          onPress={() => setToAccount(acc.id)}
                        >
                          <View style={styles.accountInfo}>
                            <Text style={[
                              styles.accountName,
                              toAccount === acc.id && styles.selectedAccountText
                            ]}>
                              {acc.name}
                            </Text>
                          <Text style={[
                            styles.accountBalance,
                            toAccount === acc.id && styles.selectedAccountText
                          ]}>
                            {formatCurrencyAmount(acc.balance, currency)}
                          </Text>
                        </View>
                        {toAccount === acc.id && (
                          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.placeholderContainer}>
                    <Text style={styles.placeholderText}>
                      Select a "From Account" first
                    </Text>
                  </View>
                )}
                {errors.toAccount && <Text style={styles.errorText}>{errors.toAccount}</Text>}
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
              {fromAccount && toAccount && (
                <View style={styles.balanceCard}>
                  <Text style={styles.balanceTitle}>Balance Impact</Text>
                  
                  <View style={styles.balanceRow}>
                    <View style={styles.balanceBox}>
                      <Text style={styles.balanceLabel}>From Account</Text>
                      <Text style={styles.accountName}>{fromAccountData?.name}</Text>
                      <Text style={styles.balanceBefore}>${fromBeforeBalance.toLocaleString()}</Text>
                      <Text style={styles.balanceAfter}>${fromAfterBalance.toLocaleString()}</Text>
                    </View>
                    
                    <View style={styles.balanceBox}>
                      <Text style={styles.balanceLabel}>To Account</Text>
                      <Text style={styles.accountName}>{toAccountData?.name}</Text>
                      <Text style={styles.balanceBefore}>${toBeforeBalance.toLocaleString()}</Text>
                      <Text style={styles.balanceAfter}>${toAfterBalance.toLocaleString()}</Text>
                    </View>
                  </View>
                </View>
              )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      {/* Fund Picker Modal for Between Accounts */}
      {transferType === 'between_accounts' && fromAccount && (
        <FundPicker
          visible={showFromFundPicker}
          onClose={() => setShowFromFundPicker(false)}
          accountId={fromAccount}
          onSelect={(bucket) => {
            setFromFundBucket(bucket);
            setShowFromFundPicker(false);
          }}
          amount={parseFloat(amount) || 0}
        />
      )}

      {/* Fund Picker Modal for Conversion */}
      {transferType === 'liability_to_personal' && selectedConversionAccount && (
        <FundPicker
          visible={showConversionFundPicker}
          onClose={() => setShowConversionFundPicker(false)}
          accountId={selectedConversionAccount}
          onSelect={(bucket) => {
            // Only allow liability buckets for conversion
            if (bucket.type === 'liability') {
              setSelectedConversionFundBucket(bucket);
              setShowConversionFundPicker(false);
            } else {
              Alert.alert('Invalid Selection', 'You can only convert liability funds to personal funds.');
            }
          }}
          amount={parseFloat(conversionAmount) || 0}
        />
      )}
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
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  selectedAccountText: {
    color: '#10B981',
  },
  placeholderContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#6B7280',
    fontSize: 14,
    fontStyle: 'italic',
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
  transferTypeToggle: {
    gap: 12,
  },
  transferTypeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedTransferType: {
    backgroundColor: '#10B981',
  },
  transferTypeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  selectedTransferTypeText: {
    color: 'white',
  },
  transferTypeSubtext: {
    color: '#9CA3AF',
    fontSize: 12,
    marginLeft: 12,
  },
  selectedTransferTypeSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  liabilityPortionText: {
    color: '#F59E0B',
    fontSize: 12,
    marginTop: 2,
  },
  personalFundsText: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
  hintText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  inputGroup: {
    marginTop: 16,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  previewBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
  },
  previewLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 8,
  },
  previewValue: {
    color: 'white',
    fontSize: 14,
    marginBottom: 4,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  warningText: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    lineHeight: 18,
  },
  confirmationText: {
    color: 'white',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
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
});
