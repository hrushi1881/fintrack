/**
 * Liability Payment Modal (Save vs Pay)
 * - Supports creating/updating a bill (one per cycle) via "Save Bill"
 * - Supports paying (spend + liability_payment + mark bill paid) via "Pay Now"
 * - Can be opened from a cycle (prefill date/amount/account) or directly
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
// Flat card style replaces glassmorphism
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import { fetchCategories } from '@/utils/categories';
import { fetchBillById, upsertBillWithCycle } from '@/utils/bills';
import FundPicker, { FundBucket } from '@/components/FundPicker';
import AccountSelector from '@/components/AccountSelector';

type LiabilityPaymentModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  liabilityId?: string;
  billId?: string;
  // Cycle context (optional)
  cycleNumber?: number;
  expectedAmount?: number;
  expectedDate?: string;
  recurringTransactionId?: string;
  // Prefills
  prefillAmount?: number;
  prefillDate?: Date;
};

export default function LiabilityPaymentModal({
  visible,
  onClose,
  onSuccess,
  liabilityId,
  billId,
  cycleNumber,
  expectedAmount,
  expectedDate,
  recurringTransactionId,
  prefillAmount,
  prefillDate,
}: LiabilityPaymentModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, refreshAccounts, refreshAccountFunds, refreshTransactions, globalRefresh } = useRealtimeData();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bill, setBill] = useState<any | null>(null);
  const [liability, setLiability] = useState<any | null>(null);
  const [availableBills, setAvailableBills] = useState<any[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(billId || null);
  const [totalAmount, setTotalAmount] = useState<string>(prefillAmount ? prefillAmount.toString() : expectedAmount ? expectedAmount.toString() : '');
  const [interestIncluded, setInterestIncluded] = useState(true);
  const [interestAmount, setInterestAmount] = useState<string>('0');
  const [feesAmount, setFeesAmount] = useState<string>('0');
  const [principalAmount, setPrincipalAmount] = useState<string>(expectedAmount ? expectedAmount.toString() : '');
  const [paymentDate, setPaymentDate] = useState<Date>(prefillDate || (expectedDate ? new Date(expectedDate) : new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [purposeTag, setPurposeTag] = useState<string>('regular_payment');
  const [showFundPicker, setShowFundPicker] = useState(false);
  const [showBillsList, setShowBillsList] = useState(false);

  // Fetch liability/bill if needed
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        if (liabilityId) {
          const { data: liab } = await supabase
            .from('liabilities')
            .select('*')
            .eq('id', liabilityId)
            .eq('user_id', user.id)
            .single();
          if (liab) setLiability(liab);

          // Fetch all bills for this liability
          const { data: bills } = await supabase
            .from('bills')
            .select('*')
            .eq('liability_id', liabilityId)
            .eq('user_id', user.id)
            .in('status', ['upcoming', 'due_today', 'overdue', 'postponed'])
            .order('due_date', { ascending: true });
          
          if (bills) {
            setAvailableBills(bills);
            // If cycleNumber is provided, try to find matching bill
            if (cycleNumber) {
              const cycleBill = bills.find(
                (b) => b.metadata?.cycle_number === cycleNumber
              );
              if (cycleBill) {
                setSelectedBillId(cycleBill.id);
                setBill(cycleBill);
              }
            }
          }
        }

        if (billId) {
          const existingBill = await fetchBillById(billId);
          if (existingBill) {
            setBill(existingBill);
            setSelectedBillId(billId);
            setTotalAmount((existingBill.total_amount || existingBill.amount || 0).toString());
            setPaymentDate(new Date(existingBill.due_date));
            if (existingBill.linked_account_id) setSelectedAccountId(existingBill.linked_account_id);
            setInterestIncluded(existingBill.interest_included ?? true);
            if (existingBill.interest_amount) setInterestAmount(existingBill.interest_amount.toString());
            if (existingBill.principal_amount) setPrincipalAmount(existingBill.principal_amount.toString());
          }
        }
      } catch (e) {
        console.error('Error loading liability/bill', e);
      } finally {
        setLoading(false);
      }
    };
    if (visible) fetchData();
  }, [visible, user, liabilityId, billId, cycleNumber]);

  const suggestedText = useMemo(() => {
    if (expectedAmount) {
      return `Suggested amount: ${formatCurrencyAmount(expectedAmount, currency)} (Next bill)`;
    }
    return null;
  }, [expectedAmount, currency]);

  // Calculate actual total based on interest inclusion
  const calculatedTotal = useMemo(() => {
    const principal = parseFloat(principalAmount || '0') || 0;
    const interest = parseFloat(interestAmount || '0') || 0;
    const fees = parseFloat(feesAmount || '0') || 0;
    
    if (interestIncluded) {
      // Interest is already part of principal, so total = principal + fees
      return principal + fees;
    } else {
      // Interest is additional, so total = principal + interest + fees
    return principal + interest + fees;
    }
  }, [principalAmount, interestAmount, feesAmount, interestIncluded]);

  // Get selected account details
  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) return null;
    return accounts.find((acc) => acc.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  // Check if payment date is today
  const isToday = useMemo(() => {
    const today = new Date();
    const payment = new Date(paymentDate);
    return (
      today.getFullYear() === payment.getFullYear() &&
      today.getMonth() === payment.getMonth() &&
      today.getDate() === payment.getDate()
    );
  }, [paymentDate]);

  // Reset fund when account changes
  useEffect(() => {
    if (selectedAccountId && selectedFundBucket) {
      // Keep fund if it's still valid for the new account
      // Otherwise, reset it
      if (selectedFundBucket.type === 'personal') {
        // Personal fund is always valid
        return;
      }
      // For other funds, we'd need to check if they belong to the account
      // For simplicity, reset when account changes
      setSelectedFundBucket(null);
    }
  }, [selectedAccountId]);

  const buildBillPayload = async (forPay: boolean) => {
    if (!user) throw new Error('Not authenticated');
    
    const principalNum = parseFloat(principalAmount || '0') || 0;
    const interestNum = parseFloat(interestAmount || '0') || 0;
    const feesNum = parseFloat(feesAmount || '0') || 0;
    
    // Calculate actual total based on interest inclusion
    let amountNum: number;
    let actualPrincipal: number;
    let actualInterest: number;
    
    if (interestIncluded) {
      // Interest is included in principal
      // Total = Principal + Fees
      amountNum = principalNum + feesNum;
      // The interest portion is already part of principal
      actualPrincipal = principalNum - interestNum; // What actually reduces the debt
      actualInterest = interestNum; // The interest portion
      
      // If interest > principal, something is wrong, default to principal = 0
      if (actualPrincipal < 0) {
        actualPrincipal = 0;
        actualInterest = principalNum;
      }
    } else {
      // Interest is NOT included - add it to principal
      // Total = Principal + Interest + Fees
      amountNum = principalNum + interestNum + feesNum;
      actualPrincipal = principalNum;
      actualInterest = interestNum;
    }
    
    if (isNaN(amountNum) || amountNum <= 0) throw new Error('Enter a valid amount');

    let categoryId: string | null = bill?.category_id || null;
    try {
      const categories = await fetchCategories(user.id, { activityType: 'expense' });
      if (!categoryId && categories.length > 0) categoryId = categories[0].id;
    } catch (err) {
      console.error('Error fetching categories', err);
    }

    const dueDateString = paymentDate.toISOString().split('T')[0];
    const cycleNum = cycleNumber ?? bill?.metadata?.cycle_number ?? 1;

    return {
      userId: user.id,
      liabilityId: liabilityId || bill?.liability_id,
      cycleNumber: cycleNum,
      amount: amountNum,
      currency,
      dueDate: dueDateString,
      originalDueDate: dueDateString,
      linkedAccountId: selectedAccountId || null,
      categoryId,
      interestAmount: actualInterest, // Actual interest amount
      principalAmount: actualPrincipal, // Amount reducing the debt
      feesAmount: feesNum,
      interestIncluded,
      paymentNumber: cycleNum,
      frequency: liability?.periodical_frequency || 'monthly',
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
      description: bill?.description || null,
      title: bill?.title || liability?.title || 'Payment',
      totalAmount: amountNum,
      metadata: {
        ...(bill?.metadata || {}),
        cycle_number: cycleNum,
        liability_id: liabilityId || bill?.liability_id,
        created_from_cycle: !!cycleNumber,
        interest_included: interestIncluded,
        interest_entered: interestNum, // What user entered
        principal_entered: principalNum, // What user entered
        fees_entered: feesNum,
      },
      color: '#10B981',
      icon: 'receipt-outline',
    };
  };

  const handleSaveBill = async () => {
    try {
      setSaving(true);
      const payload = await buildBillPayload(false);
      if (!payload.liabilityId) throw new Error('Missing liability');
      const { id } = await upsertBillWithCycle(payload);
      const updated = await fetchBillById(id);
      if (updated) setBill(updated);
      Alert.alert('Saved', 'Bill saved successfully');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectBill = (selectedBill: any) => {
    setSelectedBillId(selectedBill.id);
    setBill(selectedBill);
    setTotalAmount((selectedBill.total_amount || selectedBill.amount || 0).toString());
    setPaymentDate(new Date(selectedBill.due_date));
    if (selectedBill.linked_account_id) setSelectedAccountId(selectedBill.linked_account_id);
    setInterestIncluded(selectedBill.interest_included ?? true);
    if (selectedBill.interest_amount) setInterestAmount(selectedBill.interest_amount.toString());
    if (selectedBill.principal_amount) setPrincipalAmount(selectedBill.principal_amount.toString());
    setShowBillsList(false);
  };

  const handlePayNow = async () => {
    if (!selectedAccountId) {
      Alert.alert('Select account', 'Please select an account to pay from.');
      return;
    }
    if (!selectedFundBucket) {
      Alert.alert('Select fund', 'Please select a fund source.');
      return;
    }
    try {
      setSaving(true);

      // Build payload first (outside the if-else blocks)
      const payload = await buildBillPayload(true);
      if (!payload.liabilityId) throw new Error('Missing liability');

      const amountNum = parseFloat(totalAmount || '0');
      const paymentDateStr = paymentDate.toISOString().split('T')[0];
      
      // Cycle window tolerance (±7 days from due date is considered "within window")
      const TOLERANCE_DAYS = 7;
      
      // Calculate payment timing using cycle window rules
      const expectedDateStr = expectedDate || payload.dueDate;
      const expectedDateObj = new Date(expectedDateStr);
      const paymentDateObj = new Date(paymentDateStr);
      expectedDateObj.setHours(0, 0, 0, 0);
      paymentDateObj.setHours(0, 0, 0, 0);
      
      // Calculate days difference from expected date
      const daysDiff = Math.floor((paymentDateObj.getTime() - expectedDateObj.getTime()) / (1000 * 60 * 60 * 24));
      
      // Determine payment timing based on cycle window rules:
      // - Within ±TOLERANCE_DAYS of expected date = on_time (within window)
      // - Before window start = early (paid ahead of schedule)
      // - After window end = late (paid after window closed)
      let paymentTiming: 'early' | 'on_time' | 'late' | 'within_window' = 'on_time';
      let isWithinWindow = true;
      
      if (daysDiff < -TOLERANCE_DAYS) {
        // Paid more than TOLERANCE_DAYS before due date - early
        paymentTiming = 'early';
      } else if (daysDiff > TOLERANCE_DAYS) {
        // Paid more than TOLERANCE_DAYS after due date - late
        paymentTiming = 'late';
        isWithinWindow = false; // Outside the acceptable window
      } else if (daysDiff < 0) {
        // Paid before due date but within tolerance window - still counts as on_time/within_window
        paymentTiming = 'early';
        isWithinWindow = true;
      } else if (daysDiff > 0) {
        // Paid after due date but within tolerance window - still counts as on_time/within_window
        paymentTiming = 'within_window'; // Late but acceptable
        isWithinWindow = true;
      } else {
        // Paid exactly on due date
        paymentTiming = 'on_time';
        isWithinWindow = true;
      }
      
      // Calculate amount comparison (over, under, exact) relative to expected amount
      // Use 1% tolerance for amount matching
      const expectedAmt = expectedAmount || payload.amount || 0;
      const amountTolerancePercent = 0.01; // 1% tolerance
      const toleranceAmount = expectedAmt * amountTolerancePercent;
      let amountComparison: 'over' | 'under' | 'exact' | 'partial' = 'exact';
      let amountDifference = amountNum - expectedAmt;
      
      if (amountNum > expectedAmt + toleranceAmount) {
        amountComparison = 'over';
      } else if (amountNum < expectedAmt - toleranceAmount) {
        // Check if it's a partial payment (some amount paid but not full)
        if (amountNum > 0 && amountNum < expectedAmt * 0.5) {
          amountComparison = 'partial';
        } else {
          amountComparison = 'under';
        }
      } else {
        amountComparison = 'exact';
        amountDifference = 0; // Treat as exact if within tolerance
      }
      
      // Determine overall cycle status based on timing and amount
      let cyclePaymentStatus: 'paid_on_time' | 'paid_early' | 'paid_late' | 'paid_within_window' | 'underpaid' | 'overpaid' | 'partial' = 'paid_on_time';
      
      if (amountComparison === 'partial') {
        cyclePaymentStatus = 'partial';
      } else if (amountComparison === 'under') {
        cyclePaymentStatus = 'underpaid';
      } else if (amountComparison === 'over') {
        cyclePaymentStatus = 'overpaid';
      } else if (paymentTiming === 'early') {
        cyclePaymentStatus = 'paid_early';
      } else if (paymentTiming === 'late') {
        cyclePaymentStatus = 'paid_late';
      } else if (paymentTiming === 'within_window') {
        cyclePaymentStatus = 'paid_within_window';
      } else {
        cyclePaymentStatus = 'paid_on_time';
      }

      // Use selected bill ID if available, otherwise create/upsert
      let ensuredBillId = selectedBillId;
      if (!ensuredBillId || !bill) {
        const { id } = await upsertBillWithCycle(payload);
        ensuredBillId = id;
      } else {
        // Update existing bill with current values
        await upsertBillWithCycle({ ...payload, cycleNumber: bill.metadata?.cycle_number || cycleNumber || 1 });
      }
      
      const ensuredBill = await fetchBillById(ensuredBillId);
      if (ensuredBill) setBill(ensuredBill);

      const bucketParam = {
        type: selectedFundBucket.type === 'borrowed' ? 'liability' : selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };

      // Spend
      const { data: rpcData, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: user.id,
        p_account_id: selectedAccountId,
        p_bucket: bucketParam,
        p_amount: amountNum,
        p_category: payload.categoryId,
        p_description: `Payment for ${payload.title}`,
        p_date: paymentDateStr,
        p_currency: currency,
      });
      if (rpcError) throw rpcError;
      const transactionId = rpcData as string;

      // Update transaction metadata to include cycle_number and payment status for cycle annotation
      await supabase
        .from('transactions')
        .update({
          metadata: {
            cycle_number: payload.cycleNumber,
            liability_id: payload.liabilityId,
            bill_id: ensuredBillId,
            payment_timing: paymentTiming,
            days_diff: daysDiff,
            days_from_due: daysDiff,
            tolerance_days: TOLERANCE_DAYS,
            is_within_window: isWithinWindow,
            amount_comparison: amountComparison,
            amount_difference: amountDifference,
            expected_amount: expectedAmt,
            actual_amount: amountNum,
            cycle_status: cyclePaymentStatus,
            payment_status: 'paid',
          },
        })
        .eq('id', transactionId);

      // Insert liability_payment with cycle_number and payment status in metadata for cycle mapping
      const principalNum = payload.principalAmount ?? amountNum;
      const interestNum = payload.interestAmount ?? 0;
      const { error: lpError } = await supabase.from('liability_payments').insert({
        user_id: user.id,
        liability_id: payload.liabilityId,
        account_id: selectedAccountId,
        category_id: payload.categoryId,
        amount: amountNum,
        metadata: {
          cycle_number: payload.cycleNumber,
          bill_id: ensuredBillId,
          payment_timing: paymentTiming,
          days_diff: daysDiff,
          days_from_due: daysDiff,
          tolerance_days: TOLERANCE_DAYS,
          is_within_window: isWithinWindow,
          amount_comparison: amountComparison,
          amount_difference: amountDifference,
          expected_amount: expectedAmt,
          actual_amount: amountNum,
          cycle_status: cyclePaymentStatus,
        },
        payment_date: paymentDateStr,
        description: `Payment for ${payload.title}`,
        payment_type: 'scheduled', // Valid values: scheduled, manual, prepayment, mock, historical
        principal_component: principalNum,
        interest_component: interestNum,
        transaction_id: transactionId,
      });
      if (lpError) console.error('liability_payment error', lpError);

      // Mark bill paid with payment timing and amount comparison metadata
      await supabase
        .from('bills')
        .update({
          status: 'paid',
          last_paid_date: paymentDateStr,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(ensuredBill?.metadata || {}),
            cycle_number: payload.cycleNumber,
            payment_timing: paymentTiming,
            days_diff: daysDiff,
            days_from_due: daysDiff,
            tolerance_days: TOLERANCE_DAYS,
            is_within_window: isWithinWindow,
            amount_comparison: amountComparison,
            amount_difference: amountDifference,
            expected_amount: expectedAmt,
            actual_amount: amountNum,
            cycle_status: cyclePaymentStatus,
            paid_date: paymentDateStr,
          },
        })
        .eq('id', ensuredBillId);

      // Update liability balance, cycle statistics, and next_due_date
      const { data: currentLiab } = await supabase
        .from('liabilities')
        .select('current_balance, metadata, due_day_of_month, periodical_frequency')
        .eq('id', payload.liabilityId)
        .single();
      if (currentLiab) {
        const newBalance = Math.max(0, Number(currentLiab.current_balance) - principalNum);
        
        // Update cycle_statistics in liability metadata
        const existingMetadata = currentLiab.metadata || {};
        const cycleStats = existingMetadata.cycle_statistics || {};
        const cycleKey = `cycle_${payload.cycleNumber}`;
        
        cycleStats[cycleKey] = {
          ...(cycleStats[cycleKey] || {}),
          status: cyclePaymentStatus,
          payment_timing: paymentTiming,
          is_within_window: isWithinWindow,
          days_from_due: daysDiff,
          tolerance_days: TOLERANCE_DAYS,
          amount_comparison: amountComparison,
          amount_difference: amountDifference,
          amount_paid: amountNum,
          expected_amount: expectedAmt,
          payment_date: paymentDateStr,
          principal_paid: principalNum,
          interest_paid: interestNum,
        };
        
        // Calculate next due date based on frequency and current expected date
        const calculateNextDueDate = (currentDueDate: string, frequency: string, dueDay: number): string => {
          const current = new Date(currentDueDate);
          const freq = (frequency || 'monthly').toLowerCase();
          let next = new Date(current);
          
          switch (freq) {
            case 'daily':
              next.setDate(next.getDate() + 1);
              break;
            case 'weekly':
              next.setDate(next.getDate() + 7);
              break;
            case 'biweekly':
            case 'bi-weekly':
              next.setDate(next.getDate() + 14);
              break;
            case 'monthly':
            default:
              next.setMonth(next.getMonth() + 1);
              // Ensure we use the correct due day
              if (dueDay > 0) {
                const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(dueDay, lastDayOfMonth));
              }
              break;
            case 'bimonthly':
            case 'bi-monthly':
              next.setMonth(next.getMonth() + 2);
              if (dueDay > 0) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(dueDay, lastDay));
              }
              break;
            case 'quarterly':
              next.setMonth(next.getMonth() + 3);
              if (dueDay > 0) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(dueDay, lastDay));
              }
              break;
            case 'halfyearly':
            case 'half-yearly':
              next.setMonth(next.getMonth() + 6);
              if (dueDay > 0) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(dueDay, lastDay));
              }
              break;
            case 'yearly':
              next.setFullYear(next.getFullYear() + 1);
              if (dueDay > 0) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(dueDay, lastDay));
              }
              break;
          }
          
          return next.toISOString().split('T')[0];
        };
        
        // Determine next due date:
        // 1. Check if there's a next scheduled bill (unpaid bill after current bill)
        // 2. If not, calculate based on frequency
        let nextDueDate: string;
        
        const { data: nextBills } = await supabase
          .from('bills')
          .select('due_date')
          .eq('liability_id', payload.liabilityId)
          .eq('user_id', user.id)
          .in('status', ['upcoming', 'due_today', 'overdue', 'postponed'])
          .gt('due_date', expectedDate || expectedDateStr)
          .order('due_date', { ascending: true })
          .limit(1);
        
        if (nextBills && nextBills.length > 0) {
          // Use the next scheduled bill's due date
          nextDueDate = nextBills[0].due_date;
        } else {
          // Calculate based on frequency
          const dueDay = currentLiab.due_day_of_month || 1;
          const frequency = currentLiab.periodical_frequency || 'monthly';
          const currentExpectedDate = expectedDate || expectedDateStr;
          nextDueDate = calculateNextDueDate(currentExpectedDate, frequency, dueDay);
        }
        
        await supabase
          .from('liabilities')
          .update({
            current_balance: newBalance,
            last_payment_date: paymentDateStr,
            next_due_date: nextDueDate,
            updated_at: new Date().toISOString(),
            metadata: {
              ...existingMetadata,
              cycle_statistics: cycleStats,
            },
          })
          .eq('id', payload.liabilityId);
      }

      await globalRefresh();
      refreshAccounts();
      refreshAccountFunds();
      refreshTransactions();

      // Show success message with simple, clear language
      const timingMessages: Record<string, string> = {
        early: `Paid ${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? 's' : ''} early`,
        on_time: 'Paid on time',
        within_window: `Paid ${daysDiff} day${daysDiff > 1 ? 's' : ''} after due`,
        late: `Paid ${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? 's' : ''} late`,
      };
      const amountMessages: Record<string, string> = {
        over: `Paid ${formatCurrencyAmount(Math.abs(amountDifference), currency)} extra`,
        under: `Paid ${formatCurrencyAmount(Math.abs(amountDifference), currency)} less`,
        partial: `${formatCurrencyAmount(Math.abs(amountDifference), currency)} remaining`,
        exact: 'Full amount paid.',
      };
      
      Alert.alert(
        isWithinWindow ? 'Payment Recorded ✓' : 'Payment Recorded',
        `${timingMessages[paymentTiming]} ${amountMessages[amountComparison]}`
      );
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to process payment');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#000000" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="arrow-back" size={22} color="#000000" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.title}>Pay {liability?.title || bill?.title || 'Liability'}</Text>
              </View>
              <View style={{ width: 32 }} />
            </View>

            {/* Created Bills Section */}
            {availableBills.length > 0 && (
              <View style={[styles.card, { marginVertical: 12, padding: 20 }]}>
                <View style={styles.billsHeader}>
                  <View style={styles.billsHeaderLeft}>
                    <Ionicons name="receipt-outline" size={20} color="#6366F1" />
                    <Text style={styles.billsSectionTitle}>Created Bills</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowBillsList(!showBillsList)}
                    style={styles.billsToggleButton}
                  >
                    <Text style={styles.billsToggleText}>
                      {showBillsList ? 'Hide' : `View ${availableBills.length}`}
                    </Text>
                    <Ionicons
                      name={showBillsList ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#6366F1"
                    />
                  </TouchableOpacity>
                </View>
                
                {showBillsList && (
                  <View style={styles.billsList}>
                    {availableBills.map((b) => {
                      const isSelected = selectedBillId === b.id;
                      const billStatus = b.status;
                      const statusColors: Record<string, string> = {
                        upcoming: '#6366F1',
                        due_today: '#F59E0B',
                        overdue: '#EF4444',
                        postponed: '#8B5CF6',
                      };
                      return (
                        <TouchableOpacity
                          key={b.id}
                          style={[
                            styles.billItem,
                            isSelected && styles.billItemSelected,
                          ]}
                          onPress={() => handleSelectBill(b)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.billItemLeft}>
                            <View style={styles.billItemHeader}>
                              <Text style={styles.billItemTitle}>{b.title}</Text>
                              {isSelected && (
                                <View style={styles.selectedBadge}>
                                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                                </View>
                              )}
                            </View>
                            <View style={styles.billItemMeta}>
                              <Text style={styles.billItemDate}>
                                Due {new Date(b.due_date).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </Text>
                              <View style={[styles.billStatusBadge, { backgroundColor: statusColors[billStatus] + '20' }]}>
                                <View style={[styles.billStatusDot, { backgroundColor: statusColors[billStatus] }]} />
                                <Text style={[styles.billStatusText, { color: statusColors[billStatus] }]}>
                                  {billStatus.replace('_', ' ').toUpperCase()}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <Text style={styles.billItemAmount}>
                            {formatCurrencyAmount(b.total_amount || b.amount || 0, currency)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                
                {selectedBillId && bill && (
                  <View style={styles.selectedBillInfo}>
                    <Ionicons name="information-circle-outline" size={16} color="#6366F1" />
                    <Text style={styles.selectedBillText}>
                      Paying: {bill.title} • {formatCurrencyAmount(bill.total_amount || bill.amount || 0, currency)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Principal Amount - Main payment input */}
            <View style={[styles.card, { marginVertical: 12, padding: 20 }]}>
              <Text style={styles.sectionLabel}>Principal Amount</Text>
              <Text style={styles.fieldHint}>Amount going toward the debt</Text>
              <TextInput
                style={styles.totalAmountInput}
                value={principalAmount}
                onChangeText={(val) => {
                  setPrincipalAmount(val);
                  // Auto-update total if interest is included or not set
                  if (interestIncluded || !interestAmount || interestAmount === '0') {
                    setTotalAmount(val);
                  } else {
                    // Total = principal + interest
                    const p = parseFloat(val || '0') || 0;
                    const i = parseFloat(interestAmount || '0') || 0;
                    setTotalAmount((p + i).toFixed(2));
                  }
                }}
                placeholder="0"
                keyboardType="decimal-pad"
                placeholderTextColor="rgba(0,0,0,0.3)"
              />
              {suggestedText && <Text style={styles.suggestedAmount}>{suggestedText}</Text>}
            </View>

            {/* Interest Section */}
            <View style={[styles.card, { marginVertical: 12, padding: 20 }]}>
              <View style={styles.allocationHeader}>
                <View>
                  <Text style={styles.sectionLabel}>Interest</Text>
                  <Text style={styles.fieldHint}>Optional - enter if applicable</Text>
                </View>
              </View>
              
              <View style={styles.allocationBreakdown}>
                <View style={styles.allocationBreakdownRow}>
                  <Text style={styles.allocationBreakdownLabel}>Interest Amount</Text>
                  <TextInput
                    style={styles.allocationBreakdownInput}
                    value={interestAmount}
                    onChangeText={(val) => {
                      setInterestAmount(val);
                      // Recalculate total based on inclusion
                      const p = parseFloat(principalAmount || '0') || 0;
                      const i = parseFloat(val || '0') || 0;
                      if (interestIncluded) {
                        // Interest is included in principal, so total = principal
                        setTotalAmount(principalAmount);
                      } else {
                        // Interest is additional, so total = principal + interest
                        setTotalAmount((p + i).toFixed(2));
                      }
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="rgba(0,0,0,0.3)"
                  />
                </View>
              </View>

              {/* Interest Included Toggle */}
                <TouchableOpacity
                  onPress={() => {
                  const newIncluded = !interestIncluded;
                  setInterestIncluded(newIncluded);
                  // Recalculate total
                  const p = parseFloat(principalAmount || '0') || 0;
                  const i = parseFloat(interestAmount || '0') || 0;
                  if (newIncluded) {
                    // Interest is included in principal, total = principal
                    setTotalAmount(principalAmount);
                  } else {
                    // Interest is additional, total = principal + interest
                    setTotalAmount((p + i).toFixed(2));
                    }
                  }}
                style={[styles.toggleRow, { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' }]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, interestIncluded && styles.checkboxChecked]}>
                    {interestIncluded && (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    )}
                  </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleText}>Interest included in principal</Text>
                  <Text style={styles.toggleHint}>
                    {interestIncluded 
                      ? 'The interest amount above is already part of principal'
                      : 'Interest will be added to principal for total'}
                  </Text>
                </View>
                </TouchableOpacity>

              {/* Fees (optional) */}
              <View style={[styles.allocationBreakdownRow, { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' }]}>
                <View>
                  <Text style={styles.allocationBreakdownLabel}>Fees</Text>
                  <Text style={[styles.fieldHint, { fontSize: 11 }]}>Optional charges</Text>
              </View>
                  <TextInput
                    style={styles.allocationBreakdownInput}
                    value={feesAmount}
                  onChangeText={(val) => {
                    setFeesAmount(val);
                    // Add fees to total
                    const p = parseFloat(principalAmount || '0') || 0;
                    const i = parseFloat(interestAmount || '0') || 0;
                    const f = parseFloat(val || '0') || 0;
                    if (interestIncluded) {
                      setTotalAmount((p + f).toFixed(2));
                    } else {
                      setTotalAmount((p + i + f).toFixed(2));
                    }
                  }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="rgba(0,0,0,0.3)"
                  />
                </View>

              {/* Total Summary */}
              <View style={[styles.allocationHeader, { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' }]}>
                <View>
                  <Text style={styles.sectionLabel}>Total Payment</Text>
                  <Text style={[styles.fieldHint, { fontSize: 11 }]}>
                    {interestIncluded 
                      ? 'Principal + Fees'
                      : 'Principal + Interest + Fees'}
                  </Text>
                </View>
                <Text style={[styles.sectionLabel, { fontFamily: 'Poppins-SemiBold', fontSize: 18, color: '#10B981' }]}>
                  {formatCurrencyAmount(parseFloat(totalAmount || '0') || 0, currency)}
                </Text>
              </View>
            </View>

            {/* Payment Date */}
            <View style={[styles.card, { marginVertical: 12, padding: 20 }]}>
              <Text style={styles.sectionLabel}>Payment Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#000000" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateText}>
                    {paymentDate.toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  {isToday && <Text style={styles.dateSubtext}>Today</Text>}
                </View>
                <Ionicons name="create-outline" size={18} color="rgba(0, 0, 0, 0.5)" />
              </TouchableOpacity>
              {Platform.OS === 'ios' && showDatePicker && (
                <DateTimePicker
                  value={paymentDate}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (date) setPaymentDate(date);
                  }}
                />
              )}
              {Platform.OS === 'android' && showDatePicker && (
                <DateTimePicker
                  value={paymentDate}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (date) setPaymentDate(date);
                  }}
                />
              )}
            </View>

            {/* Purpose Tag */}
            <View style={[styles.card, { marginVertical: 12, padding: 20 }]}>
              <Text style={styles.sectionLabel}>Purpose Tag</Text>
              <TouchableOpacity style={styles.purposeTagButton}>
                <Text style={styles.purposeTagText}>Regular Payment</Text>
                <Ionicons name="chevron-down" size={18} color="rgba(0,0,0,0.5)" />
              </TouchableOpacity>
            </View>

            {/* Source Account */}
            <View style={[styles.card, { marginVertical: 12, padding: 20 }]}>
              <Text style={styles.sectionLabel}>Source Account</Text>
              {accounts.length > 0 ? (
                <AccountSelector
                  accounts={accounts}
                  selectedAccountId={selectedAccountId || undefined}
                  onSelect={(account) => {
                    setSelectedAccountId(account.id);
                    setSelectedFundBucket(null); // Reset fund when account changes
                  }}
                  showBalance={true}
                />
              ) : (
                <Text style={styles.emptyText}>No accounts available</Text>
              )}
              {selectedAccount && (
                <View style={styles.accountInfo}>
                  <Text style={styles.accountBalanceText}>
                    Balance: {formatCurrencyAmount(selectedAccount.balance, currency)}
                  </Text>
                </View>
              )}
            </View>

            {/* Fund Source */}
            {selectedAccountId && (
              <View style={[styles.card, { marginVertical: 12, padding: 20 }]}>
                <Text style={styles.sectionLabel}>Fund Source</Text>
                <TouchableOpacity
                  style={styles.fundButton}
                  onPress={() => setShowFundPicker(true)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fundButtonText}>
                      {selectedFundBucket ? selectedFundBucket.name : 'Select fund'}
                    </Text>
                    {selectedFundBucket && (
                      <Text style={styles.fundBalanceText}>
                        {formatCurrencyAmount(selectedFundBucket.amount, currency)} available
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-down" size={18} color="rgba(0,0,0,0.5)" />
                </TouchableOpacity>
              </View>
            )}

            {/* Fund Picker Modal */}
            {selectedAccountId && (
              <FundPicker
                visible={showFundPicker}
                onClose={() => setShowFundPicker(false)}
                accountId={selectedAccountId}
                onSelect={(bucket) => {
                  setSelectedFundBucket(bucket);
                  setShowFundPicker(false);
                }}
                amount={parseFloat(totalAmount || '0') || 0}
                excludeGoalFunds={true}
                excludeBorrowedFunds={false}
              />
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.actionButtonContainer}>
            <View style={styles.dualButtonRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  saving && styles.confirmButtonDisabled
                ]}
                onPress={handleSaveBill}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={20} color="#000000" />
                    <Text style={styles.secondaryButtonText}>Save Bill</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  saving && styles.confirmButtonDisabled
                ]}
                onPress={handlePayNow}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons 
                      name={selectedBillId ? "checkmark-circle" : "card"} 
                      size={20} 
                      color="#FFFFFF" 
                    />
                    <Text style={styles.confirmButtonText}>
                      {selectedBillId ? `Pay ${bill?.title || 'Bill'}` : 'Pay Now'}
                    </Text>
                    <View style={styles.payButtonGlow} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    shadowColor: '#1A331F',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: Platform.OS === 'ios' ? 20 : 18,
    fontFamily: 'Poppins-Bold',
    color: '#000000',
    letterSpacing: 0.2,
  },
  closeButton: {
    padding: 4,
  },
  sectionLabel: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: Platform.OS === 'ios' ? 10 : 8,
    letterSpacing: 0.1,
  },
  totalAmountInput: {
    fontSize: Platform.OS === 'ios' ? 40 : 36,
    fontFamily: 'Archivo-Bold',
    color: '#000000',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    letterSpacing: -0.5,
  },
  suggestedAmount: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  allocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  allocationBreakdown: {
    gap: 10,
  },
  allocationBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  allocationBreakdownLabel: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.7)',
    letterSpacing: 0.1,
  },
  allocationBreakdownInput: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(0,0,0,0.2)',
    minWidth: 100,
    textAlign: 'right',
    paddingBottom: 4,
    letterSpacing: 0.1,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  dateText: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    letterSpacing: 0.1,
  },
  purposeTagButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
  },
  purposeTagText: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    letterSpacing: 0.1,
  },
  accountButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  accountText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
  },
  actionButtonContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  dualButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  secondaryButtonText: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#000000',
    letterSpacing: 0.3,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 14,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  payButtonGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    opacity: 0.5,
  },
  billsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  billsSectionTitle: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
    letterSpacing: 0.2,
  },
  billsToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  billsToggleText: {
    fontSize: Platform.OS === 'ios' ? 14 : 13,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
  },
  billsList: {
    gap: 8,
    marginTop: 8,
  },
  billItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  billItemSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
    borderWidth: 2,
  },
  billItemLeft: {
    flex: 1,
    gap: 6,
  },
  billItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  billItemTitle: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
    letterSpacing: 0.1,
  },
  selectedBadge: {
    marginLeft: 4,
  },
  billItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  billItemDate: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  billStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  billStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  billStatusText: {
    fontSize: Platform.OS === 'ios' ? 11 : 10,
    fontFamily: 'Poppins-Medium',
    letterSpacing: 0.3,
  },
  billItemAmount: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    fontFamily: 'Poppins-Bold',
    color: '#1F2937',
    letterSpacing: 0.2,
  },
  selectedBillInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  selectedBillText: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6366F1',
    flex: 1,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    marginTop: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  toggleText: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.7)',
    letterSpacing: 0.1,
  },
  toggleHint: {
    fontSize: Platform.OS === 'ios' ? 11 : 10,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.5)',
    marginTop: 2,
  },
  fieldHint: {
    fontSize: Platform.OS === 'ios' ? 12 : 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.5)',
    marginTop: 2,
    marginBottom: 8,
  },
  dateSubtext: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.5)',
    marginTop: 2,
  },
  accountInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  accountBalanceText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.6)',
  },
  fundButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
  },
  fundButtonText: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    letterSpacing: 0.1,
  },
  fundBalanceText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.5)',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0,0,0,0.5)',
    fontStyle: 'italic',
  },
});



