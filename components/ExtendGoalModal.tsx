import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrencyAmount } from '@/utils/currency';
import { Goal } from '@/types';
import CalendarDatePicker from './CalendarDatePicker';

interface ExtendGoalModalProps {
  visible: boolean;
  onClose: () => void;
  onExtend: (data: { newTarget?: number; newDate?: string }) => void;
  goal: Goal;
}

export default function ExtendGoalModal({
  visible,
  onClose,
  onExtend,
  goal,
}: ExtendGoalModalProps) {
  const [extendType, setExtendType] = useState<'amount' | 'date' | null>(null);
  const [newTarget, setNewTarget] = useState('');
  const [newDate, setNewDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, goal.currency);
  };

  const handleExtendType = (type: 'amount' | 'date') => {
    setExtendType(type);
    if (type === 'date') {
      setShowDatePicker(true);
    }
  };

  const handleDateSelect = (date: Date) => {
    setNewDate(date.toISOString().split('T')[0]);
    setShowDatePicker(false);
  };

  const handleConfirm = () => {
    if (extendType === 'amount' && newTarget) {
      const targetValue = parseFloat(newTarget);
      if (targetValue <= goal.target_amount) {
        Alert.alert('Error', 'New target must be higher than current target');
        return;
      }
      onExtend({ newTarget: targetValue });
    } else if (extendType === 'date' && newDate) {
      onExtend({ newDate });
    }
    onClose();
  };

  const resetForm = () => {
    setExtendType(null);
    setNewTarget('');
    setNewDate('');
    setShowDatePicker(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#000000', '#1F2937']}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Extend Goal</Text>
              <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>

            {!extendType ? (
              /* Step 1: Choose Extension Type */
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Do you want to add more or extend time?</Text>
                
                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => handleExtendType('amount')}
                >
                  <View style={styles.optionIcon}>
                    <Ionicons name="trending-up" size={24} color="#10B981" />
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Increase Amount</Text>
                    <Text style={styles.optionDescription}>
                      Raise your target to save even more
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={() => handleExtendType('date')}
                >
                  <View style={styles.optionIcon}>
                    <Ionicons name="calendar" size={24} color="#3B82F6" />
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Extend Date</Text>
                    <Text style={styles.optionDescription}>
                      Keep saving until a later date
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
            ) : extendType === 'amount' ? (
              /* Step 2: Enter New Target */
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>How much more?</Text>
                
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>New Target Amount</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={newTarget}
                    onChangeText={setNewTarget}
                    placeholder={`Current: ${formatCurrency(goal.target_amount)}`}
                    placeholderTextColor="#6B7280"
                    keyboardType="numeric"
                  />
                </View>

                {newTarget && (
                  <View style={styles.previewContainer}>
                    <Text style={styles.previewTitle}>Preview:</Text>
                    <Text style={styles.previewText}>
                      New target: {formatCurrency(parseFloat(newTarget) || 0)} 
                      (was {formatCurrency(goal.target_amount)})
                    </Text>
                  </View>
                )}

                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setExtendType(null)}
                  >
                    <Text style={styles.backButtonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, !newTarget && styles.disabledButton]}
                    onPress={handleConfirm}
                    disabled={!newTarget}
                  >
                    <Text style={styles.confirmButtonText}>Extend Goal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Step 3: Select New Date */
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Keep saving until...</Text>
                
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar" size={20} color="#3B82F6" />
                  <Text style={styles.dateButtonText}>
                    {newDate ? new Date(newDate).toLocaleDateString() : 'Select Date'}
                  </Text>
                </TouchableOpacity>

                {newDate && (
                  <View style={styles.previewContainer}>
                    <Text style={styles.previewTitle}>Preview:</Text>
                    <Text style={styles.previewText}>
                      More time, same dream — goal updated to {new Date(newDate).toLocaleDateString()}
                    </Text>
                  </View>
                )}

                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setExtendType(null)}
                  >
                    <Text style={styles.backButtonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, !newDate && styles.disabledButton]}
                    onPress={handleConfirm}
                    disabled={!newDate}
                  >
                    <Text style={styles.confirmButtonText}>Extend Goal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </LinearGradient>
        </View>
      </View>

      {/* Date Picker Modal */}
      <CalendarDatePicker
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onDateSelect={handleDateSelect}
        title="Select New Deadline"
        description="Choose when you want to reach your extended goal"
        minDate={new Date()}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepContainer: {
    gap: 20,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  dateButtonText: {
    fontSize: 16,
    color: 'white',
    marginLeft: 12,
  },
  previewContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 4,
  },
  previewText: {
    fontSize: 14,
    color: 'white',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#6B7280',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

