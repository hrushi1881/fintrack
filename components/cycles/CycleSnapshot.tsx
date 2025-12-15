import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { Cycle, CycleBill, getCycleStatusMessage, getCycleRules, getCycleRulesSimple, DEFAULT_LIABILITY_TOLERANCE_DAYS } from '@/utils/cycles';
import { Transaction } from '@/types';

type PaymentStatus = 
  | 'on_time' 
  | 'paid_on_time' 
  | 'paid_early' 
  | 'paid_within_window' 
  | 'paid_late' 
  | 'late' 
  | 'early' 
  | 'within_window'
  | 'partial' 
  | 'over' 
  | 'under' 
  | 'paid' 
  | string;

interface PaymentCard {
  id: string;
  amount: number;
  date: string;
  status?: PaymentStatus;
  cycleNumber?: number;
  label?: string;
}

interface CycleSnapshotProps {
  cycle: Cycle;
  bills?: CycleBill[];
  payments?: PaymentCard[];
  onViewSchedule?: () => void;
  onGenerateBill?: () => void;
  onPayBill?: (bill: CycleBill) => void;
  onSeeAllPayments?: () => void;
  onEditRules?: () => void; // Edit cycle rules (target, minimum, date)
  rules?: string[];
  transactionType?: 'income' | 'expense'; // For recurring transactions - affects labels
}

const palette = {
  deep: '#0E1A0F',
  deep2: '#1E2C16',
  heroText: '#E6F2D8',
  accent: '#A3D411',
  accentDark: '#4F6F3E',
  textPrimary: '#0E401C',
  textSecondary: '#637050',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F9F2',
  border: '#E5ECD6',
  warning: '#E9A23B',
  danger: '#D14343',
};

const statusChip = (status?: PaymentStatus) => {
  const key = (status || '').toLowerCase();
  // Late - outside tolerance window
  if (key.includes('paid_late') || (key.includes('late') && !key.includes('within'))) {
    return { label: 'Late', bg: '#FEF3E7', fg: palette.warning };
  }
  // Within window - paid after due but acceptable
  if (key.includes('within_window') || key.includes('within window')) {
    return { label: 'Paid', bg: '#EEF2FF', fg: '#6366F1' }; // Indigo
  }
  // Early - before due date
  if (key.includes('early')) {
    return { label: 'Paid', bg: '#DCFCE7', fg: '#059669' }; // Emerald
  }
  // Partial or under
  if (key.includes('partial') || key.includes('under')) {
    return { label: 'Paid less', bg: '#FFF3E7', fg: palette.warning };
  }
  // Over
  if (key.includes('over')) {
    return { label: 'Paid more', bg: '#F3E8FF', fg: '#8B5CF6' }; // Purple
  }
  // Default - on time
  return { label: 'Paid', bg: '#E9F6E4', fg: palette.accentDark };
};

const billStatus = (status?: string) => {
  const key = (status || '').toLowerCase();
  if (key === 'overdue') return { label: 'OVERDUE', bg: '#FFF1F0', fg: palette.danger };
  if (key === 'due_today') return { label: 'DUE TODAY', bg: '#FEF3E7', fg: palette.warning };
  if (key === 'paid') return { label: 'PAID', bg: '#E9F6E4', fg: palette.accentDark };
  return { label: 'UNPAID', bg: '#E9F6E4', fg: palette.accentDark };
};

const formatDateShort = (dateString?: string) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDateRange = (start?: string, end?: string) => {
  if (!start || !end) return '';
  return `${formatDateShort(start)} - ${formatDateShort(end)}`;
};

