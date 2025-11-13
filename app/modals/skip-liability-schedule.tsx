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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import { skipLiabilitySchedule, SkipPaymentOption } from '@/utils/liabilityPaymentAdjustments';
import { supabase } from '@/lib/supabase';

interface SkipLiabilityScheduleModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  liabilityId: string;
  onSuccess?: () => void;
}

export default function SkipLiabilityScheduleModal({
  visible,
  onClose,
  scheduleId,
  liabilityId,
  onSuccess,
}: SkipLiabilityScheduleModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<SkipPaymentOption>('addToNext');

  useEffect(() => {
    if (visible && scheduleId && user) {
      fetchSchedule();
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
    } catch (error) {
      console.error('Error fetching schedule:', error);
      Alert.alert('Error', 'Failed to load payment schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!user || !schedule) return;

    try {
      setSaving(true);
      const result = await skipLiabilitySchedule(
        scheduleId,
        liabilityId,
        user.id,
        selectedOption
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
      console.error('Error skipping payment:', error);
      Alert.alert('Error', error.message || 'Failed to skip payment');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
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
              <Text style={styles.headerTitle}>Skip Payment</Text>
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
              <Text style={styles.headerTitle}>Skip Payment</Text>
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
            <Text style={styles.headerTitle}>Skip Payment</Text>
            <View style={styles.closeButton} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Payment Info */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.infoLabel}>Payment Details</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Due Date</Text>
                <Text style={styles.infoValue}>{formatDate(schedule.due_date)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Amount</Text>
                <Text style={styles.infoValue}>{formatCurrency(Number(schedule.amount || 0))}</Text>
              </View>
            </GlassCard>

            {/* Skip Options */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.optionsTitle}>How should we handle this skipped payment?</Text>

              <TouchableOpacity
                style={[
                  styles.optionButton,
                  selectedOption === 'addToNext' && styles.optionButtonActive,
                ]}
                onPress={() => setSelectedOption('addToNext')}
              >
                <Ionicons
                  name={selectedOption === 'addToNext' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedOption === 'addToNext' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Add to Next Payment</Text>
                  <Text style={styles.optionDescription}>
                    Next payment will include this amount. Catches up immediately.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.optionButton,
                  selectedOption === 'addToEnd' && styles.optionButtonActive,
                ]}
                onPress={() => setSelectedOption('addToEnd')}
              >
                <Ionicons
                  name={selectedOption === 'addToEnd' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedOption === 'addToEnd' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Add to End of Loan</Text>
                  <Text style={styles.optionDescription}>
                    All regular payments stay the same. One extra payment added at the end.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.optionButton,
                  selectedOption === 'spreadAcross' && styles.optionButtonActive,
                ]}
                onPress={() => setSelectedOption('spreadAcross')}
              >
                <Ionicons
                  name={selectedOption === 'spreadAcross' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedOption === 'spreadAcross' ? '#000000' : 'rgba(0, 0, 0, 0.4)'}
                />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Spread Across Remaining Payments</Text>
                  <Text style={styles.optionDescription}>
                    Divide this amount across all remaining payments. No single large payment.
                  </Text>
                </View>
              </TouchableOpacity>
            </GlassCard>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, saving && styles.submitButtonDisabled]}
              onPress={handleSkip}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Skip Payment</Text>
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

