import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { updateBudget, deleteBudget, getBudgetAccountIds } from '@/utils/budgets';
import CalendarDatePicker from '@/components/CalendarDatePicker';
import { Budget } from '@/types';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import { supabase } from '@/lib/supabase';

interface EditBudgetModalProps {
  visible: boolean;
  budget: Budget | null;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

const RECURRENCE_OPTIONS = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'custom', label: 'Custom' },
];

const EditBudgetModal: React.FC<EditBudgetModalProps> = ({ 
  visible, 
  budget, 
  onClose, 
  onUpdate,
  onDelete 
}) => {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { accounts, goals } = useRealtimeData();

  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    startDate: '',
    endDate: '',
    recurrencePattern: 'monthly' as 'monthly' | 'weekly' | 'yearly' | 'custom',
    recurringBudget: false,
    budgetMode: 'spend_cap' as 'spend_cap' | 'save_target',
    categoryId: '',
    goalId: '',
    accountIds: [] as string[],
    alertThresholds: [50, 80, 100],
    progressAlerts: true,
    paceAlerts: true,
    endOfPeriodAlerts: false,
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'start' | 'end'>('start');
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fetchedCategories, setFetchedCategories] = useState<any[]>([]);

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

      setFetchedCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // Initialize form data when budget changes
  useEffect(() => {
    if (budget && visible) {
      const loadBudgetData = async () => {
        try {
          // Fetch budget account IDs
          const accountIds = await getBudgetAccountIds(budget.id);
          
          // Get alert settings
          const alertSettings = budget.alert_settings || {};
          const thresholds = alertSettings.thresholds || [50, 80, 100];

          setFormData({
            name: budget.name || '',
            amount: budget.amount?.toString() || '',
            startDate: budget.start_date || '',
            endDate: budget.end_date || '',
            recurrencePattern: (budget.recurrence_pattern as any) || 'monthly',
            recurringBudget: !!budget.recurrence_pattern,
            budgetMode: (budget.budget_mode as 'spend_cap' | 'save_target') || 'spend_cap',
            categoryId: budget.category_id || '',
            goalId: budget.goal_id || '',
            accountIds: accountIds,
            alertThresholds: thresholds,
            progressAlerts: alertSettings.progress_alerts !== false,
            paceAlerts: alertSettings.daily_pace_enabled !== false,
            endOfPeriodAlerts: alertSettings.end_of_period_alerts === true,
          });
        } catch (error) {
          console.error('Error loading budget data:', error);
        }
      };

      loadBudgetData();
    }
  }, [budget, visible]);

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

  const handleUpdate = async () => {
    if (!budget || !user) return;

    // Validation
    if (!formData.name.trim()) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Budget name is required',
      });
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Budget amount must be greater than 0',
      });
      return;
    }

    if (!formData.startDate || !formData.endDate) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Start and end dates are required',
      });
      return;
    }

    if (new Date(formData.endDate) <= new Date(formData.startDate)) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'End date must be after start date',
      });
      return;
    }

    if (formData.accountIds.length === 0) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Please select at least one account',
      });
      return;
    }

    // Validate category for category budgets
    if (budget.budget_type === 'category' && !formData.categoryId) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Please select a category',
      });
      return;
    }

    // Validate goal for goal-based budgets
    if (budget.budget_type === 'goal_based' && !formData.goalId) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Please select a goal',
      });
      return;
    }

    setLoading(true);
    try {
      // Build alert settings
      const alertSettings = {
        thresholds: formData.alertThresholds,
        progress_alerts: formData.progressAlerts,
        daily_pace_enabled: formData.paceAlerts,
        end_of_period_alerts: formData.endOfPeriodAlerts,
      };

      await updateBudget(
        budget.id,
        {
          name: formData.name.trim(),
          amount: parseFloat(formData.amount),
          start_date: formData.startDate,
          end_date: formData.endDate,
          recurrence_pattern: formData.recurringBudget ? formData.recurrencePattern : null,
          rollover_enabled: formData.recurringBudget,
          budget_mode: formData.budgetMode,
          category_id: budget.budget_type === 'category' ? (formData.categoryId || null) : undefined,
          goal_id: budget.budget_type === 'goal_based' ? (formData.goalId || null) : undefined,
          account_ids: formData.accountIds,
          alert_settings: alertSettings,
        },
        user.id
      );

      showNotification({
        type: 'success',
        title: 'Budget Updated',
        description: 'Budget has been updated successfully',
      });

      onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error updating budget:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to update budget. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!budget || !user) return;

    setLoading(true);
    try {
      await deleteBudget(budget.id, user.id);

      showNotification({
        type: 'success',
        title: 'Budget Deleted',
        description: 'Budget has been deleted successfully',
      });

      onDelete();
      onClose();
      setShowDeleteConfirm(false);
    } catch (error: any) {
      console.error('Error deleting budget:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to delete budget. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!budget) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Budget</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView style={styles.content}>
          {/* Budget Name */}
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

          {/* Amount */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              value={formData.amount}
              onChangeText={(text) => setFormData(prev => ({ ...prev, amount: text }))}
              placeholder="0.00"
              keyboardType="numeric"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Date Selection */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Budget Period</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => {
                  setDatePickerType('start');
                  setShowDatePicker(true);
                }}
              >
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                <Text style={styles.dateText}>
                  {formData.startDate || 'Start Date'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => {
                  setDatePickerType('end');
                  setShowDatePicker(true);
                }}
              >
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                <Text style={styles.dateText}>
                  {formData.endDate || 'End Date'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Budget Mode (for non-goal-based budgets) */}
          {budget.budget_type !== 'goal_based' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Budget Mode</Text>
              <View style={styles.modeButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    formData.budgetMode === 'spend_cap' && styles.modeButtonActive,
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, budgetMode: 'spend_cap' }))}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      formData.budgetMode === 'spend_cap' && styles.modeButtonTextActive,
                    ]}
                  >
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
                  <Text
                    style={[
                      styles.modeButtonText,
                      formData.budgetMode === 'save_target' && styles.modeButtonTextActive,
                    ]}
                  >
                    Save Target
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Category Selection (for category budgets) */}
          {budget.budget_type === 'category' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.selectableList}>
                {fetchedCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.selectableRow,
                      formData.categoryId === category.id && styles.selectedRow,
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, categoryId: category.id }))}
                  >
                    <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
                      <Ionicons name={category.icon as any} size={20} color="white" />
                    </View>
                    <Text style={styles.selectableRowLabel}>{category.name}</Text>
                    {formData.categoryId === category.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Goal Selection (for goal-based budgets) */}
          {budget.budget_type === 'goal_based' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Goal</Text>
              <View style={styles.selectableList}>
                {goals
                  .filter(goal => goal.currency === budget.currency)
                  .map((goal) => (
                    <TouchableOpacity
                      key={goal.id}
                      style={[
                        styles.selectableRow,
                        formData.goalId === goal.id && styles.selectedRow,
                      ]}
                      onPress={() => setFormData(prev => ({ ...prev, goalId: goal.id }))}
                    >
                      <View style={[styles.goalIcon, { backgroundColor: goal.color }]}>
                        <Ionicons name="flag" size={20} color="white" />
                      </View>
                      <View style={styles.selectableRowInfo}>
                        <Text style={styles.selectableRowLabel}>{goal.title}</Text>
                        <Text style={styles.selectableRowValue}>
                          {formatCurrencyAmount(goal.current_amount || 0, goal.currency)} / {formatCurrencyAmount(goal.target_amount, goal.currency)}
                        </Text>
                      </View>
                      {formData.goalId === goal.id && (
                        <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                      )}
                    </TouchableOpacity>
                  ))}
                {goals.filter(goal => goal.currency === budget.currency).length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="flag-outline" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyStateText}>No goals available with matching currency</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Account Selection */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Accounts</Text>
            <Text style={styles.helperText}>
              Select which accounts to track for this budget. Only accounts with matching currency are shown.
            </Text>
            <View style={styles.selectableList}>
              {accounts
                .filter(account => 
                  account.currency === budget.currency && 
                  (account.is_active === true || account.is_active === null)
                )
                .length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="wallet-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyStateText}>No accounts available with matching currency</Text>
                </View>
              ) : (
                accounts
                  .filter(account => 
                    account.currency === budget.currency && 
                    (account.is_active === true || account.is_active === null)
                  )
                  .map((account) => (
                    <TouchableOpacity
                      key={account.id}
                      style={[
                        styles.selectableRow,
                        formData.accountIds.includes(account.id) && styles.selectedRow,
                      ]}
                      onPress={() => handleAccountToggle(account.id)}
                    >
                      <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                        <Ionicons name={account.icon as any} size={20} color="white" />
                      </View>
                      <View style={styles.selectableRowInfo}>
                        <Text style={styles.selectableRowLabel}>{account.name}</Text>
                        <Text style={styles.selectableRowValue}>
                          {formatCurrencyAmount(account.balance, account.currency)}
                        </Text>
                      </View>
                      {formData.accountIds.includes(account.id) && (
                        <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                      )}
                    </TouchableOpacity>
                  ))
              )}
            </View>
          </View>

          {/* Recurrence */}
          <View style={styles.formGroup}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Recurring Budget</Text>
              <Switch
                value={formData.recurringBudget}
                onValueChange={(value) =>
                  setFormData(prev => ({ ...prev, recurringBudget: value }))
                }
                trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {formData.recurringBudget && (
              <View style={styles.presetPeriodsContainer}>
                {RECURRENCE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.presetPeriodButton,
                      formData.recurrencePattern === option.id && styles.presetPeriodButtonActive,
                    ]}
                    onPress={() =>
                      setFormData(prev => ({ ...prev, recurrencePattern: option.id as any }))
                    }
                  >
                    <Text
                      style={[
                        styles.presetPeriodText,
                        formData.recurrencePattern === option.id && styles.presetPeriodTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Alert Settings */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Alert Settings</Text>
            
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Progress Alerts</Text>
              <Switch
                value={formData.progressAlerts}
                onValueChange={(value) =>
                  setFormData(prev => ({ ...prev, progressAlerts: value }))
                }
                trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Daily Pace Alerts</Text>
              <Switch
                value={formData.paceAlerts}
                onValueChange={(value) =>
                  setFormData(prev => ({ ...prev, paceAlerts: value }))
                }
                trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>End of Period Alerts</Text>
              <Switch
                value={formData.endOfPeriodAlerts}
                onValueChange={(value) =>
                  setFormData(prev => ({ ...prev, endOfPeriodAlerts: value }))
                }
                trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Delete Button */}
          <View style={styles.formGroup}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => setShowDeleteConfirm(true)}
            >
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              <Text style={styles.deleteButtonText}>Delete Budget</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleUpdate}
            disabled={loading}
          >
            <Text style={styles.saveButtonText}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Picker Modal */}
        <CalendarDatePicker
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onDateSelect={handleDateSelect}
          title={`Select ${datePickerType === 'start' ? 'Start' : 'End'} Date`}
          initialDate={
            datePickerType === 'start'
              ? formData.startDate
                ? new Date(formData.startDate)
                : new Date()
              : formData.endDate
                ? new Date(formData.endDate)
                : new Date()
          }
        />

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <Modal
            visible={showDeleteConfirm}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowDeleteConfirm(false)}
          >
            <View style={styles.deleteModalOverlay}>
              <View style={styles.deleteModalContent}>
                <Text style={styles.deleteModalTitle}>Delete Budget?</Text>
                <Text style={styles.deleteModalDescription}>
                  This action cannot be undone. All budget data will be permanently deleted.
                </Text>
                <View style={styles.deleteModalActions}>
                  <TouchableOpacity
                    style={styles.deleteModalCancelButton}
                    onPress={() => setShowDeleteConfirm(false)}
                  >
                    <Text style={styles.deleteModalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteModalConfirmButton}
                    onPress={handleDelete}
                    disabled={loading}
                  >
                    <Text style={styles.deleteModalConfirmText}>
                      {loading ? 'Deleting...' : 'Delete'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    fontWeight: '900',
    color: '#000000',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#000000',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  dateText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    flex: 1,
  },
  presetPeriodsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
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
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  presetPeriodTextActive: {
    color: '#FFFFFF',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#FFFFFF',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#FFFFFF',
  },
  datePickerModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  datePickerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '80%',
  },
  deleteModalTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    fontWeight: '900',
    color: '#000000',
    marginBottom: 12,
  },
  deleteModalDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 24,
    lineHeight: 20,
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteModalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  deleteModalCancelText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  deleteModalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
  },
  deleteModalConfirmText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#FFFFFF',
  },
  modeButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  modeButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  helperText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  selectableList: {
    marginTop: 8,
  },
  selectableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  selectedRow: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  selectableRowInfo: {
    flex: 1,
  },
  selectableRowLabel: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    marginBottom: 4,
  },
  selectableRowValue: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 12,
  },
});

export default EditBudgetModal;

