import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert, Platform, ActivityIndicator } from 'react-native';
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
import GlassCard from '@/components/GlassCard';
import { adjustFundBalance } from '@/utils/funds';

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
  const { accounts: realtimeAccounts, globalRefresh, refreshAccounts, refreshTransactions, refreshAccountFunds, recalculateAllBalances } = useRealtimeData();
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
  
  // Account breakdown state for "To Account" display
  const [accountBreakdowns, setAccountBreakdowns] = useState<{[key: string]: any}>({});
  
  // Conversion-specific state
  const [conversionStep, setConversionStep] = useState<'account' | 'details' | 'confirm'>('account');
  const [selectedConversionAccount, setSelectedConversionAccount] = useState<string | null>(null);
  const [selectedConversionFundBucket, setSelectedConversionFundBucket] = useState<FundBucket | null>(null);
  const [showConversionFundPicker, setShowConversionFundPicker] = useState(false);
  const [conversionAmount, setConversionAmount] = useState('');
  const [conversionNotes, setConversionNotes] = useState('');
  
  const mapBucketTypeForBackend = (type: FundBucket['type']) =>
    type === 'borrowed' ? 'liability' : type;
  

  // Fetch user accounts
  useEffect(() => {
    if (visible && user) {
      fetchAccounts();
    }
  }, [visible, user]);

  // Sync local accounts with realtime accounts when they update
  useEffect(() => {
    if (realtimeAccounts && realtimeAccounts.length > 0) {
      setAccounts(realtimeAccounts);
    }
  }, [realtimeAccounts]);

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
          } else if (selectedConversionFundBucket && selectedConversionFundBucket.type === 'borrowed') {
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
          const backendType = mapBucketTypeForBackend(fromFundBucket.type);
          const bucketParam = {
            type: backendType,
            id: backendType !== 'personal' ? fromFundBucket.id : null,
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

        // Verify balances were updated
        console.log('✅ Transfer RPCs Success, verifying balance updates...');
        
        let retries = 0;
        let balancesVerified = false;
        let fromAccountData: any = null;
        let toAccountData: any = null;
        
        while (retries < 5 && !balancesVerified) {
          await new Promise(resolve => setTimeout(resolve, 100 * (retries + 1)));
          
          const { data: fromData, error: fromError } = await supabase
            .from('accounts')
            .select('name, balance')
            .eq('id', fromAccount)
            .single();
          const { data: toData, error: toError } = await supabase
            .from('accounts')
            .select('name, balance')
            .eq('id', toAccount)
            .single();
          
          if (!fromError && !toError && fromData && toData) {
            fromAccountData = fromData;
            toAccountData = toData;
            const fromExpected = fromBeforeBalance - amountValue;
            const toExpected = toBeforeBalance + amountValue;
            
            if (Math.abs(fromAccountData.balance - fromExpected) < 0.01 &&
                Math.abs(toAccountData.balance - toExpected) < 0.01) {
              balancesVerified = true;
              console.log('✅ Transfer balances verified');
            }
          }
          retries++;
        }
        
        // If verification failed, fetch accounts anyway for display
        if (!fromAccountData || !toAccountData) {
          const { data: fromData } = await supabase
            .from('accounts')
            .select('name')
            .eq('id', fromAccount)
            .single();
          const { data: toData } = await supabase
            .from('accounts')
            .select('name')
            .eq('id', toAccount)
            .single();
          fromAccountData = fromAccountData || fromData;
          toAccountData = toAccountData || toData;
        }
        
        if (!balancesVerified) {
          console.warn('⚠️ Transfer balance verification failed, but RPCs succeeded');
        }

        console.log('✅ Transfer RPC successful, refreshing data...');
        
        // Wait for database commit - increased delay for reliability
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Refresh all data in parallel for faster updates
        await Promise.all([
          refreshAccounts(),
          refreshAccountFunds(),
          refreshTransactions(),
        ]);
        
        // Re-fetch accounts in modal to get latest balances
        await fetchAccounts();
        
        console.log('✅ Data refreshed after transfer');
        
        const fromAccountName = fromAccountData?.name || 'Account';
        const toAccountName = toAccountData?.name || 'Account';

        // Trigger success callback to update parent UI
        onSuccess?.();
        
        showNotification({
          type: 'success',
          title: 'Transferred',
          amount: amountValue,
          currency: currency,
          description: 'Transfer',
          account: `${fromAccountName} → ${toAccountName}`,
          date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
        
        // Small delay to allow UI to update before closing
        await new Promise(resolve => setTimeout(resolve, 300));
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

          if (selectedConversionFundBucket.type !== 'borrowed') {
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
      
      // Trigger success callback to update parent UI
      onSuccess?.();
      
      // Small delay to allow UI to update with new balances
      await new Promise(resolve => setTimeout(resolve, 300));
      
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
    if (selectedConversionFundBucket && selectedConversionFundBucket.type === 'borrowed' && conversionStep === 'account') {
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
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {transferType === 'liability_to_personal' ? 'Convert Funds' : 'Transfer Money'}
            </Text>
            <View style={styles.closeButton} />
          </View>

          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >

            {/* Transfer Type Selection (show when in between_accounts mode or at start) */}
            {transferType === 'between_accounts' && !fromAccount && (
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.sectionTitle}>Transfer Type</Text>
                <View style={styles.transferTypeToggle}>
                  <TouchableOpacity
                    style={[
                      styles.transferTypeButton,
                      styles.selectedTransferType
                    ]}
                    onPress={() => setTransferType('between_accounts')}
                  >
                    <Ionicons name="swap-horizontal" size={24} color="#000000" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.transferTypeText, styles.selectedTransferTypeText]}>
                        Between Accounts
                      </Text>
                      <Text style={[styles.transferTypeSubtext, styles.selectedTransferTypeSubtext]}>
                        Move money from one account to another
                      </Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.transferTypeButton}
                    onPress={() => {
                      setTransferType('liability_to_personal');
                      setConversionStep('account');
                    }}
                  >
                    <Ionicons name="arrow-forward-circle" size={24} color="rgba(0, 0, 0, 0.6)" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.transferTypeText}>
                        Liability → Personal Funds
                      </Text>
                      <Text style={styles.transferTypeSubtext}>
                        Convert borrowed money to personal (doesn't reduce loan debt)
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            )}

            {/* Conversion Flow UI */}
            {transferType === 'liability_to_personal' && (
              <>
                {/* Step 1: Select Account */}
                {conversionStep === 'account' && (
                  <GlassCard padding={20} marginVertical={12}>
                    <Text style={styles.sectionTitle}>Which account has liability funds?</Text>
                    <View style={styles.accountList}>
                      {accounts.map((acc) => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[
                            styles.accountButton,
                            selectedConversionAccount === acc.id && styles.selectedAccount
                          ]}
                          onPress={() => {
                            setSelectedConversionAccount(acc.id);
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
                            <Ionicons name="checkmark-circle" size={24} color="#000000" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </GlassCard>
                )}

                {/* Step 2: Conversion Details */}
                {conversionStep === 'details' && selectedConversionAccount && selectedConversionFundBucket && selectedConversionFundBucket.type === 'borrowed' && (
                  <View style={styles.section}>
                    <GlassCard padding={20} marginVertical={12}>
                      <Text style={styles.sectionTitle}>How much to convert?</Text>
                      <View style={styles.amountInputContainer}>
                        <Text style={styles.currencySymbol}>{currency === 'USD' ? '$' : '₹'}</Text>
                        <TextInput
                          style={[styles.amountInput, errors.conversionAmount && styles.errorInput]}
                          value={conversionAmount}
                          onChangeText={setConversionAmount}
                          placeholder="0.00"
                          placeholderTextColor="rgba(0, 0, 0, 0.4)"
                          keyboardType="decimal-pad"
                        />
                      </View>
                      {errors.conversionAmount && <Text style={styles.errorText}>{errors.conversionAmount}</Text>}
                      
                      {selectedConversionFundBucket && (
                        <TouchableOpacity
                          style={styles.fundBucketButton}
                          onPress={() => setShowConversionFundPicker(true)}
                        >
                          <View style={styles.fundBucketInfo}>
                            <View style={[styles.fundBucketIcon, { backgroundColor: (selectedConversionFundBucket.color || '#6366F1') + '20' }]}>
                              <Ionicons name="card-outline" size={20} color={selectedConversionFundBucket.color || '#6366F1'} />
                            </View>
                            <View style={styles.fundBucketDetails}>
                              <Text style={styles.fundBucketName}>{selectedConversionFundBucket.name}</Text>
                              <Text style={styles.fundBucketAmount}>
                                Available: {formatCurrencyAmount(selectedConversionFundBucket.amount, currency)}
                              </Text>
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                        </TouchableOpacity>
                      )}
                    </GlassCard>

                    <GlassCard padding={20} marginVertical={12}>
                      <Text style={styles.sectionTitle}>Notes (Optional)</Text>
                      <TextInput
                        style={styles.textInput}
                        value={conversionNotes}
                        onChangeText={setConversionNotes}
                        placeholder="e.g., Earned enough to cover this"
                        placeholderTextColor="rgba(0, 0, 0, 0.4)"
                        multiline
                        numberOfLines={3}
                      />
                    </GlassCard>

                    {/* Preview Note */}
                    {conversionAmount && (
                      <GlassCard padding={16} marginVertical={12}>
                        <View style={styles.infoBox}>
                          <Ionicons name="information-circle-outline" size={20} color="#F59E0B" />
                          <Text style={styles.infoText}>
                            Your account balance won't change. Your loan debt stays the same. This only changes how you track what's "yours" vs "borrowed".
                          </Text>
                        </View>
                      </GlassCard>
                    )}
                  </View>
                )}

                {/* Step 4: Confirmation */}
                {conversionStep === 'confirm' && (
                  <GlassCard padding={24} marginVertical={12}>
                    <Text style={styles.sectionTitle}>Confirm Conversion</Text>
                    <Text style={styles.confirmationText}>
                      Convert {formatCurrencyAmount(parseFloat(conversionAmount) || 0, currency)} from liability funds to personal funds?
                    </Text>
                  </GlassCard>
                )}
              </>
            )}

            {/* Regular Transfer UI */}
            {transferType === 'between_accounts' && (
              <>
                {/* Amount Input */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Amount</Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.currencySymbol}>{currency === 'USD' ? '$' : '₹'}</Text>
                    <TextInput
                      style={[styles.amountInput, errors.amount && styles.errorInput]}
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="0.00"
                      placeholderTextColor="rgba(0, 0, 0, 0.4)"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
                </View>

              {/* Description Input */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Description</Text>
                <TextInput
                  style={[styles.textInput, errors.description && styles.errorInput]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What is this transfer for?"
                  placeholderTextColor="rgba(0, 0, 0, 0.4)"
                  multiline
                  numberOfLines={3}
                />
                {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
              </View>

              {/* From Account Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>From Account</Text>
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
                        <Ionicons name="checkmark-circle" size={24} color="#000000" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                {errors.fromAccount && <Text style={styles.errorText}>{errors.fromAccount}</Text>}
              </View>

              {/* Selected Fund Source */}
              {fromAccount && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Fund Source</Text>
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
                                ? 'wallet-outline'
                                : fromFundBucket.type === 'borrowed'
                                ? 'card-outline'
                                : 'flag-outline'
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
                      <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.selectFundButton}
                      onPress={() => setShowFromFundPicker(true)}
                    >
                      <Ionicons name="wallet-outline" size={20} color="#000000" />
                      <Text style={styles.selectFundText}>Select Fund Source</Text>
                    </TouchableOpacity>
                  )}
                  {errors.fromFundBucket && <Text style={styles.errorText}>{errors.fromFundBucket}</Text>}
                </View>
              )}

              {/* To Account Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>To Account</Text>
                {fromAccount ? (
                  <View style={styles.accountList}>
                    {availableToAccounts.map((acc) => {
                      const breakdown = accountBreakdowns[acc.id];
                      return (
                        <TouchableOpacity
                          key={acc.id}
                          style={[
                            styles.accountButton,
                            toAccount === acc.id && styles.selectedAccount
                          ]}
                          onPress={async () => {
                            setToAccount(acc.id);
                            // Load breakdown if not already loaded
                            if (!accountBreakdowns[acc.id]) {
                              try {
                                const breakdown = await getAccountBreakdown(acc.id);
                                setAccountBreakdowns(prev => ({ ...prev, [acc.id]: breakdown }));
                              } catch (error) {
                                console.error('Error loading account breakdown:', error);
                              }
                            }
                          }}
                        >
                          <View style={styles.accountInfo}>
                            <Text style={[
                              styles.accountName,
                              toAccount === acc.id && styles.selectedAccountText
                            ]}>
                              {acc.name}
                            </Text>
                            {breakdown && breakdown.totalLiability > 0 ? (
                              <View>
                                <Text style={[
                                  styles.accountBalance,
                                  toAccount === acc.id && styles.selectedAccountText
                                ]}>
                                  Total: {formatCurrencyAmount(breakdown.total, currency)}
                                </Text>
                                <Text style={styles.accountBreakdown}>
                                  Personal: {formatCurrencyAmount(breakdown.personal, currency)} • Liability: {formatCurrencyAmount(breakdown.totalLiability, currency)}
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
                            <Ionicons name="checkmark-circle" size={24} color="#000000" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <GlassCard padding={20} marginVertical={12}>
                    <Text style={styles.placeholderText}>
                      Select a "From Account" first
                    </Text>
                  </GlassCard>
                )}
                {errors.toAccount && <Text style={styles.errorText}>{errors.toAccount}</Text>}
              </View>

              {/* Date Input */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Date</Text>
                <TouchableOpacity 
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="#000000" />
                  <Text style={styles.dateText}>
                    {date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
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

              {/* Balance Impact Preview */}
              {fromAccount && toAccount && amount && parseFloat(amount) > 0 && (
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.sectionTitle}>Balance Impact Preview</Text>
                  
                  <View style={styles.balanceRow}>
                    <View style={styles.balanceBox}>
                      <Text style={styles.balanceLabel}>From Account</Text>
                      <Text style={styles.balanceAccountName}>
                        {accounts.find(acc => acc.id === fromAccount)?.name || 'Account'}
                      </Text>
                      <View style={styles.balanceChange}>
                        <Text style={styles.balanceBeforeLabel}>Current:</Text>
                        <Text style={styles.balanceBefore}>
                          {formatCurrencyAmount(accounts.find(acc => acc.id === fromAccount)?.balance || 0, currency)}
                        </Text>
                      </View>
                      <View style={styles.balanceChange}>
                        <Text style={styles.balanceAfterLabel}>After Transfer:</Text>
                        <Text style={styles.balanceAfter}>
                          {formatCurrencyAmount((accounts.find(acc => acc.id === fromAccount)?.balance || 0) - parseFloat(amount || '0'), currency)}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.balanceBox}>
                      <Text style={styles.balanceLabel}>To Account</Text>
                      <Text style={styles.balanceAccountName}>
                        {accounts.find(acc => acc.id === toAccount)?.name || 'Account'}
                      </Text>
                      <View style={styles.balanceChange}>
                        <Text style={styles.balanceBeforeLabel}>Current:</Text>
                        <Text style={styles.balanceBefore}>
                          {formatCurrencyAmount(accounts.find(acc => acc.id === toAccount)?.balance || 0, currency)}
                        </Text>
                      </View>
                      <View style={styles.balanceChange}>
                        <Text style={styles.balanceAfterLabel}>After Transfer:</Text>
                        <Text style={styles.balanceAfter}>
                          {formatCurrencyAmount((accounts.find(acc => acc.id === toAccount)?.balance || 0) + parseFloat(amount || '0'), currency)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </GlassCard>
              )}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, (isLoading || !fromAccount || !toAccount || !fromFundBucket || !amount) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={isLoading || !fromAccount || !toAccount || !fromFundBucket || !amount}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Transfer Money</Text>
                )}
              </TouchableOpacity>
              </>
            )}

            {/* Conversion Submit Button */}
            {transferType === 'liability_to_personal' && conversionStep === 'confirm' && (
              <TouchableOpacity
                style={[styles.submitButton, (isLoading || !selectedConversionAccount || !selectedConversionFundBucket || !conversionAmount) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={isLoading || !selectedConversionAccount || !selectedConversionFundBucket || !conversionAmount}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Convert Funds</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Conversion Continue Button */}
            {transferType === 'liability_to_personal' && conversionStep !== 'confirm' && (
              <TouchableOpacity
                style={[styles.submitButton, (isLoading || (conversionStep === 'account' && !selectedConversionAccount) || (conversionStep === 'details' && (!conversionAmount || !selectedConversionFundBucket))) && styles.submitButtonDisabled]}
                onPress={handleConversionContinue}
                disabled={isLoading || (conversionStep === 'account' && !selectedConversionAccount) || (conversionStep === 'details' && (!conversionAmount || !selectedConversionFundBucket))}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Continue</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>

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
            // Only allow borrowed (liability) buckets for conversion
            if (bucket.type === 'borrowed') {
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
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  currencySymbol: {
    fontSize: 24,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 24,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  textInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  accountList: {
    gap: 8,
  },
  accountButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedAccount: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderColor: '#000000',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  accountBreakdown: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 2,
  },
  selectedAccountText: {
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  placeholderText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  balanceBox: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 8,
  },
  balanceAccountName: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  balanceChange: {
    marginTop: 8,
  },
  balanceBeforeLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 4,
  },
  balanceBefore: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.4)',
    textDecorationLine: 'line-through',
    marginBottom: 4,
  },
  balanceAfterLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
    marginTop: 8,
  },
  balanceAfter: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    gap: 12,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  errorInput: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#EF4444',
    marginTop: 8,
  },
  transferTypeToggle: {
    gap: 12,
    marginTop: 12,
  },
  transferTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedTransferType: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderColor: '#000000',
  },
  transferTypeText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
    marginLeft: 12,
    flex: 1,
  },
  selectedTransferTypeText: {
    color: '#000000',
  },
  transferTypeSubtext: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginLeft: 12,
    marginTop: 4,
  },
  selectedTransferTypeSubtext: {
    color: 'rgba(0, 0, 0, 0.6)',
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    lineHeight: 18,
  },
  confirmationText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    marginTop: 8,
    textAlign: 'center',
  },
  fundBucketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    marginTop: 12,
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
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  fundBucketAmount: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  selectFundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderStyle: 'dashed',
    gap: 8,
  },
  selectFundText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  submitButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  submitButtonText: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
