/**
 * Unified Payment Modal
 * 
 * A single, powerful payment modal that handles:
 * - Liability payments (via bills or direct)
 * - Bill payments
 * - Smart payment suggestions based on cycle history
 * - Interest handling (included or separate)
 * - Cycle integration
 * - Fund selection
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Switch,
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
import InlineAccountSelector from '@/components/InlineAccountSelector';
import { calculateSmartSuggestion, formatSuggestion, PaymentSuggestion } from '@/utils/smartPaymentSuggestions';
import { useLiabilityCycles } from '@/hooks/useLiabilityCycles';
import { fetchBillById } from '@/utils/bills';
import { calculatePaymentBreakdown } from '@/utils/liabilityCalculations';
import { fetchCategories } from '@/utils/categories';
import { 
  calculatePaymentImpact, 
  calculatePaymentIntelligence, 
  autoAllocatePayment,
  LiabilityPaymentAllocation 
} from '@/utils/paymentImpact';
import { PAYMENT_PURPOSES, PaymentPurpose } from '@/constants/paymentPurposes';

type BillData = {
  id: string;
  title: string;
  amount?: number;
  due_date: string;
  status: string;
  linked_account_id?: string;
  category_id?: string;
  description?: string;
  liability_id?: string;
  interest_amount?: number;
  principal_amount?: number;
  interest_included?: boolean;
  payment_number?: number;
};

type LiabilityData = {
  id: string;
  title: string;
  current_balance: number;
  periodical_payment?: number;
  periodical_frequency?: string;
  interest_rate_apy?: number;
  start_date?: string;
  last_payment_date?: string;
  next_due_date?: string;
};

interface UnifiedPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  // Can be called with either a bill or a liability
  billId?: string;
  liabilityId?: string;
  // For multi-liability payments (new feature)
  liabilityIds?: string[]; // Array of liability IDs for multi-liability payment
  // For creating bills from cycles
  createBillFromCycle?: {
    cycleNumber: number;
    expectedAmount: number;
    expectedDate: string;
    liabilityId?: string;
    recurringTransactionId?: string;
    cycle?: {
      expectedPrincipal?: number;
      expectedInterest?: number;
      remainingBalance?: number;
    };
  };
  // Pre-filled values
  prefillAmount?: number;
  prefillDate?: Date;
}

export default function UnifiedPaymentModal({
  visible,
  onClose,
  onSuccess,
  billId,
  liabilityId,
  liabilityIds, // New: for multi-liability payments
  createBillFromCycle,
  prefillAmount,
  prefillDate,
}: UnifiedPaymentModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { globalRefresh, refreshAccounts, refreshAccountFunds, refreshTransactions } = useRealtimeData();

  const [bill, setBill] = useState<BillData | null>(null);
  const [liability, setLiability] = useState<LiabilityData | null>(null);
  const [liabilities, setLiabilities] = useState<LiabilityData[]>([]); // New: for multi-liability
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Payment form state
  const [totalAmount, setTotalAmount] = useState(''); // Renamed from 'amount' for clarity
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFundBucket, setSelectedFundBucket] = useState<FundBucket | null>(null);
  const [showFundPicker, setShowFundPicker] = useState(false);
  const [purposeTag, setPurposeTag] = useState<string>('regular'); // New: purpose tag
  const [showPurposePicker, setShowPurposePicker] = useState(false);

  // Multi-liability allocation state
  const [allocations, setAllocations] = useState<Array<{
    liabilityId: string;
    allocatedAmount: number;
    interest: number;
    fees: number;
    principal: number;
  }>>([]);

  // Interest handling
  const [interestIncluded, setInterestIncluded] = useState(true);
  const [principalAmount, setPrincipalAmount] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [feesAmount, setFeesAmount] = useState('0'); // New: fees field

  // Payment preview and intelligence
  const [showPreviewDetails, setShowPreviewDetails] = useState(true);
  const [paymentImpacts, setPaymentImpacts] = useState<Map<string, any>>(new Map());

  // Smart suggestions
  const [suggestion, setSuggestion] = useState<PaymentSuggestion | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);

  // Fetch cycles for liability (for smart suggestions)
  const { cycles, currentCycle } = useLiabilityCycles({
    liabilityId: liabilityId || '',
    maxCycles: 12,
  });

  // Calculate payment breakdown (for single liability only)
  const paymentBreakdown = useMemo(() => {
    if (!liability || !totalAmount || interestIncluded || liabilityIds) return null;

    const paymentAmount = parseFloat(totalAmount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) return null;

    const currentBalance = Number(liability.current_balance || 0);
    const annualRate = Number(liability.interest_rate_apy || 0);
    const lastPaymentDate = liability.last_payment_date ? new Date(liability.last_payment_date) : undefined;

    return calculatePaymentBreakdown(
      paymentAmount,
      currentBalance,
      annualRate,
      paymentDate,
      lastPaymentDate
    );
  }, [liability, totalAmount, paymentDate, interestIncluded, liabilityIds]);

  // Calculate smart suggestion
  useEffect(() => {
    if (liabilityId && cycles.length > 0 && currentCycle) {
      const pastCycles = cycles.filter(c => c.cycleNumber < currentCycle.cycleNumber);
      const expectedAmount = liability?.periodical_payment || bill?.amount || 0;

      if (expectedAmount > 0) {
        const suggestion = calculateSmartSuggestion({
          expectedAmount,
          previousCycles: pastCycles,
          currentCycle,
          outstandingBalance: liability?.current_balance || 0,
          interestRate: liability?.interest_rate_apy,
        });

        setSuggestion(suggestion);
        setShowSuggestion(true);
      }
    }
  }, [liabilityId, cycles, currentCycle, liability, bill]);

  useEffect(() => {
    if (visible && user) {
      // Reset form
      setTotalAmount('');
      setSelectedAccountId(null);
      setSelectedFundBucket(null);
      setDescription('');
      setPaymentDate(prefillDate || new Date());
      setInterestIncluded(true);
      setPrincipalAmount('');
      setInterestAmount('');
      setFeesAmount('0');
      setPurposeTag('regular');
      setAllocations([]);
      setPaymentImpacts(new Map());
      setSuggestion(null);
      setShowSuggestion(false);

      fetchData();
      fetchAccounts();
    }
  }, [visible, billId, liabilityId, liabilityIds, user, prefillDate]);

  const fetchAccounts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .neq('type', 'liability')
        .neq('type', 'goals_savings')
        .order('name');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  const fetchData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Fetch bill if billId provided
      if (billId) {
        const billData = await fetchBillById(billId);
        if (billData) {
          setBill(billData);
          setLiability(null);

          // Pre-fill from bill
          if (billData.amount) {
            setTotalAmount(billData.amount.toString());
          } else if (prefillAmount) {
            setTotalAmount(prefillAmount.toString());
          }

          if (billData.linked_account_id) {
            setSelectedAccountId(billData.linked_account_id);
          }

          if (billData.description) {
            setDescription(billData.description);
          } else {
            setDescription(`Payment for ${billData.title}`);
          }

          // Handle interest
          if (billData.interest_amount && billData.principal_amount) {
            setInterestIncluded(billData.interest_included !== false);
            setPrincipalAmount(billData.principal_amount.toString());
            setInterestAmount(billData.interest_amount.toString());
          }

          // Set payment date to due date or today
          if (billData.due_date) {
            setPaymentDate(new Date(billData.due_date));
          }
        }
      }
      // Handle creating bill from cycle
      else if (createBillFromCycle) {
        setBill(null);
        setLiability(null);

        // Pre-fill from cycle
        if (createBillFromCycle.expectedAmount) {
          setTotalAmount(createBillFromCycle.expectedAmount.toString());
        } else if (prefillAmount) {
          setTotalAmount(prefillAmount.toString());
        }

        if (createBillFromCycle.expectedDate) {
          setPaymentDate(new Date(createBillFromCycle.expectedDate));
        } else if (prefillDate) {
          setPaymentDate(prefillDate);
        }

        // Fetch liability if provided
        if (createBillFromCycle.liabilityId) {
          const { data: liabilityData, error } = await supabase
            .from('liabilities')
            .select('*')
            .eq('id', createBillFromCycle.liabilityId)
            .eq('user_id', user.id)
            .single();

          if (!error && liabilityData) {
            setLiability(liabilityData as LiabilityData);
            if (liabilityData.linked_account_id) {
              setSelectedAccountId(liabilityData.linked_account_id);
            }
            setDescription(`${liabilityData.title} - Cycle ${createBillFromCycle.cycleNumber}`);
          }
        }
        // Fetch recurring transaction if provided
        else if (createBillFromCycle.recurringTransactionId) {
          const { data: recurringData, error } = await supabase
            .from('recurring_transactions')
            .select('*')
            .eq('id', createBillFromCycle.recurringTransactionId)
            .eq('user_id', user.id)
            .single();

          if (!error && recurringData) {
            if (recurringData.account_id) {
              setSelectedAccountId(recurringData.account_id);
            }
            setDescription(`${recurringData.title || recurringData.name} - Cycle ${createBillFromCycle.cycleNumber}`);
            
            // Set category if available
            if (recurringData.category_id) {
              // Category will be used when creating bill
            }
          }
        }
      }
      // Fetch liability if liabilityId provided
      else if (liabilityId) {
        const { data: liabilityData, error } = await supabase
          .from('liabilities')
          .select('*')
          .eq('id', liabilityId)
          .eq('user_id', user.id)
          .single();

        if (error) throw error;
        if (liabilityData) {
          setLiability(liabilityData as LiabilityData);
          setBill(null);

          // Pre-fill from liability
          if (prefillAmount) {
            setTotalAmount(prefillAmount.toString());
          } else if (liabilityData.periodical_payment) {
            setTotalAmount(liabilityData.periodical_payment.toString());
          }

          if (liabilityData.next_due_date) {
            setPaymentDate(new Date(liabilityData.next_due_date));
          }

          setDescription(`Payment for ${liabilityData.title}`);
        }
      }
      // Fetch multiple liabilities if liabilityIds provided (new: multi-liability payment)
      else if (liabilityIds && liabilityIds.length > 0) {
        const { data: liabilitiesData, error } = await supabase
          .from('liabilities')
          .select('*')
          .eq('user_id', user.id)
          .in('id', liabilityIds)
          .eq('status', 'active');

        if (error) throw error;
        if (liabilitiesData && liabilitiesData.length > 0) {
          setLiabilities(liabilitiesData as LiabilityData[]);
          setLiability(null);
          setBill(null);

          // Auto-allocate payment across liabilities
          const totalExpected = liabilitiesData.reduce((sum, l) => sum + (Number(l.periodical_payment || 0)), 0);
          if (prefillAmount) {
            setTotalAmount(prefillAmount.toString());
          } else if (totalExpected > 0) {
            setTotalAmount(totalExpected.toString());
          }

          // Auto-allocate payment
          const totalAmountNum = prefillAmount || totalExpected;
          if (totalAmountNum > 0) {
            const autoAllocations = autoAllocatePayment(totalAmountNum, liabilitiesData);
            setAllocations(autoAllocations.map(a => ({
              liabilityId: a.liabilityId,
              allocatedAmount: a.allocatedAmount,
              interest: a.interest,
              fees: a.fees,
              principal: a.principal,
            })));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to load payment information');
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

  // Calculate total when interest is separate (single liability)
  useEffect(() => {
    if (!interestIncluded && principalAmount && interestAmount && !liabilityIds) {
      const principal = parseFloat(principalAmount) || 0;
      const interest = parseFloat(interestAmount) || 0;
      const fees = parseFloat(feesAmount) || 0;
      setTotalAmount((principal + interest + fees).toFixed(2));
    }
  }, [interestIncluded, principalAmount, interestAmount, feesAmount, liabilityIds]);

  // Auto-allocate payment when total amount changes (multi-liability)
  useEffect(() => {
    if (liabilityIds && liabilityIds.length > 0 && liabilities.length > 0 && totalAmount) {
      const totalAmountNum = parseFloat(totalAmount);
      if (!isNaN(totalAmountNum) && totalAmountNum > 0) {
        const autoAllocations = autoAllocatePayment(totalAmountNum, liabilities);
        setAllocations(autoAllocations.map(a => ({
          liabilityId: a.liabilityId,
          allocatedAmount: a.allocatedAmount,
          interest: a.interest,
          fees: a.fees,
          principal: a.principal,
        })));
      }
    }
  }, [totalAmount, liabilityIds, liabilities]);

  // Calculate payment impacts when allocations change
  useEffect(() => {
    if (allocations.length > 0 && liabilities.length > 0) {
      const impacts = new Map();
      allocations.forEach(allocation => {
        const liability = liabilities.find(l => l.id === allocation.liabilityId);
        if (liability) {
          const impact = calculatePaymentImpact(
            liability,
            allocation.allocatedAmount,
            allocation.interest,
            allocation.fees,
            paymentDate
          );
          impacts.set(allocation.liabilityId, impact);
        }
      });
      setPaymentImpacts(impacts);
    } else if (liability && totalAmount) {
      // Single liability payment impact
      const totalAmountNum = parseFloat(totalAmount);
      const interestNum = parseFloat(interestAmount) || 0;
      const feesNum = parseFloat(feesAmount) || 0;
      if (!isNaN(totalAmountNum) && totalAmountNum > 0) {
        const impact = calculatePaymentImpact(
          liability,
          totalAmountNum,
          interestNum,
          feesNum,
          paymentDate
        );
        const impacts = new Map();
        impacts.set(liability.id, impact);
        setPaymentImpacts(impacts);
      }
    }
  }, [allocations, liabilities, liability, totalAmount, interestAmount, feesAmount, paymentDate]);

  // Apply suggestion
  const applySuggestion = () => {
    if (suggestion) {
      setTotalAmount(suggestion.suggestedAmount.toString());
      setShowSuggestion(false);
    }
  };

  // Create bill from cycle data
  const createBillFromCycleData = async (): Promise<string | null> => {
    if (!user || !createBillFromCycle || !totalAmount) return null;

    const amountNum = parseFloat(totalAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return null;
    }

    if (!selectedAccountId) {
      Alert.alert('Error', 'Please select an account');
      return null;
    }

    try {
      // Calculate payment number
      let paymentNumber = createBillFromCycle.cycleNumber;
      
      // Get category
      let categoryId: string | null = null;
      try {
        const categories = await fetchCategories(user.id, { activityType: 'expense' });
        if (categories.length > 0) {
          categoryId = categories[0].id;
        }
      } catch (error) {
        console.error('Error fetching category:', error);
      }

      // Calculate principal and interest
      // Priority: Use cycle's interest breakdown if available, then payment breakdown, then calculate
      let principalAmount = amountNum;
      let interestAmount = 0;
      let totalAmount = amountNum;

      // Check if cycle has interest breakdown (from generateCycles with interest calculation)
      const cycle = createBillFromCycle.cycle as any;
      if (cycle?.expectedPrincipal !== undefined && cycle?.expectedInterest !== undefined) {
        // Use interest breakdown from cycle
        principalAmount = cycle.expectedPrincipal;
        interestAmount = cycle.expectedInterest;
        totalAmount = principalAmount + interestAmount;
      } else if (liability && liability.interest_rate_apy && liability.interest_rate_apy > 0) {
        if (interestIncluded) {
          if (paymentBreakdown) {
            principalAmount = paymentBreakdown.principal;
            interestAmount = paymentBreakdown.interest;
          } else {
            // Estimate: calculate interest on current balance
            const currentBalance = Number(liability.current_balance || 0);
            const periodsPerYear = {
              daily: 365,
              weekly: 52,
              monthly: 12,
              quarterly: 4,
              yearly: 1,
            }[liability.periodical_frequency || 'monthly'] || 12;
            const periodRate = liability.interest_rate_apy / 100 / periodsPerYear;
            interestAmount = Math.round(currentBalance * periodRate * 100) / 100;
            principalAmount = Math.max(0, amountNum - interestAmount);
          }
        } else {
          principalAmount = parseFloat(principalAmount.toString()) || amountNum;
          interestAmount = parseFloat(interestAmount.toString()) || 0;
          totalAmount = principalAmount + interestAmount;
        }
      }

      const dueDateString = paymentDate.toISOString().split('T')[0];
      
      // Fetch recurring transaction name and frequency if needed
      // IMPORTANT: The database only allows: 'daily', 'weekly', 'monthly', 'yearly', 'custom'
      // Map other frequencies to these allowed values
      let recurringTransactionName = '';
      let recurrencePattern: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' = 'monthly';
      
      if (createBillFromCycle.recurringTransactionId) {
        const { data: recurringData } = await supabase
          .from('recurring_transactions')
          .select('title, name, frequency')
          .eq('id', createBillFromCycle.recurringTransactionId)
          .single();
        recurringTransactionName = recurringData?.title || recurringData?.name || 'Recurring Transaction';
        
        // Map frequency to recurrence_pattern (only allowed values)
        // Database stores: 'day', 'week', 'month', 'quarter', 'year', 'custom'
        // Bills expect: 'daily', 'weekly', 'monthly', 'yearly', 'custom'
        if (recurringData?.frequency) {
          const freq = String(recurringData.frequency).toLowerCase().trim();
          if (freq === 'day' || freq === 'daily') recurrencePattern = 'daily';
          else if (freq === 'week' || freq === 'weekly') recurrencePattern = 'weekly';
          else if (freq === 'biweekly' || freq === 'bi-weekly') recurrencePattern = 'custom';
          else if (freq === 'month' || freq === 'monthly') recurrencePattern = 'monthly';
          else if (freq === 'bimonthly' || freq === 'bi-monthly') recurrencePattern = 'custom';
          else if (freq === 'quarter' || freq === 'quarterly') recurrencePattern = 'custom';
          else if (freq === 'halfyearly' || freq === 'half-yearly') recurrencePattern = 'custom';
          else if (freq === 'year' || freq === 'yearly') recurrencePattern = 'yearly';
          else recurrencePattern = 'monthly'; // Default
        }
      } else if (liability) {
        // Get frequency from liability
        if (liability.periodical_frequency) {
          const freq = String(liability.periodical_frequency).toLowerCase().trim();
          if (freq === 'daily') recurrencePattern = 'daily';
          else if (freq === 'weekly') recurrencePattern = 'weekly';
          else if (freq === 'biweekly' || freq === 'bi-weekly') recurrencePattern = 'custom';
          else if (freq === 'monthly') recurrencePattern = 'monthly';
          else if (freq === 'quarterly') recurrencePattern = 'custom';
          else if (freq === 'yearly') recurrencePattern = 'yearly';
          else recurrencePattern = 'monthly'; // Default
        }
      }

      const billTitle = liability 
        ? `${liability.title} - Payment #${paymentNumber}`
        : recurringTransactionName
        ? `${recurringTransactionName} - Cycle ${paymentNumber}`
        : `Recurring Payment - Cycle ${paymentNumber}`;

      // Ensure recurrence_pattern is never null/undefined (required by constraint)
      // And ensure it's one of the allowed values: 'daily', 'weekly', 'monthly', 'yearly', 'custom'
      if (!recurrencePattern || !['daily', 'weekly', 'monthly', 'yearly', 'custom'].includes(recurrencePattern)) {
        recurrencePattern = 'monthly';
      }

      // Map to frequency field (required for non-one_time bills)
      // The frequency field allows: 'daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'halfyearly', 'yearly', 'custom'
      // Database stores: 'day', 'week', 'month', 'quarter', 'year', 'custom'
      let frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom' = 'monthly';
      
      // Get frequency from recurring transaction if available
      if (createBillFromCycle.recurringTransactionId) {
        const { data: recurringData } = await supabase
          .from('recurring_transactions')
          .select('frequency')
          .eq('id', createBillFromCycle.recurringTransactionId)
          .single();
        
        if (recurringData?.frequency) {
          const freq = String(recurringData.frequency).toLowerCase().trim();
          if (freq === 'day' || freq === 'daily') frequency = 'daily';
          else if (freq === 'week' || freq === 'weekly') frequency = 'weekly';
          else if (freq === 'biweekly' || freq === 'bi-weekly') frequency = 'biweekly';
          else if (freq === 'month' || freq === 'monthly') frequency = 'monthly';
          else if (freq === 'bimonthly' || freq === 'bi-monthly') frequency = 'bimonthly';
          else if (freq === 'quarter' || freq === 'quarterly') frequency = 'quarterly';
          else if (freq === 'halfyearly' || freq === 'half-yearly') frequency = 'halfyearly';
          else if (freq === 'year' || freq === 'yearly') frequency = 'yearly';
          else frequency = 'monthly'; // Default
        }
      } else if (liability) {
        if (liability.periodical_frequency) {
          const freq = String(liability.periodical_frequency).toLowerCase().trim();
          if (freq === 'daily') frequency = 'daily';
          else if (freq === 'weekly') frequency = 'weekly';
          else if (freq === 'biweekly' || freq === 'bi-weekly') frequency = 'biweekly';
          else if (freq === 'monthly') frequency = 'monthly';
          else if (freq === 'bimonthly' || freq === 'bi-monthly') frequency = 'bimonthly';
          else if (freq === 'quarterly') frequency = 'quarterly';
          else if (freq === 'halfyearly' || freq === 'half-yearly') frequency = 'halfyearly';
          else if (freq === 'yearly') frequency = 'yearly';
          else frequency = 'monthly'; // Default
        }
      }

      // Create bill
      // IMPORTANT: For bill_type != 'one_time' with parent_bill_id IS NULL, recurrence_pattern is REQUIRED
      // ALSO REQUIRED: frequency and nature fields for non-one_time bills
      //
      // Database structure matches modal:
      // - amount: Payment Amount (base payment, principal if interest not included, or total if interest included)
      // - interest_amount: Interest Amount (optional, shown separately in modal)
      // - interest_included: Whether interest is included in the amount field
      // - total_amount: Calculated total (amount if included, or amount + interest_amount if not included)
      // - principal_amount: Principal portion (amount if not included, or amount - interest_amount if included)
      const billData = {
        user_id: user.id,
        title: billTitle,
        description: description || null,
        amount: interestIncluded ? amountNum : amountNum, // If interest included, amount = total. Otherwise, amount = base payment
        currency: currency,
        due_date: dueDateString,
        original_due_date: dueDateString,
        status: 'upcoming',
        bill_type: (createBillFromCycle.liabilityId ? 'liability_linked' : 'recurring_fixed') as const,
        recurrence_pattern: recurrencePattern, // REQUIRED: Must be NOT NULL for non-one_time bills
        recurrence_interval: 1, // Default interval
        frequency: frequency, // REQUIRED: Must be NOT NULL for non-one_time bills (constraint: check_recurring_bill_frequency)
        nature: createBillFromCycle.liabilityId ? 'payment' as const : 'subscription' as const, // REQUIRED: Must be NOT NULL for non-one_time bills (constraint: check_recurring_bill_nature)
        liability_id: createBillFromCycle.liabilityId || null,
        // Note: recurring_transaction_id is not a direct column, store in metadata
        linked_account_id: selectedAccountId,
        interest_amount: interestAmount > 0 ? interestAmount : null, // Store interest amount (null if 0 or not provided)
        principal_amount: principalAmount, // Principal portion
        total_amount: amountNum, // Total amount to pay (calculated)
        payment_number: paymentNumber,
        interest_included: interestIncluded,
        category_id: categoryId,
        color: '#10B981',
        icon: 'receipt-outline',
        reminder_days: [1, 3, 7],
        metadata: {
          source_type: createBillFromCycle.liabilityId ? 'liability' : 'recurring_transaction',
          cycle_number: createBillFromCycle.cycleNumber,
          payment_amount: amountNum, // Store original payment amount from modal
          total_amount: totalAmount,
          interest_included: interestIncluded,
          created_from_cycle: true,
          recurring_transaction_id: createBillFromCycle.recurringTransactionId || null,
          liability_id: createBillFromCycle.liabilityId || null,
        },
        is_active: true,
        is_deleted: false,
        // Explicitly set parent_bill_id to NULL to ensure constraint logic works correctly
        parent_bill_id: null,
      };

      // Validate required fields before insert
      if (!billData.recurrence_pattern) {
        console.error('recurrence_pattern is missing! This will violate the constraint.');
        Alert.alert('Error', 'Unable to determine payment frequency. Please try again.');
        return null;
      }

      const { data: createdBill, error: billError } = await supabase
        .from('bills')
        .insert(billData)
        .select('id')
        .single();

      if (billError) throw billError;
      return createdBill?.id || null;
    } catch (error: any) {
      console.error('Error creating bill:', error);
      Alert.alert('Error', error.message || 'Failed to create bill');
      return null;
    }
  };

  const handleSchedule = async () => {
    if (!user || !totalAmount) return;

    const amountNum = parseFloat(totalAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!selectedAccountId) {
      Alert.alert('Error', 'Please select an account');
      return;
    }

    try {
      setSaving(true);

      // If creating from cycle, create bill
      if (createBillFromCycle) {
        const billId = await createBillFromCycleData();
        if (billId) {
          Alert.alert('Success', 'Bill scheduled successfully', [
            {
              text: 'OK',
              onPress: () => {
                onSuccess?.();
                onClose();
              },
            },
          ]);
        }
        return;
      }

      // If paying an existing bill, create a scheduled payment (bill stays as scheduled)
      if (bill) {
        // Bill already exists, just mark it as scheduled/upcoming
        // The bill will be paid later
        Alert.alert('Success', 'Payment scheduled successfully', [
          {
            text: 'OK',
            onPress: () => {
              onSuccess?.();
              onClose();
            },
          },
        ]);
        return;
      }

      // If paying liability directly (no bill), create a bill first
      if (liability) {
        // Calculate payment number
        const { data: existingBills } = await supabase
          .from('bills')
          .select('payment_number')
          .eq('liability_id', liability.id)
          .eq('user_id', user.id)
          .order('payment_number', { ascending: false })
          .limit(1);

        const paymentNumber = existingBills && existingBills.length > 0
          ? (existingBills[0].payment_number || 0) + 1
          : 1;

        // Get category
        let categoryId: string | null = null;
        try {
          const categories = await fetchCategories(user.id, { activityType: 'expense' });
          if (categories.length > 0) {
            categoryId = categories[0].id;
          }
        } catch (error) {
          console.error('Error fetching category:', error);
        }

        // Calculate principal and interest
        let principalAmount = amountNum;
        let interestAmount = 0;
        let totalAmount = amountNum;

        if (liability.interest_rate_apy && liability.interest_rate_apy > 0) {
          if (interestIncluded) {
            if (paymentBreakdown) {
              principalAmount = paymentBreakdown.principal;
              interestAmount = paymentBreakdown.interest;
            } else {
              principalAmount = parseFloat(principalAmount.toString()) || amountNum * 0.5;
              interestAmount = parseFloat(interestAmount.toString()) || amountNum * 0.5;
            }
          } else {
            principalAmount = parseFloat(principalAmount.toString()) || amountNum;
            interestAmount = parseFloat(interestAmount.toString()) || 0;
            totalAmount = principalAmount + interestAmount;
          }
        }

        const dueDateString = paymentDate.toISOString().split('T')[0];

        // Get recurrence pattern
        let recurrencePattern: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' = 'monthly';
        if (liability.periodical_frequency) {
          const freq = liability.periodical_frequency.toLowerCase();
          if (freq === 'daily') recurrencePattern = 'daily';
          else if (freq === 'weekly') recurrencePattern = 'weekly';
          else if (freq === 'biweekly' || freq === 'bi-weekly') recurrencePattern = 'custom';
          else if (freq === 'monthly') recurrencePattern = 'monthly';
          else if (freq === 'quarterly') recurrencePattern = 'custom';
          else if (freq === 'yearly') recurrencePattern = 'yearly';
          else recurrencePattern = 'monthly';
        }

        // Map to frequency field
        let frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom' = 'monthly';
        if (liability.periodical_frequency) {
          const freq = liability.periodical_frequency.toLowerCase();
          if (freq === 'daily') frequency = 'daily';
          else if (freq === 'weekly') frequency = 'weekly';
          else if (freq === 'biweekly' || freq === 'bi-weekly') frequency = 'biweekly';
          else if (freq === 'monthly') frequency = 'monthly';
          else if (freq === 'bimonthly' || freq === 'bi-monthly') frequency = 'bimonthly';
          else if (freq === 'quarterly') frequency = 'quarterly';
          else if (freq === 'halfyearly' || freq === 'half-yearly') frequency = 'halfyearly';
          else if (freq === 'yearly') frequency = 'yearly';
          else frequency = 'monthly';
        }

        const billData = {
          user_id: user.id,
          title: `${liability.title} - Payment #${paymentNumber}`,
          description: description || null,
          amount: interestIncluded ? totalAmount : amountNum,
          currency: currency,
          due_date: dueDateString,
          original_due_date: dueDateString,
          status: 'upcoming',
          bill_type: 'liability_linked' as const,
          recurrence_pattern: recurrencePattern,
          recurrence_interval: 1,
          frequency: frequency,
          nature: 'payment' as const,
          liability_id: liability.id,
          linked_account_id: selectedAccountId,
          interest_amount: interestAmount > 0 ? interestAmount : null,
          principal_amount: principalAmount,
          total_amount: totalAmount,
          payment_number: paymentNumber,
          interest_included: interestIncluded,
          category_id: categoryId,
          color: '#10B981',
          icon: 'receipt-outline',
          reminder_days: [1, 3, 7],
          metadata: {
            source_type: 'liability',
            payment_amount: amountNum,
            total_amount: totalAmount,
            interest_included: interestIncluded,
            created_manually: true,
          },
          is_active: true,
          is_deleted: false,
          parent_bill_id: null,
        };

        const { error: billError } = await supabase
          .from('bills')
          .insert(billData);

        if (billError) throw billError;

        Alert.alert('Success', 'Payment scheduled successfully', [
          {
            text: 'OK',
            onPress: () => {
              onSuccess?.();
              onClose();
            },
          },
        ]);
      }
    } catch (error: any) {
      console.error('Error scheduling payment:', error);
      Alert.alert('Error', error.message || 'Failed to schedule payment');
    } finally {
      setSaving(false);
    }
  };

  const handlePayment = async () => {
    if (!user || !totalAmount) return;

    const amountNum = parseFloat(totalAmount);
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

    // Validate allocations for multi-liability payments
    if (liabilityIds && liabilityIds.length > 0) {
      const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
      if (Math.abs(totalAllocated - amountNum) > 0.01) {
        Alert.alert('Error', `Total allocation (${formatCurrencyAmount(totalAllocated, currency)}) must match total payment (${formatCurrencyAmount(amountNum, currency)})`);
        return;
      }
    }

    // If creating from cycle, create bill first
    if (createBillFromCycle) {
      const billId = await createBillFromCycleData();
      if (!billId) return;
      
      // Fetch the created bill
      const createdBill = await fetchBillById(billId);
      if (createdBill) {
        setBill(createdBill);
      }
    }

    try {
      setSaving(true);

      // Get category
      let categoryId: string | null = null;
      try {
        const categories = await fetchCategories(user.id, { activityType: 'expense' });
        const loanCategory = categories.find(c => 
          c.name.toLowerCase().includes('loan') || 
          c.name.toLowerCase().includes('debt')
        );
        if (loanCategory) {
          categoryId = loanCategory.id;
        } else if (bill?.category_id) {
          categoryId = bill.category_id;
        } else if (categories.length > 0) {
          categoryId = categories[0].id;
        }
      } catch (error) {
        console.error('Error fetching category:', error);
      }

      // Construct bucket parameter
      const bucketParam = {
        type: selectedFundBucket.type === 'borrowed' ? 'liability' : selectedFundBucket.type,
        id: selectedFundBucket.type !== 'personal' ? selectedFundBucket.id : null,
      };

      // Handle multi-liability payments
      if (liabilityIds && liabilityIds.length > 0 && allocations.length > 0) {
        // Process each allocation separately
        for (const allocation of allocations) {
          const liability = liabilities.find(l => l.id === allocation.liabilityId);
          if (!liability) continue;

          // Create transaction for this allocation
          const { data: allocRpcData, error: allocRpcError } = await supabase.rpc('spend_from_account_bucket', {
            p_user_id: user.id,
            p_account_id: selectedAccountId,
            p_bucket: bucketParam,
            p_amount: allocation.allocatedAmount,
            p_category: categoryId,
            p_description: description || `${purposeTag} payment for ${liability.title}`,
            p_date: paymentDate.toISOString().split('T')[0],
            p_currency: currency,
          });

          if (allocRpcError) {
            console.error(`Error processing payment for ${liability.title}:`, allocRpcError);
            continue;
          }

          const allocTransactionId = (allocRpcData as any)?.id;

          // Create liability_payment record
          const { error: paymentError } = await supabase
            .from('liability_payments')
            .insert({
              user_id: user.id,
              liability_id: allocation.liabilityId,
              account_id: selectedAccountId,
              category_id: categoryId,
              amount: allocation.allocatedAmount,
              payment_date: paymentDate.toISOString().split('T')[0],
              description: description || `${purposeTag} payment for ${liability.title}`,
              payment_type: 'manual',
              principal_component: allocation.principal,
              interest_component: allocation.interest,
              transaction_id: allocTransactionId,
            });

          if (paymentError) {
            console.error(`Error creating liability_payment for ${liability.title}:`, paymentError);
            continue;
          }

          // Update liability balance
          const { data: currentLiability } = await supabase
            .from('liabilities')
            .select('current_balance')
            .eq('id', allocation.liabilityId)
            .single();

          if (currentLiability) {
            const newBalance = Math.max(0, Number(currentLiability.current_balance) - allocation.principal);
            
            const { error: liabilityUpdateError } = await supabase
              .from('liabilities')
              .update({
                current_balance: newBalance,
                last_payment_date: paymentDate.toISOString().split('T')[0],
                updated_at: new Date().toISOString(),
              })
              .eq('id', allocation.liabilityId);

            if (liabilityUpdateError) {
              console.error(`Error updating liability balance for ${liability.title}:`, liabilityUpdateError);
            }
          }
        }
      } else {
        // Single liability or bill payment
        // Calculate principal and interest using payment impact (most accurate)
        let finalPrincipal = 0;
        let finalInterest = 0;
        let finalFees = parseFloat(feesAmount) || 0;

        // Use payment impact if available (most accurate)
        const impact = paymentImpacts.get(liability?.id || '');
        if (impact) {
          finalPrincipal = impact.principalPaid;
          finalInterest = impact.interestPaid;
          finalFees = impact.feesPaid;
        } else if (interestIncluded) {
          // Interest is included in amount, calculate breakdown
          if (paymentBreakdown) {
            finalPrincipal = paymentBreakdown.principal;
            finalInterest = paymentBreakdown.interest;
          } else {
            // Use manual values if provided, otherwise split 50/50 (fallback)
            finalPrincipal = parseFloat(principalAmount) || amountNum * 0.5;
            finalInterest = parseFloat(interestAmount) || amountNum * 0.5;
          }
        } else {
          // Interest is separate
          finalPrincipal = parseFloat(principalAmount) || amountNum;
          finalInterest = parseFloat(interestAmount) || 0;
        }

        // Create expense transaction
        const { data: rpcData, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
          p_user_id: user.id,
          p_account_id: selectedAccountId,
          p_bucket: bucketParam,
          p_amount: amountNum,
          p_category: categoryId,
          p_description: description || `${purposeTag} payment for ${bill?.title || liability?.title}`,
          p_date: paymentDate.toISOString().split('T')[0],
          p_currency: currency,
        });

        if (rpcError) throw rpcError;

        const transactionId = (rpcData as any)?.id;

        // If paying a bill
        if (bill) {
          // Create bill_payment record
          const { error: billPaymentError } = await supabase
            .from('bill_payments')
            .insert({
              bill_id: bill.id,
              user_id: user.id,
              amount: amountNum,
              currency: currency,
              payment_date: paymentDate.toISOString().split('T')[0],
              actual_due_date: bill.due_date,
              transaction_id: transactionId,
              account_id: selectedAccountId,
              payment_status: 'completed',
              notes: description,
            });

          if (billPaymentError) throw billPaymentError;

          // Update bill status
          const { error: billUpdateError } = await supabase
            .from('bills')
            .update({
              status: 'paid',
              last_paid_date: paymentDate.toISOString().split('T')[0],
              updated_at: new Date().toISOString(),
            })
            .eq('id', bill.id);

          if (billUpdateError) throw billUpdateError;

          // If bill is linked to liability, update liability
          if (bill.liability_id) {
            // Fetch current liability
            const { data: currentLiability, error: fetchError } = await supabase
              .from('liabilities')
              .select('current_balance, last_payment_date, next_due_date')
              .eq('id', bill.liability_id)
              .single();

            if (!fetchError && currentLiability) {
              const newBalance = Math.max(0, Number(currentLiability.current_balance) - finalPrincipal);
              
              const { error: liabilityUpdateError } = await supabase
                .from('liabilities')
                .update({
                  current_balance: newBalance,
                  last_payment_date: paymentDate.toISOString().split('T')[0],
                  updated_at: new Date().toISOString(),
                })
                .eq('id', bill.liability_id);

              if (liabilityUpdateError) {
                console.error('Error updating liability:', liabilityUpdateError);
                // Don't throw - payment is already recorded
              }
            }
          }
        }

        // If paying liability directly (no bill) or if bill is linked to liability
        if (liability || (bill && bill.liability_id)) {
          const targetLiabilityId = liability?.id || bill?.liability_id;
          
          if (targetLiabilityId) {
            // Create liability_payment record (for cycle matching)
            const { error: paymentError } = await supabase
              .from('liability_payments')
              .insert({
                user_id: user.id,
                liability_id: targetLiabilityId,
                account_id: selectedAccountId,
                category_id: categoryId,
                amount: amountNum,
                payment_date: paymentDate.toISOString().split('T')[0],
                description: description || `${purposeTag} payment for ${bill?.title || liability?.title}`,
                payment_type: bill ? 'bill' : 'manual',
                principal_component: finalPrincipal,
                interest_component: finalInterest,
                transaction_id: transactionId,
              });

            if (paymentError) {
              console.error('Error creating liability_payment:', paymentError);
              // Don't throw - payment transaction is already created
            }

            // Update liability balance
            const { data: currentLiability } = await supabase
              .from('liabilities')
              .select('current_balance')
              .eq('id', targetLiabilityId)
              .single();

            if (currentLiability) {
              const newBalance = Math.max(0, Number(currentLiability.current_balance) - finalPrincipal);
              
              const { error: liabilityUpdateError } = await supabase
                .from('liabilities')
                .update({
                  current_balance: newBalance,
                  last_payment_date: paymentDate.toISOString().split('T')[0],
                  updated_at: new Date().toISOString(),
                })
                .eq('id', targetLiabilityId);

              if (liabilityUpdateError) {
                console.error('Error updating liability balance:', liabilityUpdateError);
                // Don't throw - payment is already recorded
              }
            }
          }
        }
      }

      // Refresh data
      await globalRefresh();
      refreshAccounts();
      refreshAccountFunds();
      refreshTransactions();

      Alert.alert('Success', 'Payment recorded successfully');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      Alert.alert('Error', error.message || 'Failed to process payment');
    } finally {
      setSaving(false);
    }
  };

  const expectedAmount = bill?.amount || liability?.periodical_payment || 0;
  const formattedSuggestion = suggestion ? formatSuggestion(suggestion) : null;

  if (loading) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#000000" />
            <Text style={styles.loadingText}>Loading payment information...</Text>
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
              <Text style={styles.title}>
                {bill ? `Pay ${bill.title}` : liability ? `Pay ${liability.title}` : 'Make Payment'}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>

            {/* Total Payment Amount Section - Large Display */}
            <GlassCard padding={24} marginVertical={12}>
              <Text style={styles.totalPaymentLabel}>Total Payment Amount</Text>
              <TextInput
                style={styles.totalAmountInput}
                value={totalAmount}
                onChangeText={setTotalAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor="rgba(0, 0, 0, 0.3)"
              />
              {suggestion && (
                <Text style={styles.suggestedAmount}>
                  Suggested amount: {formatCurrencyAmount(suggestion.suggestedAmount, currency)} (Next bills)
                </Text>
              )}
            </GlassCard>

            {/* Payment Allocation Section - For Multi-Liability or Single Liability */}
            {(liabilityIds && liabilityIds.length > 0 && allocations.length > 0) || liability ? (
              <GlassCard padding={20} marginVertical={12}>
                <View style={styles.allocationHeader}>
                  <Text style={styles.sectionLabel}>Payment Allocation</Text>
                  {liabilityIds && liabilityIds.length > 0 && (
                    <TouchableOpacity onPress={() => {/* TODO: Add liability picker */}}>
                      <Text style={styles.addLiabilityLink}>Add Liability</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Multi-Liability Allocation */}
                {liabilityIds && liabilityIds.length > 0 && allocations.map((allocation, index) => {
                  const liability = liabilities.find(l => l.id === allocation.liabilityId);
                  if (!liability) return null;
                  
                  return (
                    <View key={allocation.liabilityId} style={styles.allocationItem}>
                      <View style={styles.allocationItemHeader}>
                        <Text style={styles.allocationLiabilityName}>{liability.title}</Text>
                        <Text style={styles.allocationDueDate}>
                          Due {liability.next_due_date ? new Date(liability.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                        </Text>
                      </View>
                      <Text style={styles.allocationAmount}>
                        {formatCurrencyAmount(allocation.allocatedAmount, currency)}
                      </Text>
                      <Text style={styles.allocationLabel}>Allocated</Text>
                      
                      <View style={styles.allocationBreakdown}>
                        <View style={styles.allocationBreakdownRow}>
                          <Text style={styles.allocationBreakdownLabel}>Interest:</Text>
                          <TextInput
                            style={styles.allocationBreakdownInput}
                            value={allocation.interest.toString()}
                            onChangeText={(text) => {
                              const newAllocations = [...allocations];
                              newAllocations[index].interest = parseFloat(text) || 0;
                              newAllocations[index].principal = newAllocations[index].allocatedAmount - newAllocations[index].interest - newAllocations[index].fees;
                              setAllocations(newAllocations);
                            }}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.allocationBreakdownRow}>
                          <Text style={styles.allocationBreakdownLabel}>Fees:</Text>
                          <TextInput
                            style={styles.allocationBreakdownInput}
                            value={allocation.fees.toString()}
                            onChangeText={(text) => {
                              const newAllocations = [...allocations];
                              newAllocations[index].fees = parseFloat(text) || 0;
                              newAllocations[index].principal = newAllocations[index].allocatedAmount - newAllocations[index].interest - newAllocations[index].fees;
                              setAllocations(newAllocations);
                            }}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.allocationBreakdownRow}>
                          <Text style={styles.allocationBreakdownLabel}>Principal:</Text>
                          <TextInput
                            style={styles.allocationBreakdownInput}
                            value={allocation.principal.toString()}
                            onChangeText={(text) => {
                              const newAllocations = [...allocations];
                              newAllocations[index].principal = parseFloat(text) || 0;
                              setAllocations(newAllocations);
                            }}
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* Single Liability Allocation */}
                {liability && !liabilityIds && (
                  <View style={styles.allocationItem}>
                    <View style={styles.allocationItemHeader}>
                      <Text style={styles.allocationLiabilityName}>{liability.title}</Text>
                      {liability.next_due_date && (
                        <Text style={styles.allocationDueDate}>
                          Due {new Date(liability.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                      )}
                    </View>
                    <View style={styles.allocationBreakdown}>
                      <View style={styles.allocationBreakdownRow}>
                        <Text style={styles.allocationBreakdownLabel}>Interest:</Text>
                        <TextInput
                          style={styles.allocationBreakdownInput}
                          value={interestAmount}
                          onChangeText={setInterestAmount}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.allocationBreakdownRow}>
                        <Text style={styles.allocationBreakdownLabel}>Fees:</Text>
                        <TextInput
                          style={styles.allocationBreakdownInput}
                          value={feesAmount}
                          onChangeText={setFeesAmount}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.allocationBreakdownRow}>
                        <Text style={styles.allocationBreakdownLabel}>Principal:</Text>
                        <TextInput
                          style={styles.allocationBreakdownInput}
                          value={principalAmount}
                          onChangeText={setPrincipalAmount}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                    <View style={styles.allocationTotal}>
                      <Text style={styles.allocationTotalLabel}>Total Allocated:</Text>
                      <Text style={styles.allocationTotalValue}>
                        {formatCurrencyAmount(
                          (parseFloat(interestAmount) || 0) + 
                          (parseFloat(feesAmount) || 0) + 
                          (parseFloat(principalAmount) || 0), 
                          currency
                        )}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Allocation Summary */}
                {liabilityIds && liabilityIds.length > 0 && (
                  <View style={styles.allocationSummary}>
                    <Text style={styles.allocationSummaryText}>
                      Total allocation ({formatCurrencyAmount(
                        allocations.reduce((sum, a) => sum + a.allocatedAmount, 0),
                        currency
                      )}) matches total payment. Remaining to allocate: {formatCurrencyAmount(
                        Math.max(0, parseFloat(totalAmount) - allocations.reduce((sum, a) => sum + a.allocatedAmount, 0)),
                        currency
                      )}
                    </Text>
                  </View>
                )}
              </GlassCard>
            ) : null}

            {/* Payment Intelligence Section */}
            {liability && paymentImpacts.has(liability.id) && (
              <GlassCard padding={20} marginVertical={12}>
                <View style={styles.intelligenceHeader}>
                  <Ionicons name="information-circle" size={20} color="#10B981" />
                  <Text style={styles.intelligenceTitle}>Payment Intelligence</Text>
                  <TouchableOpacity onPress={() => setShowSuggestion(false)}>
                    <Ionicons name="close" size={18} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                {(() => {
                  const impact = paymentImpacts.get(liability.id);
                  const intelligence = calculatePaymentIntelligence(impact, parseFloat(totalAmount) || 0);
                  return (
                    <Text style={styles.intelligenceMessage}>
                      {intelligence.message}
                    </Text>
                  );
                })()}
              </GlassCard>
            )}

            {/* Interest Section with Suggestion Box - Only show if not using new allocation UI */}
            {liability && liability.interest_rate_apy && liability.interest_rate_apy > 0 && !liabilityIds && (
              <GlassCard padding={20} marginVertical={12}>
                <View style={styles.interestSection}>
                  <View style={styles.interestHeaderRow}>
                    <Text style={styles.sectionLabel}>Interest</Text>
                    {/* Small Suggestion Box */}
                    {formattedSuggestion && showSuggestion && (
                      <TouchableOpacity
                        style={[styles.suggestionBox, { borderColor: formattedSuggestion.color }]}
                        onPress={applySuggestion}
                      >
                        <Ionicons name="bulb" size={14} color={formattedSuggestion.color} />
                        <Text style={[styles.suggestionBoxText, { color: formattedSuggestion.color }]}>
                          {formattedSuggestion.amount}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <View style={styles.interestToggleRow}>
                    <Text style={styles.interestToggleLabel}>Included</Text>
                    <Switch
                      value={interestIncluded}
                      onValueChange={setInterestIncluded}
                      trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  {!interestIncluded && (
                    <View style={styles.interestInputs}>
                      <View style={styles.interestInputRow}>
                        <Text style={styles.interestLabel}>Principal</Text>
                        <TextInput
                          style={styles.interestInput}
                          value={principalAmount}
                          onChangeText={setPrincipalAmount}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.interestInputRow}>
                        <Text style={styles.interestLabel}>Interest</Text>
                        <TextInput
                          style={styles.interestInput}
                          value={interestAmount}
                          onChangeText={setInterestAmount}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  )}

                  {paymentBreakdown && interestIncluded && (
                    <View style={styles.breakdown}>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Principal</Text>
                        <Text style={styles.breakdownValue}>
                          {formatCurrencyAmount(paymentBreakdown.principal, currency)}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Interest</Text>
                        <Text style={styles.breakdownValue}>
                          {formatCurrencyAmount(paymentBreakdown.interest, currency)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </GlassCard>
            )}

            {/* Payment Preview Section */}
            {(liability || (liabilityIds && liabilityIds.length > 0)) && (
              <GlassCard padding={20} marginVertical={12}>
                <View style={styles.previewHeader}>
                  <Text style={styles.sectionLabel}>Payment Preview</Text>
                  <TouchableOpacity onPress={() => setShowPreviewDetails(!showPreviewDetails)}>
                    <Text style={styles.showDetailsLink}>
                      {showPreviewDetails ? 'Hide Details' : 'Show Details'}
                    </Text>
                    <Ionicons 
                      name={showPreviewDetails ? 'chevron-up' : 'chevron-down'} 
                      size={16} 
                      color="#6366F1" 
                    />
                  </TouchableOpacity>
                </View>

                {showPreviewDetails && (
                  <>
                    {/* Single Liability Preview */}
                    {liability && !liabilityIds && paymentImpacts.has(liability.id) && (
                      <View style={styles.previewItem}>
                        <Text style={styles.previewLiabilityName}>{liability.title}</Text>
                        {(() => {
                          const impact = paymentImpacts.get(liability.id);
                          return (
                            <>
                              <View style={styles.previewRow}>
                                <Text style={styles.previewLabel}>Current Balance:</Text>
                                <Text style={styles.previewValue}>
                                  {formatCurrencyAmount(impact.currentBalance, currency)}
                                </Text>
                              </View>
                              <View style={styles.previewRow}>
                                <Text style={styles.previewLabel}>New Balance:</Text>
                                <Text style={styles.previewValue}>
                                  {formatCurrencyAmount(impact.newBalance, currency)}
                                </Text>
                              </View>
                              {impact.newNextDueDate && (
                                <View style={styles.previewRow}>
                                  <Text style={styles.previewLabel}>Next Due Date:</Text>
                                  <Text style={styles.previewValue}>
                                    {new Date(impact.newNextDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </Text>
                                </View>
                              )}
                              {impact.newPayoffDate && (
                                <View style={styles.previewRow}>
                                  <Text style={styles.previewLabel}>Payoff Date:</Text>
                                  <Text style={styles.previewValue}>
                                    {new Date(impact.newPayoffDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                    {impact.payoffDate && (
                                      <Text style={styles.previewChange}>
                                        {' '}(was {new Date(impact.payoffDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})
                                      </Text>
                                    )}
                                  </Text>
                                </View>
                              )}
                            </>
                          );
                        })()}
                      </View>
                    )}

                    {/* Multi-Liability Preview */}
                    {liabilityIds && liabilityIds.length > 0 && allocations.map((allocation) => {
                      const liability = liabilities.find(l => l.id === allocation.liabilityId);
                      if (!liability) return null;
                      const impact = paymentImpacts.get(allocation.liabilityId);
                      if (!impact) return null;

                      return (
                        <View key={allocation.liabilityId} style={styles.previewItem}>
                          <Text style={styles.previewLiabilityName}>{liability.title}</Text>
                          <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Current Balance:</Text>
                            <Text style={styles.previewValue}>
                              {formatCurrencyAmount(impact.currentBalance, currency)}
                            </Text>
                          </View>
                          <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>New Balance:</Text>
                            <Text style={styles.previewValue}>
                              {formatCurrencyAmount(impact.newBalance, currency)}
                            </Text>
                          </View>
                          {impact.newNextDueDate && (
                            <View style={styles.previewRow}>
                              <Text style={styles.previewLabel}>Next Due Date:</Text>
                              <Text style={styles.previewValue}>
                                {new Date(impact.newNextDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </Text>
                            </View>
                          )}
                          {impact.newPayoffDate && (
                            <View style={styles.previewRow}>
                              <Text style={styles.previewLabel}>Payoff Date:</Text>
                              <Text style={styles.previewValue}>
                                {new Date(impact.newPayoffDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                {impact.payoffDate && (
                                  <Text style={styles.previewChange}>
                                    {' '}(was {new Date(impact.payoffDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})
                                  </Text>
                                )}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
              </GlassCard>
            )}

            {/* Payment Date */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.sectionLabel}>Payment Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#000000" />
                <Text style={styles.dateText}>
                  {paymentDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
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
            </GlassCard>

            {/* Purpose Tag */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.sectionLabel}>Purpose Tag *</Text>
              <TouchableOpacity
                style={styles.purposeTagButton}
                onPress={() => setShowPurposePicker(true)}
              >
                <Text style={styles.purposeTagText}>
                  {PAYMENT_PURPOSES.find(p => p.value === purposeTag)?.label || 'Regular Payment'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="rgba(0, 0, 0, 0.5)" />
              </TouchableOpacity>
            </GlassCard>

            {/* Purpose Tag Picker Modal */}
            <Modal
              visible={showPurposePicker}
              transparent
              animationType="slide"
              onRequestClose={() => setShowPurposePicker(false)}
            >
              <View style={styles.pickerOverlay}>
                <View style={styles.pickerContent}>
                  <View style={styles.pickerHeader}>
                    <Text style={styles.pickerTitle}>Select Purpose</Text>
                    <TouchableOpacity onPress={() => setShowPurposePicker(false)}>
                      <Ionicons name="close" size={24} color="#000000" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView>
                    {PAYMENT_PURPOSES.map((purpose) => (
                      <TouchableOpacity
                        key={purpose.value}
                        style={styles.purposeOption}
                        onPress={() => {
                          setPurposeTag(purpose.value);
                          setShowPurposePicker(false);
                        }}
                      >
                        <Ionicons name={purpose.icon as any} size={20} color="#6366F1" />
                        <Text style={styles.purposeOptionText}>{purpose.label}</Text>
                        {purposeTag === purpose.value && (
                          <Ionicons name="checkmark" size={20} color="#10B981" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </Modal>

            {/* Source Account */}
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.sectionLabel}>Source Account</Text>
              <InlineAccountSelector
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onSelect={(account) => {
                  setSelectedAccountId(account.id);
                  setSelectedFundBucket(null); // Reset fund when account changes
                }}
                label=""
                showBalance={true}
              />
              {!selectedAccountId && (
                <Text style={styles.hintText}>Please select an account to continue</Text>
              )}
            </GlassCard>

            {/* Fund Picker - Show when account is selected */}
            {selectedAccountId && (
              <>
                <GlassCard padding={20} marginVertical={12}>
                  <Text style={styles.sectionLabel}>Fund</Text>
                  <TouchableOpacity
                    style={styles.fundButton}
                    onPress={() => setShowFundPicker(true)}
                  >
                    <View style={styles.fundButtonContent}>
                      {selectedFundBucket ? (
                        <>
                          <View style={[styles.fundIcon, { backgroundColor: selectedFundBucket.type === 'personal' ? '#10B981' : '#6366F1' }]}>
                            <Ionicons 
                              name={selectedFundBucket.type === 'personal' ? 'wallet' : 'card'} 
                              size={18} 
                              color="#FFFFFF" 
                            />
                          </View>
                          <View style={styles.fundInfo}>
                            <Text style={styles.fundName}>{selectedFundBucket.name}</Text>
                            <Text style={styles.fundAmount}>
                              {formatCurrencyAmount(selectedFundBucket.amount || 0, currency)} available
                            </Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <Ionicons name="wallet-outline" size={20} color="rgba(0, 0, 0, 0.5)" />
                          <Text style={styles.fundPlaceholder}>Select Fund</Text>
                        </>
                      )}
                      <Ionicons name="chevron-forward" size={20} color="rgba(0, 0, 0, 0.5)" />
                    </View>
                  </TouchableOpacity>
                  {!selectedFundBucket && (
                    <Text style={styles.hintText}>Please select a fund to continue</Text>
                  )}
                </GlassCard>
                <FundPicker
                  visible={showFundPicker}
                  accountId={selectedAccountId}
                  onSelect={(bucket) => {
                    setSelectedFundBucket(bucket);
                    setShowFundPicker(false);
                  }}
                  onClose={() => setShowFundPicker(false)}
                  allowedTypes={['personal', 'liability']}
                />
              </>
            )}

            {/* Action Button - Single Confirm Payment Button */}
            <View style={styles.actionButtonContainer}>
              <TouchableOpacity
                style={[styles.confirmButton, saving && styles.confirmButtonDisabled]}
                onPress={handlePayment}
                disabled={saving || !totalAmount || !selectedAccountId || !selectedFundBucket}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>Confirm Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  title: {
    fontSize: 24,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  closeButton: {
    padding: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 12,
  },
  totalPaymentLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 8,
  },
  totalAmountInput: {
    fontSize: 40,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    paddingVertical: 12,
  },
  suggestedAmount: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 8,
  },
  amountInput: {
    fontSize: 32,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingVertical: 8,
  },
  expectedAmount: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 8,
  },
  // Payment Allocation Styles
  allocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addLiabilityLink: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
  },
  allocationItem: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  allocationItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  allocationLiabilityName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  allocationDueDate: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  allocationAmount: {
    fontSize: 20,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    marginTop: 4,
  },
  allocationLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 12,
  },
  allocationBreakdown: {
    marginTop: 12,
    gap: 8,
  },
  allocationBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  allocationBreakdownLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  allocationBreakdownInput: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.2)',
    paddingVertical: 4,
    minWidth: 100,
    textAlign: 'right',
  },
  allocationTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  allocationTotalLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  allocationTotalValue: {
    fontSize: 16,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  allocationSummary: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  allocationSummaryText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#92400E',
  },
  // Payment Intelligence Styles
  intelligenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  intelligenceTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
    flex: 1,
  },
  intelligenceMessage: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    lineHeight: 20,
  },
  // Payment Preview Styles
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  showDetailsLink: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
    marginRight: 4,
  },
  previewItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  previewLiabilityName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  previewValue: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
  },
  previewChange: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  // Purpose Tag Styles
  purposeTagButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  purposeTagText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 40,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  pickerTitle: {
    fontSize: 20,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  purposeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  purposeOptionText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    flex: 1,
  },
  // Action Button Styles
  actionButtonContainer: {
    padding: 20,
    paddingTop: 12,
  },
  confirmButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  suggestionCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  suggestionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  suggestionMessage: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 12,
  },
  applyButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  interestSection: {
    gap: 12,
  },
  interestHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  suggestionBoxText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  interestHeader: {
    marginBottom: 12,
  },
  interestToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  interestToggleLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  switchLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  interestInputs: {
    gap: 12,
    marginTop: 12,
  },
  interestInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  interestLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    flex: 1,
  },
  interestInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.2)',
    paddingVertical: 8,
    textAlign: 'right',
  },
  breakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  breakdownValue: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  dateText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
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
  fundButton: {
    paddingVertical: 12,
  },
  fundButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fundIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fundInfo: {
    flex: 1,
  },
  fundName: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    marginBottom: 2,
  },
  fundAmount: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  fundPlaceholder: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  hintText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 8,
    fontStyle: 'italic',
  },
  descriptionInput: {
    fontSize: 15,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    paddingVertical: 8,
    minHeight: 60,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 20,
  },
  scheduleButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  payButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#000000',
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginTop: 12,
  },
});

