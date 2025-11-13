import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import { postponeLiabilitySchedule } from '@/utils/liabilityPaymentAdjustments';
import { supabase } from '@/lib/supabase';

interface PostponeLiabilityScheduleModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  liabilityId: string;
  onSuccess?: () => void;
}

export default function PostponeLiabilityScheduleModal({
  visible,
  onClose,
  scheduleId,
  liabilityId,
  onSuccess,
}: PostponeLiabilityScheduleModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);
  const [liability, setLiability] = useState<any>(null);
  const [newDueDate, setNewDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible && scheduleId && user) {
      fetchSchedule();
      fetchLiability();
    }
  }, [visible, scheduleId, user]);

  const fetchSchedule = async () => {
    if (!user || !scheduleId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('liability_schedules')
        .select('*')
        .eq('id', scheduleId)
        .eq('user_id', user.id)
        .eq('liability_id', liabilityId)
        .single();

      if (error) throw error;
      setSchedule(data);
      if (data?.due_date) {
        setNewDueDate(new Date(data.due_date));
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
      Alert.alert('Error', 'Failed to load payment schedule');
    } finally {
      setLoading(false);
    }
  };

  const fetchLiability = async () => {
    if (!user || !liabilityId) return;
    
    try {
      const { data, error } = await supabase
        .from('liabilities')
        .select('targeted_payoff_date')
        .eq('id', liabilityId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setLiability(data);
    } catch (error) {
      console.error('Error fetching liability:', error);
    }
  };

  const handlePostpone = async () => {
    if (!user || !schedule) return;

    // Validate new date
    if (newDueDate < new Date()) {
      Alert.alert('Error', 'New due date cannot be in the past');
      return;
    }

    if (liability?.targeted_payoff_date && newDueDate > new Date(liability.targeted_payoff_date)) {
      Alert.alert(
        'Error',
        `New due date cannot be after liability end date (${new Date(liability.targeted_payoff_date).toLocaleDateString()})`
      );
      return;
    }

    try {
      setSaving(true);
      const result = await postponeLiabilitySchedule(
        scheduleId,
        liabilityId,
        user.id,
        newDueDate
      );

      if (result.success) {
        Alert.alert('Success', result.message, [
          {
            text: 'OK',
            onPress: () => {
              onSuccess?.();
              onClose();
            },
          },
        ]);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error: any) {
      console.error('Error postponing payment:', error);
      Alert.alert('Error', error.message || 'Failed to postpone payment');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (date: Date | string) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!visible) return null;

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Postpone Payment</Text>
              <View style={styles.closeButton} />
            </View>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#000000" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  if (!schedule) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Postpone Payment</Text>
              <View style={styles.closeButton} />
            </View>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Payment schedule not found</Text>
              <TouchableOpacity style={styles.backButton} onPress={onClose}>
                <Text style={styles.backButtonText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

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
            <Text style={styles.headerTitle}>Postpone Payment</Text>
            <View style={styles.closeButton} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Payment Info */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.infoLabel}>Current Payment</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Due Date</Text>
                <Text style={styles.infoValue}>{formatDate(schedule.due_date)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Amount</Text>
                <Text style={styles.infoValue}>{formatCurrency(Number(schedule.amount || 0))}</Text>
              </View>
            </GlassCard>

            {/* New Date Selection */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.sectionTitle}>New Due Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#000000" />
                <Text style={styles.dateText}>{formatDate(newDueDate)}</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={newDueDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date()}
                  maximumDate={liability?.targeted_payoff_date ? new Date(liability.targeted_payoff_date) : undefined}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) setNewDueDate(selectedDate);
                  }}
                />
              )}
              {liability?.targeted_payoff_date && (
                <Text style={styles.dateHint}>
                  Must be before {formatDate(liability.targeted_payoff_date)}
                </Text>
              )}
            </GlassCard>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, saving && styles.submitButtonDisabled]}
              onPress={handlePostpone}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Postpone Payment</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  infoValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
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
  },
  dateText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  dateHint: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  submitButton: {
    marginTop: 24,
    paddingVertical: 16,
    backgroundColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

