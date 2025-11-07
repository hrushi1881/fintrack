import React, { useState, useEffect, useMemo } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassmorphCard from '@/components/GlassmorphCard';
import FundPicker, { FundBucket } from '@/components/FundPicker';

type LiabilityData = {
  id: string;
  title: string;
  liability_type: string;
  current_balance: number;
  periodical_payment?: number;
  metadata?: any;
};

type LiabilityAllocation = {
  accountId: string;
  amount: number;
  liabilityName?: string;
};

interface PayLiabilityModalProps {
  visible: boolean;
  onClose: () => void;
  liabilityId: string;
  onSuccess?: () => void;
}

export default function PayLiabilityModal({ visible, onClose, liabilityId, onSuccess }: PayLiabilityModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { getAccountBreakdown, fetchLiabilityAllocations } = useLiabilities();
  const { globalRefresh, refreshAccounts } = useRealtimeData();
  
  const [liability, setLiability] = useState<LiabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // Payment form state
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    if (visible && liabilityId && user) {
      // Reset form when modal opens
      setAmount('');
      setSelectedAccountId(null);
      setSelectedFundBucket(null);
      setDescription('');
      setPaymentDate(new Date());
      fetchLiability();
      fetchAccounts();
    }
  }, [visible, liabilityId, user]);

  const fetchAccounts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAccounts(data || []);
      console.log('Fetched accounts for pay liability:', data?.length || 0, data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  // Auto-show fund picker when account is selected
  useEffect(() => {
    if (selectedAccountId && !selectedFundBucket) {
      setShowFundPicker(true);
    }
  }, [selectedAccountId]);

  // Reset fund bucket when account changes
  useEffect(() => {
    if (selectedAccountId && selectedFundBucket) {
      setSelectedFundBucket(null);
    }
  }, [selectedAccountId]);

  // Calculate regular accounts - must be called before early returns
  const regularAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];
    return accounts.filter((a) => 
      a.type !== 'liability' && 
      a.type !== 'goals_savings' && 
      a.is_active === true
    );
  }, [accounts]);

  const fetchLiability = async () => {
    if (!user || !liabilityId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('liabilities')
        .select('*')
        .eq('id', liabilityId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setLiability(data);
      
      // Pre-fill EMI amount if applicable
      if (data.periodical_payment) {
        setAmount(data.periodical_payment.toString());
      }
    } catch (error) {
      console.error('Error fetching liability:', error);
      Alert.alert('Error', 'Failed to load liability');
    } finally {
      setLoading(false);
    }
  };


  const detectLiabilityType = (liabilityType: string): 'loan' | 'emi' | 'one_time' => {
    if (['personal_loan', 'student_loan', 'auto_loan', 'mortgage'].includes(liabilityType)) {
      return 'loan';
    }
    if (liability?.periodical_payment) {
      return 'emi';
    }
    return 'one_time';
  };

  const handlePayment = async () => {
    if (!user || !liability || !amount) return;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!selectedAccountId) {
      Alert.alert('Error', 'Please select a payment account');
      return;
    }

    if (!selectedFundBucket) {
      Alert.alert('Error', 'Please select a fund source');
      return;
    }

    try {
      setSaving(true);
      // Use bucket-aware RPCs for repayment based on selected fund bucket
      if (selectedFundBucket.type === 'personal') {
        // Repay from personal funds using repay_liability
        const { error: repayErr } = await supabase.rpc('repay_liability', {
          p_user_id: user.id,
          p_account_id: selectedAccountId,
          p_liability_id: liability.id,
          p_amount: amountNum,
          p_date: paymentDate.toISOString().split('T')[0],
          p_notes: description || null,
        });
        if (repayErr) throw repayErr;
      } else if (selectedFundBucket.type === 'liability' && selectedFundBucket.id === liability.id) {
        // Repay using liability portion funds from the same liability
        const { error: settleErr } = await supabase.rpc('settle_liability_portion', {
          p_user_id: user.id,
          p_account_id: selectedAccountId,
          p_liability_id: liability.id,
          p_amount: amountNum,
          p_date: paymentDate.toISOString().split('T')[0],
          p_notes: description || null,
        });
        if (settleErr) throw settleErr;
      } else {
        Alert.alert('Error', 'Selected fund source is not valid for this liability payment');
        setSaving(false);
        return;
      }

      console.log('✅ Liability payment RPC success, refreshing accounts...');
      // Force immediate account refresh
      await refreshAccounts();
      
      // Small delay to ensure database has committed and state has updated
      await new Promise(resolve => setTimeout(resolve, 200));

      Alert.alert('Success', 'Payment recorded successfully', [
        {
          text: 'OK',
          onPress: () => {
            globalRefresh();
            onSuccess?.();
            onClose();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error recording payment:', error);
      Alert.alert('Error', error.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <LinearGradient colors={["#99D795", "#99D795", "#99D795"]} style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={onClose}>
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Liability</Text>
              <View style={{ width: 28 }} />
            </View>
            <View style={styles.container}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Modal>
    );
  }

  if (!liability) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <LinearGradient colors={["#99D795", "#99D795", "#99D795"]} style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={onClose}>
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Liability</Text>
              <View style={{ width: 28 }} />
            </View>
            <View style={styles.container}>
              <Text style={styles.errorText}>Liability not found</Text>
              <TouchableOpacity style={styles.backButton} onPress={onClose}>
                <Text style={styles.backButtonText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Modal>
    );
  }

  const liabilityType = detectLiabilityType(liability.liability_type);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient colors={["#99D795", "#99D795", "#99D795"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={onClose}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Pay Liability</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Liability Info */}
          <GlassmorphCard style={styles.infoCard}>
            <Text style={styles.infoLabel}>Liability</Text>
            <Text style={styles.infoValue}>{liability.title}</Text>
            <Text style={styles.infoBalance}>
              Balance: {formatCurrency(parseFloat(liability.current_balance || '0'))}
            </Text>
          </GlassmorphCard>

          {/* Account Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Account</Text>
            {regularAccounts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No accounts available. Please create an account first.</Text>
              </View>
            ) : (
              <View style={styles.accountList}>
                {regularAccounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountItem,
                      selectedAccountId === acc.id && styles.accountItemActive,
                    ]}
                    onPress={() => setSelectedAccountId(acc.id)}
                  >
                    <Text style={styles.accountName}>{acc.name}</Text>
                    <Text style={styles.accountBalance}>
                      {formatCurrency(parseFloat(acc.balance || '0'))}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Fund Source Selection */}
          {selectedAccountId && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Fund Source</Text>
              {selectedFundBucket ? (
                <TouchableOpacity
                  style={styles.fundBucketButton}
                  onPress={() => setShowFundPicker(true)}
                >
                  <View style={styles.fundBucketInfo}>
                    <View style={[styles.fundBucketIcon, { backgroundColor: (selectedFundBucket.color || '#6366F1') + '20' }]}>
                      <Ionicons
                        name={
                          selectedFundBucket.type === 'personal'
                            ? 'person'
                            : selectedFundBucket.type === 'liability'
                            ? 'card'
                            : 'flag'
                        }
                        size={20}
                        color={selectedFundBucket.color || '#6366F1'}
                      />
                    </View>
                    <View style={styles.fundBucketDetails}>
                      <Text style={styles.fundBucketName}>{selectedFundBucket.name}</Text>
                      <Text style={styles.fundBucketAmount}>
                        Available: {formatCurrencyAmount(selectedFundBucket.amount, currency)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.selectFundButton}
                  onPress={() => setShowFundPicker(true)}
                >
                  <Ionicons name="wallet-outline" size={20} color="#10B981" />
                  <Text style={styles.selectFundText}>Select Fund Source</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Amount */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Amount</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter amount"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateText}>
                {paymentDate.toLocaleDateString()}
              </Text>
              <Ionicons name="calendar" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={paymentDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) setPaymentDate(selectedDate);
                }}
              />
            )}
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Add notes"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* Mock Payment Toggle */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsMock(!isMock)}
            >
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>Mock/Historical Payment</Text>
                <Text style={styles.toggleSubtitle}>
                  Record payment without affecting account balances
                </Text>
              </View>
              <View
                style={[
                  styles.toggleSwitch,
                  isMock && styles.toggleSwitchActive,
                ]}
              >
                <View style={[styles.toggleDot, isMock && styles.toggleDotActive]} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={handlePayment}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Record Payment</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
      
      {/* Fund Picker Modal */}
      {selectedAccountId && liability && (
        <FundPicker
          visible={showFundPicker}
          onClose={() => setShowFundPicker(false)}
          accountId={selectedAccountId}
          onSelect={(bucket) => {
            // Only allow personal or same liability bucket
            if (bucket.type === 'personal' || (bucket.type === 'liability' && bucket.id === liability.id)) {
              setSelectedFundBucket(bucket);
              setShowFundPicker(false);
            } else {
              Alert.alert('Invalid Selection', 'You can only pay from personal funds or funds from this liability.');
            }
          }}
          amount={parseFloat(amount) || 0}
        />
      )}
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingTop: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 12,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  backButtonText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    textAlign: 'center',
  },
  infoCard: {
    padding: 16,
    marginBottom: 24,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoBalance: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  sourceButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  sourceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    gap: 8,
  },
  sourceButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  sourceButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  sourceButtonTextActive: {
    color: '#10B981',
  },
  accountList: {
    gap: 8,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  accountItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  accountName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  accountBalance: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  accountBreakdown: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 4,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  emptyContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 20,
    marginTop: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  toggleSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.5)',
  },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleDotActive: {
    alignSelf: 'flex-end',
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  fundBucketButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  fundBucketInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fundBucketIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fundBucketDetails: {
    flex: 1,
  },
  fundBucketName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  fundBucketAmount: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  selectFundButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderStyle: 'dashed',
  },
  selectFundText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '500',
  },
});
