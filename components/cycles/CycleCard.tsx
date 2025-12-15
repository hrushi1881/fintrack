import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { Cycle, getCycleStatusMessage, DEFAULT_LIABILITY_TOLERANCE_DAYS } from '@/utils/cycles';
import { Transaction } from '@/types';
import { RecurringTransaction } from '@/utils/recurringTransactions';

interface CycleCardProps {
  cycle: Cycle;
  recurringTransaction?: RecurringTransaction;
  onAddNote?: (cycleNumber: number, note: string) => void;
  onViewTransactions?: (transactions: Transaction[]) => void;
  onCreateBill?: (cycle: Cycle) => void;
  onSchedulePayment?: (cycle: Cycle) => void;
  onSetOverride?: (cycle: Cycle) => void;
  onEditTarget?: (cycle: Cycle) => void;
  expanded?: boolean;
}

export default function CycleCard({
  cycle,
  recurringTransaction,
  onAddNote,
  onViewTransactions,
  onCreateBill,
  onSchedulePayment,
  onSetOverride,
  onEditTarget,
  expanded = false,
}: CycleCardProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const { currency } = useSettings();

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'paid_on_time':
        return '#10B981'; // Green
      case 'paid_early':
        return '#059669'; // Emerald (darker green for early)
      case 'paid_within_window':
        return '#6366F1'; // Indigo (acceptable but flagged)
      case 'paid_late':
        return '#F59E0B'; // Amber
      case 'underpaid':
      case 'partial':
        return '#EF4444'; // Red
      case 'overpaid':
        return '#8B5CF6'; // Purple
      case 'not_paid':
        return '#EF4444'; // Red
      case 'upcoming':
        return '#6B7280'; // Gray
      default:
        return '#6B7280';
    }
  };

  const getBillStatusColor = (status?: string): string => {
    const s = (status || '').toLowerCase();
    if (s === 'due_today') return '#F59E0B';
    if (s === 'overdue') return '#EF4444';
    if (s === 'paid') return '#10B981';
    if (s === 'postponed') return '#8B5CF6';
    if (s === 'upcoming') return '#6366F1';
    return '#6B7280';
  };

  const getBillStatusLabel = (status?: string): string => {
    const s = (status || '').toLowerCase();
    if (s === 'due_today') return 'Due today';
    if (s === 'overdue') return 'Overdue';
    if (s === 'paid') return 'Paid';
    if (s === 'postponed') return 'Postponed';
    if (s === 'upcoming') return 'Scheduled';
    return s || 'Scheduled';
  };

  const getPaymentTimingLabel = (timing?: string, daysFromDue?: number): string => {
    const t = (timing || '').toLowerCase();
    const days = Math.abs(daysFromDue || 0);
    const daysText = days > 0 ? ` · ${days} day${days !== 1 ? 's' : ''}` : '';
    
    if (t === 'early') return `Paid${daysText} early`;
    if (t === 'on_time') return 'Paid on time';
    if (t === 'within_window') return `Paid${daysText} after`;
    if (t === 'late') return `Paid late${daysText}`;
    return '';
  };

  const getPaymentTimingColor = (timing?: string, isWithinWindow?: boolean): string => {
    const t = (timing || '').toLowerCase();
    if (t === 'early') return '#059669'; // Emerald
    if (t === 'on_time') return '#10B981'; // Green
    if (t === 'within_window') return '#6366F1'; // Indigo
    if (t === 'late') return isWithinWindow ? '#6366F1' : '#F59E0B'; // Indigo if still in window, Amber if not
    return '#6B7280';
  };

  const getAmountComparisonLabel = (
    comparison?: string,
    diff?: number,
    currencyCode?: string
  ): string => {
    const c = (comparison || '').toLowerCase();
    if (!c) return '';
    const value = diff !== undefined && diff !== null ? formatCurrency(Math.abs(diff)) : '';
    if (c === 'over') return value ? `+${value} extra` : 'Paid more';
    if (c === 'under') return value ? `-${value} short` : 'Paid less';
    if (c === 'partial') return value ? `${value} remaining` : 'Partial';
    if (c === 'exact') return 'Full amount';
    return '';
  };

  const getAmountComparisonColor = (comparison?: string): string => {
    const c = (comparison || '').toLowerCase();
    if (c === 'over') return '#8B5CF6'; // Purple
    if (c === 'under') return '#EF4444'; // Red
    if (c === 'partial') return '#F59E0B'; // Amber
    if (c === 'exact') return '#10B981'; // Green
    return '#6B7280';
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'paid_on_time':
        return 'checkmark-circle';
      case 'paid_late':
        return 'time';
      case 'underpaid':
      case 'partial':
        return 'alert-circle';
      case 'overpaid':
        return 'arrow-up-circle';
      case 'not_paid':
        return 'close-circle';
      case 'upcoming':
        return 'calendar';
      default:
        return 'ellipse';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'paid_on_time':
        return 'Paid on Time';
      case 'paid_late':
        return 'Paid Late';
      case 'underpaid':
        return 'Underpaid';
      case 'partial':
        return 'Partial Payment';
      case 'overpaid':
        return 'Overpaid';
      case 'not_paid':
        return 'Not Paid';
      case 'upcoming':
        return 'Upcoming';
      default:
        return status;
    }
  };

  // Use enhanced status message
  const statusMessage = useMemo(() => getCycleStatusMessage(cycle), [cycle]);
  const statusColor = statusMessage.color || getStatusColor(cycle.status);
  const statusIcon = (statusMessage.icon || getStatusIcon(cycle.status)) as keyof typeof Ionicons.glyphMap;
  const statusLabel = cycle.statusLabel || statusMessage.title;
  const statusSubtitle = statusMessage.subtitle;
  const timingLabel = cycle.timingStatus
    ? cycle.timingStatus === 'early'
      ? `${cycle.daysEarly ?? 0} days early`
      : cycle.timingStatus === 'late'
        ? `${cycle.daysLate ?? 0} days late`
        : 'On time'
    : '';

  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        style={styles.header}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.cycleNumber}>Cycle {cycle.cycleNumber}</Text>
          <Text style={styles.dateRange}>
            {formatDateShort(cycle.startDate)} - {formatDateShort(cycle.endDate)}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Ionicons name={statusIcon} size={16} color={statusColor} />
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#6B7280"
          />
        </View>
      </TouchableOpacity>

      {/* Status summary */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadgeLarge, { backgroundColor: statusColor + '20' }]}>
          <Ionicons name={statusIcon} size={18} color={statusColor} />
        </View>
        <View style={styles.statusTextGroup}>
          <Text style={[styles.statusLabelText, { color: statusColor }]} numberOfLines={1}>
            {statusLabel}
          </Text>
          {statusSubtitle && (
            <Text style={[styles.statusSubtitleText, { color: statusColor }]} numberOfLines={1}>
              {statusSubtitle}
            </Text>
          )}
          <Text style={styles.statusSubText} numberOfLines={1}>
            Paid {formatCurrency(cycle.actualAmount || 0)} of {formatCurrency(cycle.expectedAmount)}
            {cycle.minimumAmount ? ` • Min ${formatCurrency(cycle.minimumAmount)}` : ''}
          </Text>
          <Text style={styles.statusSubText} numberOfLines={1}>
            {cycle.paymentCount || cycle.transactions?.length || 0} payment(s)
            {timingLabel ? ` • ${timingLabel}` : ''}
            {cycle.lastPaymentDate ? ` • Last ${formatDateShort(cycle.lastPaymentDate)}` : ''}
          </Text>
        </View>
      </View>

      {/* Scheduled Bill Badge */}
      {cycle.scheduledBill && (
        <View style={styles.scheduledBillBadge}>
          <Ionicons name="receipt-outline" size={14} color="#6366F1" />
          <Text style={styles.scheduledBillText}>
            Bill Scheduled: {formatCurrency(cycle.scheduledBill.amount)} • Due {formatDateShort(cycle.scheduledBill.dueDate)}
          </Text>
        </View>
      )}

      {/* Bills List */}
      {cycle.bills && cycle.bills.length > 0 && (
        <View style={styles.billsSection}>
          <Text style={styles.billsTitle}>Bills</Text>
          {cycle.bills.map((bill) => {
            const statusColor = getBillStatusColor(bill.status);
            const timingLabel = getPaymentTimingLabel(bill.metadata?.payment_timing);
            const amountLabel = getAmountComparisonLabel(
              bill.metadata?.amount_comparison,
              bill.metadata?.amount_difference,
              currency
            );
            return (
              <View key={bill.id} style={styles.billRow}>
                <View style={styles.billLeft}>
                  <Text style={styles.billTitle}>{bill.title || 'Bill'}</Text>
                  <Text style={styles.billMeta}>
                    Due {formatDateShort(bill.dueDate)}
                    <Text style={styles.billStatusDot}> • </Text>
                    <Text style={[styles.billMeta, { color: statusColor }]}>
                      {getBillStatusLabel(bill.status)}
                    </Text>
                    {timingLabel ? (
                      <>
                        <Text style={styles.billStatusDot}> • </Text>
                        <Text style={[styles.billMeta, { color: getPaymentTimingColor(bill.metadata?.payment_timing) }]}>
                          {timingLabel}
                        </Text>
                      </>
                    ) : null}
                    {amountLabel ? (
                      <>
                        <Text style={styles.billStatusDot}> • </Text>
                        <Text style={[styles.billMeta, { color: getAmountComparisonColor(bill.metadata?.amount_comparison) }]}>
                          {amountLabel}
                        </Text>
                      </>
                    ) : null}
                  </Text>
                </View>
                <Text style={styles.billAmount}>{formatCurrency(bill.totalAmount ?? bill.amount)}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.amounts}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Expected:</Text>
          <Text style={[styles.amountValue, { color: '#6B7280' }]}>
            {formatCurrency(cycle.expectedAmount)}
            {cycle.scheduledBill && (
              <Text style={styles.fromBillHint}> (from bill)</Text>
            )}
          </Text>
        </View>
        {cycle.actualAmount > 0 && (
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Paid:</Text>
            <Text style={[styles.amountValue, { color: statusColor }]}>
              {formatCurrency(cycle.actualAmount)}
            </Text>
          </View>
        )}
        {cycle.amountShort && cycle.amountShort > 0 && (
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Remaining:</Text>
            <Text style={[styles.amountValue, { color: '#EF4444' }]}>
              {formatCurrency(cycle.amountShort)}
            </Text>
          </View>
        )}
        {cycle.amountOver && cycle.amountOver > 0 && (
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Overpaid:</Text>
            <Text style={[styles.amountValue, { color: '#8B5CF6' }]}>
              {formatCurrency(cycle.amountOver)}
            </Text>
          </View>
        )}
        {/* Interest Breakdown */}
        {cycle.expectedPrincipal !== undefined && cycle.expectedInterest !== undefined && (
          <View style={styles.interestBreakdown}>
            <View style={styles.interestRow}>
              <Text style={styles.interestLabel}>Principal:</Text>
              <Text style={styles.interestValue}>
                {cycle.actualPrincipal !== undefined 
                  ? `${formatCurrency(cycle.actualPrincipal)} (expected: ${formatCurrency(cycle.expectedPrincipal)})`
                  : formatCurrency(cycle.expectedPrincipal)}
              </Text>
            </View>
            <View style={styles.interestRow}>
              <Text style={styles.interestLabel}>Interest:</Text>
              <Text style={[styles.interestValue, { color: '#EF4444' }]}>
                {cycle.actualInterest !== undefined 
                  ? `${formatCurrency(cycle.actualInterest)} (expected: ${formatCurrency(cycle.expectedInterest)})`
                  : formatCurrency(cycle.expectedInterest)}
              </Text>
            </View>
            {cycle.remainingBalance !== undefined && (
              <View style={styles.interestRow}>
                <Text style={styles.interestLabel}>Balance After:</Text>
                <Text style={styles.interestValue}>
                  {formatCurrency(cycle.remainingBalance)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={styles.divider} />

          {/* Status Details */}
          <View style={styles.statusSection}>
            <View style={styles.statusRow}>
              <Ionicons name={statusIcon} size={20} color={statusColor} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>

            {/* Additional status info */}
            {cycle.daysLate && cycle.daysLate > 0 && (
              <Text style={styles.statusDetail}>
                • {cycle.daysLate} day{cycle.daysLate > 1 ? 's' : ''} late
              </Text>
            )}
            {cycle.amountShort && cycle.amountShort > 0 && (
              <Text style={styles.statusDetail}>
                • Short by {formatCurrency(cycle.amountShort)}
              </Text>
            )}
            {cycle.amountOver && cycle.amountOver > 0 && (
              <Text style={styles.statusDetail}>
                • Overpaid by {formatCurrency(cycle.amountOver)}
              </Text>
            )}
          </View>

          {/* Expected Payment Date */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Due Date:</Text>
            <Text style={styles.infoValue}>{formatDate(cycle.expectedDate)}</Text>
          </View>

          {/* Combined Bills & Transactions Section */}
          {(cycle.bills && cycle.bills.length > 0) || (cycle.transactions && cycle.transactions.length > 0) ? (
            <View style={styles.billsTransactionsSection}>
              <View style={styles.billsTransactionsHeader}>
                <Text style={styles.billsTransactionsTitle}>
                  Bills & Payments
                </Text>
                {onViewTransactions && cycle.transactions.length > 0 && (
                  <TouchableOpacity
                    onPress={() => onViewTransactions(cycle.transactions)}
                    style={styles.viewAllButton}
                  >
                    <Text style={styles.viewAllText}>View All</Text>
                    <Ionicons name="chevron-forward" size={16} color="#6366F1" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Bills */}
              {cycle.bills && cycle.bills.map((bill) => {
                const billAmount = bill.totalAmount ?? bill.amount ?? 0;
                const isPaid = bill.status === 'paid';
                const isScheduled = ['upcoming', 'due_today', 'overdue', 'postponed'].includes(bill.status);
                const billDate = new Date(bill.dueDate);
                const expectedDate = new Date(cycle.expectedDate);
                const isLate = isPaid && billDate > expectedDate;
                const isEarly = isPaid && billDate < expectedDate;
                const amountDiff = billAmount - cycle.expectedAmount;
                const isMore = amountDiff > 0.01;
                const isLess = amountDiff < -0.01;

                return (
                  <View key={bill.id} style={styles.billRow}>
                    <View style={styles.billLeft}>
                      <View style={styles.billHeaderRow}>
                        <Ionicons 
                          name={isPaid ? 'checkmark-circle' : isScheduled ? 'calendar-outline' : 'receipt-outline'} 
                          size={16} 
                          color={isPaid ? '#10B981' : isScheduled ? '#6366F1' : '#6B7280'} 
                        />
                        <Text style={styles.billTitle}>{bill.title || 'Bill'}</Text>
                      </View>
                      <View style={styles.billStatusRow}>
                        <Text style={styles.billMeta}>
                          Due {formatDate(bill.dueDate)}
                        </Text>
                        {isPaid && (
                          <>
                            <Text style={styles.billStatusDot}>•</Text>
                            <Text style={[styles.billStatus, { color: isLate ? '#F59E0B' : isEarly ? '#10B981' : '#10B981' }]}>
                              {isLate ? 'Paid Late' : isEarly ? 'Paid Early' : 'Paid On Time'}
                            </Text>
                          </>
                        )}
                        {isScheduled && (
                          <>
                            <Text style={styles.billStatusDot}>•</Text>
                            <Text style={[styles.billStatus, { color: '#6366F1' }]}>
                              Scheduled
                            </Text>
                          </>
                        )}
                        {isMore && (
                          <>
                            <Text style={styles.billStatusDot}>•</Text>
                            <Text style={[styles.billStatus, { color: '#8B5CF6' }]}>
                              Paid More ({formatCurrency(amountDiff)})
                            </Text>
                          </>
                        )}
                        {isLess && (
                          <>
                            <Text style={styles.billStatusDot}>•</Text>
                            <Text style={[styles.billStatus, { color: '#EF4444' }]}>
                              Paid Less ({formatCurrency(Math.abs(amountDiff))})
                            </Text>
                          </>
                        )}
                        {!isMore && !isLess && Math.abs(billAmount - cycle.expectedAmount) < 0.01 && (
                          <>
                            <Text style={styles.billStatusDot}>•</Text>
                            <Text style={[styles.billStatus, { color: '#10B981' }]}>
                              Full Amount
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                    <Text style={styles.billAmount}>
                      {formatCurrency(billAmount)}
                    </Text>
                  </View>
                );
              })}

              {/* Transactions */}
              {cycle.transactions && cycle.transactions.map((tx, index) => (
                <View key={tx.id} style={styles.transactionItem}>
                  <View style={styles.transactionLeft}>
                    <View style={styles.transactionHeaderRow}>
                      <Ionicons name="cash-outline" size={16} color={statusColor} />
                    <Text style={styles.transactionDescription}>
                        {tx.description || 'Payment'}
                    </Text>
                    </View>
                    <Text style={styles.transactionDate}>
                      {formatDate(tx.date)}
                    </Text>
                  </View>
                  <Text style={[styles.transactionAmount, { color: statusColor }]}>
                    {formatCurrency(Math.abs(tx.amount))}
                  </Text>
                </View>
              ))}

              {cycle.transactions && cycle.transactions.length > 3 && (
                <Text style={styles.moreTransactions}>
                  +{cycle.transactions.length - 3} more transactions
                </Text>
              )}
            </View>
          ) : null}

          {/* Tolerance Hint / Cycle Rules */}
          <View style={styles.toleranceHint}>
            <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
            <Text style={styles.toleranceHintText}>
              Payments within ±{DEFAULT_LIABILITY_TOLERANCE_DAYS} days apply to this cycle
            </Text>
          </View>
          
          {/* Additional Rules */}
          <View style={styles.rulesContainer}>
            <View style={styles.ruleItem}>
              <Ionicons name="layers-outline" size={12} color="#9CA3AF" />
              <Text style={styles.ruleText}>Multiple payments allowed</Text>
            </View>
            <View style={styles.ruleItem}>
              <Ionicons name="flash-outline" size={12} color="#9CA3AF" />
              <Text style={styles.ruleText}>Early payments encouraged</Text>
            </View>
            {cycle.minimumAmount && cycle.minimumAmount > 0 && (
              <View style={styles.ruleItem}>
                <Ionicons name="shield-checkmark-outline" size={12} color="#9CA3AF" />
                <Text style={styles.ruleText}>Minimum: {formatCurrency(cycle.minimumAmount)} required</Text>
              </View>
            )}
          </View>

          {/* Actual Payment Date */}
          {cycle.actualDate && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Paid On:</Text>
              <Text style={styles.infoValue}>{formatDate(cycle.actualDate)}</Text>
            </View>
          )}

          {/* Notes */}
          {cycle.notes && (
            <View style={styles.notesSection}>
              <View style={styles.notesHeader}>
                <Ionicons name="document-text" size={18} color="#6B7280" />
                <Text style={styles.notesTitle}>Note</Text>
              </View>
              <Text style={styles.notesText}>{cycle.notes}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {onCreateBill && (
              <TouchableOpacity
                style={styles.createBillButton}
                onPress={() => onCreateBill(cycle)}
                activeOpacity={0.7}
              >
                <Ionicons name="card" size={18} color="#FFFFFF" />
                <Text style={styles.createBillButtonText} numberOfLines={1}>
                  Pay / Schedule
                </Text>
              </TouchableOpacity>
            )}
            {onEditTarget && (
              <TouchableOpacity
                style={styles.overrideButton}
                onPress={() => onEditTarget(cycle)}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil" size={16} color="#8B5CF6" />
                <Text style={styles.overrideButtonText} numberOfLines={1}>
                  Update Target
                </Text>
              </TouchableOpacity>
            )}
            {onAddNote && (
              <TouchableOpacity
                style={styles.addNoteButton}
                onPress={() => {
                  onAddNote(cycle.cycleNumber, cycle.notes || '');
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cycle.notes ? 'pencil' : 'add-circle-outline'}
                  size={16}
                  color="#6366F1"
                />
                <Text style={styles.addNoteText} numberOfLines={1}>
                  {cycle.notes ? 'Edit Note' : 'Add Note'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cycleNumber: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
    marginBottom: 4,
    letterSpacing: 0.1,
  },
  dateRange: {
    fontSize: Platform.OS === 'ios' ? 14 : 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amounts: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  amountValue: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'Poppins-SemiBold',
    letterSpacing: 0.1,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 16,
  },
  statusSection: {
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusBadgeLarge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextGroup: {
    flex: 1,
    gap: 2,
  },
  statusLabelText: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-SemiBold',
    letterSpacing: 0.1,
  },
  statusSubtitleText: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontFamily: 'InstrumentSerif-Regular',
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  statusSubText: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    letterSpacing: 0.1,
  },
  statusText: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    fontFamily: 'Poppins-Medium',
    letterSpacing: 0.1,
  },
  statusDetail: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginLeft: 28,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#1F2937',
  },
  transactionsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionsTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  transactionLeft: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F2937',
    marginBottom: 3,
  },
  transactionDate: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
  },
  transactionAmount: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-SemiBold',
    letterSpacing: 0.1,
  },
  moreTransactions: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Italic',
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  notesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  notesTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
  },
  notesText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#4B5563',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  createBillButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    paddingHorizontal: Platform.OS === 'ios' ? 12 : 10,
    borderRadius: 10,
    backgroundColor: '#000000',
    minHeight: 44, // iOS touch target minimum
  },
  createBillButtonText: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  addNoteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    paddingHorizontal: Platform.OS === 'ios' ? 12 : 10,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    minHeight: 44,
  },
  addNoteText: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
    letterSpacing: 0.1,
  },
  scheduleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  scheduleButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
  },
  overrideButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    paddingHorizontal: Platform.OS === 'ios' ? 12 : 10,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    minHeight: 44,
  },
  overrideButtonText: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-Medium',
    color: '#8B5CF6',
    letterSpacing: 0.1,
  },
  interestBreakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  interestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  interestLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  interestValue: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: '#1F2937',
  },
  scheduledBillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  scheduledBillText: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
    flex: 1,
    letterSpacing: 0.1,
  },
  fromBillHint: {
    fontSize: Platform.OS === 'ios' ? 12 : 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  toleranceHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  toleranceHintText: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    flex: 1,
    lineHeight: Platform.OS === 'ios' ? 18 : 16,
  },
  rulesContainer: {
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleText: {
    fontSize: Platform.OS === 'ios' ? 12 : 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
  },
  billsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  billsTitle: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
    letterSpacing: 0.1,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  billLeft: {
    flex: 1,
  },
  billTitle: {
    fontSize: Platform.OS === 'ios' ? 14 : 13,
    fontFamily: 'Poppins-Medium',
    color: '#1F2937',
    letterSpacing: 0.1,
  },
  billMeta: {
    fontSize: Platform.OS === 'ios' ? 13 : 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  billAmount: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#111827',
    marginLeft: 8,
    letterSpacing: 0.1,
  },
  billsTransactionsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  billsTransactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billsTransactionsTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
  },
  billHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  billStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  billStatusDot: {
    fontSize: 12,
    color: '#9CA3AF',
    marginHorizontal: 4,
  },
  billStatus: {
    fontSize: Platform.OS === 'ios' ? 12 : 11,
    fontFamily: 'Poppins-Medium',
    letterSpacing: 0.1,
  },
  transactionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
});

