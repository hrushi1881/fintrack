import React, { useState, useEffect, useMemo } from 'react';
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

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassCard from '@/components/GlassCard';
import { fetchBillById, getBillPaymentHistory, getPaymentBillsForContainer, calculateBillStatus } from '@/utils/bills';
import { Bill, BillPayment } from '@/types';
import PayBillModal from '@/app/modals/pay-bill';
import { BillBulkGenerator } from '@/components/bills/BillBulkGenerator';

interface BillRecord {
  id: string;
  title: string;
  description?: string;
  amount?: number;
  currency: string;
  due_date: string;
  next_due_date?: string;
  status: string;
  bill_type: string;
  frequency?: string;
  recurrence_interval?: number;
  category_id?: string;
  linked_account_id?: string;
  parent_bill_id?: string;
  color?: string;
  icon?: string;
  created_at: string;
  auto_create?: boolean;
}

const BillDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, categories, globalRefresh } = useRealtimeData();

  const [bill, setBill] = useState<BillRecord | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<BillPayment[]>([]);
  const [paymentBills, setPaymentBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  // const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [showPayBillModal, setShowPayBillModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  useEffect(() => {
    if (id && user) {
      loadBill();
    }
  }, [id, user]);

  const loadBill = async () => {
    if (!id || !user) return;

    try {
      setLoading(true);

      const billData = await fetchBillById(id);
      if (billData) {
        setBill(billData as BillRecord);
        
        const payments = await getBillPaymentHistory(billData.id);
        setPaymentHistory(payments);

        // If this is a container bill (parent_bill_id is NULL and it's recurring), load payment bills
        if (!billData.parent_bill_id && billData.bill_type !== 'one_time' && billData.frequency) {
          const paymentBillsData = await getPaymentBillsForContainer(billData.id);
          // Calculate status for each payment bill
          const billsWithStatus = paymentBillsData.map(bill => ({
            ...bill,
            status: calculateBillStatus(bill),
          }));
          setPaymentBills(billsWithStatus);
        } else {
          setPaymentBills([]);
        }
      }
    } catch (error) {
      console.error('Failed to load bill details', error);
      Alert.alert('Error', 'Could not load bill details.');
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

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Uncategorized';
  };

  const getAccountName = (accountId?: string) => {
    if (!accountId) return null;
    const account = accounts.find(a => a.id === accountId);
    return account?.name || null;
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

  const handlePayBill = (billToPay?: Bill) => {
    if (billToPay) {
      setSelectedBill(billToPay);
      setShowPayBillModal(true);
    } else if (bill && !bill.parent_bill_id) {
      // For container bills, show first unpaid payment bill
      const firstUnpaid = paymentBills.find(b => b.status !== 'paid' && b.status !== 'cancelled');
      if (firstUnpaid) {
        setSelectedBill(firstUnpaid);
        setShowPayBillModal(true);
      }
    } else if (bill) {
      // For payment bills, pay this bill
      setSelectedBill(bill as Bill);
      setShowPayBillModal(true);
    }
  };

  // const handleCreateNextPaymentBill = async () => {
  //   if (!bill || !user || bill.parent_bill_id) return; // Only for container bills

  //   try {
  //     // Calculate next due date based on frequency
  //     const lastPaymentBill = paymentBills
  //       .filter(b => b.due_date)
  //       .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())[0];

  //     let nextDueDate: Date;
  //     if (lastPaymentBill) {
  //       nextDueDate = new Date(lastPaymentBill.due_date);
  //     } else if (bill.due_date) {
  //       nextDueDate = new Date(bill.due_date);
  //     } else {
  //       nextDueDate = new Date();
  //     }

  //     // Calculate next date based on frequency
  //     const frequency = bill.frequency || 'monthly';
  //     const interval = bill.recurrence_interval || 1;

  //     switch (frequency) {
  //       case 'daily':
  //         nextDueDate.setDate(nextDueDate.getDate() + interval);
  //         break;
  //       case 'weekly':
  //         nextDueDate.setDate(nextDueDate.getDate() + (7 * interval));
  //         break;
  //       case 'biweekly':
  //         nextDueDate.setDate(nextDueDate.getDate() + 14);
  //         break;
  //       case 'monthly':
  //         nextDueDate.setMonth(nextDueDate.getMonth() + interval);
  //         break;
  //       case 'bimonthly':
  //         nextDueDate.setMonth(nextDueDate.getMonth() + 2);
  //         break;
  //       case 'quarterly':
  //         nextDueDate.setMonth(nextDueDate.getMonth() + 3);
  //         break;
  //       case 'halfyearly':
  //         nextDueDate.setMonth(nextDueDate.getMonth() + 6);
  //         break;
  //       case 'yearly':
  //         nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
  //         break;
  //       default:
  //         nextDueDate.setMonth(nextDueDate.getMonth() + interval);
  //     }

  //     await generatePaymentBillFromContainer(
  //       bill.id,
  //       nextDueDate.toISOString().split('T')[0]
  //     );

  //     await loadBill();
  //     globalRefresh();
  //     Alert.alert('Success', 'Payment bill created successfully');
  //   } catch (error: any) {
  //     console.error('Error creating payment bill:', error);
  //     Alert.alert('Error', error.message || 'Failed to create payment bill');
  //   }
  // };

  const handleMenuPress = () => {
    if (!bill) return;
    
    Alert.alert(
      bill.title,
      'Choose an action',
      [
        {
          text: 'Edit Bill',
          onPress: () => {
            // Navigate to edit or show edit modal
            router.push(`/modals/add-bill?edit=${bill.id}` as any);
          },
        },
        {
          text: 'Delete Bill',
          style: 'destructive',
          onPress: async () => {
            if (!bill || !user) return;
            Alert.alert(
              'Delete bill?',
              'This action cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await supabase
                        .from('bills')
                        .update({
                          is_deleted: true,
                          deleted_at: new Date().toISOString(),
                          is_active: false,
                        })
                        .eq('id', bill.id);
                      router.back();
                    } catch (error) {
                      console.error('Failed to delete bill', error);
                      Alert.alert('Error', 'Could not delete bill.');
                    }
                  },
                },
              ]
            );
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  // Calculate totals
  const totalPaid = useMemo(() => {
    return paymentHistory.reduce((sum, payment) => sum + payment.amount, 0);
  }, [paymentHistory]);

  const upcomingBills = useMemo(() => {
    return paymentBills.filter(b => b.status !== 'paid' && b.status !== 'cancelled');
  }, [paymentBills]);

  const paidBills = useMemo(() => {
    return paymentBills.filter(b => b.status === 'paid');
  }, [paymentBills]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.loadingText}>Loading bill details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!bill) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="rgba(0, 0, 0, 0.3)" />
          <Text style={styles.emptyTitle}>Bill not found</Text>
          <Text style={styles.emptyMessage}>
            This bill may have been deleted or is no longer accessible.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isContainerBill = !bill.parent_bill_id && bill.bill_type !== 'one_time';

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
              {bill.title}
            </Text>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleMenuPress}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color="#000000" />
            </TouchableOpacity>
          </View>

          {/* Hero Section - Current Amount */}
          <GlassCard padding={24} marginVertical={20}>
            <Text style={styles.heroLabel}>Amount Due</Text>
            <Text style={styles.heroAmount}>
              {bill.amount ? formatCurrency(bill.amount) : 'Variable'}
            </Text>
            <View style={styles.statusSection}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(bill.status) + '20' }]}>
                <Ionicons 
                  name={getStatusIcon(bill.status)} 
                  size={16} 
                  color={getStatusColor(bill.status)} 
                />
                <Text style={[styles.statusText, { color: getStatusColor(bill.status) }]}>
                  {bill.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Key Metrics */}
          <View style={styles.metricsGrid}>
            <GlassCard padding={20}>
              <Text style={styles.metricLabel}>Due Date</Text>
              <Text style={styles.metricValue}>
                {formatDate(bill.due_date)}
              </Text>
            </GlassCard>
            {bill.next_due_date && (
              <GlassCard padding={20}>
                <Text style={styles.metricLabel}>Next Payment</Text>
                <Text style={styles.metricValue}>
                  {formatDate(bill.next_due_date)}
                </Text>
              </GlassCard>
            )}
            {isContainerBill && (
              <GlassCard padding={20}>
                <Text style={styles.metricLabel}>Frequency</Text>
                <Text style={styles.metricValue}>
                  {bill.frequency ? bill.frequency.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : '—'}
                </Text>
              </GlassCard>
            )}
            {totalPaid > 0 && (
              <GlassCard padding={20}>
                <Text style={styles.metricLabel}>Total Paid</Text>
                <Text style={styles.metricValue}>{formatCurrency(totalPaid)}</Text>
              </GlassCard>
            )}
          </View>

          {/* Payment History */}
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
              {paymentHistory.length === 0 ? (
                <Text style={styles.emptyText}>No payments recorded yet.</Text>
              ) : (
                <View style={styles.paymentList}>
                  {paymentHistory.slice(0, 5).map((payment) => (
                    <View key={payment.id} style={styles.paymentItem}>
                      <View style={styles.paymentIcon}>
                        <Ionicons name="checkmark-circle" size={20} color="rgba(0, 0, 0, 0.6)" />
                      </View>
                      <View style={styles.paymentInfo}>
                        <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                        <Text style={styles.paymentDate}>{formatDate(payment.payment_date)}</Text>
                        {payment.account_id && (
                          <Text style={styles.paymentAccount}>
                            Account: {getAccountName(payment.account_id)}
                          </Text>
                        )}
                        {payment.description && (
                          <Text style={styles.paymentDescription}>{payment.description}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </GlassCard>
          )}

          {/* Payment Bills Section (for container bills) */}
          {isContainerBill && (
            <GlassCard padding={24} marginVertical={12}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Payment Schedule</Text>
                <TouchableOpacity 
                  style={styles.createBillButton}
                  onPress={() => setShowScheduleModal(true)}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#10B981" />
                  <Text style={styles.createBillButtonText}>Create Bill</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.sectionSubtitle}>
                {upcomingBills.length > 0 
                  ? `${upcomingBills.length} upcoming payment${upcomingBills.length > 1 ? 's' : ''}`
                  : paymentBills.length === 0
                  ? 'No bills yet. Create your first bill to start tracking payments.'
                  : 'No upcoming payments'
                }
              </Text>
              
              {/* Bills List */}
              <View style={styles.billsList}>
                {paymentBills.length === 0 ? (
                  <View style={styles.emptyBills}>
                    <Ionicons name="receipt-outline" size={48} color="rgba(0, 0, 0, 0.3)" />
                    <Text style={styles.emptyBillsText}>No bills created yet</Text>
                    <Text style={styles.emptyBillsSubtext}>Create your first bill to start tracking payments</Text>
                    <TouchableOpacity 
                      style={styles.createFirstBillButton}
                      onPress={() => setShowScheduleModal(true)}
                    >
                      <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.createFirstBillButtonText}>Create First Bill</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* Show paid bills count if any */}
                    {paidBills.length > 0 && (
                      <View style={styles.paidBillsSummary}>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={styles.paidBillsText}>
                          {paidBills.length} paid
                        </Text>
                      </View>
                    )}
                    
                    {paymentBills
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
                      .filter((paymentBill) => paymentBill.status !== 'paid' && paymentBill.status !== 'cancelled')
                      .slice(0, 10)
                      .map((paymentBill) => {
                        const statusColor = getStatusColor(paymentBill.status);
                        const statusIcon = getStatusIcon(paymentBill.status);
                        const isOverdue = paymentBill.status === 'overdue';
                        const isDueToday = paymentBill.status === 'due_today';
                        
                        return (
                          <TouchableOpacity
                            key={paymentBill.id}
                            style={[
                              styles.billCard,
                              isOverdue && styles.billCardOverdue,
                              isDueToday && styles.billCardDueToday,
                            ]}
                            onPress={() => handlePayBill(paymentBill)}
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
                                {paymentBill.payment_number && (
                                  <Text style={styles.billPaymentNumber}>Payment #{paymentBill.payment_number}</Text>
                                )}
                                <Text style={styles.billDate}>
                                  {formatDate(paymentBill.due_date)}
                                  {isOverdue && <Text style={styles.overdueText}> • Overdue</Text>}
                                  {isDueToday && <Text style={styles.dueTodayText}> • Due Today</Text>}
                                </Text>
                                {paymentBill.description && (
                                  <Text style={styles.billDescription}>{paymentBill.description}</Text>
                                )}
                              </View>
                            </View>
                            <View style={styles.billCardRight}>
                              <Text style={styles.billAmount}>
                                {paymentBill.amount ? formatCurrency(paymentBill.amount) : 'Variable'}
                              </Text>
                              <TouchableOpacity 
                                style={[styles.payButton, isOverdue && styles.payButtonOverdue]} 
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handlePayBill(paymentBill);
                                }}
                              >
                                <Text style={[styles.payButtonText, isOverdue && styles.payButtonTextOverdue]}>Pay</Text>
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                
                    {/* Show "All Paid" message if all are paid but bills exist */}
                    {upcomingBills.length === 0 && paymentBills.length > 0 && (
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
              {upcomingBills.length > 10 && (
                <TouchableOpacity 
                  style={styles.viewAllButton} 
                  onPress={() => {
                    // Could expand to show all or navigate to full list
                  }}
                >
                  <Text style={styles.viewAllButtonText}>View All Bills</Text>
                  <Ionicons name="chevron-forward" size={20} color="#000000" />
                </TouchableOpacity>
              )}
            </GlassCard>
          )}

          {/* Bill Information */}
          <GlassCard padding={24} marginVertical={12}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Bill Information</Text>
            </View>
            <View style={styles.infoList}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Category</Text>
                <Text style={styles.infoValue}>{getCategoryName(bill.category_id)}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Type</Text>
                <Text style={styles.infoValue}>
                  {bill.bill_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
              </View>
              {bill.frequency && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Frequency</Text>
                  <Text style={styles.infoValue}>
                    Every {bill.recurrence_interval || 1} {bill.frequency.replace('_', ' ')}
                  </Text>
                </View>
              )}
              {bill.linked_account_id && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Linked Account</Text>
                  <Text style={styles.infoValue}>{getAccountName(bill.linked_account_id)}</Text>
                </View>
              )}
              {bill.description && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Description</Text>
                  <Text style={styles.infoValue}>{bill.description}</Text>
                </View>
              )}
            </View>
          </GlassCard>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Action Bar */}
        {(!isContainerBill || upcomingBills.length > 0) && (
          <View style={styles.bottomBar}>
            {isContainerBill ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  const firstUnpaid = upcomingBills[0];
                  if (firstUnpaid) {
                    handlePayBill(firstUnpaid);
                  }
                }}
              >
                <Text style={styles.primaryButtonText}>
                  {upcomingBills.length > 0 ? 'Pay Next Bill' : 'All Paid'}
                </Text>
              </TouchableOpacity>
            ) : (
              bill.status !== 'paid' && bill.status !== 'cancelled' && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => handlePayBill()}
                >
                  <Text style={styles.primaryButtonText}>Pay Bill</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}

        {/* Pay Bill Modal */}
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
            loadBill();
            globalRefresh();
          }}
        />

        {/* Schedule Payment Bills Modal */}
        {bill && (
          <BillBulkGenerator
            visible={showScheduleModal}
            template={bill as Bill}
            onClose={() => setShowScheduleModal(false)}
            onSuccess={() => {
              setShowScheduleModal(false);
              loadBill();
              globalRefresh();
            }}
          />
        )}
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
  statusSection: {
    marginTop: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
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
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 12,
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
  paymentAccount: {
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
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
    paddingVertical: 24,
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
  billPaymentNumber: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 4,
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
  billDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
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
  emptyBillsSubtext: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.4)',
    marginTop: 4,
    textAlign: 'center',
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
  infoList: {
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  infoValue: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    flex: 1,
    textAlign: 'right',
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
});

export default BillDetailScreen;
