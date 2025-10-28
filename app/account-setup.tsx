import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface AccountData {
  name: string;
  type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'cash' | 'loan';
  balance: string;
  currency: string;
  color: string;
  icon: string;
}

export default function AccountSetupScreen() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const accountTypes = [
    {
      id: 'checking',
      name: 'Checking Account',
      icon: 'card',
      color: '#3B82F6',
      description: 'Daily spending account',
    },
    {
      id: 'savings',
      name: 'Savings Account',
      icon: 'wallet',
      color: '#10B981',
      description: 'Money you want to save',
    },
    {
      id: 'credit_card',
      name: 'Credit Card',
      icon: 'card-outline',
      color: '#EF4444',
      description: 'Credit card balance',
    },
    {
      id: 'investment',
      name: 'Investment Account',
      icon: 'trending-up',
      color: '#8B5CF6',
      description: 'Stocks, bonds, mutual funds',
    },
    {
      id: 'cash',
      name: 'Cash',
      icon: 'cash',
      color: '#F59E0B',
      description: 'Physical cash on hand',
    },
    {
      id: 'loan',
      name: 'Loan',
      icon: 'document-text',
      color: '#6B7280',
      description: 'Personal loan, mortgage, etc.',
    },
  ];

  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  ];

  const colors = [
    '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#F59E0B', '#6B7280',
    '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#6366F1', '#EF4444'
  ];

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
    type: 'checking',
    balance: '',
    currency: 'USD',
    color: '#3B82F6',
    icon: 'card',
  });

  const handleAddAccount = () => {
    if (!newAccount.name || !newAccount.balance) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setAccounts([...accounts, { ...newAccount }]);
    setNewAccount({
      name: '',
      type: 'checking',
      balance: '',
      currency: 'USD',
      color: '#3B82F6',
      icon: 'card',
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
      // Save accounts to database
      const accountPromises = accounts.map(account => 
        supabase.from('accounts').insert({
          user_id: user?.id,
          name: account.name,
          type: account.type,
          balance: parseFloat(account.balance),
          currency: account.currency,
          color: account.color,
          icon: account.icon,
        })
      );

      await Promise.all(accountPromises);

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
    } catch (error) {
      Alert.alert('Error', 'Failed to save accounts. Please try again.');
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
                    color={newAccount.type === type.id ? 'white' : type.color} 
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
                placeholderTextColor="#9CA3AF"
                value={newAccount.name}
                onChangeText={(value) => setNewAccount(prev => ({ ...prev, name: value }))}
              />
            </View>

            <TouchableOpacity 
              style={styles.addButton}
              onPress={handleAddAccount}
            >
              <Ionicons name="add" size={20} color="white" />
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
                    <Ionicons name={account.icon as any} size={20} color="white" />
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
                      placeholderTextColor="#9CA3AF"
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
                <Ionicons name="wallet-outline" size={48} color="#9CA3AF" />
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
                    <Ionicons name={account.icon as any} size={20} color="white" />
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

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#99D795" />
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
              <Ionicons name="arrow-back" size={20} color="white" />
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
              <Ionicons name="arrow-forward" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
    color: 'rgba(255, 255, 255, 0.8)',
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
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },
  stepContent: {
    marginBottom: 40,
  },
  stepDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  accountTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  accountTypeCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  accountTypeCardSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  accountTypeName: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    textAlign: 'center',
  },
  accountTypeNameSelected: {
    color: 'white',
  },
  accountTypeDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
    textAlign: 'center',
  },
  accountTypeDescriptionSelected: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginLeft: 8,
  },
  accountCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    color: 'white',
    marginBottom: 2,
  },
  accountType: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  removeButton: {
    padding: 8,
  },
  balanceInput: {
    marginTop: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  balanceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 16,
    color: 'white',
    marginRight: 8,
  },
  balanceInputField: {
    flex: 1,
    fontSize: 16,
    color: 'white',
    paddingVertical: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  reviewCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    color: 'white',
    marginBottom: 2,
  },
  reviewType: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  reviewBalance: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
  },
  summaryCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    marginTop: 20,
  },
  summaryTitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10B981',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginHorizontal: 8,
  },
});
