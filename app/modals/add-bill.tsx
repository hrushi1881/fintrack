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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useSettings } from '../../contexts/SettingsContext';
import { Bill } from '../../types';
import { createBill } from '../../utils/bills';
import { formatCurrencyAmount } from '../../utils/currency';
import CategoryPicker from '../../components/CategoryPicker';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function AddBillModal() {
  const { categories, accounts, goals } = useRealtimeData();
  const { currency } = useSettings();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'due_date' | 'end_date'>('due_date');
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amount: '',
    currency: currency,
    category_id: '',
    bill_type: 'one_time' as Bill['bill_type'],
    recurrence_pattern: 'monthly' as Bill['recurrence_pattern'],
    recurrence_interval: 1,
    due_date: '',
    next_due_date: '',
    recurrence_end_date: '',
    goal_id: '',
    linked_account_id: '',
    color: '#F59E0B',
    icon: 'receipt',
    reminder_days: [1, 3, 7],
    notes: '',
  });

  const billTypes = [
    { key: 'one_time', label: 'One-time Bill', description: 'Paid once, no recurrence', icon: 'receipt' },
    { key: 'recurring_fixed', label: 'Recurring Fixed', description: 'Same amount every cycle', icon: 'repeat' },
    { key: 'recurring_variable', label: 'Recurring Variable', description: 'Due every cycle, amount changes', icon: 'trending-up' },
    { key: 'goal_linked', label: 'Goal-linked Bill', description: 'Connected to a savings goal', icon: 'flag' },
  ];

  const recurrencePatterns = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
  ];

  const colors = [
    '#F59E0B', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#F97316',
    '#84CC16', '#06B6D4', '#EC4899', '#6366F1', '#14B8A6', '#F43F5E'
  ];

  const icons = [
    'receipt', 'flash', 'home', 'car', 'phone', 'wifi', 'card', 'medical',
    'school', 'restaurant', 'shirt', 'game-controller', 'fitness', 'book'
  ];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep === 1 && !formData.title.trim()) {
      Alert.alert('Error', 'Please enter a bill title');
      return;
    }
    if (currentStep === 2 && !formData.amount.trim() && formData.bill_type !== 'recurring_variable') {
      Alert.alert('Error', 'Please enter an amount');
      return;
    }
    if (currentStep === 3 && !formData.due_date) {
      Alert.alert('Error', 'Please select a due date');
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      const billData = {
        ...formData,
        amount: formData.amount ? parseFloat(formData.amount) : null,
        recurrence_interval: parseInt(formData.recurrence_interval.toString()),
        reminder_days: formData.reminder_days,
        category_id: formData.category_id || null,
        goal_id: formData.goal_id || null,
        linked_account_id: formData.linked_account_id || null,
        recurrence_end_date: formData.recurrence_end_date || null,
        metadata: {},
        is_active: true,
        is_deleted: false,
      };

      await createBill(billData);
      router.back();
    } catch (error) {
      console.error('Error creating bill:', error);
      Alert.alert('Error', 'Failed to create bill. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Bill Type & Basic Info';
      case 2: return 'Amount & Category';
      case 3: return 'Due Date & Recurrence';
      case 4: return 'Additional Settings';
      default: return 'Add Bill';
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>Choose the type of bill you want to add</Text>
      
      {billTypes.map((type) => (
        <TouchableOpacity
          key={type.key}
          style={[
            styles.billTypeCard,
            formData.bill_type === type.key && styles.selectedBillTypeCard
          ]}
          onPress={() => handleInputChange('bill_type', type.key)}
        >
          <View style={styles.billTypeIcon}>
            <Ionicons 
              name={type.icon as any} 
              size={24} 
              color={formData.bill_type === type.key ? '#10B981' : '#6B7280'} 
            />
          </View>
          <View style={styles.billTypeInfo}>
            <Text style={[
              styles.billTypeLabel,
              formData.bill_type === type.key && styles.selectedBillTypeLabel
            ]}>
              {type.label}
            </Text>
            <Text style={styles.billTypeDescription}>{type.description}</Text>
          </View>
          {formData.bill_type === type.key && (
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
          )}
        </TouchableOpacity>
      ))}

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Bill Title *</Text>
        <TextInput
          style={styles.textInput}
          value={formData.title}
          onChangeText={(value) => handleInputChange('title', value)}
          placeholder="e.g., Electricity Bill"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Description (Optional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={formData.description}
          onChangeText={(value) => handleInputChange('description', value)}
          placeholder="Add a description..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>Set the amount and categorize your bill</Text>
      
      {formData.bill_type !== 'recurring_variable' && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Amount *</Text>
          <View style={styles.amountInputContainer}>
            <Text style={styles.currencySymbol}>{formatCurrencyAmount(0, currency).charAt(0)}</Text>
            <TextInput
              style={styles.amountInput}
              value={formData.amount}
              onChangeText={(value) => handleInputChange('amount', value)}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />
          </View>
        </View>
      )}

      {formData.bill_type === 'recurring_variable' && (
        <View style={styles.variableAmountInfo}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={styles.variableAmountText}>
            Variable amount bills don't require a fixed amount. You can enter the amount when marking as paid.
          </Text>
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Category</Text>
        <CategoryPicker
          selectedCategoryId={formData.category_id}
          onCategorySelect={(category) => handleInputChange('category_id', category?.id)}
          activityType="bill"
          placeholder="Select a category"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Icon & Color</Text>
        <View style={styles.iconColorContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScroll}>
            {icons.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={[
                  styles.iconOption,
                  formData.icon === icon && styles.selectedIconOption
                ]}
                onPress={() => handleInputChange('icon', icon)}
              >
                <Ionicons 
                  name={icon as any} 
                  size={20} 
                  color={formData.icon === icon ? 'white' : '#6B7280'} 
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScroll}>
            {colors.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  formData.color === color && styles.selectedColorOption
                ]}
                onPress={() => handleInputChange('color', color)}
              >
                {formData.color === color && (
                  <Ionicons name="checkmark" size={16} color="white" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>Set due date and recurrence pattern</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Due Date *</Text>
        <TouchableOpacity 
          style={styles.dateButton}
          onPress={() => {
            setDatePickerMode('due_date');
            setShowDatePicker(true);
          }}
        >
          <Text style={styles.dateButtonText}>
            {formData.due_date ? new Date(formData.due_date).toLocaleDateString() : 'Select Date'}
          </Text>
          <Ionicons name="calendar" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {formData.bill_type !== 'one_time' && (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Recurrence Pattern</Text>
            <View style={styles.recurrenceContainer}>
              {recurrencePatterns.map((pattern) => (
                <TouchableOpacity
                  key={pattern.key}
                  style={[
                    styles.recurrenceOption,
                    formData.recurrence_pattern === pattern.key && styles.selectedRecurrenceOption
                  ]}
                  onPress={() => handleInputChange('recurrence_pattern', pattern.key)}
                >
                  <Text style={[
                    styles.recurrenceText,
                    formData.recurrence_pattern === pattern.key && styles.selectedRecurrenceText
                  ]}>
                    {pattern.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Every</Text>
            <View style={styles.intervalContainer}>
              <TextInput
                style={styles.intervalInput}
                value={formData.recurrence_interval.toString()}
                onChangeText={(value) => handleInputChange('recurrence_interval', parseInt(value) || 1)}
                keyboardType="numeric"
              />
              <Text style={styles.intervalText}>
                {formData.recurrence_pattern}(s)
              </Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>End Date (Optional)</Text>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => {
                setDatePickerMode('end_date');
                setShowEndDatePicker(true);
              }}
            >
              <Text style={styles.dateButtonText}>
                {formData.recurrence_end_date ? new Date(formData.recurrence_end_date).toLocaleDateString() : 'No end date'}
              </Text>
              <Ionicons name="calendar" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>Configure additional settings and reminders</Text>
      
      {formData.bill_type === 'goal_linked' && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Linked Goal</Text>
          <TouchableOpacity 
            style={styles.pickerButton}
            onPress={() => setShowGoalPicker(!showGoalPicker)}
          >
            <Text style={styles.pickerButtonText}>
              {formData.goal_id ? goals.find(g => g.id === formData.goal_id)?.title : 'Select Goal'}
            </Text>
            <Ionicons name={showGoalPicker ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
          </TouchableOpacity>
          
          {showGoalPicker && (
            <View style={styles.pickerContainer}>
              <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                {goals.map((goal) => (
                  <TouchableOpacity
                    key={goal.id}
                    style={[
                      styles.pickerOption,
                      formData.goal_id === goal.id && styles.selectedPickerOption
                    ]}
                    onPress={() => {
                      handleInputChange('goal_id', goal.id);
                      setShowGoalPicker(false);
                    }}
                  >
                    <View style={styles.pickerOptionInfo}>
                      <Text style={[
                        styles.pickerOptionName,
                        formData.goal_id === goal.id && styles.selectedPickerOptionText
                      ]}>
                        {goal.title}
                      </Text>
                      <Text style={[
                        styles.pickerOptionDescription,
                        formData.goal_id === goal.id && styles.selectedPickerOptionText
                      ]}>
                        {formatCurrencyAmount(goal.current_amount, currency)} / {formatCurrencyAmount(goal.target_amount, currency)}
                      </Text>
                    </View>
                    {formData.goal_id === goal.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Linked Account (Optional)</Text>
        <TouchableOpacity 
          style={styles.pickerButton}
          onPress={() => setShowAccountPicker(!showAccountPicker)}
        >
          <Text style={styles.pickerButtonText}>
            {formData.linked_account_id ? accounts.find(a => a.id === formData.linked_account_id)?.name : 'Select account'}
          </Text>
          <Ionicons name={showAccountPicker ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
        </TouchableOpacity>
        
        {showAccountPicker && (
          <View style={styles.pickerContainer}>
            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  styles.pickerOption,
                  !formData.linked_account_id && styles.selectedPickerOption
                ]}
                onPress={() => {
                  handleInputChange('linked_account_id', '');
                  setShowAccountPicker(false);
                }}
              >
                <View style={styles.pickerOptionInfo}>
                  <Text style={[
                    styles.pickerOptionName,
                    !formData.linked_account_id && styles.selectedPickerOptionText
                  ]}>
                    No account linked
                  </Text>
                </View>
                {!formData.linked_account_id && (
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                )}
              </TouchableOpacity>
              {accounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[
                    styles.pickerOption,
                    formData.linked_account_id === account.id && styles.selectedPickerOption
                  ]}
                  onPress={() => {
                    handleInputChange('linked_account_id', account.id);
                    setShowAccountPicker(false);
                  }}
                >
                  <View style={styles.pickerOptionInfo}>
                    <Text style={[
                      styles.pickerOptionName,
                      formData.linked_account_id === account.id && styles.selectedPickerOptionText
                    ]}>
                      {account.name}
                    </Text>
                    <Text style={[
                      styles.pickerOptionDescription,
                      formData.linked_account_id === account.id && styles.selectedPickerOptionText
                    ]}>
                      {formatCurrencyAmount(account.balance, currency)}
                    </Text>
                  </View>
                  {formData.linked_account_id === account.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Reminder Days</Text>
        <Text style={styles.reminderDescription}>Get notified before the due date</Text>
        <View style={styles.reminderContainer}>
          {[1, 3, 7, 14, 30].map((day) => (
            <TouchableOpacity
              key={day}
              style={[
                styles.reminderOption,
                formData.reminder_days.includes(day) && styles.selectedReminderOption
              ]}
              onPress={() => {
                const newDays = formData.reminder_days.includes(day)
                  ? formData.reminder_days.filter(d => d !== day)
                  : [...formData.reminder_days, day];
                handleInputChange('reminder_days', newDays);
              }}
            >
              <Text style={[
                styles.reminderText,
                formData.reminder_days.includes(day) && styles.selectedReminderText
              ]}>
                {day}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Notes (Optional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={formData.notes}
          onChangeText={(value) => handleInputChange('notes', value)}
          placeholder="Add any additional notes..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
  );

  return (
    <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{getStepTitle()}</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${(currentStep / 4) * 100}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>Step {currentStep} of 4</Text>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.buttonContainer}>
            {currentStep > 1 && (
              <TouchableOpacity style={styles.secondaryButton} onPress={handlePrevious}>
                <Text style={styles.secondaryButtonText}>Previous</Text>
              </TouchableOpacity>
            )}
            
            {currentStep < 4 ? (
              <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                <Text style={styles.primaryButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={20} color="white" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.primaryButton, loading && styles.disabledButton]} 
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Creating...' : 'Create Bill'}
                </Text>
                <Ionicons name="checkmark" size={20} color="white" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Date Picker for Due Date */}
      {showDatePicker && (
        <DateTimePicker
          value={formData.due_date ? new Date(formData.due_date) : new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              handleInputChange('due_date', selectedDate.toISOString().split('T')[0]);
            }
          }}
        />
      )}

      {/* Date Picker for End Date */}
      {showEndDatePicker && (
        <DateTimePicker
          value={formData.recurrence_end_date ? new Date(formData.recurrence_end_date) : new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowEndDatePicker(false);
            if (selectedDate) {
              handleInputChange('recurrence_end_date', selectedDate.toISOString().split('T')[0]);
            }
          }}
        />
      )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  headerTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
  placeholder: {
    width: 48,
  },
  progressContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  progressText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContent: {
    paddingBottom: 20,
  },
  stepDescription: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  billTypeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedBillTypeCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  billTypeIcon: {
    marginRight: 12,
  },
  billTypeInfo: {
    flex: 1,
  },
  billTypeLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  selectedBillTypeLabel: {
    color: '#10B981',
  },
  billTypeDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
    paddingVertical: 16,
  },
  variableAmountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  variableAmountText: {
    color: '#3B82F6',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  iconColorContainer: {
    gap: 16,
  },
  iconScroll: {
    maxHeight: 60,
  },
  iconOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  selectedIconOption: {
    backgroundColor: '#10B981',
  },
  colorScroll: {
    maxHeight: 40,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedColorOption: {
    borderWidth: 2,
    borderColor: 'white',
  },
  dateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonText: {
    color: 'white',
    fontSize: 16,
  },
  recurrenceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recurrenceOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectedRecurrenceOption: {
    backgroundColor: '#10B981',
  },
  recurrenceText: {
    color: 'white',
    fontSize: 14,
  },
  selectedRecurrenceText: {
    color: 'white',
    fontWeight: '600',
  },
  intervalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  intervalInput: {
    color: 'white',
    fontSize: 16,
    paddingVertical: 16,
    minWidth: 60,
  },
  intervalText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginLeft: 8,
  },
  pickerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerButtonText: {
    color: 'white',
    fontSize: 16,
  },
  reminderDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 12,
  },
  reminderContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reminderOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectedReminderOption: {
    backgroundColor: '#10B981',
  },
  reminderText: {
    color: 'white',
    fontSize: 14,
  },
  selectedReminderText: {
    color: 'white',
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  pickerContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedPickerOption: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  pickerOptionInfo: {
    flex: 1,
  },
  pickerOptionName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  selectedPickerOptionText: {
    color: '#10B981',
  },
  pickerOptionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
});
