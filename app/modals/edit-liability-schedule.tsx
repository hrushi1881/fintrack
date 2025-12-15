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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import { updateLiabilitySchedule, deleteLiabilitySchedule, LiabilitySchedule, validateScheduleDate } from '@/utils/liabilitySchedules';
import { changePaymentAmount, changePaymentDate, AmountChangeOption } from '@/utils/liabilityPaymentAdjustments';

interface EditLiabilityScheduleModalProps {
  visible: boolean;
  onClose: () => void;
  schedule: LiabilitySchedule | null;
  liabilityId: string;
  liabilityStartDate?: string;
  liabilityEndDate?: string;
  onSuccess?: () => void;
}

export default function EditLiabilityScheduleModal({
  visible,
  onClose,
  schedule,
  liabilityId,
  liabilityStartDate,
  liabilityEndDate,
  onSuccess,
}: EditLiabilityScheduleModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'pending' | 'completed' | 'cancelled' | 'overdue'>('pending');
  
  // Amount change option
  const [amountChangeOption, setAmountChangeOption] = useState<AmountChangeOption>('oneTime');
  const [showAmountOptions, setShowAmountOptions] = useState(false);

  useEffect(() => {
    if (schedule && visible) {
      setDueDate(new Date(schedule.due_date));
      setAmount(schedule.amount.toString());
      setStatus(schedule.status);
      setAmountChangeOption('oneTime');
      setShowAmountOptions(false);
    }
  }, [schedule, visible]);

  // Check if amount changed
  const isAmountChanged = schedule && amount && parseFloat(amount) !== schedule.amount;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const handleSave = async () => {
    if (!schedule || !user) return;

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Validate date
    const dateValidation = validateScheduleDate(
      formatDateForInput(dueDate),
      liabilityStartDate,
      liabilityEndDate
    );

    if (!dateValidation.valid) {
      Alert.alert('Invalid Date', dateValidation.error || 'Date is not valid');
      return;
    }

    // If amount changed, show options
    if (isAmountChanged && !showAmountOptions && schedule.status === 'pending') {
      setShowAmountOptions(true);
      return;
    }

    try {
      setSaving(true);

      // If amount changed and options are shown, use adjustment function
      if (isAmountChanged && showAmountOptions && schedule.status === 'pending') {
        const result = await changePaymentAmount(
          schedule.id,
          liabilityId,
          user.id,
          amountValue,
          amountChangeOption
        );

        if (!result.success) {
          Alert.alert('Error', result.message);
          setSaving(false);
          return;
        }
      } else {
        // Regular update
        await updateLiabilitySchedule(schedule.id, {
          due_date: formatDateForInput(dueDate),
          amount: amountValue,
          status: status,
        });
      }

      // Update date separately if changed
      if (formatDateForInput(dueDate) !== schedule.due_date) {
        const dateResult = await changePaymentDate(
          schedule.id,
          liabilityId,
          user.id,
          dueDate
        );

        if (!dateResult.success) {
          Alert.alert('Warning', dateResult.message || 'Amount updated but date update failed');
        }
      }

      Alert.alert('Success', 'Bill updated successfully', [
        { text: 'OK', onPress: () => {
          onSuccess?.();
          onClose();
        }}
      ]);
    } catch (error: any) {
      console.error('Error updating schedule:', error);
      Alert.alert('Error', error.message || 'Failed to update bill');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!schedule || !user) return;

    Alert.alert(
      'Delete Bill?',
      'Are you sure you want to delete this bill? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await deleteLiabilitySchedule(schedule.id);
              Alert.alert('Success', 'Bill deleted successfully', [
                { text: 'OK', onPress: () => {
                  onSuccess?.();
                  onClose();
                }}
              ]);
            } catch (error: any) {
              console.error('Error deleting schedule:', error);
              Alert.alert('Error', error.message || 'Failed to delete bill');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (!visible || !schedule) return null;

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
            <Text style={styles.headerTitle}>Edit Bill</Text>
            <TouchableOpacity
              onPress={handleDelete}
              style={styles.deleteButton}
              disabled={saving}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Bill Info */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.infoLabel}>Payment Schedule</Text>
              {schedule.metadata?.payment_number && (
                <Text style={styles.infoValue}>
                  Payment {schedule.metadata.payment_number} of {schedule.metadata.total_payments || '?'}
                </Text>
              )}
              {schedule.metadata?.principal_component && schedule.metadata?.interest_component && (
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Principal</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrencyAmount(schedule.metadata.principal_component, currency)}
                    </Text>
                  </View>
                  <View style={styles.breakdownDivider} />
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Interest</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrencyAmount(schedule.metadata.interest_component, currency)}
                    </Text>
                  </View>
                </View>
              )}
            </GlassCard>

            {/* Due Date */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Due Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#000000" />
                <Text style={styles.dateText}>{formatDate(dueDate)}</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={dueDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      // Validate date
                      const validation = validateScheduleDate(
                        formatDateForInput(selectedDate),
                        liabilityStartDate,
                        liabilityEndDate
                      );
                      if (validation.valid) {
                        setDueDate(selectedDate);
                      } else {
                        Alert.alert('Invalid Date', validation.error || 'Date must be between start and end date');
                      }
                    }
                  }}
                />
              )}
              {liabilityStartDate && liabilityEndDate && (
                <Text style={styles.dateHint}>
                  Must be between {formatDate(new Date(liabilityStartDate))} and {formatDate(new Date(liabilityEndDate))}
                </Text>
              )}
            </View>

            {/* Amount */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Amount</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>{currency === 'USD' ? '$' : '₹'}</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="rgba(0, 0, 0, 0.4)"
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>
              {isAmountChanged && schedule.status === 'pending' && !showAmountOptions && (
                <Text style={styles.hintText}>
                  Amount changed. Tap &quot;Save&quot; to choose how to apply the change.
                </Text>
              )}
            </View>

            {/* Amount Change Options */}
            {isAmountChanged && showAmountOptions && schedule.status === 'pending' && (
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.optionsTitle}>How should we apply this amount change?</Text>
                
                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    amountChangeOption === 'oneTime' && styles.optionButtonActive,
                  ]}
                  onPress={() => setAmountChangeOption('oneTime')}
                >
                  <Ionicons
                    name={amountChangeOption === 'oneTime' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={amountChangeOption === 'oneTime' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                  />
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>One-Time Change</Text>
                    <Text style={styles.optionDescription}>
                      Only this payment changes. Next payment returns to original amount.
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    amountChangeOption === 'updateAll' && styles.optionButtonActive,
                  ]}
                  onPress={() => setAmountChangeOption('updateAll')}
                >
                  <Ionicons
                    name={amountChangeOption === 'updateAll' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={amountChangeOption === 'updateAll' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                  />
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Update All Future Payments</Text>
                    <Text style={styles.optionDescription}>
                      All remaining payments will change to this amount.
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    amountChangeOption === 'addToNext' && styles.optionButtonActive,
                  ]}
                  onPress={() => setAmountChangeOption('addToNext')}
                >
                  <Ionicons
                    name={amountChangeOption === 'addToNext' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={amountChangeOption === 'addToNext' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                  />
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Add Difference to Next Payment</Text>
                    <Text style={styles.optionDescription}>
                      This payment changes, and the difference is added to the next payment.
                    </Text>
                  </View>
                </TouchableOpacity>
              </GlassCard>
            )}

            {/* Status */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Status</Text>
              <View style={styles.statusButtons}>
                {(['pending', 'completed', 'cancelled', 'overdue'] as const).map((statusOption) => (
                  <TouchableOpacity
                    key={statusOption}
                    style={[
                      styles.statusButton,
                      status === statusOption && styles.statusButtonActive,
                    ]}
                    onPress={() => setStatus(statusOption)}
                  >
                    <Text style={[
                      styles.statusButtonText,
                      status === statusOption && styles.statusButtonTextActive,
                    ]}>
                      {statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>
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
  deleteButton: {
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
  infoLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  breakdownItem: {
    flex: 1,
  },
  breakdownLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  breakdownValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  breakdownDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
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
  dateHint: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 8,
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
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  statusButtonActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderColor: '#000000',
  },
  statusButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  statusButtonTextActive: {
    color: '#000000',
  },
  saveButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  saveButtonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  saveButtonText: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  hintText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginTop: 8,
    fontStyle: 'italic',
  },
  optionsTitle: {
    fontSize: 18,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 8,
    gap: 12,
  },
  optionButtonActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: '#000000',
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  optionDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
});

