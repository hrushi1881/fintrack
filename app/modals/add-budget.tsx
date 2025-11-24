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
    description: 'General control over total spending in a fixed month',
    focus: 'General control',
    timeFrame: 'Month-based',
    trigger: 'Expenses',
    output: '% of total spent',
    icon: 'calendar-outline',
    color: '#3B82F6',
  },
  {
    id: 'category',
    title: 'Category Budget',
    description: 'Control spending habits for specific categories',
    focus: 'Spending habits',
    timeFrame: 'Configurable',
    trigger: 'Category expenses',
    output: '% of category cap',
    icon: 'pricetag-outline',
    color: '#8B5CF6',
  },
  {
    id: 'goal_based',
    title: 'Goal-Based Budget',
    description: 'Save toward a target by linking to your goals',
    focus: 'Saving toward target',
    timeFrame: 'Configurable',
    trigger: 'Expenses or savings',
    output: 'Goal progress + budget',
    icon: 'flag-outline',
    color: '#F59E0B',
  },
  {
    id: 'smart',
    title: 'Smart Budget',
    description: 'Prediction & automation based on spending patterns',
    focus: 'Prediction & automation',
    timeFrame: 'Dynamic',
    trigger: 'Spending patterns',
    output: 'AI-generated caps',
    icon: 'bulb-outline',
    color: '#10B981',
    disabled: true,
  },
  {
    id: 'custom',
    title: 'Custom Budget',
    description: 'Events & projects with manual time periods',
    focus: 'Events & projects',
    timeFrame: 'Manual',
    trigger: 'Selected period',
    output: 'Event expense tracking',
    icon: 'settings-outline',
    color: '#6B7280',
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
    budgetMode: 'spend_cap' as 'spend_cap' | 'save_target', // NEW: Mode selection
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    recurrencePattern: 'monthly' as 'monthly' | 'weekly' | 'yearly' | 'custom',
    recurringBudget: false,
    categoryId: '',
    goalId: '',
    goalSubtype: '',
    accountIds: [] as string[],
    alertThresholds: [50, 80, 100],
    progressAlerts: true,
    paceAlerts: true,
    endOfPeriodAlerts: false,
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
      budgetMode: 'spend_cap',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      recurrencePattern: 'monthly',
      recurringBudget: false,
      categoryId: '',
      goalId: '',
      goalSubtype: '',
      accountIds: [],
      alertThresholds: [50, 80, 100],
      progressAlerts: true,
      paceAlerts: true,
      endOfPeriodAlerts: false,
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
        budget_mode: formData.budgetMode, // NEW: Include budget mode
        start_date: formData.startDate,
        end_date: formData.endDate,
        recurrence_pattern: formData.recurringBudget ? formData.recurrencePattern : undefined,
        rollover_enabled: formData.recurringBudget,
        category_id: formData.categoryId || undefined,
        goal_id: formData.goalId || undefined,
        metadata: {
          goal_subtype: formData.goalSubtype || undefined,
        },
        alert_settings: {
          thresholds: formData.alertThresholds,
          channels: ['in_app'],
          daily_pace_enabled: formData.paceAlerts,
          progress_alerts: formData.progressAlerts,
          end_of_period_alerts: formData.endOfPeriodAlerts,
        },
        account_ids: formData.accountIds.length > 0 ? formData.accountIds : accounts.map(a => a.id), // Default to all accounts if none selected
      });

      // Global refresh to update all data
      await globalRefresh();
      
      showNotification({
        type: 'success',
        title: 'Budget Created',
        description: `${formData.name} budget has been created successfully`,
      });

      // Reset form but keep modal open
      // Note: handleClose resets form, but we want to keep modal open
      // So we'll reset manually without closing
      setCurrentStep(1);
      setBudgetType(null);
      setFormData({
        name: '',
        amount: '',
        startDate: '',
        endDate: '',
        categoryId: '',
        goalId: '',
        accountIds: [],
        recurringBudget: false,
        recurrencePattern: 'monthly',
        budgetMode: 'spend_cap',
        goalSubtype: '',
        alertThresholds: [50, 75, 90],
        paceAlerts: false,
        progressAlerts: false,
        endOfPeriodAlerts: false,
      });
      
      // Modal stays open - user can add another budget
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
            {!type.disabled && (
              <View style={styles.typeDetails}>
                <View style={styles.typeDetailRow}>
                  <Text style={styles.typeDetailLabel}>Focus:</Text>
                  <Text style={styles.typeDetailValue}>{type.focus}</Text>
                </View>
                <View style={styles.typeDetailRow}>
                  <Text style={styles.typeDetailLabel}>Time Frame:</Text>
                  <Text style={styles.typeDetailValue}>{type.timeFrame}</Text>
                </View>
                <View style={styles.typeDetailRow}>
                  <Text style={styles.typeDetailLabel}>Output:</Text>
                  <Text style={styles.typeDetailValue}>{type.output}</Text>
                </View>
              </View>
            )}
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
      <Text style={styles.sectionHeading}>Budget Details</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Budget Name</Text>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
          placeholder="e.g. Groceries"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={styles.input}
          value={formData.amount}
          onChangeText={(text) => setFormData(prev => ({ ...prev, amount: text }))}
          placeholder="$0.00"
          keyboardType="numeric"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* Mode Selection - Only show for non-goal-based budgets */}
      {budgetType !== 'goal_based' && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Mode Selection</Text>
          <View style={styles.modeContainer}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                formData.budgetMode === 'spend_cap' && styles.modeButtonActive,
              ]}
              onPress={() => setFormData(prev => ({ ...prev, budgetMode: 'spend_cap' }))}
            >
              <Text style={[
                styles.modeButtonText,
                formData.budgetMode === 'spend_cap' && styles.modeButtonTextActive,
              ]}>
                Spend Cap
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                formData.budgetMode === 'save_target' && styles.modeButtonActive,
              ]}
              onPress={() => setFormData(prev => ({ ...prev, budgetMode: 'save_target' }))}
            >
              <Text style={[
                styles.modeButtonText,
                formData.budgetMode === 'save_target' && styles.modeButtonTextActive,
              ]}>
                Save Target
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helperText}>
            A 'Spend Cap' helps you stay under spending, while a 'Save Target' encourages you to save towards a specific amount.
          </Text>
        </View>
      )}
      
      {/* Show mode info for goal-based budgets */}
      {budgetType === 'goal_based' && formData.goalSubtype && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Budget Mode</Text>
          <View style={styles.modeInfoContainer}>
            <Text style={styles.modeInfoText}>
              Mode: <Text style={styles.modeInfoValue}>
                {formData.budgetMode === 'save_target' ? 'Save Target' : 'Spend Cap'}
              </Text>
            </Text>
            <Text style={styles.helperText}>
              This mode is automatically determined by the selected goal subtype.
            </Text>
          </View>
        </View>
      )}

      {/* Period Control */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Period Control</Text>
        <View style={styles.presetPeriodsContainer}>
          <TouchableOpacity
            style={[
              styles.presetPeriodButton,
              formData.recurrencePattern === 'weekly' && styles.presetPeriodButtonActive,
            ]}
            onPress={() => setFormData(prev => ({ ...prev, recurrencePattern: 'weekly' }))}
          >
            <Text style={[
              styles.presetPeriodText,
              formData.recurrencePattern === 'weekly' && styles.presetPeriodTextActive,
            ]}>
              Weekly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.presetPeriodButton,
              formData.recurrencePattern === 'monthly' && styles.presetPeriodButtonActive,
            ]}
            onPress={() => setFormData(prev => ({ ...prev, recurrencePattern: 'monthly' }))}
          >
            <Text style={[
              styles.presetPeriodText,
              formData.recurrencePattern === 'monthly' && styles.presetPeriodTextActive,
            ]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.presetPeriodButton,
              formData.recurrencePattern === 'yearly' && styles.presetPeriodButtonActive,
            ]}
            onPress={() => setFormData(prev => ({ ...prev, recurrencePattern: 'yearly' }))}
          >
            <Text style={[
              styles.presetPeriodText,
              formData.recurrencePattern === 'yearly' && styles.presetPeriodTextActive,
            ]}>
              Yearly
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Recurring Budget</Text>
          <TouchableOpacity
            style={[
              styles.toggle,
              formData.recurringBudget && styles.toggleActive,
            ]}
            onPress={() => setFormData(prev => ({ ...prev, recurringBudget: !prev.recurringBudget }))}
          >
            <View style={[
              styles.toggleThumb,
              formData.recurringBudget && styles.toggleThumbActive,
            ]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Selection */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Budget Period</Text>
        <View style={styles.dateRow}>
          <View style={styles.dateInput}>
            <Text style={styles.dateLabel}>Start Date</Text>
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
            <Text style={styles.dateLabel}>End Date</Text>
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
      </View>

      {/* Budget Scope */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Budget Scope</Text>
        {budgetType === 'category' && (
          <>
            <TouchableOpacity 
              style={styles.selectableRow}
              onPress={() => {
                // TODO: Open category selection modal
                // For now, show first category as placeholder
                if (categories.length > 0 && !formData.categoryId) {
                  setFormData(prev => ({ ...prev, categoryId: categories[0].id }));
                }
              }}
            >
              <View style={styles.selectableRowContent}>
                <Text style={styles.selectableRowLabel}>Category</Text>
                <Text style={styles.selectableRowValue}>
                  {categories.find(c => c.id === formData.categoryId)?.name || 'Select Category'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.helperText}>
              Apply this budget to specific spending categories. Transactions in this category will be counted towards this budget.
            </Text>
          </>
        )}
        {budgetType !== 'category' && (
          <View style={styles.selectableRowContainer}>
            <TouchableOpacity 
              style={styles.selectableRow}
              onPress={() => setStep(3)} // Navigate to account selection step
            >
              <View style={styles.selectableRowContent}>
                <Text style={styles.selectableRowLabel}>Included Accounts</Text>
                <Text style={styles.selectableRowValue}>
                  {formData.accountIds.length === 0 ? 'All Accounts' : `${formData.accountIds.length} Selected`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.helperText}>
              Choose which accounts this budget will track transactions from.
            </Text>
          </View>
        )}
      </View>


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

      {budgetType === 'goal_based' && formData.goalId && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Goal Subtype</Text>
          <View style={styles.subtypeContainer}>
            <TouchableOpacity
              style={[
                styles.subtypeOption,
                formData.goalSubtype === 'A' && styles.selectedSubtype,
              ]}
              onPress={() => {
                setFormData(prev => ({ 
                  ...prev, 
                  goalSubtype: 'A',
                  budgetMode: 'save_target' // Auto-set mode for subtype A
                }));
              }}
            >
              <Text style={styles.subtypeTitle}>Subtype A</Text>
              <Text style={styles.subtypeDescription}>Saving Target Mode - Auto-calculated monthly targets from goals</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.subtypeOption,
                formData.goalSubtype === 'B' && styles.selectedSubtype,
              ]}
              onPress={() => {
                setFormData(prev => ({ 
                  ...prev, 
                  goalSubtype: 'B',
                  budgetMode: 'spend_cap' // Auto-set mode for subtype B
                }));
              }}
            >
              <Text style={styles.subtypeTitle}>Subtype B</Text>
              <Text style={styles.subtypeDescription}>Under Budget Saving Mode - Transfer leftover to goal at period end</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.subtypeOption,
                formData.goalSubtype === 'C' && styles.selectedSubtype,
              ]}
              onPress={() => {
                setFormData(prev => ({ 
                  ...prev, 
                  goalSubtype: 'C',
                  budgetMode: 'spend_cap' // Auto-set mode for subtype C
                }));
              }}
            >
              <Text style={styles.subtypeTitle}>Subtype C</Text>
              <Text style={styles.subtypeDescription}>Category-Linked Goal Mode - Cut category spending → save to goal</Text>
            </TouchableOpacity>
          </View>
          {formData.goalSubtype && (
            <Text style={styles.helperText}>
              Mode automatically set to "{formData.budgetMode === 'save_target' ? 'Save Target' : 'Spend Cap'}" based on selected subtype.
            </Text>
          )}
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.sectionHeading}>Account Selection</Text>
      <Text style={[styles.helperText, { marginBottom: 20 }]}>
        Choose which accounts to include in this budget. Transactions from selected accounts will be tracked.
      </Text>

      <View style={styles.accountList}>
        {accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyStateText}>No accounts available</Text>
          </View>
        ) : (
          accounts.map((account) => (
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
          ))
        )}
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.sectionHeading}>Alerts & Guidance</Text>

      <View style={styles.alertSection}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Progress Alerts</Text>
          <TouchableOpacity
            style={[
              styles.toggle,
              formData.progressAlerts && styles.toggleActive,
            ]}
            onPress={() => setFormData(prev => ({ ...prev, progressAlerts: !prev.progressAlerts }))}
          >
            <View style={[
              styles.toggleThumb,
              formData.progressAlerts && styles.toggleThumbActive,
            ]} />
          </TouchableOpacity>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Pace Alerts</Text>
          <TouchableOpacity
            style={[
              styles.toggle,
              formData.paceAlerts && styles.toggleActive,
            ]}
            onPress={() => setFormData(prev => ({ ...prev, paceAlerts: !prev.paceAlerts }))}
          >
            <View style={[
              styles.toggleThumb,
              formData.paceAlerts && styles.toggleThumbActive,
            ]} />
          </TouchableOpacity>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>End-of-Period Alerts</Text>
          <TouchableOpacity
            style={[
              styles.toggle,
              formData.endOfPeriodAlerts && styles.toggleActive,
            ]}
            onPress={() => setFormData(prev => ({ ...prev, endOfPeriodAlerts: !prev.endOfPeriodAlerts }))}
          >
            <View style={[
              styles.toggleThumb,
              formData.endOfPeriodAlerts && styles.toggleThumbActive,
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
        // Allow proceeding even if no accounts selected (will default to all accounts)
        return true;
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
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create New Budget</Text>
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
          <View style={styles.footerButtons}>
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
                {step === 5 ? (loading ? 'Creating...' : 'Save Budget') : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
          {step === 5 && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
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
    backgroundColor: '#FFFFFF', // White background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black', // Archivo Black for page headings
    fontWeight: '900',
    color: '#000000', // Black text
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
    backgroundColor: '#FFFFFF',
  },
  stepContainer: {
    paddingVertical: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontFamily: 'Archivo Black', // Archivo Black for page headings
    fontWeight: '900',
    color: '#000000', // Black text
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    color: '#000000', // Black text
    marginBottom: 24,
  },
  sectionHeading: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold', // Poppins for section headings
    fontWeight: '600',
    color: '#000000', // Black text
    marginBottom: 20,
  },
  sectionSubheading: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold', // Poppins for section headings
    fontWeight: '600',
    color: '#000000', // Black text
    marginBottom: 12,
    marginTop: 8,
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
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  typeDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  typeDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  typeDetailLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  typeDetailValue: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
    flex: 1,
    textAlign: 'right',
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
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles/labels
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#000000', // Black text
  },
  helperText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 20,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
  },
  dateButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dateLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000', // Black text
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    minWidth: 140,
    marginRight: 12,
  },
  selectedGoalCard: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  goalTitle: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 4,
  },
  goalAmount: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  accountList: {
    gap: 12,
  },
  accountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 4,
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
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
  modeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modeButtonActive: {
    backgroundColor: '#10B981', // Dark green when active
    borderColor: '#10B981',
  },
  modeButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles/text
    fontWeight: '400',
    color: '#6B7280',
  },
  modeButtonTextActive: {
    color: '#FFFFFF', // White text when active
  },
  presetPeriodsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  presetPeriodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  presetPeriodButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  presetPeriodText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  presetPeriodTextActive: {
    color: '#FFFFFF',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles/text
    fontWeight: '400',
    color: '#000000', // Black text
    flex: 1,
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
    backgroundColor: '#10B981', // Dark green when active
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  selectableRowContainer: {
    marginTop: 16,
  },
  selectableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  selectableRowContent: {
    flex: 1,
  },
  selectableRowLabel: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 4,
  },
  selectableRowValue: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  summaryLabel: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
  },
  footer: {
    flexDirection: 'column',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold', // Poppins for headings
    fontWeight: '600',
    color: '#6B7280',
  },
  nextButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#10B981', // Dark green button
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  nextButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold', // Poppins for headings
    fontWeight: '600',
    color: '#FFFFFF', // White text on button
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  selectedCategoryCard: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
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
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    color: '#000000', // Black text
    textAlign: 'center',
  },
  subtypeContainer: {
    gap: 12,
  },
  subtypeOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  selectedSubtype: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  subtypeTitle: {
    color: '#000000', // Black text
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for titles
    fontWeight: '400',
    marginBottom: 4,
  },
  subtypeDescription: {
    color: '#6B7280',
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginTop: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#6B7280',
  },
  alertSection: {
    marginTop: 8,
  },
  modeInfoContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modeInfoText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#000000', // Black text
    marginBottom: 8,
  },
  modeInfoValue: {
    fontFamily: 'InstrumentSerif-Regular', // Instrument Serif for text
    fontWeight: '400',
    color: '#10B981',
  },
});
