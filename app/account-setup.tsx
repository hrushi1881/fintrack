import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/lib/supabase';

interface AccountData {
  name: string;
  type: 'bank' | 'card' | 'wallet';
  balance: string;
  currency: string;
  color: string;
  icon: string;
}

export default function AccountSetupScreen() {
  const { user } = useAuth();
  const { currency: userCurrency } = useSettings();
  const [currentStep, setCurrentStep] = useState(0);
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);

  // Check if user already has accounts (setup already completed)
  useEffect(() => {
    const checkExistingAccounts = async () => {
      if (!user) {
        router.replace('/auth/signin');
        return;
      }

      try {
        const { data: existingAccounts, error } = await supabase
          .from('accounts')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);

        if (error) {
          console.error('Error checking existing accounts:', error);
          setCheckingExisting(false);
          return;
        }

        if (existingAccounts && existingAccounts.length > 0) {
          // User already has accounts, redirect to main app
          router.replace('/(tabs)');
        } else {
          // No accounts, show setup screen
          setCheckingExisting(false);
        }
      } catch (error) {
        console.error('Error during account check:', error);
        setCheckingExisting(false);
      }
    };

    checkExistingAccounts();
  }, [user]);

  const accountTypes = [
    {
      id: 'bank',
      name: 'Bank Account',
      icon: 'card-outline',
      color: '#3B82F6',
      description: 'Checking or savings account',
    },
    {
      id: 'card',
      name: 'Credit Card',
      icon: 'card',
      color: '#EF4444',
      description: 'Credit card account',
    },
    {
      id: 'wallet',
      name: 'Wallet',
      icon: 'wallet',
      color: '#10B981',
      description: 'Cash or digital wallet',
    },
  ];

  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  ];

  // const colors = [
  //   '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#F59E0B', '#6B7280',
  //   '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#6366F1', '#EF4444'
  // ];

  const steps = [
    {
      title: 'Add Your Accounts',
      subtitle: 'Let\'s start by adding your financial accounts',
      icon: 'wallet',
      color: '#10B981',
    },
    {
      title: 'Set Balances',
      subtitle: 'Enter your current account balances',
      icon: 'calculator',
      color: '#3B82F6',
    },
    {
      title: 'Review & Complete',
      subtitle: 'Review your accounts and finish setup',
      icon: 'checkmark-circle',
      color: '#8B5CF6',
    },
  ];

  const [newAccount, setNewAccount] = useState<AccountData>({
    name: '',
    type: 'bank',
    balance: '',
    currency: userCurrency || 'USD',
    color: '#3B82F6',
    icon: 'card-outline',
  });

  const handleAddAccount = () => {
    if (!newAccount.name || !newAccount.balance) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setAccounts([...accounts, { ...newAccount }]);
    setNewAccount({
      name: '',
      type: 'bank',
      balance: '',
      currency: userCurrency || 'USD',
      color: '#3B82F6',
      icon: 'card-outline',
    });
  };

  const handleRemoveAccount = (index: number) => {
    setAccounts(accounts.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (accounts.length === 0) {
      Alert.alert('Error', 'Please add at least one account');
      return;
    }

    setIsLoading(true);

    try {
      // Create accounts and add initial balances to personal funds
      for (const account of accounts) {
        const balanceAmount = parseFloat(account.balance || '0') || 0;
        
        // Create account (trigger will create personal fund automatically)
        const { data: newAccount, error: accountError } = await supabase
          .from('accounts')
          .insert({
            user_id: user?.id,
            name: account.name,
            type: account.type,
            balance: 0, // Start with 0, we'll add to personal fund
            currency: account.currency,
            color: account.color,
            icon: account.icon,
            is_active: true,
            include_in_totals: true,
          })
          .select()
          .single();

        if (accountError || !newAccount) {
          throw accountError || new Error('Failed to create account');
        }

        // If there's an initial balance, add it to personal fund using receive_to_account_bucket
        if (balanceAmount > 0) {
          const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
            p_user_id: user?.id,
            p_account_id: newAccount.id,
            p_bucket_type: 'personal',
            p_bucket_id: null,
            p_amount: balanceAmount,
            p_category: 'Initial Balance',
            p_description: `Initial balance for ${account.name}`,
            p_date: new Date().toISOString().split('T')[0],
            p_metadata: { notes: 'Account setup initial balance' },
            p_currency: account.currency,
          });

          if (receiveError) {
            console.error('Error adding initial balance:', receiveError);
            // Continue even if balance addition fails - account is created
          }
        }
      }

      Alert.alert(
        'Setup Complete!',
        'Your accounts have been added successfully. Welcome to FinTrack!',
        [
          {
            text: 'Get Started',
            onPress: () => router.replace('/(tabs)'),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error creating accounts:', error);
      Alert.alert('Error', error?.message || 'Failed to save accounts. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepDescription}>
              Choose the type of account you want to add:
            </Text>
            
            <View style={styles.accountTypesGrid}>
              {accountTypes.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.accountTypeCard,
                    newAccount.type === type.id && styles.accountTypeCardSelected,
                  ]}
                  onPress={() => setNewAccount(prev => ({ 
                    ...prev, 
                    type: type.id as any,
                    icon: type.icon,
                    color: type.color,
                  }))}
                >
                  <Ionicons 
                    name={type.icon as any} 
                    size={24} 
                    color={newAccount.type === type.id ? '#FFFFFF' : type.color} 
                  />
                  <Text style={[
                    styles.accountTypeName,
                    newAccount.type === type.id && styles.accountTypeNameSelected,
                  ]}>
                    {type.name}
                  </Text>
                  <Text style={[
                    styles.accountTypeDescription,
                    newAccount.type === type.id && styles.accountTypeDescriptionSelected,
                  ]}>
                    {type.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Account Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Chase Checking, Emergency Fund"
                  placeholderTextColor="#999999"
                  value={newAccount.name}
                  onChangeText={(value) => setNewAccount(prev => ({ ...prev, name: value }))}
                />
            </View>

            <TouchableOpacity 
              style={styles.addButton}
              onPress={handleAddAccount}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Account</Text>
            </TouchableOpacity>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepDescription}>
              Enter the current balance for each account:
            </Text>

            {accounts.map((account, index) => (
              <View key={index} style={styles.accountCard}>
                <View style={styles.accountHeader}>
                  <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                    <Ionicons name={account.icon as any} size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountType}>{accountTypes.find(t => t.id === account.type)?.name}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.removeButton}
                    onPress={() => handleRemoveAccount(index)}
                  >
                    <Ionicons name="close" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                <View style={styles.balanceInput}>
                  <Text style={styles.balanceLabel}>Current Balance</Text>
                  <View style={styles.balanceInputWrapper}>
                    <Text style={styles.currencySymbol}>
                      {currencies.find(c => c.code === account.currency)?.symbol || '$'}
                    </Text>
                    <TextInput
                      style={styles.balanceInputField}
                      placeholder="0.00"
                      placeholderTextColor="#999999"
                      value={account.balance}
                      onChangeText={(value) => {
                        const updatedAccounts = [...accounts];
                        updatedAccounts[index].balance = value;
                        setAccounts(updatedAccounts);
                      }}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            ))}

            {accounts.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={48} color="#666666" />
                <Text style={styles.emptyStateText}>No accounts added yet</Text>
                <Text style={styles.emptyStateSubtext}>Go back to add your first account</Text>
              </View>
            )}
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepDescription}>
              Review your accounts before completing setup:
            </Text>

            {accounts.map((account, index) => (
              <View key={index} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={[styles.reviewIcon, { backgroundColor: account.color }]}>
                    <Ionicons name={account.icon as any} size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewName}>{account.name}</Text>
                    <Text style={styles.reviewType}>{accountTypes.find(t => t.id === account.type)?.name}</Text>
                  </View>
                  <Text style={styles.reviewBalance}>
                    {currencies.find(c => c.code === account.currency)?.symbol || '$'}{account.balance}
                  </Text>
                </View>
              </View>
            ))}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Total Balance</Text>
              <Text style={styles.summaryAmount}>
                ${accounts.reduce((total, account) => total + parseFloat(account.balance || '0'), 0).toFixed(2)}
              </Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  // Show loading while checking for existing accounts
  if (checkingExisting) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Ionicons name="wallet" size={60} color="#000000" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${((currentStep + 1) / steps.length) * 100}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {currentStep + 1} of {steps.length}
              </Text>
            </View>
          </View>

          {/* Step Content */}
          <View style={styles.content}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, { backgroundColor: steps[currentStep].color + '20' }]}>
                <Ionicons 
                  name={steps[currentStep].icon as any} 
                  size={32} 
                  color={steps[currentStep].color} 
                />
              </View>
              <Text style={styles.stepTitle}>{steps[currentStep].title}</Text>
              <Text style={styles.stepSubtitle}>{steps[currentStep].subtitle}</Text>
            </View>

            {renderStepContent()}
          </View>

          {/* Navigation */}
          <View style={styles.navigation}>
            <TouchableOpacity 
              style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
              onPress={handleBack}
              disabled={currentStep === 0}
            >
              <Ionicons name="arrow-back" size={20} color="#000000" />
              <Text style={styles.navButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.navButton, isLoading && styles.navButtonDisabled]}
              onPress={handleNext}
              disabled={isLoading}
            >
              <Text style={styles.navButtonText}>
                {isLoading ? 'Saving...' : currentStep === steps.length - 1 ? 'Complete' : 'Next'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#000000" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Instrument Serif',
  },
  content: {
    flex: 1,
    paddingVertical: 20,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  stepIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Helvetica Neue',
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'Poppins',
  },
  stepContent: {
    marginBottom: 40,
  },
  stepDescription: {
    fontSize: 16,
    color: '#000000',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'Instrument Serif',
  },
  accountTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  accountTypeCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  accountTypeCardSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
    borderWidth: 2,
  },
  accountTypeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Poppins',
  },
  accountTypeNameSelected: {
    color: '#10B981',
  },
  accountTypeDescription: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'Instrument Serif',
  },
  accountTypeDescriptionSelected: {
    color: '#10B981',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
    fontFamily: 'Poppins',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    fontFamily: 'Instrument Serif',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
    fontFamily: 'Poppins',
  },
  accountCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
    fontFamily: 'Poppins',
  },
  accountType: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Instrument Serif',
  },
  removeButton: {
    padding: 8,
  },
  balanceInput: {
    marginTop: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 8,
    fontFamily: 'Poppins',
  },
  balanceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  currencySymbol: {
    fontSize: 16,
    color: '#000000',
    marginRight: 8,
    fontFamily: 'Instrument Serif',
  },
  balanceInputField: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    paddingVertical: 12,
    fontFamily: 'Instrument Serif',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8,
    fontFamily: 'Poppins',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Instrument Serif',
  },
  reviewCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reviewInfo: {
    flex: 1,
  },
  reviewName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
    fontFamily: 'Poppins',
  },
  reviewType: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Instrument Serif',
  },
  reviewBalance: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
    fontFamily: 'Helvetica Neue',
  },
  summaryCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    marginTop: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#000000',
    marginBottom: 8,
    fontFamily: 'Poppins',
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10B981',
    fontFamily: 'Helvetica Neue',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginHorizontal: 8,
    fontFamily: 'Poppins',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#000000',
    marginTop: 20,
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
});
