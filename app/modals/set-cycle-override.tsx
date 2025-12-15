import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { Cycle } from '@/utils/cycles';

interface SetCycleOverrideModalProps {
  visible: boolean;
  onClose: () => void;
  cycle: Cycle;
  recurringTransactionId?: string; // Add this to allow bill updates
  currentOverride?: {
    expectedDate?: string;
    expectedAmount?: number;
    minimumAmount?: number;
    notes?: string;
  };
  onSuccess?: () => void;
  onSave: (override: { expectedDate?: string; expectedAmount?: number; minimumAmount?: number; notes?: string }) => Promise<void>;
  onRemove?: () => Promise<void>;
}

export default function SetCycleOverrideModal({
  visible,
  onClose,
  cycle,
  currentOverride,
  onSuccess,
  onSave,
  onRemove,
}: SetCycleOverrideModalProps) {
  const { currency } = useSettings();

  const [amount, setAmount] = useState('');
  const [minimumAmount, setMinimumAmount] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);

  useEffect(() => {
    if (visible) {
      if (currentOverride) {
        setAmount(currentOverride.expectedAmount?.toString() || cycle.expectedAmount.toString());
        setMinimumAmount(currentOverride.minimumAmount?.toString() || cycle.minimumAmount?.toString() || '');
        setDueDate(currentOverride.expectedDate ? new Date(currentOverride.expectedDate) : new Date(cycle.expectedDate));
        setNotes(currentOverride.notes || '');
        setHasOverride(true);
      } else {
        setAmount(cycle.expectedAmount.toString());
        setMinimumAmount(cycle.minimumAmount?.toString() || '');
        setDueDate(new Date(cycle.expectedDate));
        setNotes('');
        setHasOverride(false);
      }
    }
  }, [visible, cycle, currentOverride]);

  const formatCurrency = (value: number) => {
    return formatCurrencyAmount(value, currency);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSave = async () => {
    if (!dueDate) {
      Alert.alert('Error', 'Please select a date');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid target amount');
      return;
    }

    const targetAmt = parseFloat(amount);
    let minAmt: number | undefined;
    
    if (minimumAmount && minimumAmount !== '') {
      minAmt = parseFloat(minimumAmount);
      if (isNaN(minAmt) || minAmt < 0) {
        Alert.alert('Error', 'Please enter a valid minimum amount');
        return;
      }
      if (minAmt > targetAmt) {
        Alert.alert('Error', 'Minimum amount cannot be greater than target amount');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        expectedDate: dueDate.toISOString().split('T')[0],
        expectedAmount: targetAmt,
        minimumAmount: minAmt,
        notes: notes.trim() || undefined,
      });

      Alert.alert('Success', 'Cycle rules saved', [
        {
          text: 'OK',
          onPress: () => {
            onSuccess?.();
            onClose();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error saving override:', error);
      Alert.alert('Error', error.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;

    Alert.alert(
      'Remove Override',
      'Are you sure you want to remove this cycle override?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await onRemove();
              Alert.alert('Success', 'Override removed successfully', [
                {
                  text: 'OK',
                  onPress: () => {
                    onSuccess?.();
                    onClose();
                  },
                },
              ]);
            } catch (error: any) {
              console.error('Error removing override:', error);
              Alert.alert('Error', error.message || 'Failed to remove override. Please try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Cycle {cycle.cycleNumber} Rules</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Info */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color="#6366F1" />
              <Text style={styles.infoText}>
                Set custom rules for this cycle: target amount, minimum payment, and due date.
              </Text>
            </View>

            {/* Target Amount */}
            <View style={styles.section}>
              <Text style={styles.label}>Target Amount</Text>
              <Text style={styles.labelHint}>Full payment expected for this cycle</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.currencySymbol}>{formatCurrencyAmount(0, currency).replace(/[\d.,]/g, '').trim()}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/[^0-9.]/g, '');
                    const parts = cleaned.split('.');
                    if (parts.length <= 2 && (!parts[1] || parts[1].length <= 2)) {
                      setAmount(cleaned);
                    }
                  }}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                />
              </View>
              <Text style={styles.hint}>Default: {formatCurrency(cycle.expectedAmount)}</Text>
            </View>

            {/* Minimum Amount */}
            <View style={styles.section}>
              <Text style={styles.label}>Minimum Payment</Text>
              <Text style={styles.labelHint}>Optional - minimum to avoid late status</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.currencySymbol}>{formatCurrencyAmount(0, currency).replace(/[\d.,]/g, '').trim()}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={minimumAmount}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/[^0-9.]/g, '');
                    const parts = cleaned.split('.');
                    if (parts.length <= 2 && (!parts[1] || parts[1].length <= 2)) {
                      setMinimumAmount(cleaned);
                    }
                  }}
                  placeholder="Leave empty for no minimum"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                />
              </View>
              {cycle.minimumAmount ? (
                <Text style={styles.hint}>Default: {formatCurrency(cycle.minimumAmount)}</Text>
              ) : (
                <Text style={styles.hint}>No minimum set</Text>
              )}
            </View>

            {/* Due Date */}
            <View style={styles.section}>
              <Text style={styles.label}>Due Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                <Text style={styles.dateText}>
                  {dueDate ? formatDate(dueDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.hint}>Default: {formatDate(new Date(cycle.expectedDate))}</Text>
              {showDatePicker && dueDate && (
                <DateTimePicker
                  value={dueDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setDueDate(selectedDate);
                    }
                  }}
                />
              )}
            </View>

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add a note about this cycle..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {hasOverride && onRemove && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={handleRemove}
                disabled={saving}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text style={styles.removeButtonText}>Remove Override</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.submitButton, saving && styles.submitButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>Save Override</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  section: {
    marginTop: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  labelHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    paddingVertical: 14,
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F9FAFB',
  },
  dateText: {
    fontSize: 16,
    color: '#1F2937',
    marginLeft: 12,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  removeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
});

