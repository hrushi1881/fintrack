import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import DrawLiabilityFundsModal from '@/app/modals/draw-liability-funds';
import PayLiabilityModal from '@/app/modals/pay-liability';
import LiabilitySettlementModal from '@/app/modals/liability-settlement';
import EditLiabilityScheduleModal from '@/app/modals/edit-liability-schedule';
import EditLiabilityModal from '@/app/modals/edit-liability';
import PayBillModal from '@/app/modals/pay-bill';
// AddLiabilityBillModal replaced with UnifiedPaymentModal
import { checkLiabilitySettlementStatus } from '@/utils/liabilities';
import GlassCard from '@/components/GlassCard';
import { fetchLiabilitySchedules, LiabilitySchedule } from '@/utils/liabilitySchedules';
import { fetchBills, calculateBillStatus } from '@/utils/bills';
import { Bill } from '@/types';
import LiabilityCycles from '@/components/cycles/LiabilityCycles';
import UnifiedPaymentModal from '@/app/modals/unified-payment-modal';
import { regenerateBillsFromCycles } from '@/utils/cycleBillGeneration';

interface LiabilityPayment {
  id: string;
  amount: number;
  payment_date: string;
  description?: string;
  is_mock?: boolean;
  principal_component?: number;
  interest_component?: number;
}

interface LiabilityActivity {
  id: string;
  activity_type: string;
  created_at: string;
  amount?: number;
  notes?: string;
}

interface LiabilityRecord {
  id: string;
  title: string;
  description?: string;
  liability_type: string;
  current_balance: number;
  original_amount?: number;
  disbursed_amount?: number;
  interest_rate_apy?: number;
  periodical_payment?: number;
  start_date?: string;
  targeted_payoff_date?: string;
  next_due_date?: string;
  status: string;
  color?: string;
  icon?: string;
}

const LiabilityDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts } = useRealtimeData();
  const { fetchLiabilityAllocations } = useLiabilities();

  const [liability, setLiability] = useState<LiabilityRecord | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<LiabilityPayment[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [activityLog, setActivityLog] = useState<LiabilityActivity[]>([]);
  const [schedules, setSchedules] = useState<LiabilitySchedule[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billsRefreshKey, setBillsRefreshKey] = useState(0); // Force refresh trigger
  const [loading, setLoading] = useState(true);
  const [showDrawFunds, setShowDrawFunds] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [checkingSettlement, setCheckingSettlement] = useState(false);
  const [showAmortization, setShowAmortization] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<LiabilitySchedule | null>(null);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [showPayBillModal, setShowPayBillModal] = useState(false);
  // showAddBillModal removed - using unified payment modal instead
  const [showUnifiedPayModal, setShowUnifiedPayModal] = useState(false);
  const [viewMode, setViewMode] = useState<'bills' | 'cycles'>('bills');
  const [cyclesRefreshKey, setCyclesRefreshKey] = useState(0); // Force cycles refresh

  useEffect(() => {
    if (id && user) {
      loadLiability();
    }
  }, [id, user]);

  // Refresh when screen comes into focus (e.g., after returning from payment modal)
  useFocusEffect(
    React.useCallback(() => {
      if (id && user) {
        loadLiability();
      }
    }, [id, user])
  );

  const loadLiability = async () => {
    if (!id || !user) return;

    try {
      setLoading(true);

      const { data: record, error: liabilityError } = await supabase
        .from('liabilities')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (liabilityError) throw liabilityError;
      setLiability(record as LiabilityRecord);

      const { data: payments } = await supabase
        .from('liability_payments')
        .select('*')
        .eq('liability_id', id)
        .order('payment_date', { ascending: false });
      setPaymentHistory((payments as LiabilityPayment[]) || []);

      const allocationRows = await fetchLiabilityAllocations(id);
      setAllocations(allocationRows || []);

      try {
        const { data: activityRows } = await supabase
          .from('liability_activity_log')
          .select('*')
          .eq('liability_id', id)
          .order('created_at', { ascending: false });
        setActivityLog((activityRows as LiabilityActivity[]) || []);
      } catch (error) {
        setActivityLog([]);
      }

      // Fetch liability schedules (bills)
      try {
        const schedulesData = await fetchLiabilitySchedules(id);
        setSchedules(schedulesData || []);
      } catch (error) {
        console.error('Error fetching schedules:', error);
        setSchedules([]);
      }

      // Fetch bills linked to this liability
      try {
        const billsData = await fetchBills(user.id, {
          // @ts-ignore - billType filter may not be in type yet
          billType: 'liability_linked',
        });
        // Filter bills for this liability
        const liabilityBills = billsData.filter(b => b.liability_id === id);
        // Calculate status for each bill (recalculate to ensure status is up-to-date)
        const billsWithStatus = liabilityBills.map(bill => {
          // Recalculate status to ensure it's current
          const currentStatus = calculateBillStatus(bill);
          return {
            ...bill,
            status: currentStatus,
          };
        });
        // Sort by due date to ensure proper ordering for next payment calculation
        billsWithStatus.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        setBills(billsWithStatus);
        // Trigger refresh key update to force useMemo recalculation
        setBillsRefreshKey(prev => prev + 1);
      } catch (error) {
        console.error('Error fetching bills:', error);
        setBills([]);
      }
    } catch (error) {
      console.error('Failed to load liability details', error);
      Alert.alert('Error', 'Could not load liability details.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => formatCurrencyAmount(value, currency);

  const formatDate = (value?: string) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const outstanding = useMemo(() => Number(liability?.current_balance ?? 0), [liability]);
  const totalOwed = useMemo(
    () => Number(liability?.original_amount ?? liability?.current_balance ?? 0),
    [liability]
  );
  const minPayment = useMemo(
    () => Number(liability?.periodical_payment ?? 0),
    [liability]
  );
  const paidAmount = useMemo(() => totalOwed - outstanding, [totalOwed, outstanding]);
  const paidProgress = useMemo(() => {
    if (totalOwed === 0) return 0;
    return Math.max(0, Math.min(1, paidAmount / totalOwed));
  }, [paidAmount, totalOwed]);

  const totalInterestPaid = useMemo(() => {
    return paymentHistory.reduce((sum, payment) => sum + Number(payment.interest_component ?? 0), 0);
  }, [paymentHistory]);

  const totalPrincipalPaid = useMemo(() => {
    return paymentHistory.reduce((sum, payment) => sum + Number(payment.principal_component ?? 0), 0);
  }, [paymentHistory]);

  // Calculate next payment due from bills (most accurate and updates dynamically)
  const nextPaymentDue = useMemo(() => {
    if (!bills || bills.length === 0) {
      return liability?.next_due_date;
    }

    // Filter out paid, cancelled, and skipped bills
    const upcomingBills = bills.filter(b => {
      const status = b.status?.toLowerCase();
      const isUpcoming = status !== 'paid' && status !== 'cancelled' && status !== 'skipped';
      return isUpcoming;
    });

    if (upcomingBills.length === 0) {
      return liability?.next_due_date;
    }

    // Sort by due date (earliest first)
    const sortedBills = [...upcomingBills].sort((a, b) => {
      const dateA = new Date(a.due_date).getTime();
      const dateB = new Date(b.due_date).getTime();
      return dateA - dateB;
    });
    
    const nextDue = sortedBills[0]?.due_date || liability?.next_due_date;
    
    // Debug logging (remove in production if needed)
    if (__DEV__) {
      console.log('Next Payment Due Calculation:', {
        totalBills: bills.length,
        upcomingBills: upcomingBills.length,
        nextDue,
        billsStatuses: bills.map(b => ({ id: b.id, status: b.status, due_date: b.due_date })),
      });
    }
    
    return nextDue;
  }, [bills, liability, billsRefreshKey]);

  const handlePayBill = (bill: Bill) => {
    setSelectedBill(bill);
    // Use unified payment modal instead
    setShowUnifiedPayModal(true);
  };

  // No separate edit function - clicking bill opens pay modal which allows editing
  const handleEditBill = (bill: Bill) => {
    // Same as pay bill - one modal for both editing and paying
    setSelectedBill(bill);
    setShowPayBillModal(true);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'paid':
        return '#10B981';
      case 'overdue':
        return '#EF4444';
      case 'due_today':
        return '#F59E0B';
      case 'upcoming':
        return '#3B82F6';
      case 'pending':
        return '#F59E0B';
      case 'skipped':
        return '#6B7280';
      case 'cancelled':
        return '#9CA3AF';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = (status: string): any => {
    switch (status) {
      case 'paid':
        return 'checkmark-circle';
      case 'overdue':
        return 'alert-circle';
      case 'due_today':
        return 'time';
      case 'upcoming':
        return 'time-outline';
      case 'pending':
        return 'hourglass-outline';
      case 'skipped':
        return 'close-circle-outline';
      case 'cancelled':
        return 'ban-outline';
      default:
        return 'ellipse-outline';
    }
  };

  const handleMenuPress = () => {
    if (!liability) return;
    
    Alert.alert(
      liability.title,
      'Choose an action',
      [
        {
          text: 'Edit Liability',
          onPress: () => setShowEditModal(true),
        },
        {
          text: 'Delete Liability',
          style: 'destructive',
          onPress: handleDeleteLiability,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleDeleteLiability = async () => {
    if (!liability || !user) return;

    setCheckingSettlement(true);
    try {
      const settlementStatus = await checkLiabilitySettlementStatus(liability.id, user.id);

      if (settlementStatus.needsSettlement) {
        setShowSettlementModal(true);
      } else {
        Alert.alert(
          'Delete liability?',
          'This liability is already settled. This action cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await supabase
                    .from('liabilities')
                    .update({
                      is_deleted: true,
                      deleted_at: new Date().toISOString(),
                      is_active: false,
                    })
                    .eq('id', liability.id);
                  router.back();
                } catch (error) {
                  console.error('Failed to delete liability', error);
                  Alert.alert('Error', 'Could not delete liability.');
                }
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Error checking settlement status:', error);
      Alert.alert('Error', error.message || 'Could not check settlement status.');
    } finally {
      setCheckingSettlement(false);
    }
  };

  const handleSettlementComplete = () => {
    setShowSettlementModal(false);
    router.back();
  };

  const handleGenerateBills = async () => {
    if (!liability || !user) return;

    // Check if liability has required fields for bill generation
    if (!liability.periodical_payment || !liability.periodical_frequency || !liability.start_date) {
      Alert.alert(
        'Cannot Generate Bills',
        'This liability is missing required payment information. Please edit the liability to add:\n\n• Payment amount\n• Payment frequency\n• Start date',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setLoading(true);
      
      const result = await regenerateBillsFromCycles(liability.id, user.id, {
        deleteExisting: false, // Don't delete existing bills
        maxCycles: 12, // Generate first 12 cycles
      });

      Alert.alert(
        'Bills Generated',
        `Successfully generated ${result.billsCreated} bills for this liability.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Reload bills
              loadLiability();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error generating bills:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to generate bills. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.loadingText}>Loading liability details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!liability) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="rgba(0, 0, 0, 0.3)" />
          <Text style={styles.emptyTitle}>Liability not found</Text>
          <Text style={styles.emptyMessage}>
            This liability may have been deleted or is no longer accessible.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.pageTitle} numberOfLines={1}>
              {liability.title}
            </Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleMenuPress}
            disabled={checkingSettlement}
          >
            {checkingSettlement ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Ionicons name="ellipsis-horizontal" size={24} color="#000000" />
            )}
          </TouchableOpacity>
          </View>

          {/* Hero Section - Current Balance */}
          <GlassCard padding={24} marginVertical={20}>
            <Text style={styles.heroLabel}>Current Outstanding Balance</Text>
            <Text style={styles.heroAmount}>{formatCurrency(outstanding)}</Text>
            <View style={styles.progressSection}>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${paidProgress * 100}%` }]} />
            </View>
              <Text style={styles.progressText}>
                {Math.round(paidProgress * 100)}% paid ({formatCurrency(paidAmount)} of {formatCurrency(totalOwed)})
              </Text>
            </View>
          </GlassCard>

          {/* Key Metrics */}
          <View style={styles.metricsGrid}>
            <GlassCard padding={20}>
              <Text style={styles.metricLabel}>Monthly Payment</Text>
              <Text style={styles.metricValue}>
                {minPayment ? formatCurrency(minPayment) : '—'}
              </Text>
            </GlassCard>
            <GlassCard padding={20}>
              <Text style={styles.metricLabel}>Interest Rate</Text>
              <Text style={styles.metricValue}>
                {liability.interest_rate_apy ? `${liability.interest_rate_apy}%` : '—'}
              </Text>
            </GlassCard>
            <GlassCard padding={20}>
              <Text style={styles.metricLabel}>Next Payment Due</Text>
              <Text style={styles.metricValue}>
                {formatDate(nextPaymentDue)}
              </Text>
            </GlassCard>
            <GlassCard padding={20}>
              <Text style={styles.metricLabel}>Total Interest Paid</Text>
              <Text style={styles.metricValue}>{formatCurrency(totalInterestPaid)}</Text>
            </GlassCard>
          </View>

          {/* Payment Breakdown */}
          {paymentHistory.length > 0 && (
            <GlassCard padding={24} marginVertical={12}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Payment Breakdown</Text>
              </View>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Principal Paid</Text>
                  <Text style={styles.breakdownValue}>{formatCurrency(totalPrincipalPaid)}</Text>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Interest Paid</Text>
                  <Text style={styles.breakdownValue}>{formatCurrency(totalInterestPaid)}</Text>
                </View>
              </View>
            </GlassCard>
          )}

          {/* Payment History - Only show if there are payments */}
          {paymentHistory.length > 0 && (
            <GlassCard padding={24} marginVertical={12}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Payment History</Text>
                {paymentHistory.length > 5 && (
                <TouchableOpacity>
                    <Text style={styles.sectionAction}>View All</Text>
                </TouchableOpacity>
                )}
              </View>
              <View style={styles.paymentList}>
                {paymentHistory.slice(0, 5).map((payment) => (
                  <View key={payment.id} style={styles.paymentItem}>
                    <View style={styles.paymentIcon}>
                      <Ionicons name="checkmark-circle" size={20} color="rgba(0, 0, 0, 0.6)" />
                    </View>
                    <View style={styles.paymentInfo}>
                      <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                      <Text style={styles.paymentDate}>{formatDate(payment.payment_date)}</Text>
                      {payment.principal_component && payment.interest_component && (
                        <Text style={styles.paymentBreakdown}>
                          Principal: {formatCurrency(payment.principal_component)} • Interest: {formatCurrency(payment.interest_component)}
                        </Text>
                      )}
                      {payment.description && (
                        <Text style={styles.paymentDescription}>{payment.description}</Text>
                      )}
            </View>
          </View>
                ))}
              </View>
            </GlassCard>
          )}

          {/* Linked Accounts */}
          {allocations.length > 0 && (
            <GlassCard padding={24} marginVertical={12}>
              <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Linked Accounts</Text>
              </View>
              <View style={styles.allocationList}>
                {allocations.map((allocation) => {
                  const account = accounts.find((acct) => acct.id === allocation.accountId);
                  return (
                    <View key={allocation.accountId} style={styles.allocationItem}>
                      <View style={styles.allocationIcon}>
                        <Ionicons name="wallet-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                      </View>
                      <View style={styles.allocationInfo}>
                        <Text style={styles.allocationName}>{account?.name || 'Account'}</Text>
                        {allocation.liabilityName && (
                          <Text style={styles.allocationSubtext}>{allocation.liabilityName}</Text>
            )}
          </View>
                      <Text style={styles.allocationAmount}>
                        {formatCurrency(Number(allocation.amount ?? 0))}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </GlassCard>
          )}

          {/* Bills & Cycles Section */}
          <GlassCard padding={24} marginVertical={12}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Payment Schedule</Text>
              <View style={styles.headerActions}>
                {/* View Mode Toggle */}
                <View style={styles.viewModeToggle}>
                  <TouchableOpacity
                    style={[styles.viewModeButton, viewMode === 'bills' && styles.viewModeButtonActive]}
                    onPress={() => setViewMode('bills')}
                  >
                    <Ionicons 
                      name="receipt-outline" 
                      size={18} 
                      color={viewMode === 'bills' ? '#000000' : 'rgba(0, 0, 0, 0.5)'} 
                    />
                    <Text style={[styles.viewModeText, viewMode === 'bills' && styles.viewModeTextActive]}>
                      Bills
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.viewModeButton, viewMode === 'cycles' && styles.viewModeButtonActive]}
                    onPress={() => setViewMode('cycles')}
                  >
                    <Ionicons 
                      name="calendar-outline" 
                      size={18} 
                      color={viewMode === 'cycles' ? '#000000' : 'rgba(0, 0, 0, 0.5)'} 
                    />
                    <Text style={[styles.viewModeText, viewMode === 'cycles' && styles.viewModeTextActive]}>
                      Cycles
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            {viewMode === 'bills' ? (
              <>
                <View style={styles.billsHeaderRow}>
                  <Text style={styles.sectionSubtitle}>
                    {bills.length > 0 
                      ? `${bills.filter(b => b.status !== 'paid' && b.status !== 'cancelled').length} upcoming bills`
                      : '0 upcoming bills'
                    }
                  </Text>
                  {bills.length === 0 && liability && liability.periodical_payment && liability.periodical_frequency && (
                    <TouchableOpacity
                      style={styles.generateBillsButton}
                      onPress={handleGenerateBills}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="refresh-outline" size={18} color="#000000" />
                      <Text style={styles.generateBillsButtonText}>Generate Bills</Text>
                    </TouchableOpacity>
                  )}
                </View>
                  
                {/* Interest Summary */}
                {bills.some(b => b.interest_amount && b.interest_amount > 0) && (
                <View style={styles.interestSummary}>
                  <View style={styles.interestItem}>
                    <Text style={styles.interestLabel}>Total Interest</Text>
                    <Text style={styles.interestValue}>
                      {formatCurrency(bills.reduce((sum, b) => sum + (b.interest_amount || 0), 0))}
                    </Text>
                    <Text style={styles.interestSubtext}>Over life of loan</Text>
                  </View>
                  <View style={styles.interestItem}>
                    <Text style={styles.interestLabel}>Interest Paid</Text>
                    <Text style={styles.interestValuePaid}>
                      {formatCurrency(bills.filter(b => b.status === 'paid').reduce((sum, b) => sum + (b.interest_amount || 0), 0))}
                    </Text>
                    <Text style={styles.interestSubtext}>So far</Text>
                  </View>
                  <View style={styles.interestItem}>
                    <Text style={styles.interestLabel}>Interest Remaining</Text>
                    <Text style={styles.interestValue}>
                      {formatCurrency(bills.filter(b => b.status !== 'paid').reduce((sum, b) => sum + (b.interest_amount || 0), 0))}
                    </Text>
                    <Text style={styles.interestSubtext}>To be paid</Text>
                  </View>
                </View>
              )}

              {/* Bills List */}
              <View style={styles.billsList}>
                {bills.length === 0 ? (
                  <View style={styles.emptyBills}>
                    <Ionicons name="receipt-outline" size={48} color="rgba(0, 0, 0, 0.3)" />
                    <Text style={styles.emptyBillsText}>No bills created yet</Text>
                    <Text style={styles.emptyBillsSubtext}>Create your first bill to start tracking payments</Text>
                    <TouchableOpacity 
                      style={styles.createFirstBillButton}
                      onPress={() => {
                        // Open unified payment modal for creating a bill
                        setShowUnifiedPayModal(true);
                      }}
                    >
                      <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.createFirstBillButtonText}>Create First Bill</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* Show paid bills count if any */}
                    {bills.filter((b) => b.status === 'paid').length > 0 && (
                      <View style={styles.paidBillsSummary}>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={styles.paidBillsText}>
                          {bills.filter((b) => b.status === 'paid').length} paid
                        </Text>
                      </View>
                    )}
                    
                    {bills
                      .sort((a, b) => {
                        // Sort by due date, then by status (overdue first)
                        const dateA = new Date(a.due_date).getTime();
                        const dateB = new Date(b.due_date).getTime();
                        if (dateA !== dateB) return dateA - dateB;
                        if (a.status === 'overdue') return -1;
                        if (b.status === 'overdue') return 1;
                        if (a.status === 'due_today') return -1;
                        if (b.status === 'due_today') return 1;
                        return 0;
                      })
                      .filter((bill) => bill.status !== 'paid' && bill.status !== 'cancelled')
                      .slice(0, 10)
                      .map((bill) => {
                        const statusColor = getStatusColor(bill.status);
                        const statusIcon = getStatusIcon(bill.status);
                        const isOverdue = bill.status === 'overdue';
                        const isDueToday = bill.status === 'due_today';
                        
                        return (
                    <TouchableOpacity
                      key={bill.id}
                      style={[
                        styles.billCard,
                        isOverdue && styles.billCardOverdue,
                        isDueToday && styles.billCardDueToday,
                      ]}
                      onPress={() => handlePayBill(bill)}
                    >
                            <View style={styles.billCardLeft}>
                              <View style={[styles.billStatus, { backgroundColor: statusColor }]}>
                                <Ionicons 
                                  name={statusIcon} 
                                  size={20} 
                                  color="#FFFFFF" 
                                />
                              </View>
                              <View style={styles.billInfo}>
                                {bill.payment_number && (
                                  <Text style={styles.billPaymentNumber}>Payment #{bill.payment_number}</Text>
                                )}
                                <Text style={styles.billDate}>
                                  {formatDate(bill.due_date)}
                                  {isOverdue && <Text style={styles.overdueText}> • Overdue</Text>}
                                  {isDueToday && <Text style={styles.dueTodayText}> • Due Today</Text>}
                                </Text>
                                {bill.principal_amount && bill.interest_amount && bill.interest_amount > 0 ? (
                                  <Text style={styles.billBreakdown}>
                                    {formatCurrency(bill.principal_amount)} principal + {formatCurrency(bill.interest_amount)} interest
                                  </Text>
                                ) : bill.principal_amount ? (
                                  <Text style={styles.billBreakdown}>
                                    Principal: {formatCurrency(bill.principal_amount)}
                                  </Text>
                                ) : (
                                  bill.description && <Text style={styles.billDescription}>{bill.description}</Text>
                                )}
                              </View>
                            </View>
                            <View style={styles.billCardRight}>
                              <Text style={styles.billAmount}>{formatCurrency(bill.amount || 0)}</Text>
                              <TouchableOpacity 
                                style={[styles.payButton, isOverdue && styles.payButtonOverdue]} 
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handlePayBill(bill);
                                }}
                              >
                                <Text style={[styles.payButtonText, isOverdue && styles.payButtonTextOverdue]}>Pay</Text>
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                
                    {/* Show "All Paid" message if all are paid but bills exist */}
                    {bills.filter((b) => b.status !== 'paid' && b.status !== 'cancelled').length === 0 && bills.length > 0 && (
                      <View style={styles.emptyBills}>
                        <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
                        <Text style={styles.emptyBillsText}>All payments completed! 🎉</Text>
                        <Text style={styles.emptyBillsSubtext}>All bills have been paid successfully</Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              {/* View All Bills Button */}
              {bills.filter((b) => b.status !== 'paid' && b.status !== 'cancelled').length > 10 && (
                <TouchableOpacity 
                  style={styles.viewAllButton} 
                  onPress={() => {
                    // Show all bills in an expanded view or modal
                    const paidCount = bills.filter(b => b.status === 'paid').length;
                    const upcomingCount = bills.filter(b => b.status !== 'paid' && b.status !== 'cancelled').length;
                    const overdueCount = bills.filter(b => b.status === 'overdue').length;
                    
                    Alert.alert(
                      'All Bills',
                      `Total: ${bills.length} bills\n\nPaid: ${paidCount}\nUpcoming: ${upcomingCount}\nOverdue: ${overdueCount}\n\nScroll to see all bills.`,
                      [{ text: 'OK' }]
                    );
                  }}
                >
                  <Text style={styles.viewAllButtonText}>View All Bills</Text>
                  <Ionicons name="chevron-forward" size={20} color="#000000" />
                </TouchableOpacity>
              )}
              </>
            ) : (
              /* Cycles View */
              <View style={styles.cyclesContainer}>
                {liability && (
                  <LiabilityCycles 
                    key={cyclesRefreshKey}
                    liabilityId={liability.id}
                    maxCycles={12}
                  />
                )}
              </View>
            )}
          </GlassCard>

          {/* Recent Activity */}
          {activityLog.length > 0 && (
            <GlassCard padding={24} marginVertical={12}>
              <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              </View>
              <View style={styles.activityList}>
              {activityLog.slice(0, 4).map((activity) => (
                  <View key={activity.id} style={styles.activityItem}>
                    <View style={styles.activityIcon}>
                      <Ionicons name="document-text-outline" size={20} color="rgba(0, 0, 0, 0.6)" />
                  </View>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityTitle}>
                      {activity.activity_type.replace(/_/g, ' ').replace(/\b\w/g, (char: string) => char.toUpperCase())}
                    </Text>
                      <Text style={styles.activityDate}>{formatDate(activity.created_at)}</Text>
                      {activity.notes && (
                        <Text style={styles.activityNotes}>{activity.notes}</Text>
                      )}
                  </View>
                </View>
              ))}
            </View>
            </GlassCard>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Floating Action Button for Create Bill */}
        {viewMode === 'bills' && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setShowUnifiedPayModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {/* Bottom Action Bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowDrawFunds(true)}
          >
            <Ionicons name="download-outline" size={22} color="#000000" />
            <Text style={styles.actionButtonText}>Draw Funds</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              // Use unified payment modal
              setShowUnifiedPayModal(true);
            }}
          >
            <Text style={styles.primaryButtonText}>Make Payment</Text>
          </TouchableOpacity>
        </View>

        <DrawLiabilityFundsModal
          visible={showDrawFunds}
          onClose={() => setShowDrawFunds(false)}
          liabilityId={liability.id}
          onSuccess={loadLiability}
        />
        <PayLiabilityModal
          visible={showPayModal}
          onClose={() => setShowPayModal(false)}
          liabilityId={liability.id}
          onSuccess={loadLiability}
        />
        <LiabilitySettlementModal
          visible={showSettlementModal}
          liability={liability}
          onClose={() => setShowSettlementModal(false)}
          onComplete={handleSettlementComplete}
        />
        <EditLiabilityScheduleModal
          visible={editingSchedule !== null}
          onClose={() => setEditingSchedule(null)}
          schedule={editingSchedule}
          liabilityId={liability.id}
          liabilityStartDate={liability.start_date || undefined}
          liabilityEndDate={liability.targeted_payoff_date || undefined}
          onSuccess={() => {
            loadLiability();
            setEditingSchedule(null);
          }}
        />
        <EditLiabilityModal
          visible={showEditModal}
          onClose={() => setShowEditModal(false)}
          liability={liability}
          onSuccess={() => {
            loadLiability();
            setShowEditModal(false);
          }}
        />

        {/* Unified Payment Modal */}
        <UnifiedPaymentModal
          visible={showUnifiedPayModal}
          onClose={() => {
            setShowUnifiedPayModal(false);
            setSelectedBill(null);
          }}
          billId={selectedBill?.id}
          liabilityId={liability?.id}
          onSuccess={async () => {
            setShowUnifiedPayModal(false);
            setSelectedBill(null);
            // Small delay to ensure database updates are committed
            await new Promise(resolve => setTimeout(resolve, 300));
            await loadLiability();
            // Refresh cycles to update payment status
            setCyclesRefreshKey(prev => prev + 1);
          }}
        />

        {/* Legacy Pay Bill Modal (for backward compatibility) */}
        <PayBillModal
          visible={showPayBillModal}
          bill={selectedBill}
          onClose={() => {
            setShowPayBillModal(false);
            setSelectedBill(null);
          }}
          onSuccess={() => {
            setShowPayBillModal(false);
            setSelectedBill(null);
            loadLiability();
            // Refresh cycles to update payment status
            setCyclesRefreshKey(prev => prev + 1);
          }}
        />

        {/* Add Bill uses UnifiedPaymentModal - bills are created from cycles */}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    color: '#000000',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
  },
  emptyMessage: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
    lineHeight: 24,
  },
  backButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#000000',
  },
  backButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    flex: 1,
    fontSize: 32,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    marginHorizontal: 12,
    letterSpacing: -0.5,
  },
  heroLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 40,
    fontFamily: 'HelveticaNeue-Bold',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
    letterSpacing: -1,
  },
  progressSection: {
    gap: 8,
  },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#000000',
  },
  progressText: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  sectionAction: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 16,
  },
  billsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  generateBillsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  generateBillsButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  breakdownItem: {
    flex: 1,
  },
  breakdownLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  breakdownValue: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  breakdownDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  paymentList: {
    gap: 16,
  },
  paymentItem: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfo: {
    flex: 1,
    gap: 4,
  },
  paymentAmount: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  paymentDate: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  paymentBreakdown: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 2,
  },
  paymentDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 2,
  },
  allocationList: {
    gap: 12,
  },
  allocationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  allocationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allocationInfo: {
    flex: 1,
    gap: 2,
  },
  allocationName: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  allocationSubtext: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  allocationAmount: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  activityList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: {
    flex: 1,
    gap: 4,
  },
  activityTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  activityDate: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  activityNotes: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 2,
  },
  scheduleList: {
    gap: 12,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  scheduleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  scheduleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleDetails: {
    flex: 1,
    gap: 4,
  },
  scheduleDate: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  scheduleAmount: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  scheduleBreakdown: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
    paddingVertical: 24,
  },
  // Bills Section Styles
  interestSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  interestItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  interestLabel: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  interestValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#EF4444',
  },
  interestValuePaid: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  interestSubtext: {
    fontSize: 10,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.4)',
  },
  billsList: {
    gap: 12,
    marginTop: 16,
  },
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  billCardOverdue: {
    borderColor: '#EF4444',
    borderWidth: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  billCardDueToday: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  billCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  billStatus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billInfo: {
    flex: 1,
    gap: 4,
  },
  billDate: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  overdueText: {
    color: '#EF4444',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  dueTodayText: {
    color: '#F59E0B',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  billBreakdown: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  billDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  billCardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  billAmount: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  payButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#000000',
    borderRadius: 12,
  },
  payButtonOverdue: {
    backgroundColor: '#EF4444',
  },
  payButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  payButtonTextOverdue: {
    color: '#FFFFFF',
  },
  emptyBills: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyBillsText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    gap: 8,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  createBillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  createBillButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 12,
  },
  billPaymentNumber: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 4,
  },
  emptyBillsSubtext: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.4)',
    marginTop: 4,
    textAlign: 'center',
  },
  createFirstBillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#10B981',
    borderRadius: 12,
  },
  createFirstBillButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 2,
  },
  viewModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewModeButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  viewModeText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  viewModeTextActive: {
    color: '#000000',
    fontWeight: '600',
  },
  cyclesContainer: {
    marginTop: 12,
    minHeight: 400,
  },
  paidBillsSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    marginBottom: 12,
  },
  paidBillsText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000,
  },
});

export default LiabilityDetailScreen;
