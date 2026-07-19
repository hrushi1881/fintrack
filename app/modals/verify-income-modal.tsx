/**
 * Verify Income Modal
 * 
 * Specialized modal for recording income received from recurring income streams.
 * Optimized UX for income verification with clear, positive messaging.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import LiquidGlassCard from '@/components/LiquidGlassCard';
import AccountSelector from '@/components/AccountSelector';
import { formatCurrencyAmount } from '@/utils/currency';
import { verifyIncomeReceived } from '@/utils/incomeCycles';
import { fetchRecurringTransactionById, RecurringTransaction } from '@/utils/recurringTransactions';

type VerifyIncomeModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  streamId: string;
  expectedDate: string;
  expectedAmount: number;
  streamTitle?: string;
  streamColor?: string;
  streamIcon?: string;
};

export default function VerifyIncomeModal({
  visible,
  onClose,
  onSuccess,
  streamId,
  expectedDate,
  expectedAmount,
  streamTitle,
  streamColor = '#10B981',
  streamIcon = 'cash',
}: VerifyIncomeModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, globalRefresh } = useRealtimeData();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stream, setStream] = useState<RecurringTransaction | null>(null);

  const [amount, setAmount] = useState(expectedAmount.toString());
  const [receivedDate, setReceivedDate] = useState(new Date(expectedDate));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const activeAccounts = accounts.filter(
    (acc) =>
      acc.type !== 'goals_savings' &&
      acc.type !== 'liability' &&
      (acc.is_active === true || acc.is_active === undefined)
  );

  useEffect(() => {
    const load = async () => {
      if (!user || !streamId) return;
      setLoading(true);
      try {
        const streamData = await fetchRecurringTransactionById(streamId);
        if (streamData) {
          setStream(streamData);
          if (streamData.account_id) {
            setSelectedAccountId(streamData.account_id);
          }
        }
      } catch (error) {
        console.error('Error loading income stream:', error);
      } finally {
        setLoading(false);
      }
    };
    if (visible) load();
  }, [visible, streamId, user]);

  const handleVerify = async () => {
    if (!user || !selectedAccountId) {
      Alert.alert('Error', 'Please select an account');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      setSaving(true);

      const result = await verifyIncomeReceived(
        streamId,
        receivedDate.toISOString().split('T')[0],
        amountNum,
        selectedAccountId,
        notes || `${streamTitle || stream?.title || 'Income'} received`
      );

      if (result.success) {
        await globalRefresh();
        Alert.alert('Success', 'Income verified successfully! 💰', [
          {
            text: 'OK',
            onPress: () => {
              onSuccess?.();
              onClose();
            },
          },
        ]);
      } else {
        Alert.alert('Error', 'Failed to verify income');
      }
    } catch (error: any) {
      console.error('Error verifying income:', error);
      Alert.alert('Error', error.message || 'Failed to verify income');
    } finally {
      setSaving(false);
    }
  };

  const variance = expectedAmount > 0 ? ((parseFloat(amount) - expectedAmount) / expectedAmount) * 100 : 0;
  const hasVariance = Math.abs(variance) > 1;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.modalHeader}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#041B11" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Verify Income Received</Text>
          <View style={{ width: 28 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Stream Info Card */}
            <LiquidGlassCard variant="premium" style={styles.streamCard}>
              <View style={styles.streamHeader}>
                <LinearGradient
                  colors={[streamColor + '30', streamColor + '10']}
                  style={styles.streamIconContainer}
                >
                  <Ionicons name={streamIcon as any} size={32} color={streamColor} />
                </LinearGradient>
                <View style={styles.streamInfo}>
                  <Text style={styles.streamTitle}>{streamTitle || stream?.title || 'Income Stream'}</Text>
                  <Text style={styles.streamSubtitle}>Expected Payment</Text>
                </View>
              </View>

              <View style={styles.expectedRow}>
                <View>
                  <Text style={styles.expectedLabel}>Expected Amount</Text>
                  <Text style={styles.expectedAmount}>
                    {formatCurrencyAmount(expectedAmount, currency)}
                  </Text>
                </View>
                <View style={styles.expectedDateBox}>
                  <Text style={styles.expectedLabel}>Expected Date</Text>
                  <Text style={styles.expectedDate}>
                    {new Date(expectedDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              </View>
            </LiquidGlassCard>

            {/* Amount Input */}
            <LiquidGlassCard variant="frosted" style={styles.inputCard}>
              <Text style={styles.inputLabel}>Actual Amount Received</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>{currency}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor="rgba(4,27,17,0.3)"
                />
              </View>

              {hasVariance && (
                <View
                  style={[
                    styles.varianceBadge,
                    {
                      backgroundColor: variance > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      borderColor: variance > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                    },
                  ]}
                >
                  <Ionicons
                    name={variance > 0 ? 'trending-up' : 'trending-down'}
                    size={16}
                    color={variance > 0 ? '#10B981' : '#EF4444'}
                  />
                  <Text
                    style={[
                      styles.varianceText,
                      { color: variance > 0 ? '#10B981' : '#EF4444' },
                    ]}
                  >
                    {variance > 0 ? '+' : ''}
                    {variance.toFixed(1)}% from expected
                  </Text>
                </View>
              )}
            </LiquidGlassCard>

            {/* Date Picker */}
            <LiquidGlassCard variant="frosted" style={styles.inputCard}>
              <Text style={styles.inputLabel}>Date Received</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar" size={20} color="#10B981" />
                <Text style={styles.dateButtonText}>
                  {receivedDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <Ionicons name="chevron-down" size={20} color="rgba(4,27,17,0.4)" />
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={receivedDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (date) setReceivedDate(date);
                  }}
                  maximumDate={new Date()}
                />
              )}
            </LiquidGlassCard>

            {/* Account Selector */}
            <LiquidGlassCard variant="frosted" style={styles.inputCard}>
              <Text style={styles.inputLabel}>Received In Account</Text>
              <AccountSelector
                accounts={activeAccounts}
                selectedAccountId={selectedAccountId}
                onSelect={setSelectedAccountId}
                placeholder="Select account"
                showBalance
              />
            </LiquidGlassCard>

            {/* Notes */}
            <LiquidGlassCard variant="frosted" style={styles.inputCard}>
              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any notes about this payment..."
                placeholderTextColor="rgba(4,27,17,0.3)"
                multiline
                numberOfLines={3}
              />
            </LiquidGlassCard>

            {/* Verify Button */}
            <TouchableOpacity
              style={[styles.verifyButton, saving && styles.verifyButtonDisabled]}
              onPress={handleVerify}
              disabled={saving}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.verifyButtonGradient}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={24} color="#FFFFFF" />
                    <Text style={styles.verifyButtonText}>Verify Income Received</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(4,27,17,0.06)',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(4,27,17,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  streamCard: {
    padding: 20,
    marginBottom: 20,
  },
  streamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 16,
  },
  streamIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamInfo: {
    flex: 1,
  },
  streamTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginBottom: 4,
  },
  streamSubtitle: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
  },
  expectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  expectedLabel: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expectedAmount: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: '#10B981',
  },
  expectedDateBox: {
    alignItems: 'flex-end',
  },
  expectedDate: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  inputCard: {
    padding: 20,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginBottom: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(4,27,17,0.03)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  currencySymbol: {
    fontSize: 32,
    fontFamily: 'Poppins-SemiBold',
    color: '#10B981',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
    paddingVertical: 12,
  },
  varianceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  varianceText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(4,27,17,0.03)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
    color: '#041B11',
  },
  notesInput: {
    backgroundColor: 'rgba(4,27,17,0.03)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#041B11',
    textAlignVertical: 'top',
    minHeight: 80,
  },
  verifyButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
  },
  verifyButtonText: {
    fontSize: 17,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
  },
});
