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
import { RecurringTransactionNature, RecurringAmountType } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';
import CategoryPicker from '@/components/CategoryPicker';
import InlineAccountSelector from '@/components/InlineAccountSelector';
import GlassCard from '@/components/GlassCard';
import { createRecurringTransaction, CreateRecurringTransactionData } from '@/utils/recurringTransactions';
import {
  RECURRING_TRANSACTION_TYPES,
  getAllRecurringTypeDefinitions,
} from '@/constants/recurringTransactionTypes';

type Direction = 'income' | 'expense';
type Frequency = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
type CustomFrequencyUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface FormData {
  direction: Direction;
  nature: RecurringTransactionNature | null;
  title: string;
  description: string;
  amount: string;
  amount_type: RecurringAmountType;
  category_id: string;
  account_id: string; // Required only for income types
  
  // Schedule
  frequency: Frequency;
  custom_unit: CustomFrequencyUnit;
  custom_interval: string;
  interval: string;
  start_date: Date | null;
  end_date: Date | null;
  date_of_occurrence: string; // Day of month for monthly, day of week for weekly
}

export default function AddRecurringTransactionModal() {
  const { user } = useAuth();
  const { categories, accounts, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  
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
    account_id: '',
    
    frequency: 'month',
    custom_unit: 'month',
    custom_interval: '1',
    interval: '1',
    start_date: null,
    end_date: null,
    date_of_occurrence: '',
  });

  // Apply defaults when nature is selected
  useEffect(() => {
    if (formData.nature) {
      const typeDef = RECURRING_TRANSACTION_TYPES[formData.nature];
      if (typeDef) {
        // Map old frequency to new frequency format
        const mapFrequency = (oldFreq: string): Frequency => {
          switch (oldFreq) {
            case 'daily': return 'day';
            case 'weekly': return 'week';
            case 'monthly': return 'month';
            case 'yearly': return 'year';
            default: return 'month';
          }
        };
        
        setFormData(prev => ({
          ...prev,
          direction: typeDef.defaultType,
          amount_type: typeDef.defaults.amount_type,
          frequency: mapFrequency(typeDef.defaults.frequency),
          interval: typeDef.defaults.interval.toString(),
        }));
      }
    }
  }, [formData.nature]);

  // Set date_of_occurrence when start_date changes for monthly/weekly frequencies
  useEffect(() => {
    if (formData.start_date) {
      if (formData.frequency === 'month' && !formData.date_of_occurrence) {
        // Set to day of month from start_date
        handleInputChange('date_of_occurrence', formData.start_date.getDate().toString());
      } else if (formData.frequency === 'week' && !formData.date_of_occurrence) {
        // Set to day of week from start_date (0 = Sunday, 1 = Monday, etc.)
        handleInputChange('date_of_occurrence', formData.start_date.getDay().toString());
      }
    }
  }, [formData.start_date, formData.frequency]);

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
      // Only require account for income types
      if (formData.direction === 'income' && !formData.account_id) {
        Alert.alert('Error', 'Please select an account for income transactions');
        return;
      }
    }
    
    if (currentStep === 2) {
      if (!formData.start_date) {
        Alert.alert('Error', 'Please select a start date');
        return;
      }
      if (formData.frequency === 'custom') {
        const num = parseInt(formData.custom_interval);
        if (isNaN(num) || num <= 0) {
          Alert.alert('Error', 'Please enter a valid custom interval');
          return;
        }
      }
      const intervalNum = parseInt(formData.interval);
      if (isNaN(intervalNum) || intervalNum <= 0) {
        Alert.alert('Error', 'Please enter a valid interval');
        return;
      }
      // Auto-set date_of_occurrence from start_date if not set
      if (formData.start_date) {
        if (formData.frequency === 'month' && !formData.date_of_occurrence) {
          handleInputChange('date_of_occurrence', formData.start_date.getDate().toString());
        }
        if (formData.frequency === 'week' && !formData.date_of_occurrence) {
          handleInputChange('date_of_occurrence', formData.start_date.getDay().toString());
        }
      }
      
      if (formData.frequency === 'month' && !formData.date_of_occurrence) {
        Alert.alert('Error', 'Please select a day of month');
        return;
      }
      if (formData.frequency === 'week' && !formData.date_of_occurrence) {
        Alert.alert('Error', 'Please select a day of week');
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

    // Validate amount for fixed transactions
    if (formData.amount_type === 'fixed' && (!formData.amount || parseFloat(formData.amount) <= 0)) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Validate account for income types only
    if (formData.direction === 'income' && !formData.account_id) {
      Alert.alert('Error', 'Please select an account for income transactions');
      return;
    }

    setLoading(true);

    try {
      const natureDef = RECURRING_TRANSACTION_TYPES[formData.nature];
      const amountValue = formData.amount ? parseFloat(formData.amount) : undefined;
      const estimatedAmount = formData.amount_type === 'variable' ? amountValue : undefined;
      
      // Map date_of_occurrence based on frequency
      // Auto-set from start_date if not explicitly set
      let finalDateOfOccurrence = formData.date_of_occurrence;
      if (!finalDateOfOccurrence && formData.start_date) {
        if (formData.frequency === 'month') {
          finalDateOfOccurrence = formData.start_date.getDate().toString();
        } else if (formData.frequency === 'week') {
          finalDateOfOccurrence = formData.start_date.getDay().toString();
        }
      }
      
      let dateOfOccurrence: number | undefined;
      if (formData.frequency === 'month' && finalDateOfOccurrence) {
        dateOfOccurrence = parseInt(finalDateOfOccurrence);
      } else if (formData.frequency === 'week' && finalDateOfOccurrence) {
        dateOfOccurrence = parseInt(finalDateOfOccurrence); // 0 = Sunday, 1 = Monday, etc.
      } else if (formData.frequency === 'quarter' && formData.start_date) {
        // For quarterly, use the day of month from start_date
        dateOfOccurrence = formData.start_date.getDate();
      } else if (formData.frequency === 'year' && formData.start_date) {
        // For yearly, use the day of month from start_date
        dateOfOccurrence = formData.start_date.getDate();
      }

      // Prepare recurring transaction data
      const transactionData: CreateRecurringTransactionData = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        category_id: formData.category_id || undefined,
        direction: formData.direction,
        amount: amountValue,
        amount_type: formData.amount_type,
        estimated_amount: estimatedAmount,
        currency: currency,
        frequency: formData.frequency,
        interval: parseInt(formData.interval) || 1,
        start_date: formData.start_date.toISOString().split('T')[0],
        end_date: formData.end_date ? formData.end_date.toISOString().split('T')[0] : undefined,
        date_of_occurrence: dateOfOccurrence,
        custom_unit: formData.frequency === 'custom' ? formData.custom_unit : undefined,
        custom_interval: formData.frequency === 'custom' ? parseInt(formData.custom_interval) || 1 : undefined,
        account_id: formData.direction === 'income' ? formData.account_id : undefined, // Required for income, optional for expenses
        fund_type: 'personal',
        nature: formData.nature,
        is_subscription: formData.nature === 'subscription',
        subscription_provider: formData.nature === 'subscription' ? formData.title.trim() : undefined,
        subscription_start_date: formData.start_date.toISOString().split('T')[0],
        auto_create: true,
        auto_create_days_before: 3,
        remind_before: true,
        reminder_days: [7, 3, 1],
        color: natureDef?.color || '#F59E0B',
        icon: natureDef?.icon || 'repeat',
        notes: formData.description.trim() || undefined,
        metadata: {
          original_modal: 'add-recurring-transaction',
        },
      };

      await createRecurringTransaction(transactionData);
      
      await globalRefresh();
      
      Alert.alert('Success', 'Recurring transaction created successfully!');
      
      // Reset form and go back
      setFormData({
        direction: 'expense',
        nature: null,
        title: '',
        description: '',
        amount: '',
        amount_type: 'fixed',
        category_id: '',
        account_id: '',
        frequency: 'month',
        custom_unit: 'month',
        custom_interval: '1',
        interval: '1',
        start_date: null,
        end_date: null,
        date_of_occurrence: '',
      });
      setCurrentStep(1);
      
      router.back();
    } catch (error: any) {
      console.error('Error creating recurring transaction:', error);
      Alert.alert('Error', error.message || 'Failed to create recurring transaction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Basics';
      case 2: return 'Schedule';
      case 3: return 'Review & Create';
      default: return 'Create Recurring Transaction';
    }
  };

  const natureTypes = getAllRecurringTypeDefinitions();

  // Map frequency labels
  const frequencyLabels: Record<Frequency, string> = {
    day: 'Daily',
    week: 'Weekly',
    month: 'Monthly',
    quarter: 'Quarterly',
    year: 'Yearly',
    custom: 'Custom',
  };

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

        {/* Account Selection - Only for Income */}
        {formData.direction === 'income' && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Account *</Text>
            <InlineAccountSelector
              accounts={accounts.filter(acc => acc.type !== 'liability' && acc.type !== 'goals_savings')}
              selectedAccountId={formData.account_id || null}
              onSelect={(account) => handleInputChange('account_id', account.id)}
              label="Select Account"
              showBalance={true}
            />
          </View>
        )}

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

      </View>
    </ScrollView>
  );

  // Render Step 2: Schedule
  const renderStep2 = () => {
    const frequencyOptions: Frequency[] = ['day', 'week', 'month', 'quarter', 'year', 'custom'];
    
    return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.stepContent}>
          <Text style={styles.stepDescription}>Set frequency and schedule</Text>
          
          {/* Frequency */}
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
                    {frequencyLabels[freq]}
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
                    placeholder="1"
                    placeholderTextColor="rgba(0, 0, 0, 0.4)"
                    keyboardType="numeric"
                    value={formData.custom_interval}
                    onChangeText={(value) => handleInputChange('custom_interval', value)}
                    onFocus={() => setFrequencyLocked(false)}
                    onBlur={() => setFrequencyLocked(true)}
                  />
                  <TouchableOpacity
                    style={styles.customFrequencyUnitButton}
                    onPress={() => {
                      const units: CustomFrequencyUnit[] = ['day', 'week', 'month', 'quarter', 'year'];
                      const currentIndex = units.indexOf(formData.custom_unit);
                      const nextIndex = (currentIndex + 1) % units.length;
                      handleInputChange('custom_unit', units[nextIndex]);
                    }}
                  >
                    <Text style={styles.customFrequencyUnitText}>
                      {formData.custom_unit.charAt(0).toUpperCase() + formData.custom_unit.slice(1)}
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

          {/* Interval */}
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
                  ? formData.custom_unit + '(s)'
                  : formData.frequency === 'day' ? 'day(s)'
                  : formData.frequency === 'week' ? 'week(s)'
                  : formData.frequency === 'month' ? 'month(s)'
                  : formData.frequency === 'quarter' ? 'quarter(s)'
                  : formData.frequency === 'year' ? 'year(s)'
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
          {formData.frequency === 'month' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Day of Month *</Text>
              <View style={styles.dayOfMonthContainer}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dayOfMonthOption,
                      formData.date_of_occurrence === day.toString() && styles.selectedDayOfMonthOption,
                    ]}
                    onPress={() => handleInputChange('date_of_occurrence', day.toString())}
                  >
                    <Text style={[
                      styles.dayOfMonthText,
                      formData.date_of_occurrence === day.toString() && styles.selectedDayOfMonthText
                    ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Day of Week (for weekly) */}
          {formData.frequency === 'week' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Day of Week *</Text>
              <View style={styles.dayOfWeekContainer}>
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dayOfWeekOption,
                      formData.date_of_occurrence === index.toString() && styles.selectedDayOfWeekOption,
                    ]}
                    onPress={() => handleInputChange('date_of_occurrence', index.toString())}
                  >
                    <Text style={[
                      styles.dayOfWeekText,
                      formData.date_of_occurrence === index.toString() && styles.selectedDayOfWeekText
                    ]}>
                      {day.substring(0, 3)}
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
                Recurrence will end on this date
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    );
  };

  // Render Step 3: Review & Create
  const renderStep3 = () => {
    const selectedNature = formData.nature ? RECURRING_TRANSACTION_TYPES[formData.nature] : null;
    const selectedCategory = categories.find(c => c.id === formData.category_id);

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

            {formData.direction === 'income' && formData.account_id && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Account</Text>
                <Text style={styles.summaryValue}>
                  {accounts.find(acc => acc.id === formData.account_id)?.name || 'Selected'}
                </Text>
              </View>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Frequency</Text>
              <Text style={styles.summaryValue}>
                {formData.frequency === 'custom'
                  ? `Every ${formData.custom_interval} ${formData.custom_unit}(s)`
                  : frequencyLabels[formData.frequency]}
                {' every '}
                {formData.interval}
                {' '}
                {formData.frequency === 'custom' ? formData.custom_unit : formData.frequency}
                {parseInt(formData.interval) > 1 ? 's' : ''}
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

// Reuse styles from add-bill.tsx
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
  dayOfWeekContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayOfWeekOption: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDayOfWeekOption: {
    borderColor: '#000000',
    borderWidth: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  dayOfWeekText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  selectedDayOfWeekText: {
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
});

