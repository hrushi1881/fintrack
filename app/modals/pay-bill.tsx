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
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import FundPicker, { FundBucket } from '@/components/FundPicker';
import { fetchBillById } from '@/utils/bills';
import { fetchCategories } from '@/utils/categories';
import { useLocalSearchParams, router } from 'expo-router';

type BillData = {
  id: string;
  title: string;
  amount?: number;
  due_date: string;
  status: string;
  linked_account_id?: string;
  category_id?: string;
  description?: string;
  parent_bill_id?: string;
  bill_type: string;
};

interface PayBillModalProps {
  visible?: boolean;
  onClose?: () => void;
  bill?: BillData | null;
  onSuccess?: () => void;
}

export default function PayBillModal({ visible: propVisible, onClose: propOnClose, bill: propBill, onSuccess }: PayBillModalProps) {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { currency } = useSettings();
  const { globalRefresh, refreshAccounts, refreshAccountFunds, refreshTransactions } = useRealtimeData();
  
  const [bill, setBill] = useState<BillData | null>(propBill || null);
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

  // Determine if modal is visible (from props or route)
  const visible = propVisible !== undefined ? propVisible : (id !== undefined);

  useEffect(() => {
    if ((visible || id) && user) {
      // Reset form when modal opens
      setAmount('');
      setSelectedAccountId(null);
      setSelectedFundBucket(null);
      setDescription('');
      setPaymentDate(new Date());
      fetchBill();
      fetchAccounts();
    }
  }, [visible, id, user]);

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
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  const fetchBill = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const billId = id || propBill?.id;
      if (!billId) {
        setBill(null);
        return;
      }

      const billData = await fetchBillById(billId as string);
      if (billData) {
        setBill(billData);
        // Pre-fill amount with bill amount if available
        if (billData.amount) {
          setAmount(billData.amount.toString());
        }
        // Pre-fill account if linked
        if (billData.linked_account_id) {
          setSelectedAccountId(billData.linked_account_id);
        } else if (accounts.length > 0) {
          setSelectedAccountId(accounts[0].id);
        }
        // Pre-fill description
        if (billData.description) {
          setDescription(billData.description);
        } else {
          setDescription(`Payment for ${billData.title}`);
        }
      }
    } catch (error) {
      console.error('Error fetching bill:', error);
      Alert.alert('Error', 'Failed to load bill');
    } finally {
      setLoading(false);
    }
  };

  // Auto-show fund picker when account is selected
  useEffect(() => {
    if (selectedAccountId && !selectedFundBucket && visible) {
      setShowFundPicker(true);
    }
  }, [selectedAccountId, visible]);

  // Reset fund bucket when account changes
  useEffect(() => {
    if (selectedAccountId && selectedFundBucket) {
      setSelectedFundBucket(null);
    }
  }, [selectedAccountId]);

  // Calculate regular accounts
  const regularAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];
    return accounts.filter((a) => 
      a.type !== 'liability' && 
      a.type !== 'goals_savings' && 
      a.is_active === true
    );
  }, [accounts]);

  const handlePayment = async () => {
    if (!user || !bill || !amount) return;
    
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
      
      // Get or find "Bills" category for bill payments
      let billCategoryId: string | null = null;
      try {
        const categories = await fetchCategories(user.id, { activityType: 'bill' });
        const billsCategory = categories.find(c => c.name === 'Bills' || c.name === 'Bill Payment');
        if (billsCategory) {
          billCategoryId = billsCategory.id;
        } else if (categories.length > 0) {
          billCategoryId = categories[0].id;
        } else {
          const expenseCategories = await fetchCategories(user.id, { activityType: 'expense' });
          const billsExpenseCategory = expenseCategories.find(c => c.name === 'Bills');
          if (billsExpenseCategory) {
            billCategoryId = billsExpenseCategory.id;
          } else if (expenseCategories.length > 0) {
            billCategoryId = expenseCategories[0].id;
          }
        }
      } catch (error) {
        console.error('Error fetching category:', error);
      }

      // Construct bucket parameter from selected fund
      const bucketParam = {
        type: selectedFundBucket.type === 'borrowed' ? 'liability' : selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };

      // Create expense transaction via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user.id,
        p_account_id: selectedAccountId,
        p_bucket: bucketParam,
        p_amount: amountNum,
        p_category: billCategoryId || bill.category_id || null,
        p_description: description || `Payment for ${bill.title}`,
        p_date: paymentDate.toISOString().split('T')[0],
        p_currency: currency,
      });

      if (rpcError) throw rpcError;

      // Mark bill as paid
      const { error: billError } = await supabase
        .from('bills')
        .update({
          status: 'paid',
          last_paid_date: paymentDate.toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
          metadata: {
            paid_amount: amountNum,
            paid_date: paymentDate.toISOString().split('T')[0],
            transaction_id: (rpcData as string) || null,
          },
        })
        .eq('id', bill.id);

      if (billError) throw billError;

      // If this is a payment bill (has parent), check if we need to generate next payment bill
      if (bill.parent_bill_id) {
        // Check if container bill has auto-create enabled and generate next payment bill
        const { data: containerBill } = await supabase
          .from('bills')
          .select('*')
          .eq('id', bill.parent_bill_id)
          .single();

        if (containerBill && containerBill.auto_create && containerBill.frequency) {
          // Calculate next due date based on frequency
          const currentDueDate = new Date(bill.due_date);
          let nextDueDate = new Date(currentDueDate);

          switch (containerBill.frequency) {
            case 'daily':
              nextDueDate.setDate(nextDueDate.getDate() + (containerBill.recurrence_interval || 1));
              break;
            case 'weekly':
              nextDueDate.setDate(nextDueDate.getDate() + 7 * (containerBill.recurrence_interval || 1));
              break;
            case 'biweekly':
              nextDueDate.setDate(nextDueDate.getDate() + 14);
              break;
            case 'monthly':
              nextDueDate.setMonth(nextDueDate.getMonth() + (containerBill.recurrence_interval || 1));
              break;
            case 'bimonthly':
              nextDueDate.setMonth(nextDueDate.getMonth() + 2);
              break;
            case 'quarterly':
              nextDueDate.setMonth(nextDueDate.getMonth() + 3);
              break;
            case 'halfyearly':
              nextDueDate.setMonth(nextDueDate.getMonth() + 6);
              break;
            case 'yearly':
              nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
              break;
          }

          // Create next payment bill
          const { error: nextBillError } = await supabase
            .from('bills')
            .insert({
              user_id: user.id,
              title: `${containerBill.title} - Payment`,
              description: containerBill.description,
              amount: containerBill.amount,
              currency: containerBill.currency,
              due_date: nextDueDate.toISOString().split('T')[0],
              original_due_date: nextDueDate.toISOString().split('T')[0],
              status: 'upcoming',
              bill_type: containerBill.bill_type,
              parent_bill_id: containerBill.id,
              linked_account_id: containerBill.linked_account_id || selectedAccountId,
              category_id: containerBill.category_id,
              color: containerBill.color,
              icon: containerBill.icon,
              reminder_days: containerBill.reminder_days || [3, 1],
              is_active: true,
              is_deleted: false,
            });

          if (nextBillError) {
            console.error('Error creating next payment bill:', nextBillError);
          }
        }
      }

      // Wait for database commit
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh all data
      await Promise.all([
        refreshAccounts(),
        refreshAccountFunds(),
        refreshTransactions(),
      ]);

      Alert.alert('Success', 'Payment recorded successfully', [
        {
          text: 'OK',
          onPress: () => {
            globalRefresh();
            onSuccess?.();
            handleClose();
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      router.back();
    }
  };

  if (!visible) return null;

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Bill</Text>
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

  if (!bill) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Bill</Text>
              <View style={styles.closeButton} />
            </View>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Bill not found</Text>
              <TouchableOpacity style={styles.backButton} onPress={handleClose}>
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
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Pay Bill</Text>
              <View style={styles.closeButton} />
            </View>

            <ScrollView 
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Bill Info */}
              <GlassCard padding={20} marginVertical={12}>
                <Text style={styles.infoLabel}>Bill</Text>
                <Text style={styles.infoValue}>{bill.title}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Amount Due</Text>
                  <Text style={styles.infoBalance}>
                    {bill.amount ? formatCurrency(bill.amount) : 'Variable'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Due Date</Text>
                  <Text style={styles.infoBalance}>
                    {new Date(bill.due_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
              </GlassCard>

              {/* Account Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Account</Text>
                {regularAccounts.length === 0 ? (
                  <GlassCard padding={20} marginVertical={8}>
                    <Text style={styles.emptyText}>
                      No accounts available. Please create an account first.
                    </Text>
                  </GlassCard>
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
                        <View style={styles.accountInfo}>
                          <Text style={[
                            styles.accountName,
                            selectedAccountId === acc.id && styles.accountNameActive,
                          ]}>
                            {acc.name}
                          </Text>
                          <Text style={styles.accountBalance}>
                            {formatCurrency(Number(acc.balance || 0))}
                          </Text>
                        </View>
                        {selectedAccountId === acc.id && (
                          <Ionicons name="checkmark-circle" size={24} color="#000000" />
                        )}
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
                                ? 'wallet-outline'
                                : selectedFundBucket.type === 'borrowed'
                                ? 'card-outline'
                                : 'layers-outline'
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
                      <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.selectFundButton}
                      onPress={() => setShowFundPicker(true)}
                    >
                      <Ionicons name="wallet-outline" size={20} color="#000000" />
                      <Text style={styles.selectFundText}>Select Fund Source</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

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
                {bill.amount && (
                  <TouchableOpacity
                    style={styles.suggestedAmountButton}
                    onPress={() => setAmount(bill.amount!.toString())}
                  >
                    <Text style={styles.suggestedAmountText}>
                      Use bill amount: {formatCurrency(bill.amount)}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Date */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payment Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="#000000" />
                  <Text style={styles.dateText}>{formatDate(paymentDate)}</Text>
                  <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.4)" />
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
                  style={styles.input}
                  placeholder="Add notes about this payment"
                  placeholderTextColor="rgba(0, 0, 0, 0.4)"
                  multiline
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>
            </ScrollView>

            {/* Footer with Submit Button */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.submitButton, saving && styles.submitButtonDisabled]}
                onPress={handlePayment}
                disabled={saving || !selectedAccountId || !selectedFundBucket || !amount}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Record Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      
      {/* Fund Picker Modal */}
      {selectedAccountId && bill && (
        <FundPicker
          visible={showFundPicker}
          onClose={() => setShowFundPicker(false)}
          accountId={selectedAccountId}
          onSelect={(bucket) => {
            // For bills, allow Personal Fund only (goal funds are excluded)
            if (bucket.type === 'personal') {
              setSelectedFundBucket(bucket);
              setShowFundPicker(false);
            } else {
              Alert.alert(
                'Invalid Selection',
                'For bills, you can only pay from Personal Fund.'
              );
            }
          }}
          amount={parseFloat(amount) || 0}
          excludeGoalFunds={true}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: 'transparent',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  modalContainer: {
    width: '100%',
    height: '100%',
    minHeight: 500,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 30,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
    flexDirection: 'column',
  },
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
    flexShrink: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
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
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    flexGrow: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    flexShrink: 0,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 60,
    minHeight: 200,
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
    paddingVertical: 60,
    minHeight: 200,
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
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 20,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  infoBalance: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
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
  accountList: {
    gap: 8,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accountItemActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderColor: '#000000',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  accountNameActive: {
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  fundBucketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
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
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  fundBucketAmount: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  selectFundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderStyle: 'dashed',
    gap: 8,
  },
  selectFundText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
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
  suggestedAmountButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  suggestedAmountText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textDecorationLine: 'underline',
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
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  submitButtonText: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
