import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import DrawLiabilityFundsModal from '@/app/modals/draw-liability-funds';
import PayLiabilityModal from '@/app/modals/pay-liability';

type LiabilityData = {
  id: string;
  title: string;
  description?: string;
  liability_type: string;
  current_balance: number;
  interest_rate_apy?: number;
  periodical_payment?: number;
  start_date?: string;
  targeted_payoff_date?: string;
  next_due_date?: string;
  status: string;
  color?: string;
  icon?: string;
  metadata?: any;
};

type LiabilityPayment = {
  id: string;
  amount: number;
  payment_date: string;
  description?: string;
  account_id?: string;
  is_mock?: boolean;
  payment_type?: string;
};

export default function LiabilityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts } = useRealtimeData();
  const { getAccountBreakdown, fetchLiabilityAllocations } = useLiabilities();
  const [activeTab, setActiveTab] = useState('overview');
  const [liability, setLiability] = useState<LiabilityData | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<LiabilityPayment[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrawFunds, setShowDrawFunds] = useState(false);
  const [showPayLiability, setShowPayLiability] = useState(false);

  useEffect(() => {
    if (id && user) {
      loadLiabilityData();
    }
  }, [id, user]);

  const loadLiabilityData = async () => {
    if (!user || !id) return;
    
    try {
      setLoading(true);
      
      // Fetch liability
      const { data: liabilityData, error: liabilityError } = await supabase
        .from('liabilities')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (liabilityError) throw liabilityError;
      setLiability(liabilityData);

      // Fetch payment history
      const { data: payments, error: paymentsError } = await supabase
        .from('liability_payments')
        .select('*')
        .eq('liability_id', id)
        .order('payment_date', { ascending: false });

      if (!paymentsError) {
        setPaymentHistory(payments || []);
      }

      // Fetch allocations
      const allocationsData = await fetchLiabilityAllocations(id);
      setAllocations(allocationsData);

      // Fetch activity log
      const { data: activityData, error: activityError } = await supabase
        .from('liability_activity_log')
        .select('*')
        .eq('liability_id', id)
        .order('created_at', { ascending: false });

      if (!activityError && activityData) {
        setActivityLog(activityData);
      }
    } catch (error) {
      console.error('Error loading liability data:', error);
      Alert.alert('Error', 'Failed to load liability details');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid_off': return '#10B981';
      case 'active': return '#3B82F6';
      case 'overdue': return '#EF4444';
      case 'paused': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid_off': return 'Paid Off';
      case 'active': return 'Active';
      case 'overdue': return 'Overdue';
      case 'paused': return 'Paused';
      default: return 'Unknown';
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

  const handlePayLiability = () => {
    setShowPayLiability(true);
  };

  if (loading) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading liability details...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!liability) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.errorText}>Liability not found</Text>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const liabilityType = detectLiabilityType(liability.liability_type);
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'home' },
    { key: 'payments', label: 'Payments', icon: 'time' },
    { key: 'allocations', label: 'Allocations', icon: 'location' },
    { key: 'activity', label: 'Activity', icon: 'list' },
  ];

  const calculateAvailableToDraw = () => {
    const original = parseFloat(liability.original_amount || '0');
    const disbursed = parseFloat(liability.disbursed_amount || '0');
    return Math.max(0, original - disbursed);
  };

  const formatActivityType = (activityType: string, amount: number) => {
    switch (activityType) {
      case 'draw':
        return `Drawn ${formatCurrency(amount)}`;
      case 'limit_increase':
        return `Limit increased by ${formatCurrency(amount)}`;
      case 'repayment':
        return `Repayment of ${formatCurrency(amount)}`;
      default:
        return activityType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  return (
    <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Liability Details</Text>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="create" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Liability Info Card */}
          <View style={styles.liabilityInfoCard}>
            <View style={styles.liabilityHeader}>
              <View style={[styles.liabilityIcon, { backgroundColor: (liability.color || '#EF4444') + '20' }]}>
                <Ionicons name={(liability.icon || 'card') as any} size={32} color={liability.color || '#EF4444'} />
              </View>
              <View style={styles.liabilityDetails}>
                <Text style={styles.liabilityName}>{liability.title}</Text>
                <Text style={styles.liabilityType}>
                  {liability.liability_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
              </View>
            </View>

            <View style={styles.amountSection}>
              <Text style={styles.amountLabel}>Current Balance</Text>
              <Text style={styles.amountValue}>
                {formatCurrency(parseFloat(liability.current_balance || '0'))}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(liability.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(liability.status) }]}>
                  {getStatusText(liability.status)}
                </Text>
              </View>
            </View>

            {/* Liability Summary */}
            <View style={styles.summarySection}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Owed:</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(parseFloat(liability.original_amount || '0'))}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Remaining:</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(parseFloat(liability.current_balance || '0'))}
                </Text>
              </View>
              <View style={[styles.summaryRow, styles.availableRow]}>
                <Text style={styles.summaryLabel}>Available to Draw:</Text>
                <View style={[
                  styles.availableBadge,
                  calculateAvailableToDraw() === 0 && styles.availableBadgeEmpty
                ]}>
                  <Text style={[
                    styles.availableValue,
                    calculateAvailableToDraw() === 0 && styles.availableValueEmpty
                  ]}>
                    {formatCurrency(calculateAvailableToDraw())}
                  </Text>
                </View>
              </View>
            </View>

            {(liability.next_due_date || liability.targeted_payoff_date) && (
              <View style={styles.dueDateSection}>
                {liability.next_due_date && (
                  <>
                    <Text style={styles.dueDateLabel}>Next Due Date</Text>
                    <Text style={styles.dueDateValue}>{formatDate(liability.next_due_date)}</Text>
                  </>
                )}
                {liability.targeted_payoff_date && (
                  <>
                    <Text style={styles.targetLabel}>Target Payoff Date</Text>
                    <Text style={styles.targetValue}>{formatDate(liability.targeted_payoff_date)}</Text>
                  </>
                )}
              </View>
            )}
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons 
                  name={tab.icon as any} 
                  size={20} 
                  color={activeTab === tab.key ? '#10B981' : '#6B7280'} 
                />
                <Text style={[
                  styles.tabText,
                  activeTab === tab.key && styles.activeTabText
                ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <View style={styles.tabContent}>
              {/* Payment Actions */}
              {liability.status !== 'paid_off' && (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Payment Actions</Text>
                  <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                    onPress={handlePayLiability}
                  >
                    <Ionicons name="card" size={24} color="white" />
                    <Text style={styles.actionText}>Pay Liability</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: '#6366F1' }]}
                    onPress={() => setShowDrawFunds(true)}
                  >
                    <Ionicons name="download" size={24} color="white" />
                    <Text style={styles.actionText}>Draw Funds</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Liability Information */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Liability Information</Text>
                {liability.description && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Description:</Text>
                    <Text style={styles.infoValue}>{liability.description}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Type:</Text>
                  <Text style={styles.infoValue}>
                    {liability.liability_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                </View>
                {liability.interest_rate_apy && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Interest Rate (APY):</Text>
                    <Text style={styles.infoValue}>{liability.interest_rate_apy}%</Text>
                  </View>
                )}
                {liability.periodical_payment && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Periodical Payment:</Text>
                    <Text style={styles.infoValue}>{formatCurrency(liability.periodical_payment)}</Text>
                  </View>
                )}
                {liability.start_date && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Start Date:</Text>
                    <Text style={styles.infoValue}>{formatDate(liability.start_date)}</Text>
                  </View>
                )}
              </View>

              {/* Recent Payments */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Recent Payments</Text>
                {paymentHistory.slice(0, 3).map((payment) => (
                  <View key={payment.id} style={styles.paymentItem}>
                    <View style={styles.paymentInfo}>
                      <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                      <Text style={styles.paymentDate}>{formatDate(payment.payment_date)}</Text>
                      {payment.is_mock && (
                        <Text style={styles.mockBadge}>Mock Payment</Text>
                      )}
                    </View>
                    {payment.description && (
                      <Text style={styles.paymentDescription}>{payment.description}</Text>
                    )}
                  </View>
                ))}
                {paymentHistory.length === 0 && (
                  <Text style={styles.noPaymentsText}>No payments recorded yet</Text>
                )}
              </View>
            </View>
          )}

          {activeTab === 'payments' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Payment History</Text>
                {paymentHistory.map((payment) => (
                  <View key={payment.id} style={styles.historyItem}>
                    <View style={styles.historyIcon}>
                      <Ionicons name="receipt" size={20} color="#10B981" />
                    </View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyAmount}>{formatCurrency(payment.amount)}</Text>
                      <Text style={styles.historyDate}>{formatDate(payment.payment_date)}</Text>
                      {payment.description && (
                        <Text style={styles.historyDescription}>{payment.description}</Text>
                      )}
                      {payment.is_mock && (
                        <View style={styles.mockBadgeContainer}>
                          <Text style={styles.mockBadgeText}>Mock/Historical</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
                {paymentHistory.length === 0 && (
                  <Text style={styles.noPaymentsText}>No payment history available</Text>
                )}
              </View>

              {/* Payment Statistics */}
              {paymentHistory.length > 0 && (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Payment Statistics</Text>
                  <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                      <Text style={styles.statLabel}>Total Paid</Text>
                      <Text style={styles.statValue}>
                        {formatCurrency(paymentHistory.reduce((sum, p) => sum + p.amount, 0))}
                      </Text>
                    </View>
                    <View style={styles.statCard}>
                      <Text style={styles.statLabel}>Average</Text>
                      <Text style={styles.statValue}>
                        {formatCurrency(
                          paymentHistory.reduce((sum, p) => sum + p.amount, 0) / paymentHistory.length
                        )}
                      </Text>
                    </View>
                    <View style={styles.statCard}>
                      <Text style={styles.statLabel}>Payments</Text>
                      <Text style={styles.statValue}>{paymentHistory.length}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {activeTab === 'allocations' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Fund Allocations</Text>
                {allocations.length > 0 ? (
                  allocations.map((alloc) => {
                    const account = accounts.find((a) => a.id === alloc.accountId);
                    return (
                      <View key={alloc.accountId} style={styles.allocationItem}>
                        <View style={styles.allocationInfo}>
                          <View style={styles.allocationDetails}>
                            <Text style={styles.allocationAccount}>
                              {account?.name || 'Unknown Account'}
                            </Text>
                            {alloc.liabilityName && (
                              <Text style={styles.allocationLiability}>{alloc.liabilityName}</Text>
                            )}
                          </View>
                          <Text style={styles.allocationAmount}>{formatCurrency(alloc.amount)}</Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.noPaymentsText}>No fund allocations recorded</Text>
                )}
              </View>
            </View>
          )}

          {activeTab === 'activity' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Activity Log</Text>
                {activityLog.length > 0 ? (
                  activityLog.map((activity) => (
                    <View key={activity.id} style={styles.activityItem}>
                      <View style={styles.activityIcon}>
                        <Ionicons 
                          name={
                            activity.activity_type === 'draw' ? 'download' :
                            activity.activity_type === 'limit_increase' ? 'trending-up' :
                            activity.activity_type === 'repayment' ? 'arrow-back' :
                            'document-text'
                          } 
                          size={20} 
                          color={
                            activity.activity_type === 'draw' ? '#6366F1' :
                            activity.activity_type === 'limit_increase' ? '#F59E0B' :
                            activity.activity_type === 'repayment' ? '#10B981' :
                            '#6B7280'
                          } 
                        />
                      </View>
                      <View style={styles.activityInfo}>
                        <Text style={styles.activityDescription}>
                          {formatActivityType(activity.activity_type, parseFloat(activity.amount || '0'))}
                        </Text>
                        <Text style={styles.activityDate}>
                          {formatDate(activity.created_at)}
                        </Text>
                        {activity.notes && (
                          <Text style={styles.activityNotes}>{activity.notes}</Text>
                        )}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noPaymentsText}>No activity recorded yet</Text>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Modals */}
      <DrawLiabilityFundsModal
        visible={showDrawFunds}
        onClose={() => setShowDrawFunds(false)}
        liability={liability}
        onSuccess={() => {
          loadLiabilityData();
        }}
      />
      {liability && (
        <PayLiabilityModal
          visible={showPayLiability}
          onClose={() => setShowPayLiability(false)}
          liabilityId={liability.id}
          onSuccess={() => {
            loadLiabilityData();
          }}
        />
      )}
    </LinearGradient>
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
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  headerTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  errorText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  backButtonText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  liabilityInfoCard: {
    backgroundColor: '#000000',
    borderRadius: 20,
    padding: 24,
    marginBottom: 30,
  },
  liabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  liabilityIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  liabilityDetails: {
    flex: 1,
  },
  liabilityName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  liabilityType: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  amountSection: {
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dueDateSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  dueDateLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  dueDateValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
  },
  targetLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  targetValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
  },
  activeTab: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  tabText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#10B981',
  },
  tabContent: {
    marginBottom: 24,
  },
  sectionCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  actionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  paymentItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  paymentInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  paymentDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  paymentDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
  },
  mockBadge: {
    fontSize: 10,
    color: '#F59E0B',
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noPaymentsText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    paddingVertical: 20,
  },
  historyItem: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyInfo: {
    flex: 1,
  },
  historyAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  historyDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  mockBadgeContainer: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  mockBadgeText: {
    fontSize: 10,
    color: '#F59E0B',
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  allocationItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  allocationInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  allocationDetails: {
    flex: 1,
  },
  allocationAccount: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  allocationLiability: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  allocationAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  summarySection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
    marginTop: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  availableRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  availableBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  availableBadgeEmpty: {
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderColor: '#6B7280',
  },
  availableValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  availableValueEmpty: {
    color: '#6B7280',
  },
  activityItem: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  activityDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  activityNotes: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontStyle: 'italic',
  },
});