import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
 Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { Budget, BudgetPeriodSummary, RenewalDecision } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';
import {
  prepareBudgetForReflection,
  executeRenewalDecision,
} from '@/utils/budgets';
import CalendarDatePicker from '@/components/CalendarDatePicker';

import { useRealtimeData } from '@/hooks/useRealtimeData';

interface BudgetReflectionModalProps {
  visible: boolean;
  budget: Budget | null;
  onClose: () => void;
  onRenewalComplete: () => void;
}

type RenewalPath = 'continue' | 'repeat' | 'extend' | null;

const RECURRENCE_OPTIONS = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'custom', label: 'Custom' },
];

const BudgetReflectionModal: React.FC<BudgetReflectionModalProps> = ({
  visible,
  budget,
  onClose,
  onRenewalComplete,
}) => {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { showNotification } = useNotification();
  const { refreshBudgets } = useRealtimeData();

  const [insights, setInsights] = useState<BudgetPeriodSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<RenewalPath>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Renewal form data
  const [continueEndDate, setContinueEndDate] = useState('');
  const [continueResetSpent, setContinueResetSpent] = useState(false);
  const [repeatAmount, setRepeatAmount] = useState('');
  const [repeatStartDate, setRepeatStartDate] = useState('');
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [repeatRollover, setRepeatRollover] = useState(false);
  const [extendRecurrence, setExtendRecurrence] = useState<'monthly' | 'weekly' | 'yearly' | 'custom'>('monthly');
  const [extendRollover, setExtendRollover] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'continue' | 'repeat_start' | 'repeat_end'>('continue');

  // Load insights when modal opens
  useEffect(() => {
    if (visible && budget && user) {
      loadInsights();
    }
  }, [visible, budget, user]);

  const loadInsights = async () => {
    if (!budget || !user) return;

    setLoading(true);
    try {
      // Check if insights are already stored in metadata
      if (budget.metadata?.period_summary) {
        setInsights(budget.metadata.period_summary);
        // Show confetti if under budget
        if (budget.metadata.period_summary.remaining_amount > 0) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3000);
        }
      } else {
        // Generate insights
        const generatedInsights = await prepareBudgetForReflection(budget.id, user.id);
        setInsights(generatedInsights);
        // Show confetti if under budget
        if (generatedInsights.remaining_amount > 0) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3000);
        }
      }
    } catch (error: any) {
      console.error('Error loading insights:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to load budget insights',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRenewal = async () => {
    if (!budget || !user || !selectedPath || !insights) return;

    setLoading(true);
    try {
      let decision: RenewalDecision;

      switch (selectedPath) {
        case 'continue':
          if (!continueEndDate) {
            showNotification({
              type: 'error',
              title: 'Validation Error',
              description: 'Please select an end date',
            });
            setLoading(false);
            return;
          }
          decision = {
            renewal_type: 'continue',
            budget_id: budget.id,
            new_end_date: continueEndDate,
            reset_spent: continueResetSpent,
          };
          break;

        case 'repeat':
          decision = {
            renewal_type: 'repeat',
            budget_id: budget.id,
            new_amount: repeatAmount ? parseFloat(repeatAmount) : budget.amount,
            new_start_date: repeatStartDate || (() => {
              const endDate = new Date(budget.end_date);
              endDate.setDate(endDate.getDate() + 1);
              return endDate.toISOString().split('T')[0];
            })(),
            new_end_date: repeatEndDate || (() => {
              const startDate = new Date(budget.end_date);
              startDate.setDate(startDate.getDate() + 1);
              const duration = Math.ceil(
                (new Date(budget.end_date).getTime() - new Date(budget.start_date).getTime()) / (1000 * 60 * 60 * 24)
              );
              startDate.setDate(startDate.getDate() + duration);
              return startDate.toISOString().split('T')[0];
            })(),
            rollover_enabled: repeatRollover,
            rollover_amount: repeatRollover ? insights.remaining_amount : 0,
          };
          break;

        case 'extend':
          decision = {
            renewal_type: 'extend',
            budget_id: budget.id,
            recurrence_pattern: extendRecurrence,
            rollover_enabled: extendRollover,
            rollover_amount: extendRollover ? insights.remaining_amount : 0,
          };
          break;

        default:
          setLoading(false);
          return;
      }

      await executeRenewalDecision(decision, user.id);

      showNotification({
        type: 'success',
        title: 'Budget Renewed',
        description: 'Budget has been renewed successfully',
      });

      await refreshBudgets();
      onRenewalComplete();
      onClose();
    } catch (error: any) {
      console.error('Error executing renewal:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to renew budget',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    if (datePickerType === 'continue') {
      setContinueEndDate(dateString);
    } else if (datePickerType === 'repeat_start') {
      setRepeatStartDate(dateString);
    } else if (datePickerType === 'repeat_end') {
      setRepeatEndDate(dateString);
    }
    setShowDatePicker(false);
  };

  if (!budget || !insights) {
    return null;
  }

  const isUnderBudget = insights.remaining_amount > 0;
  const isOverBudget = insights.spent_amount > insights.total_amount;
  // const isExactlyOnBudget = Math.abs(insights.spent_amount - insights.total_amount) < 0.01;

  // Determine outcome message
  let outcomeMessage = '';
  if (isUnderBudget) {
    outcomeMessage = 'You managed your money beautifully. That\'s discipline meeting awareness.';
  } else if (isOverBudget) {
    outcomeMessage = 'You covered everything you needed this month. That\'s still progress.';
  } else {
    outcomeMessage = 'Perfect balance — every rupee had a job.';
  }

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
          <Text style={styles.headerTitle}>Period Review</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Celebration Section */}
          <View style={styles.celebrationSection}>
            {showConfetti && isUnderBudget && (
              <View style={styles.confettiContainer}>
                <Ionicons name="sparkles" size={48} color="#10B981" />
              </View>
            )}
            <Text style={styles.celebrationTitle}>Great Job!</Text>
            <Text style={styles.outcomeMessage}>
              {isUnderBudget
                ? `You stayed under budget by ${formatCurrencyAmount(insights.remaining_amount, currency)} this month.`
                : isOverBudget
                ? `You went over budget by ${formatCurrencyAmount(insights.spent_amount - insights.total_amount, currency)} this month.`
                : `You spent exactly ${formatCurrencyAmount(insights.total_amount, currency)} this month.`}
            </Text>
            <Text style={styles.outcomeSubtext}>{outcomeMessage}</Text>
          </View>

          {/* Insights Section */}
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Your {budget.name} Story</Text>

            {/* Category Highlights */}
            {insights.category_breakdown.length > 0 && (
              <View style={styles.insightCard}>
                <Text style={styles.insightCardTitle}>Category Highlights</Text>
                {insights.category_breakdown.slice(0, 3).map((category, index) => (
                  <View key={category.category_id} style={styles.insightRow}>
                    <Ionicons 
                      name={index === 0 ? "trending-up" : index === 1 ? "trending-down" : "remove"} 
                      size={16} 
                      color={index === 0 ? "#10B981" : index === 1 ? "#EF4444" : "#6B7280"} 
                    />
                    <Text style={styles.insightText}>
                      {category.category_name} - {formatCurrencyAmount(category.amount, currency)} ({category.percentage.toFixed(1)}%)
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Previous Period Comparison */}
            {insights.previous_period_comparison && (
              <View style={styles.insightCard}>
                <Text style={styles.insightCardTitle}>Comparison with Last Period</Text>
                <View style={styles.insightRow}>
                  <Ionicons 
                    name={insights.previous_period_comparison.total_change_percentage < 0 ? "trending-down" : "trending-up"} 
                    size={16} 
                    color={insights.previous_period_comparison.total_change_percentage < 0 ? "#10B981" : "#EF4444"} 
                  />
                  <Text style={styles.insightText}>
                    You spent {Math.abs(insights.previous_period_comparison.total_change_percentage).toFixed(1)}%{' '}
                    {insights.previous_period_comparison.total_change_percentage < 0 ? 'less' : 'more'} than last period
                  </Text>
                </View>
                {insights.previous_period_comparison.category_changes.slice(0, 3).map((change) => (
                  <View key={change.category_id} style={styles.insightRow}>
                    <Text style={[
                      styles.insightText,
                      { color: change.change_percentage < 0 ? '#10B981' : change.change_percentage > 0 ? '#EF4444' : '#6B7280' }
                    ]}>
                      {change.category_name}: {change.change_percentage > 0 ? '+' : ''}{change.change_percentage.toFixed(1)}%
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Achievements */}
            <View style={styles.insightCard}>
              <Text style={styles.insightCardTitle}>Achievements</Text>
              <View style={styles.insightRow}>
                <Ionicons name="trophy" size={16} color="#F59E0B" />
                <Text style={styles.insightText}>
                  {insights.achievements.streak_count} months of consistent tracking!
                </Text>
              </View>
              {insights.achievements.improvement_percentage !== undefined && insights.achievements.improvement_percentage > 0 && (
                <View style={styles.insightRow}>
                  <Ionicons name="trending-up" size={16} color="#10B981" />
                  <Text style={styles.insightText}>
                    You improved by {insights.achievements.improvement_percentage.toFixed(1)}% this period
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Renewal Decision Section */}
          <View style={styles.renewalSection}>
            <Text style={styles.sectionTitle}>What&apos;s Next?</Text>
            <Text style={styles.sectionSubtitle}>
              For {new Date(budget.end_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}, what&apos;s the plan?
            </Text>

            {/* Renewal Path Selection */}
            <View style={styles.pathSelector}>
              <TouchableOpacity
                style={[styles.pathButton, selectedPath === 'continue' && styles.pathButtonActive]}
                onPress={() => setSelectedPath('continue')}
              >
                <Ionicons 
                  name="time-outline" 
                  size={24} 
                  color={selectedPath === 'continue' ? '#FFFFFF' : '#6B7280'} 
                />
                <Text style={[styles.pathButtonText, selectedPath === 'continue' && styles.pathButtonTextActive]}>
                  Continue This
                </Text>
                <Text style={[styles.pathButtonDescription, selectedPath === 'continue' && styles.pathButtonDescriptionActive]}>
                  Extend the current period
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pathButton, selectedPath === 'repeat' && styles.pathButtonActive]}
                onPress={() => setSelectedPath('repeat')}
              >
                <Ionicons 
                  name="refresh-outline" 
                  size={24} 
                  color={selectedPath === 'repeat' ? '#FFFFFF' : '#6B7280'} 
                />
                <Text style={[styles.pathButtonText, selectedPath === 'repeat' && styles.pathButtonTextActive]}>
                  Repeat This
                </Text>
                <Text style={[styles.pathButtonDescription, selectedPath === 'repeat' && styles.pathButtonDescriptionActive]}>
                  Start a fresh cycle
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pathButton, selectedPath === 'extend' && styles.pathButtonActive]}
                onPress={() => setSelectedPath('extend')}
              >
                <Ionicons 
                  name="repeat-outline" 
                  size={24} 
                  color={selectedPath === 'extend' ? '#FFFFFF' : '#6B7280'} 
                />
                <Text style={[styles.pathButtonText, selectedPath === 'extend' && styles.pathButtonTextActive]}>
                  Extend This
                </Text>
                <Text style={[styles.pathButtonDescription, selectedPath === 'extend' && styles.pathButtonDescriptionActive]}>
                  Make it recurring
                </Text>
              </TouchableOpacity>
            </View>

            {/* Continue Form */}
            {selectedPath === 'continue' && (
              <View style={styles.renewalForm}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>New End Date</Text>
                  <TouchableOpacity
                    style={styles.dateInput}
                    onPress={() => {
                      setDatePickerType('continue');
                      setShowDatePicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                    <Text style={styles.dateText}>
                      {continueEndDate || 'Select end date'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Start Fresh (Reset Spent Amount)</Text>
                  <Switch
                    value={continueResetSpent}
                    onValueChange={setContinueResetSpent}
                    trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            )}

            {/* Repeat Form */}
            {selectedPath === 'repeat' && (
              <View style={styles.renewalForm}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Budget Amount ({currency})</Text>
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputPrefix}>{currency === 'USD' ? '$' : currency === 'INR' ? '₹' : currency}</Text>
                    <TextInput
                      style={styles.input}
                      value={repeatAmount}
                      onChangeText={setRepeatAmount}
                      keyboardType="numeric"
                      placeholder={budget.amount.toString()}
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Start Date</Text>
                  <TouchableOpacity
                    style={styles.dateInput}
                    onPress={() => {
                      setDatePickerType('repeat_start');
                      setShowDatePicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                    <Text style={styles.dateText}>
                      {repeatStartDate || 'Select start date'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>End Date</Text>
                  <TouchableOpacity
                    style={styles.dateInput}
                    onPress={() => {
                      setDatePickerType('repeat_end');
                      setShowDatePicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                    <Text style={styles.dateText}>
                      {repeatEndDate || 'Select end date'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Rollover Unspent Amount</Text>
                  <Switch
                    value={repeatRollover}
                    onValueChange={setRepeatRollover}
                    trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                {repeatRollover && insights.remaining_amount > 0 && (
                  <Text style={styles.helperText}>
                    {formatCurrencyAmount(insights.remaining_amount, currency)} will be added to the new budget
                  </Text>
                )}
              </View>
            )}

            {/* Extend Form */}
            {selectedPath === 'extend' && (
              <View style={styles.renewalForm}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Recurrence Pattern</Text>
                  <View style={styles.presetPeriodsContainer}>
                    {RECURRENCE_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.presetPeriodButton,
                          extendRecurrence === option.id && styles.presetPeriodButtonActive,
                        ]}
                        onPress={() => setExtendRecurrence(option.id as any)}
                      >
                        <Text
                          style={[
                            styles.presetPeriodText,
                            extendRecurrence === option.id && styles.presetPeriodTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Rollover Unspent Amount</Text>
                  <Switch
                    value={extendRollover}
                    onValueChange={setExtendRollover}
                    trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                {extendRollover && insights.remaining_amount > 0 && (
                  <Text style={styles.helperText}>
                    {formatCurrencyAmount(insights.remaining_amount, currency)} will be added to each new period
                  </Text>
                )}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmButton, !selectedPath && styles.confirmButtonDisabled]}
            onPress={handleRenewal}
            disabled={!selectedPath || loading}
          >
            <Text style={styles.confirmButtonText}>
              {loading ? 'Processing...' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Picker */}
        <CalendarDatePicker
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onDateSelect={handleDateSelect}
          title={`Select ${datePickerType === 'continue' ? 'End' : datePickerType === 'repeat_start' ? 'Start' : 'End'} Date`}
          initialDate={
            datePickerType === 'continue'
              ? continueEndDate
                ? new Date(continueEndDate)
                : new Date(budget.end_date)
              : datePickerType === 'repeat_start'
              ? repeatStartDate
                ? new Date(repeatStartDate)
                : (() => {
                    const endDate = new Date(budget.end_date);
                    endDate.setDate(endDate.getDate() + 1);
                    return endDate;
                  })()
              : repeatEndDate
                ? new Date(repeatEndDate)
                : (() => {
                    const startDate = new Date(budget.end_date);
                    startDate.setDate(startDate.getDate() + 1);
                    const duration = Math.ceil(
                      (new Date(budget.end_date).getTime() - new Date(budget.start_date).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    startDate.setDate(startDate.getDate() + duration);
                    return startDate;
                  })()
          }
        />
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
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  celebrationSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 24,
  },
  confettiContainer: {
    marginBottom: 16,
  },
  celebrationTitle: {
    fontSize: 32,
    fontFamily: 'Archivo Black',
    fontWeight: '900',
    color: '#000000',
    marginBottom: 8,
  },
  outcomeMessage: {
    fontSize: 18,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 8,
  },
  outcomeSubtext: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  insightsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 20,
    lineHeight: 24,
  },
  insightCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  insightCardTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  insightText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    flex: 1,
  },
  renewalSection: {
    marginBottom: 32,
  },
  pathSelector: {
    gap: 12,
    marginBottom: 24,
  },
  pathButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  pathButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  pathButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    flex: 1,
  },
  pathButtonTextActive: {
    color: '#FFFFFF',
  },
  pathButtonDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#9CA3AF',
  },
  pathButtonDescriptionActive: {
    color: '#D1FAE5',
  },
  renewalForm: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputPrefix: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 16,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
  },
  dateInput: {
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
    fontWeight: '400',
    color: '#000000',
    flex: 1,
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
  helperText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 20,
  },
  presetPeriodsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  presetPeriodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  presetPeriodButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  presetPeriodText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
  },
  presetPeriodTextActive: {
    color: '#FFFFFF',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  confirmButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#FFFFFF',
  },
});

export default BudgetReflectionModal;

