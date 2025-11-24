import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { RecurringTransactionNature, RecurringFrequency, RecurringAmountType } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';
import CategoryPicker from '@/components/CategoryPicker';
import GlassCard from '@/components/GlassCard';
import { createBill } from '@/utils/bills';
import {
  RECURRING_TRANSACTION_TYPES,
  getAllRecurringTypeDefinitions,
  FREQUENCY_LABELS,
} from '@/constants/recurringTransactionTypes';

type Direction = 'income' | 'expense';
type CustomFrequencyUnit = 'days' | 'weeks' | 'months' | 'years';

interface FormData {
  direction: Direction;
  nature: RecurringTransactionNature | null;
  is_one_time: boolean; // Flag for one-time bills
  title: string;
  description: string;
  amount: string;
  amount_type: RecurringAmountType;
  category_id: string;
  account_ids: string[]; // Changed to array for multiple selection
  all_accounts: boolean; // Flag for "All Accounts" option
  
  // Schedule (for recurring bills only)
  frequency: RecurringFrequency;
  custom_frequency_number: string;
  custom_frequency_unit: CustomFrequencyUnit;
  interval: string;
  start_date: Date | null;
  end_date: Date | null;
  day_of_month: string;
}

export default function AddBillModal() {
  const { user } = useAuth();
  const { categories, accounts, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  
  // Visual locked state
  const [amountLocked, setAmountLocked] = useState(true);
  const [intervalLocked, setIntervalLocked] = useState(true);
  const [frequencyLocked, setFrequencyLocked] = useState(true);
  
  const [formData, setFormData] = useState<FormData>({
    direction: 'expense',
    nature: null,
    title: '',
    description: '',
    amount: '',
    amount_type: 'fixed',
    category_id: '',
    account_ids: [],
    all_accounts: false,
    
    frequency: 'monthly',
    custom_frequency_number: '45',
    custom_frequency_unit: 'days',
    interval: '1',
    start_date: null,
    end_date: null,
    day_of_month: '1',
  });

  // Apply defaults when nature is selected
  useEffect(() => {
    if (formData.nature) {
      const typeDef = RECURRING_TRANSACTION_TYPES[formData.nature];
      if (typeDef) {
        setFormData(prev => ({
          ...prev,
          direction: typeDef.defaultType,
          amount_type: typeDef.defaults.amount_type,
          frequency: typeDef.defaults.frequency,
          interval: typeDef.defaults.interval.toString(),
        }));
      }
    }
  }, [formData.nature]);

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.title.trim()) {
        Alert.alert('Error', 'Please enter a title');
      return;
    }
      if (!formData.nature) {
        Alert.alert('Error', 'Please select a type');
      return;
    }
    }
    
    if (currentStep === 2) {
      if (!formData.start_date) {
        Alert.alert('Error', 'Please select a start date');
      return;
    }
      if (formData.frequency === 'custom') {
        const num = parseInt(formData.custom_frequency_number);
        if (isNaN(num) || num <= 0) {
          Alert.alert('Error', 'Please enter a valid custom frequency number');
          return;
        }
      }
      const intervalNum = parseInt(formData.interval);
      if (isNaN(intervalNum) || intervalNum <= 0) {
        Alert.alert('Error', 'Please enter a valid interval');
        return;
      }
    }
    
    setCurrentStep(prev => prev + 1);
  };

  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    // Validate required fields
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    if (!formData.nature) {
      Alert.alert('Error', 'Please select a type');
      return;
    }

    if (!formData.start_date) {
      Alert.alert('Error', 'Please select a start date');
      return;
    }

    if (!formData.all_accounts && formData.account_ids.length === 0) {
      Alert.alert('Error', 'Please select at least one account or select "All Accounts"');
      return;
    }

    // Validate amount for fixed bills
    if (formData.amount_type === 'fixed' && (!formData.amount || parseFloat(formData.amount) <= 0)) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      // Map formData to CreateBillData
      const natureDef = RECURRING_TRANSACTION_TYPES[formData.nature];
      const amountValue = formData.amount ? parseFloat(formData.amount) : undefined;
      
      // Determine end_type and dates
      let endType: 'never' | 'on_date' | 'after_count' = 'never';
      let recurrenceEndDate: string | undefined = undefined;
      
      if (formData.end_date) {
        endType = 'on_date';
        recurrenceEndDate = formData.end_date.toISOString().split('T')[0];
      }

      // Handle custom frequency
      let frequency: RecurringFrequency = formData.frequency;
      let customPattern: any = undefined;
      
      if (formData.frequency === 'custom') {
        // For custom, we'll use the closest standard frequency and adjust interval
        const customNum = parseInt(formData.custom_frequency_number) || 1;
        const customUnit = formData.custom_frequency_unit;
        
        // Map custom units to frequencies
        switch (customUnit) {
          case 'days':
            frequency = 'daily';
            break;
          case 'weeks':
            frequency = 'weekly';
            break;
          case 'months':
            frequency = 'monthly';
            break;
          case 'years':
            frequency = 'yearly';
            break;
          default:
            frequency = 'monthly';
        }
        
        // Store custom pattern in metadata
        customPattern = {
          type: 'specific_days',
          interval: customNum,
          unit: customUnit,
        };
      }

      // Calculate day_of_month for monthly frequency
      const dayOfMonth = formData.frequency === 'monthly' && formData.day_of_month 
        ? parseInt(formData.day_of_month) 
        : undefined;

      // Determine bill_type from nature and amount_type
      let billType: 'one_time' | 'recurring_fixed' | 'recurring_variable' | 'goal_linked' | 'liability_linked' = 'recurring_fixed';
      if (formData.amount_type === 'variable') {
        billType = 'recurring_variable';
      } else if (formData.nature === 'payment') {
        billType = 'liability_linked';
      } else if (formData.nature === 'income' || formData.nature === 'subscription' || formData.nature === 'bill') {
        billType = 'recurring_fixed';
      }

      // Determine which accounts to create bills for
      const accountsToUse = formData.all_accounts ? accounts : accounts.filter(a => formData.account_ids.includes(a.id));
      
      if (accountsToUse.length === 0) {
        Alert.alert('Error', 'No accounts available');
        return;
      }

      // Create bills for each selected account
      let billsCreated = 0;
      const errors: string[] = [];

      for (const account of accountsToUse) {
        try {
          const billData = {
            title: formData.title.trim(),
            description: formData.description.trim() || undefined,
            amount: amountValue,
            currency: currency,
            category_id: formData.category_id || undefined,
            linked_account_id: account.id,
            bill_type: billType,
            
            // Recurring transaction fields
            direction: formData.direction,
            nature: formData.nature,
            amount_type: formData.amount_type,
            estimated_amount: formData.amount_type === 'variable' ? amountValue : undefined,
            frequency: frequency,
            custom_pattern: customPattern,
            recurrence_interval: parseInt(formData.interval) || 1,
            day_of_month: dayOfMonth,
            due_date: formData.start_date.toISOString().split('T')[0],
            end_type: endType,
            recurrence_end_date: recurrenceEndDate,
            
            // Visual
            color: natureDef?.color || '#F59E0B',
            icon: natureDef?.icon || 'receipt',
            
            // Subscription details (if applicable)
            is_subscription: formData.nature === 'subscription',
            
            // Reminder settings
            remind_before: true,
            auto_create: true,
            auto_create_days_before: 3,
            reminder_days: [3, 1],
            
            // Metadata to track if this is part of a multi-account bill
            metadata: {
              ...(formData.all_accounts && { all_accounts: true }),
              ...(accountsToUse.length > 1 && { 
                multi_account: true,
                account_count: accountsToUse.length 
              }),
            },
          };

          await createBill(billData);
          billsCreated++;
        } catch (error: any) {
          errors.push(`Failed to create bill for ${account.name}: ${error.message}`);
        }
      }
      
      // Global refresh to update all data
      await globalRefresh();
      
      if (errors.length > 0) {
        Alert.alert(
          'Partial Success',
          `Created ${billsCreated} bill(s), but ${errors.length} failed:\n${errors.slice(0, 3).join('\n')}`
        );
      } else {
        Alert.alert(
          'Success',
          billsCreated > 1
            ? `Successfully created ${billsCreated} bills!`
            : 'Bill created successfully!'
        );
      }
      
      // Reset form but keep modal open
      setFormData({
        direction: 'expense',
        nature: null,
        title: '',
        description: '',
        amount: '',
        amount_type: 'fixed',
        category_id: '',
        account_ids: [],
        all_accounts: false,
        frequency: 'monthly',
        custom_frequency_number: '45',
        custom_frequency_unit: 'days',
        interval: '1',
        start_date: null,
        end_date: null,
        day_of_month: '1',
      });
      setCurrentStep(1);
      
      // Modal stays open - user can add another bill
    } catch (error: any) {
      console.error('Error creating bill:', error);
      Alert.alert('Error', error.message || 'Failed to create bill. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Basics';
      case 2: return 'Schedule';
      case 3: return 'Review & Create';
      default: return 'Create Bill';
    }
  };

  const natureTypes = getAllRecurringTypeDefinitions();

  // Render Step 1: Basics
  const renderStep1 = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
    <View style={styles.stepContent}>
        <Text style={styles.stepDescription}>Choose direction and type of recurring transaction</Text>
      
        {/* Direction Toggle */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Direction *</Text>
          <View style={styles.optionButtons}>
        <TouchableOpacity
          style={[
                styles.optionButton,
                formData.direction === 'expense' && styles.optionButtonSelected,
          ]}
              onPress={() => handleInputChange('direction', 'expense')}
        >
            <Ionicons 
                name={formData.direction === 'expense' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={formData.direction === 'expense' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
            />
            <Text style={[
                styles.optionButtonText,
                formData.direction === 'expense' && styles.optionButtonTextSelected
            ]}>
                Expense
            </Text>
        </TouchableOpacity>
              <TouchableOpacity
                style={[
                styles.optionButton,
                formData.direction === 'income' && styles.optionButtonSelected,
                ]}
              onPress={() => handleInputChange('direction', 'income')}
              >
                <Ionicons 
                name={formData.direction === 'income' ? 'radio-button-on' : 'radio-button-off'}
                  size={20} 
                color={formData.direction === 'income' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                />
              <Text style={[
                styles.optionButtonText,
                formData.direction === 'income' && styles.optionButtonTextSelected
              ]}>
                Income
              </Text>
              </TouchableOpacity>
        </View>
      </View>

        {/* Nature Selection */}
      <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Type *</Text>
          {natureTypes.map((typeDef) => {
            const isSelected = formData.nature === typeDef.nature;
            const shouldShow = formData.direction === typeDef.defaultType;
            
            if (!shouldShow && !isSelected) return null;
            
            return (
                <TouchableOpacity
                key={typeDef.nature}
                  style={[
                  styles.natureCard,
                  isSelected && styles.natureCardSelected,
                  { borderLeftColor: typeDef.color },
                  ]}
                onPress={() => handleInputChange('nature', typeDef.nature)}
                >
                <View style={[styles.natureIcon, { backgroundColor: typeDef.color + '20' }]}>
                  <Ionicons name={typeDef.icon as any} size={24} color={typeDef.color} />
                </View>
                <View style={styles.natureInfo}>
                  <Text style={[
                    styles.natureLabel,
                    isSelected && styles.natureLabelSelected
                  ]}>
                    {typeDef.label}
                  </Text>
                  <Text style={styles.natureDescription}>{typeDef.description}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color={typeDef.color} />
                )}
                </TouchableOpacity>
            );
          })}
          </View>

        {/* Title */}
          <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
            style={styles.textInput}
            placeholder="e.g., Netflix Subscription"
            placeholderTextColor="rgba(0, 0, 0, 0.4)"
            value={formData.title}
            onChangeText={(value) => handleInputChange('title', value)}
              />
          </View>

        {/* Amount - Visually Locked */}
          <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Amount</Text>
          <View style={[
            styles.amountInputContainer,
            amountLocked && styles.lockedField,
            !amountLocked && styles.unlockedField,
          ]}>
            <Text style={styles.currencySymbol}>
              {formatCurrencyAmount(0, currency).charAt(0)}
            </Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="rgba(0, 0, 0, 0.4)"
              keyboardType="decimal-pad"
              value={formData.amount}
              onChangeText={(value) => handleInputChange('amount', value)}
              onFocus={() => setAmountLocked(false)}
              onBlur={() => setAmountLocked(true)}
            />
            <TouchableOpacity 
              onPress={() => {
                setAmountLocked(!amountLocked);
              }}
              style={styles.lockButton}
            >
              <Ionicons
                name={amountLocked ? 'lock-closed' : 'lock-open'}
                size={16}
                color="rgba(0, 0, 0, 0.4)"
              />
            </TouchableOpacity>
          </View>
          {amountLocked && (
            <Text style={styles.helperText}>Tap to edit amount</Text>
      )}
    </View>

        {/* Amount Type */}
        {formData.nature && RECURRING_TRANSACTION_TYPES[formData.nature]?.characteristics.amountPattern === 'both' && (
        <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Amount Pattern</Text>
            <View style={styles.optionButtons}>
          <TouchableOpacity 
                style={[
                  styles.optionButton,
                  formData.amount_type === 'fixed' && styles.optionButtonSelected,
                ]}
                onPress={() => handleInputChange('amount_type', 'fixed')}
          >
                <Text style={[
                  styles.optionButtonText,
                  formData.amount_type === 'fixed' && styles.optionButtonTextSelected
                ]}>
                  Fixed
            </Text>
          </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                  styles.optionButton,
                  formData.amount_type === 'variable' && styles.optionButtonSelected,
                    ]}
                onPress={() => handleInputChange('amount_type', 'variable')}
                  >
                      <Text style={[
                  styles.optionButtonText,
                  formData.amount_type === 'variable' && styles.optionButtonTextSelected
                      ]}>
                  Variable
                      </Text>
                  </TouchableOpacity>
            </View>
        </View>
      )}

        {/* Category */}
      <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Category</Text>
          <CategoryPicker
            selectedCategoryId={formData.category_id}
            onCategorySelect={(category) => handleInputChange('category_id', category?.id || '')}
            activityType={formData.direction}
            placeholder="Select a category"
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Description (Optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Add a description..."
            placeholderTextColor="rgba(0, 0, 0, 0.4)"
            multiline
            numberOfLines={3}
            value={formData.description}
            onChangeText={(value) => handleInputChange('description', value)}
          />
        </View>

        {/* Account Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Account(s) *</Text>
        <TouchableOpacity 
          style={styles.pickerButton}
          onPress={() => setShowAccountPicker(!showAccountPicker)}
        >
          <Text style={styles.pickerButtonText}>
              {formData.all_accounts
                ? 'All Accounts'
                : formData.account_ids.length === 0
                ? 'Select account(s)'
                : formData.account_ids.length === 1
                ? accounts.find(a => a.id === formData.account_ids[0])?.name
                : `${formData.account_ids.length} accounts selected`}
          </Text>
            <Ionicons
              name={showAccountPicker ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="rgba(0, 0, 0, 0.4)"
            />
        </TouchableOpacity>
        
        {showAccountPicker && (
          <View style={styles.pickerContainer}>
            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
              {/* All Accounts Option */}
              <TouchableOpacity
                style={[
                  styles.pickerOption,
                  formData.all_accounts && styles.selectedPickerOption
                ]}
                onPress={() => {
                  handleInputChange('all_accounts', true);
                  handleInputChange('account_ids', []);
                  setShowAccountPicker(false);
                }}
              >
                <View style={styles.pickerOptionInfo}>
                  <Text style={[
                    styles.pickerOptionName,
                    formData.all_accounts && styles.selectedPickerOptionText
                  ]}>
                    All Accounts
                  </Text>
                  <Text style={styles.pickerOptionDescription}>
                    Apply to all your accounts
                  </Text>
                </View>
                {formData.all_accounts && (
                  <Ionicons name="checkmark-circle" size={20} color="#000000" />
                )}
              </TouchableOpacity>
              
              {/* Individual Accounts */}
              {accounts.map((account) => {
                const isSelected = formData.account_ids.includes(account.id);
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[
                      styles.pickerOption,
                      isSelected && styles.selectedPickerOption
                    ]}
                    onPress={() => {
                      if (formData.all_accounts) {
                        // If "All Accounts" is selected, unselect it and select this account
                        handleInputChange('all_accounts', false);
                        handleInputChange('account_ids', [account.id]);
                      } else {
                        // Toggle account selection
                        const newAccountIds = isSelected
                          ? formData.account_ids.filter(id => id !== account.id)
                          : [...formData.account_ids, account.id];
                        handleInputChange('account_ids', newAccountIds);
                      }
                      // Don't close picker to allow multiple selections
                    }}
                  >
                    <View style={styles.pickerOptionInfo}>
                      <Text style={[
                        styles.pickerOptionName,
                        isSelected && styles.selectedPickerOptionText
                      ]}>
                        {account.name}
                      </Text>
                      <Text style={styles.pickerOptionDescription}>
                        {formatCurrencyAmount(account.balance, currency)}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color="#000000" />
                    )}
                  </TouchableOpacity>
                );
              })}
              
              {/* Done Button */}
              {!formData.all_accounts && (
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => setShowAccountPicker(false)}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}
      </View>
      </View>
    </ScrollView>
  );

  // Render Step 2: Schedule
  const renderStep2 = () => {
    const frequencyOptions: RecurringFrequency[] = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];
    
    return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.stepContent}>
          <Text style={styles.stepDescription}>Set frequency and schedule</Text>
          
          {/* Frequency - Visually Locked */}
      <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Frequency *</Text>
            <View style={styles.frequencyContainer}>
              {frequencyOptions.map((freq) => (
            <TouchableOpacity
                  key={freq}
              style={[
                    styles.frequencyOption,
                    formData.frequency === freq && styles.selectedFrequencyOption,
              ]}
              onPress={() => {
                    handleInputChange('frequency', freq);
                    setFrequencyLocked(true);
              }}
            >
              <Text style={[
                    styles.frequencyText,
                    formData.frequency === freq && styles.selectedFrequencyText
              ]}>
                    {FREQUENCY_LABELS[freq]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
            
            {formData.frequency === 'custom' && (
              <View style={styles.customFrequencyContainer}>
                <View style={[
                  styles.customFrequencyInput,
                  frequencyLocked && styles.lockedField,
                  !frequencyLocked && styles.unlockedField,
                ]}>
                  <TextInput
                    style={styles.customFrequencyNumberInput}
                    placeholder="45"
                    placeholderTextColor="rgba(0, 0, 0, 0.4)"
                    keyboardType="numeric"
                    value={formData.custom_frequency_number}
                    onChangeText={(value) => handleInputChange('custom_frequency_number', value)}
                    onFocus={() => setFrequencyLocked(false)}
                    onBlur={() => setFrequencyLocked(true)}
                  />
                  <TouchableOpacity
                    style={styles.customFrequencyUnitButton}
                    onPress={() => {
                      // Cycle through units or show dropdown
                      const units: CustomFrequencyUnit[] = ['days', 'weeks', 'months', 'years'];
                      const currentIndex = units.indexOf(formData.custom_frequency_unit);
                      const nextIndex = (currentIndex + 1) % units.length;
                      handleInputChange('custom_frequency_unit', units[nextIndex]);
                    }}
                  >
                    <Text style={styles.customFrequencyUnitText}>
                      {formData.custom_frequency_unit.charAt(0).toUpperCase() + formData.custom_frequency_unit.slice(1)}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="rgba(0, 0, 0, 0.4)" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setFrequencyLocked(!frequencyLocked)}
                    style={styles.lockButton}
                  >
                    <Ionicons
                      name={frequencyLocked ? 'lock-closed' : 'lock-open'}
                      size={16}
                      color="rgba(0, 0, 0, 0.4)"
                    />
                  </TouchableOpacity>
                </View>
                {frequencyLocked && (
                  <Text style={styles.helperText}>Tap to edit custom frequency</Text>
                )}
              </View>
            )}
      </View>

          {/* Interval - Visually Locked */}
      <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Repeat Every</Text>
            <View style={[
              styles.intervalContainer,
              intervalLocked && styles.lockedField,
              !intervalLocked && styles.unlockedField,
            ]}>
        <TextInput
                style={styles.intervalInput}
                placeholder="1"
                placeholderTextColor="rgba(0, 0, 0, 0.4)"
                keyboardType="numeric"
                value={formData.interval}
                onChangeText={(value) => handleInputChange('interval', value)}
                onFocus={() => setIntervalLocked(false)}
                onBlur={() => setIntervalLocked(true)}
              />
              <Text style={styles.intervalText}>
                {formData.frequency === 'custom'
                  ? formData.custom_frequency_unit
                  : formData.frequency === 'daily' ? 'day(s)'
                  : formData.frequency === 'weekly' ? 'week(s)'
                  : formData.frequency === 'monthly' ? 'month(s)'
                  : formData.frequency === 'yearly' ? 'year(s)'
                  : 'period(s)'}
              </Text>
              <TouchableOpacity
                onPress={() => setIntervalLocked(!intervalLocked)}
                style={styles.lockButton}
              >
                <Ionicons
                  name={intervalLocked ? 'lock-closed' : 'lock-open'}
                  size={16}
                  color="rgba(0, 0, 0, 0.4)"
                />
              </TouchableOpacity>
      </View>
            {intervalLocked && (
              <Text style={styles.helperText}>Tap to edit interval</Text>
            )}
    </View>

          {/* Day of Month (for monthly) */}
          {formData.frequency === 'monthly' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Day of Month *</Text>
              <View style={styles.dayOfMonthContainer}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dayOfMonthOption,
                      formData.day_of_month === day.toString() && styles.selectedDayOfMonthOption,
                    ]}
                    onPress={() => handleInputChange('day_of_month', day.toString())}
                  >
                    <Text style={[
                      styles.dayOfMonthText,
                      formData.day_of_month === day.toString() && styles.selectedDayOfMonthText
                    ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Start Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Start Date *</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowStartDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
              <Text style={styles.dateButtonText}>
                {formData.start_date
                  ? formData.start_date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Select start date'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* End Date (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>End Date (Optional)</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowEndDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
              <Text style={styles.dateButtonText}>
                {formData.end_date
                  ? formData.end_date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'No end date'}
              </Text>
            </TouchableOpacity>
            {formData.end_date && (
              <Text style={styles.helperText}>
                Payment dates cannot go beyond this date
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    );
  };

  // Render Step 3: Review & Create
  const renderStep3 = () => {
    // Calculate bill count (simplified - will be more sophisticated later)
    const calculateBillCount = () => {
      if (!formData.start_date) return 0;
      if (formData.end_date && formData.end_date < formData.start_date) return 0;
      
      // Simplified calculation - actual implementation will consider frequency and interval
      return 12; // Placeholder
    };

    const billCount = calculateBillCount();
    const selectedNature = formData.nature ? RECURRING_TRANSACTION_TYPES[formData.nature] : null;
    const selectedCategory = categories.find(c => c.id === formData.category_id);
    
    // Get selected accounts for display
    const selectedAccounts = formData.all_accounts 
      ? accounts 
      : accounts.filter(a => formData.account_ids.includes(a.id));
    const accountCount = selectedAccounts.length;

  return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.stepContent}>
          <Text style={styles.stepDescription}>Review your recurring transaction</Text>
          
          <GlassCard padding={20} marginVertical={12}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Type</Text>
              <View style={styles.summaryValueContainer}>
                {selectedNature && (
                  <View style={[styles.summaryBadge, { backgroundColor: selectedNature.color + '20' }]}>
                    <Ionicons name={selectedNature.icon as any} size={16} color={selectedNature.color} />
                    <Text style={[styles.summaryBadgeText, { color: selectedNature.color }]}>
                      {selectedNature.label}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Direction</Text>
              <Text style={styles.summaryValue}>
                {formData.direction === 'income' ? 'Income' : 'Expense'}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Title</Text>
              <Text style={styles.summaryValue}>{formData.title}</Text>
            </View>

            {formData.amount && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Amount</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrencyAmount(parseFloat(formData.amount) || 0, currency)}
                  {formData.amount_type === 'variable' && ' (variable)'}
                </Text>
              </View>
            )}

            {selectedCategory && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Category</Text>
                <Text style={styles.summaryValue}>{selectedCategory.name}</Text>
              </View>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Frequency</Text>
              <Text style={styles.summaryValue}>
                {formData.frequency === 'custom'
                  ? `Every ${formData.custom_frequency_number} ${formData.custom_frequency_unit}`
                  : FREQUENCY_LABELS[formData.frequency]}
              </Text>
            </View>

            {formData.start_date && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Start Date</Text>
                <Text style={styles.summaryValue}>
                  {formData.start_date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            )}

            {formData.end_date && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>End Date</Text>
                <Text style={styles.summaryValue}>
                  {formData.end_date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Account{accountCount > 1 ? 's' : ''}</Text>
              <View style={styles.summaryValueContainer}>
                {formData.all_accounts ? (
                  <Text style={styles.summaryValue}>All Accounts ({accountCount})</Text>
                ) : accountCount === 1 ? (
                  <Text style={styles.summaryValue}>{selectedAccounts[0]?.name}</Text>
                ) : accountCount > 1 ? (
                  <View>
                    <Text style={styles.summaryValue}>{accountCount} accounts selected:</Text>
                    {selectedAccounts.slice(0, 3).map((account) => (
                      <Text key={account.id} style={[styles.summaryValue, { fontSize: 12, marginTop: 4 }]}>
                        • {account.name}
                      </Text>
                    ))}
                    {accountCount > 3 && (
                      <Text style={[styles.summaryValue, { fontSize: 12, marginTop: 4, fontStyle: 'italic' }]}>
                        ...and {accountCount - 3} more
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          </GlassCard>

          <GlassCard padding={20} marginVertical={12}>
            <Text style={styles.previewTitle}>Preview</Text>
            <Text style={styles.previewText}>
              Will create {accountCount > 1 ? `${accountCount} bills (one per account)` : '1 bill'} with approximately {billCount} occurrences per bill from{' '}
              {formData.start_date
                ? formData.start_date.toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })
                : 'start date'}{' '}
              {formData.end_date
                ? `to ${formData.end_date.toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}`
                : 'indefinitely'}
              {'\n\n'}
              {accountCount > 1 && `Total: ${accountCount * billCount} bill occurrences across all accounts`}
            </Text>
          </GlassCard>
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
        <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{getStepTitle()}</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
              { width: `${(currentStep / 3) * 100}%` }
              ]} 
            />
          </View>
        <Text style={styles.progressText}>Step {currentStep} of 3</Text>
        </View>

          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}

        <View style={styles.footer}>
          <View style={styles.buttonContainer}>
            {currentStep > 1 && (
              <TouchableOpacity style={styles.secondaryButton} onPress={handlePrevious}>
                <Text style={styles.secondaryButtonText}>Previous</Text>
              </TouchableOpacity>
            )}
            
          {currentStep < 3 ? (
              <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                <Text style={styles.primaryButtonText}>Next</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.primaryButton, loading && styles.disabledButton]} 
                onPress={handleSubmit}
                disabled={loading}
              >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Create</Text>
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                </>
              )}
              </TouchableOpacity>
            )}
          </View>
        </View>

      {/* Date Pickers */}
      {showStartDatePicker && (
        <DateTimePicker
          value={formData.start_date || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowStartDatePicker(Platform.OS === 'ios');
            if (selectedDate && (Platform.OS === 'ios' || event.type === 'set')) {
              handleInputChange('start_date', selectedDate);
              if (Platform.OS === 'ios') {
                setShowStartDatePicker(false);
              }
            }
          }}
        />
      )}

      {showEndDatePicker && (
        <DateTimePicker
          value={formData.end_date || new Date()}
          mode="date"
          display="default"
          minimumDate={formData.start_date || undefined}
          onChange={(event, selectedDate) => {
            setShowEndDatePicker(Platform.OS === 'ios');
            if (selectedDate && (Platform.OS === 'ios' || event.type === 'set')) {
              handleInputChange('end_date', selectedDate);
              if (Platform.OS === 'ios') {
            setShowEndDatePicker(false);
              }
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: 'bold',
    color: '#000000',
  },
  placeholder: {
    width: 34,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#000000',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  stepContent: {
    padding: 20,
    paddingBottom: 20,
  },
  stepDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  optionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: '#FFFFFF',
  },
  optionButtonSelected: {
    borderColor: '#000000',
    borderWidth: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  optionButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  optionButtonTextSelected: {
    color: '#000000',
  },
  natureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderLeftWidth: 4,
    backgroundColor: '#FFFFFF',
  },
  natureCardSelected: {
    borderColor: '#000000',
    borderWidth: 2,
    borderLeftWidth: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  natureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  natureInfo: {
    flex: 1,
  },
  natureLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 4,
  },
  natureLabelSelected: {
    color: '#000000',
  },
  natureDescription: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingLeft: 16,
  },
  lockedField: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  unlockedField: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  currencySymbol: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  lockButton: {
    padding: 12,
  },
  helperText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 6,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  pickerButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  pickerContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 200,
  },
  pickerScroll: {
    maxHeight: 200,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  selectedPickerOption: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  pickerOptionInfo: {
    flex: 1,
  },
  pickerOptionName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 4,
  },
  selectedPickerOptionText: {
    color: '#000000',
  },
  pickerOptionDescription: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  doneButton: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  frequencyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: '#FFFFFF',
  },
  selectedFrequencyOption: {
    borderColor: '#000000',
    borderWidth: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  frequencyText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  selectedFrequencyText: {
    color: '#000000',
  },
  customFrequencyContainer: {
    marginTop: 12,
  },
  customFrequencyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  customFrequencyNumberInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  customFrequencyUnitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0, 0, 0, 0.1)',
  },
  customFrequencyUnitText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  intervalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingLeft: 16,
  },
  intervalInput: {
    minWidth: 60,
    paddingVertical: 16,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  intervalText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginLeft: 8,
  },
  dayOfMonthContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    maxHeight: 200,
  },
  dayOfMonthOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDayOfMonthOption: {
    borderColor: '#000000',
    borderWidth: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  dayOfMonthText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  selectedDayOfMonthText: {
    color: '#000000',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: '#FFFFFF',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  summaryValueContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  summaryBadgeText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  previewTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  previewText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    lineHeight: 20,
  },
});
