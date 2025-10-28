import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useSettings } from '../../contexts/SettingsContext';
import { Bill, BillPayment } from '../../types';
import { fetchBillById, getBillPaymentHistory, markBillAsPaid, postponeBill, skipBill, cancelBill } from '../../utils/bills';
import { formatCurrencyAmount } from '../../utils/currency';

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const { bills, categories, goals, accounts, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  const [bill, setBill] = useState<Bill | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<BillPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBillData();
  }, [id]);

  const loadBillData = async () => {
    try {
      setLoading(true);
      const billData = await fetchBillById(id as string);
      if (billData) {
        setBill(billData);
        const payments = await getBillPaymentHistory(billData.id);
        setPaymentHistory(payments);
      }
    } catch (error) {
      console.error('Error loading bill data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Uncategorized';
  };

  const getCategoryColor = (categoryId?: string) => {
    if (!categoryId) return '#6B7280';
    const category = categories.find(c => c.id === categoryId);
    return category?.color || '#6B7280';
  };

  const getGoalName = (goalId?: string) => {
    if (!goalId) return null;
    const goal = goals.find(g => g.id === goalId);
    return goal?.title || null;
  };

  const getAccountName = (accountId?: string) => {
    if (!accountId) return null;
    const account = accounts.find(a => a.id === accountId);
    return account?.name || null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#10B981';
      case 'overdue': return '#EF4444';
      case 'due_today': return '#F59E0B';
      case 'upcoming': return '#3B82F6';
      case 'skipped': return '#6B7280';
      case 'cancelled': return '#6B7280';
      case 'postponed': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'overdue': return 'Overdue';
      case 'due_today': return 'Due Today';
      case 'upcoming': return 'Upcoming';
      case 'skipped': return 'Skipped';
      case 'cancelled': return 'Cancelled';
      case 'postponed': return 'Postponed';
      default: return 'Unknown';
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handlePayBill = () => {
    if (!bill) return;
    router.push(`/modals/mark-bill-paid?id=${bill.id}` as any);
  };

  const handlePostpone = () => {
    router.push(`/modals/postpone-bill?id=${bill?.id}` as any);
  };

  const handleSkip = async () => {
    if (!bill) return;
    try {
      await skipBill(bill.id);
      await loadBillData();
      globalRefresh();
    } catch (error) {
      console.error('Error skipping bill:', error);
    }
  };

  const handleCancel = async () => {
    if (!bill) return;
    try {
      await cancelBill(bill.id);
      await loadBillData();
      globalRefresh();
    } catch (error) {
      console.error('Error cancelling bill:', error);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading bill details...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!bill) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Bill not found</Text>
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

  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'home' },
    { key: 'history', label: 'Payments', icon: 'time' },
    { key: 'recurrence', label: 'Recurrence', icon: 'refresh' },
  ];

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Bill Details</Text>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="create" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Bill Info Card */}
          <View style={styles.billInfoCard}>
            <View style={styles.billHeader}>
              <View style={[styles.billIcon, { backgroundColor: bill.color + '20' }]}>
                <Ionicons name={bill.icon as any} size={32} color={bill.color} />
              </View>
              <View style={styles.billDetails}>
                <Text style={styles.billName}>{bill.title}</Text>
                <Text style={styles.billCategory}>{getCategoryName(bill.category_id)}</Text>
                <Text style={styles.billCreationDate}>Created: {formatDate(bill.created_at)}</Text>
              </View>
            </View>
            
            <View style={styles.amountSection}>
              <Text style={styles.amountLabel}>Amount Due</Text>
              <Text style={styles.amountValue}>
                {bill.amount ? formatCurrency(bill.amount) : 'Variable'}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(bill.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(bill.status) }]}>
                  {getStatusText(bill.status)}
                </Text>
              </View>
            </View>

            <View style={styles.dueDateSection}>
              <Text style={styles.dueDateLabel}>Due Date</Text>
              <Text style={styles.dueDateValue}>{formatDate(bill.due_date)}</Text>
              {bill.next_due_date && (
                <Text style={styles.nextPaymentLabel}>Next Payment: {formatDate(bill.next_due_date)}</Text>
              )}
            </View>
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
              {bill.status !== 'paid' && bill.status !== 'cancelled' && (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Payment Actions</Text>
                  <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                    onPress={handlePayBill}
                  >
                    <Ionicons name="checkmark-circle" size={24} color="white" />
                    <Text style={styles.actionText}>Pay Bill</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
                    onPress={handlePostpone}
                  >
                    <Ionicons name="calendar" size={24} color="white" />
                    <Text style={styles.actionText}>Postpone</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: '#F59E0B' }]}
                    onPress={handleSkip}
                  >
                    <Ionicons name="pause" size={24} color="white" />
                    <Text style={styles.actionText}>Skip</Text>
                  </TouchableOpacity>
                  {bill.bill_type !== 'one_time' && (
                    <TouchableOpacity 
                      style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
                      onPress={handleCancel}
                    >
                      <Ionicons name="close" size={24} color="white" />
                      <Text style={styles.actionText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Bill Information */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Bill Information</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Type:</Text>
                  <Text style={styles.infoValue}>
                    {bill.bill_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                </View>
                {bill.recurrence_pattern && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Frequency:</Text>
                    <Text style={styles.infoValue}>
                      Every {bill.recurrence_interval} {bill.recurrence_pattern}
                    </Text>
                  </View>
                )}
                {bill.next_due_date && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Next Due:</Text>
                    <Text style={styles.infoValue}>{formatDate(bill.next_due_date)}</Text>
                  </View>
                )}
                {bill.goal_id && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Linked Goal:</Text>
                    <Text style={styles.infoValue}>{getGoalName(bill.goal_id)}</Text>
                  </View>
                )}
                {bill.linked_account_id && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Linked Account:</Text>
                    <Text style={styles.infoValue}>{getAccountName(bill.linked_account_id)}</Text>
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
                    </View>
                    <View style={[styles.paymentStatus, { backgroundColor: payment.payment_status === 'completed' ? '#10B981' : '#EF4444' }]}>
                      <Text style={[styles.paymentStatusText, { color: payment.payment_status === 'completed' ? '#10B981' : '#EF4444' }]}>
                        {payment.payment_status}
                      </Text>
                    </View>
                  </View>
                ))}
                {paymentHistory.length === 0 && (
                  <Text style={styles.noPaymentsText}>No payments recorded yet</Text>
                )}
              </View>
            </View>
          )}

          {activeTab === 'history' && (
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
                      {payment.account_id && (
                        <Text style={styles.historyAccount}>Account: {getAccountName(payment.account_id)}</Text>
                      )}
                    </View>
                    <View style={[styles.historyStatus, { backgroundColor: payment.payment_status === 'completed' ? '#10B981' : '#EF4444' }]}>
                      <Text style={[styles.historyStatusText, { color: payment.payment_status === 'completed' ? '#10B981' : '#EF4444' }]}>
                        {payment.payment_status}
                      </Text>
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
                        {formatCurrency(paymentHistory.reduce((sum: number, p: BillPayment) => sum + p.amount, 0))}
                      </Text>
                    </View>
                    <View style={styles.statCard}>
                      <Text style={styles.statLabel}>Average</Text>
                      <Text style={styles.statValue}>
                        {formatCurrency(paymentHistory.reduce((sum: number, p: BillPayment) => sum + p.amount, 0) / paymentHistory.length)}
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

          {activeTab === 'settings' && (
            <View style={styles.tabContent}>
              {/* Bill Settings */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Bill Settings</Text>
                <TouchableOpacity style={styles.settingItem}>
                  <Ionicons name="notifications" size={20} color="#3B82F6" />
                  <Text style={styles.settingLabel}>Reminder Notifications</Text>
                  <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingItem}>
                  <Ionicons name="repeat" size={20} color="#8B5CF6" />
                  <Text style={styles.settingLabel}>Auto Pay Settings</Text>
                  <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingItem}>
                  <Ionicons name="calendar" size={20} color="#F59E0B" />
                  <Text style={styles.settingLabel}>Due Date Reminder</Text>
                  <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Category Settings */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Category & Tags</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Category:</Text>
                  <Text style={styles.infoValue}>{getCategoryName(bill.category_id)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Tags:</Text>
                  <Text style={styles.infoValue}>Utilities, Monthly</Text>
                </View>
              </View>

              {/* Danger Zone */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Danger Zone</Text>
                <TouchableOpacity style={[styles.dangerButton, { backgroundColor: '#EF4444' }]}>
                  <Ionicons name="trash" size={20} color="white" />
                  <Text style={styles.dangerText}>Delete Bill</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
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
  billInfoCard: {
    backgroundColor: '#000000',
    borderRadius: 20,
    padding: 24,
    marginBottom: 30,
  },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  billIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  billDetails: {
    flex: 1,
  },
  billName: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  billCategory: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  billCreationDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  amountSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 16,
    color: 'white',
    fontFamily: 'serif',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 32,
    color: 'white',
    fontFamily: 'serif',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  dueDateSection: {
    alignItems: 'center',
  },
  dueDateLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  dueDateValue: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  nextPaymentLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 30,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#10B981',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: 'white',
  },
  tabContent: {
    marginBottom: 30,
  },
  sectionCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionText: {
    color: 'white',
    marginLeft: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  infoValue: {
    fontSize: 14,
    color: 'white',
    fontWeight: 'bold',
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentAmount: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  paymentDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  paymentStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paymentStatusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  historyInfo: {
    flex: 1,
  },
  historyAmount: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  historyStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  historyStatusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  statCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    color: 'white',
    marginLeft: 12,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
  },
  dangerText: {
    color: 'white',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'white',
    fontSize: 18,
    marginBottom: 20,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
  },
  noPaymentsText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  noRecurrenceText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  historyAccount: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
});
