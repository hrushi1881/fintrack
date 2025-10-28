import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { createBudget } from '@/utils/budgets';
import CalendarDatePicker from '@/components/CalendarDatePicker';
import { formatCurrencyAmount } from '@/utils/currency';
import { supabase } from '@/lib/supabase';

interface AddBudgetModalProps {
  visible: boolean;
  onClose: () => void;
}

const BUDGET_TYPES = [
  {
    id: 'monthly',
    title: 'Monthly Budget',
    description: 'Track total spending across all categories',
    icon: 'calendar-outline',
    color: '#3B82F6',
  },
  {
    id: 'category',
    title: 'Category Budget',
    description: 'Set spending limits for specific categories',
    icon: 'pricetag-outline',
    color: '#8B5CF6',
  },
  {
    id: 'goal_based',
    title: 'Goal-Based Budget',
    description: 'Link budget to your savings goals',
    icon: 'flag-outline',
    color: '#F59E0B',
  },
  {
    id: 'smart',
    title: 'Smart Budget',
    description: 'AI-powered spending recommendations',
    icon: 'bulb-outline',
    color: '#10B981',
    disabled: true,
  },
];

const RECURRENCE_OPTIONS = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'custom', label: 'Custom' },
];

export const AddBudgetModal: React.FC<AddBudgetModalProps> = ({ visible, onClose }) => {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { showNotification } = useNotification();
  const { accounts, goals, globalRefresh } = useRealtimeData();

  const [step, setStep] = useState(1);
  const [budgetType, setBudgetType] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    recurrencePattern: 'monthly',
    rolloverEnabled: false,
    categoryId: '',
    goalId: '',
    goalSubtype: '',
    accountIds: [] as string[],
    alertThresholds: [50, 80, 100],
    dailyPaceEnabled: true,
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'start' | 'end'>('start');
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);

  // Fetch categories when modal opens
  useEffect(() => {
    if (visible && user) {
      fetchCategories();
    }
  }, [visible, user]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user?.id)
        .contains('activity_types', ['expense', 'budget'])
        .eq('is_deleted', false)
        .order('name');

      if (error) {
        console.error('Error fetching categories:', error);
        return;
      }

      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleReset = () => {
    setStep(1);
    setBudgetType('');
    setFormData({
      name: '',
      amount: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      recurrencePattern: 'monthly',
      rolloverEnabled: false,
      categoryId: '',
      goalId: '',
      goalSubtype: '',
      accountIds: [],
      alertThresholds: [50, 80, 100],
      dailyPaceEnabled: true,
    });
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleDateSelect = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    if (datePickerType === 'start') {
      setFormData(prev => ({ ...prev, startDate: dateString }));
    } else {
      setFormData(prev => ({ ...prev, endDate: dateString }));
    }
    setShowDatePicker(false);
  };

  const handleAccountToggle = (accountId: string) => {
    setFormData(prev => ({
      ...prev,
      accountIds: prev.accountIds.includes(accountId)
        ? prev.accountIds.filter(id => id !== accountId)
        : [...prev.accountIds, accountId]
    }));
  };

  const handleSubmit = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await createBudget({
        user_id: user.id,
        name: formData.name,
        amount: parseFloat(formData.amount),
        currency,
        budget_type: budgetType as any,
        start_date: formData.startDate,
        end_date: formData.endDate,
        recurrence_pattern: formData.recurrencePattern as any,
        rollover_enabled: formData.rolloverEnabled,
        category_id: formData.categoryId || undefined,
        goal_id: formData.goalId || undefined,
        metadata: {
          goal_subtype: formData.goalSubtype || undefined,
        },
        alert_settings: {
          thresholds: formData.alertThresholds,
          channels: ['in_app'],
          daily_pace_enabled: formData.dailyPaceEnabled,
        },
        account_ids: formData.accountIds,
      });

      // Global refresh to update all data
      await globalRefresh();
      
      showNotification({
        type: 'success',
        title: 'Budget Created',
        description: `${formData.name} budget has been created successfully`,
      });

      handleClose();
    } catch (error) {
      console.error('Error creating budget:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: 'Failed to create budget. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Choose Budget Type</Text>
      <Text style={styles.stepDescription}>
        Select the type of budget you want to create
      </Text>

      <View style={styles.typeGrid}>
        {BUDGET_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.typeCard,
              type.disabled && styles.disabledCard,
            ]}
            onPress={() => !type.disabled && setBudgetType(type.id)}
            disabled={type.disabled}
          >
            <View style={[styles.typeIcon, { backgroundColor: type.color }]}>
              <Ionicons name={type.icon as any} size={24} color="white" />
            </View>
            <Text style={[styles.typeTitle, type.disabled && styles.disabledText]}>
              {type.title}
            </Text>
            <Text style={[styles.typeDescription, type.disabled && styles.disabledText]}>
              {type.description}
            </Text>
            {type.disabled && (
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Budget Details</Text>
      <Text style={styles.stepDescription}>
        Configure your budget settings
      </Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Budget Name</Text>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
          placeholder="e.g., Monthly Food Budget"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Budget Amount</Text>
        <TextInput
          style={styles.input}
          value={formData.amount}
          onChangeText={(text) => setFormData(prev => ({ ...prev, amount: text }))}
          placeholder="0"
          keyboardType="numeric"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={styles.dateRow}>
        <View style={styles.dateInput}>
          <Text style={styles.label}>Start Date</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => {
              setDatePickerType('start');
              setShowDatePicker(true);
            }}
          >
            <Text style={styles.dateText}>{formData.startDate}</Text>
            <Ionicons name="calendar-outline" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={styles.dateInput}>
          <Text style={styles.label}>End Date</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => {
              setDatePickerType('end');
              setShowDatePicker(true);
            }}
          >
            <Text style={styles.dateText}>{formData.endDate || 'Select date'}</Text>
            <Ionicons name="calendar-outline" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>

      {budgetType === 'category' && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.categoryList}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryCard,
                    formData.categoryId === category.id && styles.selectedCategoryCard,
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, categoryId: category.id }))}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
                    <Ionicons name={category.icon as any} size={20} color="white" />
                  </View>
                  <Text style={styles.categoryName}>{category.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {budgetType === 'goal_based' && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Linked Goal</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.goalList}>
              {goals.map((goal) => (
                <TouchableOpacity
                  key={goal.id}
                  style={[
                    styles.goalCard,
                    formData.goalId === goal.id && styles.selectedGoalCard,
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, goalId: goal.id }))}
                >
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  <Text style={styles.goalAmount}>
                    {formatCurrencyAmount(goal.target_amount, currency)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {budgetType === 'goal_based' && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Goal Subtype</Text>
          <View style={styles.subtypeContainer}>
            <TouchableOpacity
              style={[
                styles.subtypeOption,
                formData.goalSubtype === 'A' && styles.selectedSubtype,
              ]}
              onPress={() => setFormData(prev => ({ ...prev, goalSubtype: 'A' }))}
            >
              <Text style={styles.subtypeTitle}>Type A</Text>
              <Text style={styles.subtypeDescription}>Save X% of deposits until date</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.subtypeOption,
                formData.goalSubtype === 'B' && styles.selectedSubtype,
              ]}
              onPress={() => setFormData(prev => ({ ...prev, goalSubtype: 'B' }))}
            >
              <Text style={styles.subtypeTitle}>Type B</Text>
              <Text style={styles.subtypeDescription}>Save fixed amount monthly until date</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.subtypeOption,
                formData.goalSubtype === 'C' && styles.selectedSubtype,
              ]}
              onPress={() => setFormData(prev => ({ ...prev, goalSubtype: 'C' }))}
            >
              <Text style={styles.subtypeTitle}>Type C</Text>
              <Text style={styles.subtypeDescription}>Reach target by date, system calculates monthly</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Account Selection</Text>
      <Text style={styles.stepDescription}>
        Choose which accounts to include in this budget
      </Text>

      <View style={styles.accountList}>
        {accounts.map((account) => (
          <TouchableOpacity
            key={account.id}
            style={[
              styles.accountCard,
              formData.accountIds.includes(account.id) && styles.selectedAccountCard,
            ]}
            onPress={() => handleAccountToggle(account.id)}
          >
            <View style={styles.accountInfo}>
              <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                <Ionicons name={account.icon as any} size={20} color="white" />
              </View>
              <View style={styles.accountDetails}>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountBalance}>
                  {formatCurrencyAmount(account.balance, currency)}
                </Text>
              </View>
            </View>
            {formData.accountIds.includes(account.id) && (
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Alert Settings</Text>
      <Text style={styles.stepDescription}>
        Configure when you want to be notified
      </Text>

      <View style={styles.alertSection}>
        <Text style={styles.sectionTitle}>Spending Thresholds</Text>
        <View style={styles.thresholdList}>
          {[50, 80, 100].map((threshold) => (
            <View key={threshold} style={styles.thresholdItem}>
              <Text style={styles.thresholdLabel}>{threshold}% spent</Text>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  formData.alertThresholds.includes(threshold) && styles.toggleActive,
                ]}
                onPress={() => {
                  const newThresholds = formData.alertThresholds.includes(threshold)
                    ? formData.alertThresholds.filter(t => t !== threshold)
                    : [...formData.alertThresholds, threshold];
                  setFormData(prev => ({ ...prev, alertThresholds: newThresholds }));
                }}
              >
                <View style={[
                  styles.toggleThumb,
                  formData.alertThresholds.includes(threshold) && styles.toggleThumbActive,
                ]} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.alertSection}>
        <View style={styles.thresholdItem}>
          <Text style={styles.thresholdLabel}>Daily pace warnings</Text>
          <TouchableOpacity
            style={[
              styles.toggle,
              formData.dailyPaceEnabled && styles.toggleActive,
            ]}
            onPress={() => setFormData(prev => ({ ...prev, dailyPaceEnabled: !prev.dailyPaceEnabled }))}
          >
            <View style={[
              styles.toggleThumb,
              formData.dailyPaceEnabled && styles.toggleThumbActive,
            ]} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Review & Create</Text>
      <Text style={styles.stepDescription}>
        Review your budget settings before creating
      </Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Name</Text>
          <Text style={styles.summaryValue}>{formData.name}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Amount</Text>
          <Text style={styles.summaryValue}>
            {formatCurrencyAmount(parseFloat(formData.amount) || 0, currency)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Period</Text>
          <Text style={styles.summaryValue}>
            {formData.startDate} to {formData.endDate}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Accounts</Text>
          <Text style={styles.summaryValue}>{formData.accountIds.length} selected</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Alerts</Text>
          <Text style={styles.summaryValue}>
            {formData.alertThresholds.join(', ')}%
          </Text>
        </View>
      </View>
    </View>
  );

  const canProceed = () => {
    switch (step) {
      case 1:
        return budgetType !== '';
      case 2:
        const basicValidation = formData.name.trim() !== '' && formData.amount !== '' && formData.endDate !== '';
        
        // Type-specific validation
        if (budgetType === 'category' && !formData.categoryId) {
          return false;
        }
        if (budgetType === 'goal_based') {
          if (!formData.goalId || !formData.goalSubtype) {
            return false;
          }
        }
        
        return basicValidation;
      case 3:
        return formData.accountIds.length > 0;
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Budget</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / 5) * 100}%` }]} />
        </View>

        <ScrollView style={styles.content}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </ScrollView>

        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(step - 1)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.nextButton,
              !canProceed() && styles.nextButtonDisabled,
            ]}
            onPress={() => {
              if (step < 5) {
                setStep(step + 1);
              } else {
                handleSubmit();
              }
            }}
            disabled={!canProceed() || loading}
          >
            <Text style={[
              styles.nextButtonText,
              !canProceed() && styles.nextButtonTextDisabled,
            ]}>
              {step === 5 ? (loading ? 'Creating...' : 'Create Budget') : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>

        <CalendarDatePicker
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onDateSelect={handleDateSelect}
          minDate={new Date()}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerRight: {
    width: 24,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContainer: {
    paddingVertical: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  disabledCard: {
    opacity: 0.6,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  disabledText: {
    color: '#9CA3AF',
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
  },
  dateButton: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 16,
    color: '#1F2937',
  },
  categoryList: {
    flexDirection: 'row',
    gap: 12,
  },
  goalList: {
    flexDirection: 'row',
    gap: 12,
  },
  goalCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    minWidth: 120,
  },
  selectedGoalCard: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  goalAmount: {
    fontSize: 12,
    color: '#6B7280',
  },
  accountList: {
    gap: 12,
  },
  accountCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedAccountCard: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  accountBalance: {
    fontSize: 14,
    color: '#6B7280',
  },
  alertSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  thresholdList: {
    gap: 12,
  },
  thresholdItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  thresholdLabel: {
    fontSize: 16,
    color: '#1F2937',
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: '#10B981',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  backButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  nextButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  nextButtonTextDisabled: {
    color: '#9CA3AF',
  },
  placeholderText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  categoryCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCategoryCard: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  subtypeContainer: {
    gap: 12,
  },
  subtypeOption: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedSubtype: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  subtypeTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtypeDescription: {
    color: '#9CA3AF',
    fontSize: 14,
  },
});