function derivePayments(cycle: Cycle, currency: string): PaymentCard[] {
  if (!cycle?.transactions) return [];
  const sorted = [...cycle.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return sorted.slice(0, 5).map((tx: Transaction) => {
    // Derive status from payment timing and cycle status metadata
    const paymentTiming = tx.metadata?.payment_timing;
    const cycleStatus = tx.metadata?.cycle_status;
    const isWithinWindow = tx.metadata?.is_within_window;
    
    let status: PaymentStatus = 'paid';
    if (cycleStatus) {
      status = cycleStatus as PaymentStatus;
    } else if (paymentTiming) {
      if (paymentTiming === 'within_window') {
        status = 'paid_within_window';
      } else if (paymentTiming === 'early') {
        status = 'paid_early';
      } else if (paymentTiming === 'late') {
        status = 'paid_late';
      } else {
        status = 'paid_on_time';
      }
    } else if (tx.metadata?.payment_status) {
      status = tx.metadata.payment_status;
    }
    
    return {
    id: tx.id,
    amount: tx.amount,
    date: tx.date,
      status,
    cycleNumber: tx.metadata?.cycle_number,
      label: isWithinWindow === false ? 'Outside window' : undefined,
    };
  });
}

export default function CycleSnapshot({
  cycle,
  bills: billsProp,
  payments,
  onViewSchedule,
  onGenerateBill,
  onPayBill,
  onSeeAllPayments,
  onEditRules,
  rules: rulesProp,
  transactionType = 'expense', // Default to expense for backward compatibility
}: CycleSnapshotProps) {
  const isIncome = transactionType === 'income';
  const [showDetails, setShowDetails] = useState(false);
  const { currency } = useSettings();
  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

  const bills = useMemo(() => billsProp || cycle.bills || [], [billsProp, cycle.bills]);
  const openBills = bills.filter((b) => (b.status || '').toLowerCase() !== 'paid' && (b.status || '').toLowerCase() !== 'cancelled');
  const sortedBills = [...bills].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const nextBill = sortedBills.find((b) => (b.status || '').toLowerCase() !== 'paid');

  const paymentCards = payments && payments.length > 0 ? payments : derivePayments(cycle, currency);
  const totalPaid = paymentCards.reduce((sum, p) => sum + (p.amount || 0), 0);

  const progress = cycle.expectedAmount > 0 ? Math.min(1, Math.max(0, (cycle.actualAmount || 0) / cycle.expectedAmount)) : 0;
  
  // Use enhanced status message
  const statusInfo = useMemo(() => getCycleStatusMessage(cycle), [cycle]);
  const status = cycle.statusLabel || statusInfo.title;
  
  // Get cycle rules (use provided rules or generate from cycle)
  const cycleRulesDetailed = useMemo(() => {
    return getCycleRules(cycle, { tolerance: DEFAULT_LIABILITY_TOLERANCE_DAYS });
  }, [cycle]);
  
  // Simple string rules for backward compatibility
  const cycleRules = useMemo(() => {
    if (rulesProp && rulesProp.length > 0) return rulesProp;
    return getCycleRulesSimple(cycle, { tolerance: DEFAULT_LIABILITY_TOLERANCE_DAYS });
  }, [cycle, rulesProp]);
  
  // Calculate days until due
  const daysUntilDue = useMemo(() => {
    const expectedDate = new Date(cycle.expectedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expectedDate.setHours(0, 0, 0, 0);
    return Math.ceil((expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, [cycle.expectedDate]);
  
  // Determine if cycle needs attention
  const needsAttention = useMemo(() => {
    if (cycle.status === 'not_paid') return true;
    if (cycle.status === 'upcoming' && daysUntilDue <= 3 && daysUntilDue >= 0) return true;
    if (cycle.status === 'partial' || cycle.status === 'underpaid') return true;
    return false;
  }, [cycle.status, daysUntilDue]);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => setShowDetails(true)}>
        <LinearGradient
          colors={needsAttention ? ['#7C2D12', '#451A03'] : [palette.deep, palette.deep2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroTitle}>Cycle {cycle.cycleNumber ?? ''}</Text>
              <Text style={styles.heroSub}>{formatDateRange(cycle.startDate, cycle.endDate)}</Text>
            </View>
            <View style={[styles.statusPill, needsAttention && styles.statusPillWarning]}>
              <Ionicons 
                name={statusInfo.icon as any} 
                size={12} 
                color={needsAttention ? '#FCD34D' : palette.heroText} 
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.statusPillText, needsAttention && { color: '#FCD34D' }]}>
                {status.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Status subtitle */}
          <View style={styles.statusSubtitleRow}>
            <Ionicons name={statusInfo.icon as any} size={14} color={statusInfo.color} />
            <Text style={[styles.statusSubtitleText, { color: statusInfo.color }]}>
              {statusInfo.subtitle}
            </Text>
          </View>

          <View style={styles.targetsRow}>
            <View>
              <Text style={styles.labelMuted}>{isIncome ? 'Expected' : 'Target'}</Text>
              <Text style={styles.valueLight}>{formatCurrency(cycle.expectedAmount)}</Text>
              {cycle.minimumAmount && cycle.minimumAmount > 0 && (
                <Text style={styles.minimumLabel}>Min: {formatCurrency(cycle.minimumAmount)}</Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.labelAccent}>{isIncome ? 'Received' : 'Paid So Far'}</Text>
              <Text style={styles.valueAccent}>{formatCurrency(cycle.actualAmount || 0)}</Text>
              {cycle.paymentCount && cycle.paymentCount > 0 && (
                <Text style={styles.paymentCountLabel}>
                  {cycle.paymentCount} payment{cycle.paymentCount > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          </View>
          
          {/* Edit Rules Button */}
          {onEditRules && (
            <TouchableOpacity 
              style={styles.editRulesButton} 
              onPress={onEditRules}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={14} color={palette.textSecondary} />
              <Text style={styles.editRulesText}>Edit rules</Text>
            </TouchableOpacity>
          )}

          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${Math.min(progress * 100, 100)}%` },
                progress > 1 && styles.progressFillOver
              ]} 
            />
          </View>
          
          {/* Progress percentage text */}
          <Text style={styles.progressText}>
            {Math.round(progress * 100)}% {progress >= 1 ? '✓' : 'complete'}
            {cycle.amountShort && cycle.amountShort > 0 && ` • ${formatCurrency(cycle.amountShort)} remaining`}
          </Text>

          <TouchableOpacity style={styles.heroButton} onPress={onViewSchedule} activeOpacity={0.85}>
            <Text style={styles.heroButtonText}>
              {nextBill ? `Pay Next Bill (${formatCurrency(nextBill.totalAmount ?? nextBill.amount)})` : 'Make Payment'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={palette.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowDetails(true)} activeOpacity={0.85}>
            <Text style={styles.secondaryButtonText}>Cycle Details & Rules</Text>
            <Ionicons name="information-circle" size={15} color={palette.heroText} />
          </TouchableOpacity>
        </LinearGradient>
      </TouchableOpacity>

      {/* Bills */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Bills</Text>
          <TouchableOpacity onPress={onGenerateBill} style={styles.generateButton} activeOpacity={0.8}>
            <Ionicons name="add-circle" size={16} color={palette.accentDark} />
            <Text style={styles.generateText}>Generate</Text>
          </TouchableOpacity>
        </View>

        {nextBill && (
          <TouchableOpacity
            style={[styles.primaryBill, { borderColor: palette.border }]}
            onPress={() => onPayBill?.(nextBill)}
            activeOpacity={0.9}
          >
            <View style={styles.primaryBillLeft}>
              <View style={styles.billIcon}>
                <Ionicons name="receipt-outline" size={18} color={palette.accentDark} />
              </View>
              <View>
                <Text style={styles.billTitle}>{nextBill.title || 'Upcoming Bill'}</Text>
                <Text style={styles.billSub}>Due {formatDateShort(nextBill.dueDate) || 'Soon'}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.billAmount}>{formatCurrency(nextBill.totalAmount ?? nextBill.amount)}</Text>
              <View style={[styles.billChip, { backgroundColor: billStatus(nextBill.status).bg }]}>
                <Text style={[styles.billChipText, { color: billStatus(nextBill.status).fg }]}>
                  {billStatus(nextBill.status).label}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {sortedBills.length > 0 && (
          <View style={styles.billList}>
            {sortedBills.slice(0, 3).map((bill) => (
              <TouchableOpacity
                key={bill.id}
                style={styles.billRow}
                onPress={() => onPayBill?.(bill)}
                activeOpacity={0.8}
              >
                <View>
                  <Text style={styles.billRowTitle}>{bill.title || 'Bill'}</Text>
                  <Text style={styles.billRowMeta}>Due {formatDateShort(bill.dueDate)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text
                    style={[
                      styles.billRowAmount,
                      bill.status?.toLowerCase() === 'paid' ? styles.billRowAmountPaid : undefined,
                    ]}
                  >
                    {formatCurrency(bill.totalAmount ?? bill.amount)}
                  </Text>
                  <View style={[styles.billChip, { backgroundColor: billStatus(bill.status).bg }]}>
                    <Text style={[styles.billChipText, { color: billStatus(bill.status).fg }]}>
                      {billStatus(bill.status).label}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {sortedBills.length > 3 && (
              <Text style={styles.billSummary}>
                {sortedBills.length - 3} more bill{sortedBills.length - 3 === 1 ? '' : 's'}
              </Text>
            )}

            {bills.length === 0 && (
              <Text style={styles.emptyMuted}>No bills yet. Generate to schedule payments.</Text>
            )}
          </View>
        )}
      </View>

      {/* Recent Payments */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Payments</Text>
          <TouchableOpacity onPress={onSeeAllPayments} activeOpacity={0.8}>
            <Text style={styles.link}>See all</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paymentScroller}>
          {paymentCards.length === 0 && <Text style={styles.emptyMuted}>No payments yet.</Text>}
          {paymentCards.map((p) => {
            const chip = statusChip(p.status);
            return (
              <View key={p.id} style={styles.paymentCard}>
                <Text style={styles.paymentDate}>{formatDateShort(p.date)}</Text>
                <Text style={styles.paymentAmount}>{formatCurrency(p.amount)}</Text>
                <View style={[styles.billChip, { backgroundColor: chip.bg }]}>
                  <Text style={[styles.billChipText, { color: chip.fg }]}>{chip.label}</Text>
                </View>
                {p.cycleNumber ? <Text style={styles.paymentMeta}>Cycle {p.cycleNumber}</Text> : null}
              </View>
            );
          })}
        </ScrollView>

        <Text style={styles.paidSummary}>
          {isIncome ? 'Income' : 'Paid'} Summary: {formatCurrency(totalPaid)} (YTD)
        </Text>
      </View>

      {/* Details Modal */}
      <Modal visible={showDetails} animationType="slide" transparent onRequestClose={() => setShowDetails(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cycle Details</Text>
              <TouchableOpacity onPress={() => setShowDetails(false)} style={styles.closeButton} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.modalPrimaryAction}
                  onPress={() => {
                    setShowDetails(false);
                    onViewSchedule?.();
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle" size={18} color={palette.textPrimary} />
                  <Text style={styles.modalPrimaryActionText}>Add Payment / Save Bill</Text>
                </TouchableOpacity>
                {nextBill && (
                  <TouchableOpacity
                    style={styles.modalSecondaryAction}
                    onPress={() => {
                      setShowDetails(false);
                      onPayBill?.(nextBill);
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="card-outline" size={18} color={palette.accentDark} />
                    <Text style={styles.modalSecondaryActionText}>Pay Next</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Cycle Rules & Configuration</Text>
                
                {/* Key metrics */}
                <View style={styles.rulesMetricsRow}>
                  <View style={styles.rulesMetricItem}>
                    <Text style={styles.rulesMetricLabel}>Target Amount</Text>
                    <Text style={styles.rulesMetricValue}>{formatCurrency(cycle.expectedAmount)}</Text>
                  </View>
                  {cycle.minimumAmount && cycle.minimumAmount > 0 && (
                    <View style={styles.rulesMetricItem}>
                      <Text style={styles.rulesMetricLabel}>Minimum Required</Text>
                      <Text style={styles.rulesMetricValue}>{formatCurrency(cycle.minimumAmount)}</Text>
                    </View>
                  )}
                </View>
                
                {/* Date window */}
                <View style={styles.rulesDateWindow}>
                  <Ionicons name="calendar-outline" size={16} color={palette.accentDark} />
                  <Text style={styles.rulesDateText}>
                    Due: {formatDateShort(cycle.expectedDate)} • Window: {formatDateShort(cycle.startDate)} - {formatDateShort(cycle.endDate)}
                    </Text>
                  </View>
                
                {/* Rules chips with window explanation */}
                <View style={styles.chipGroup}>
                  {cycleRulesDetailed && cycleRulesDetailed.length > 0 && cycleRulesDetailed.slice(0, 6).map((rule, idx) => (
                    rule && rule.text ? (
                      <View 
                        style={[
                          styles.chip, 
                          rule.type === 'success' && styles.chipSuccess,
                          rule.type === 'warning' && styles.chipWarning,
                        ]} 
                        key={`rule-${idx}`}
                      >
                        <Ionicons 
                          name={(rule.icon || 'information-circle') as any} 
                          size={12} 
                          color={
                            rule.type === 'success' ? '#059669' : 
                            rule.type === 'warning' ? '#F59E0B' : 
                            palette.textSecondary
                          } 
                        />
                        <Text style={[
                          styles.chipText,
                          rule.type === 'success' && { color: '#059669' },
                          rule.type === 'warning' && { color: '#F59E0B' },
                        ]}>
                          {rule.text}
                        </Text>
                    </View>
                    ) : null
                  ))}
                </View>
                
                {/* Window status indicator */}
                {typeof cycle.isWithinWindow === 'boolean' && (
                  <View style={[styles.windowIndicator, cycle.isWithinWindow ? styles.windowIndicatorSuccess : styles.windowIndicatorWarning]}>
                    <Ionicons 
                      name={cycle.isWithinWindow ? 'checkmark-circle' : 'alert-circle'} 
                      size={14} 
                      color={cycle.isWithinWindow ? '#059669' : '#F59E0B'} 
                    />
                    <Text style={[styles.windowIndicatorText, { color: cycle.isWithinWindow ? '#059669' : '#F59E0B' }]}>
                      {cycle.isWithinWindow 
                        ? `Payment within ±${DEFAULT_LIABILITY_TOLERANCE_DAYS} day window ✓` 
                        : `Payment outside ${DEFAULT_LIABILITY_TOLERANCE_DAYS} day window`}
                    </Text>
                  </View>
                )}
                
                {/* Interest breakdown if available */}
                {cycle.expectedInterest !== undefined && cycle.expectedPrincipal !== undefined && (
                  <View style={styles.interestBreakdownSection}>
                    <Text style={styles.interestBreakdownTitle}>Payment Breakdown</Text>
                    <View style={styles.interestBreakdownRow}>
                      <Text style={styles.interestBreakdownLabel}>Principal</Text>
                      <Text style={styles.interestBreakdownValue}>
                        {formatCurrency(cycle.actualPrincipal ?? cycle.expectedPrincipal)}
                        {cycle.actualPrincipal !== undefined && cycle.actualPrincipal !== cycle.expectedPrincipal && (
                          <Text style={styles.interestExpectedHint}> (exp: {formatCurrency(cycle.expectedPrincipal)})</Text>
                        )}
                      </Text>
                    </View>
                    <View style={styles.interestBreakdownRow}>
                      <Text style={styles.interestBreakdownLabel}>Interest</Text>
                      <Text style={[styles.interestBreakdownValue, { color: palette.warning }]}>
                        {formatCurrency(cycle.actualInterest ?? cycle.expectedInterest)}
                        {cycle.actualInterest !== undefined && cycle.actualInterest !== cycle.expectedInterest && (
                          <Text style={styles.interestExpectedHint}> (exp: {formatCurrency(cycle.expectedInterest)})</Text>
                        )}
                      </Text>
                    </View>
                    {cycle.remainingBalance !== undefined && (
                      <View style={styles.interestBreakdownRow}>
                        <Text style={styles.interestBreakdownLabel}>Balance After</Text>
                        <Text style={styles.interestBreakdownValue}>{formatCurrency(cycle.remainingBalance)}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Scheduled Payments</Text>
                {bills.length === 0 && <Text style={styles.emptyMuted}>No scheduled payments.</Text>}
                {bills.map((bill) => (
                  <TouchableOpacity
                    key={bill.id}
                    style={[styles.modalRow, { paddingVertical: 10 }]}
                    onPress={() => {
                      setShowDetails(false);
                      onPayBill?.(bill);
                    }}
                    activeOpacity={0.8}
                  >
                    <View>
                      <Text style={styles.billRowTitle}>{bill.title || 'Bill'}</Text>
                      <Text style={styles.billRowMeta}>Due {formatDateShort(bill.dueDate)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.billRowAmount}>{formatCurrency(bill.totalAmount ?? bill.amount)}</Text>
                      <View style={[styles.billChip, { backgroundColor: billStatus(bill.status).bg }]}>
                        <Text style={[styles.billChipText, { color: billStatus(bill.status).fg }]}>
                          {billStatus(bill.status).label}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Transactions Done</Text>
                {paymentCards.length === 0 && <Text style={styles.emptyMuted}>No payments yet.</Text>}
                {paymentCards.map((p) => (
                  <View key={p.id} style={styles.modalRow}>
                    <View>
                      <Text style={styles.billRowTitle}>{formatCurrency(p.amount)}</Text>
                      <Text style={styles.billRowMeta}>{formatDateShort(p.date)}</Text>
                    </View>
                    <View style={[styles.billChip, { backgroundColor: statusChip(p.status).bg }]}>
                      <Text style={[styles.billChipText, { color: statusChip(p.status).fg }]}>
                        {statusChip(p.status).label}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 16,
  },
  heroCard: {
    borderRadius: 16,
    padding: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 16,
    color: palette.heroText,
    fontFamily: 'Poppins-SemiBold',
  },
  heroSub: {
    fontSize: 13,
    color: '#D1DFC5',
    fontFamily: 'InstrumentSerif-Regular',
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(227, 241, 208, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(227, 241, 208, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusPillWarning: {
    backgroundColor: 'rgba(252, 211, 77, 0.15)',
    borderColor: 'rgba(252, 211, 77, 0.4)',
  },
  statusPillText: {
    fontSize: 11,
    color: palette.heroText,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.6,
  },
  statusSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  statusSubtitleText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
  },
  targetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  minimumLabel: {
    fontSize: 11,
    color: '#C5D2BF',
    fontFamily: 'InstrumentSerif-Regular',
    marginTop: 2,
  },
  paymentCountLabel: {
    fontSize: 11,
    color: palette.accent,
    fontFamily: 'InstrumentSerif-Regular',
    marginTop: 2,
  },
  editRulesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  editRulesText: {
    fontSize: 11,
    color: palette.textSecondary,
    fontFamily: 'InstrumentSerif-Regular',
  },
  progressText: {
    fontSize: 11,
    color: '#C5D2BF',
    fontFamily: 'InstrumentSerif-Regular',
    marginBottom: 12,
    textAlign: 'center',
  },
  progressFillOver: {
    backgroundColor: '#8B5CF6',
  },
  labelMuted: {
    fontSize: 11,
    color: '#C5D2BF',
    letterSpacing: 0.4,
    fontFamily: 'Poppins-SemiBold',
    textTransform: 'uppercase',
  },
  labelAccent: {
    fontSize: 11,
    color: palette.accent,
    fontFamily: 'Poppins-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  valueLight: {
    fontSize: 18,
    color: palette.heroText,
    fontFamily: 'Poppins-SemiBold',
  },
  valueAccent: {
    fontSize: 20,
    color: palette.accent,
    fontFamily: 'Poppins-Bold',
  },
  progressBar: {
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.accent,
    borderRadius: 8,
  },
  heroButton: {
    backgroundColor: '#F9FBEF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroButtonText: {
    fontSize: 13,
    color: palette.textPrimary,
    fontFamily: 'Poppins-SemiBold',
  },
  secondaryButton: {
    marginTop: 8,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryButtonText: {
    fontSize: 12,
    color: palette.heroText,
    fontFamily: 'Poppins-SemiBold',
  },
  section: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 15,
    color: palette.textPrimary,
    fontFamily: 'Poppins-SemiBold',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: palette.surfaceMuted,
  },
  generateText: {
    fontSize: 12,
    color: palette.accentDark,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.3,
  },
  primaryBill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
  },
  primaryBillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  billIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  billTitle: {
    fontSize: 14,
    color: palette.textPrimary,
    fontFamily: 'Poppins-SemiBold',
  },
  billSub: {
    fontSize: 12,
    color: palette.textSecondary,
    fontFamily: 'InstrumentSerif-Regular',
  },
  billAmount: {
    fontSize: 16,
    color: palette.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  billChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  billChipText: {
    fontSize: 11,
    fontFamily: 'Poppins-Bold',
  },
  billList: {
    gap: 10,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  billRowTitle: {
    fontSize: 13,
    color: palette.textPrimary,
    fontFamily: 'Poppins-SemiBold',
  },
  billRowMeta: {
    fontSize: 12,
    color: palette.textSecondary,
    fontFamily: 'InstrumentSerif-Regular',
  },
  billRowAmount: {
    fontSize: 14,
    color: palette.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  billRowAmountPaid: {
    textDecorationLine: 'line-through',
    color: palette.textSecondary,
  },
  billSummary: {
    fontSize: 12,
    color: palette.textSecondary,
    fontFamily: 'InstrumentSerif-Regular',
  },
  emptyMuted: {
    fontSize: 12,
    color: palette.textSecondary,
    fontFamily: 'InstrumentSerif-Regular',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  link: {
    fontSize: 12,
    color: palette.accentDark,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.3,
  },
  paymentScroller: {
    gap: 10,
    paddingVertical: 4,
  },
  paymentCard: {
    width: 120,
    padding: 10,
    backgroundColor: palette.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 6,
  },
  paymentDate: {
    fontSize: 11,
    color: palette.textSecondary,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.3,
  },
  paymentAmount: {
    fontSize: 16,
    color: palette.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  paymentMeta: {
    fontSize: 11,
    color: palette.textSecondary,
    fontFamily: 'InstrumentSerif-Regular',
  },
  paidSummary: {
    marginTop: 8,
    fontSize: 12,
    color: palette.textSecondary,
    fontFamily: 'Poppins-SemiBold',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    color: palette.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  closeButton: {
    padding: 6,
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  modalSection: {
    gap: 10,
  },
  modalSectionTitle: {
    fontSize: 14,
    color: palette.textPrimary,
    fontFamily: 'Poppins-SemiBold',
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  modalPrimaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalPrimaryActionText: {
    fontSize: 13,
    color: palette.textPrimary,
    fontFamily: 'Poppins-SemiBold',
  },
  modalSecondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalSecondaryActionText: {
    fontSize: 12,
    color: palette.accentDark,
    fontFamily: 'Poppins-Bold',
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: palette.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipHighlight: {
    backgroundColor: '#E9F6E4',
    borderColor: palette.accentDark,
  },
  chipSuccess: {
    backgroundColor: '#DCFCE7',
    borderColor: '#059669',
  },
  chipWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  chipText: {
    fontSize: 12,
    color: palette.textPrimary,
    fontFamily: 'Poppins-Medium',
  },
  windowIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  windowIndicatorSuccess: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#059669',
  },
  windowIndicatorWarning: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  windowIndicatorText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    flex: 1,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rulesMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rulesMetricItem: {
    alignItems: 'center',
  },
  rulesMetricLabel: {
    fontSize: 11,
    color: palette.textSecondary,
    fontFamily: 'Poppins-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  rulesMetricValue: {
    fontSize: 16,
    color: palette.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  rulesDateWindow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: palette.surfaceMuted,
    borderRadius: 10,
    marginBottom: 12,
  },
  rulesDateText: {
    fontSize: 12,
    color: palette.textPrimary,
    fontFamily: 'InstrumentSerif-Regular',
    flex: 1,
  },
  interestBreakdownSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  interestBreakdownTitle: {
    fontSize: 13,
    color: palette.textPrimary,
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 8,
  },
  interestBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  interestBreakdownLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    fontFamily: 'InstrumentSerif-Regular',
  },
  interestBreakdownValue: {
    fontSize: 13,
    color: palette.textPrimary,
    fontFamily: 'Poppins-Medium',
  },
  interestExpectedHint: {
    fontSize: 11,
    color: palette.textSecondary,
    fontFamily: 'InstrumentSerif-Regular',
  },
});


