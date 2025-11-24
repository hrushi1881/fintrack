import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { Cycle } from '@/utils/cycles';
import { Transaction } from '@/types';
import GlassmorphCard from '../GlassmorphCard';

interface CycleCardProps {
  cycle: Cycle;
  onAddNote?: (cycleNumber: number, note: string) => void;
  onViewTransactions?: (transactions: Transaction[]) => void;
  onCreateBill?: (cycle: Cycle) => void;
  expanded?: boolean;
}

export default function CycleCard({
  cycle,
  onAddNote,
  onViewTransactions,
  onCreateBill,
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

  const statusColor = getStatusColor(cycle.status);
  const statusIcon = getStatusIcon(cycle.status);
  const statusLabel = getStatusLabel(cycle.status);

  return (
    <GlassmorphCard
      style={styles.card}
      overlayColor="rgba(255, 255, 255, 0.95)"
      borderRadius={16}
      padding={0}
      margin={8}
    >
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

      <View style={styles.amounts}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Expected:</Text>
          <Text style={[styles.amountValue, { color: '#6B7280' }]}>
            {formatCurrency(cycle.expectedAmount)}
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

          {/* Actual Payment Date */}
          {cycle.actualDate && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Paid On:</Text>
              <Text style={styles.infoValue}>{formatDate(cycle.actualDate)}</Text>
            </View>
          )}

          {/* Transactions */}
          {cycle.transactions && cycle.transactions.length > 0 && (
            <View style={styles.transactionsSection}>
              <View style={styles.transactionsHeader}>
                <Text style={styles.transactionsTitle}>
                  Transactions ({cycle.transactions.length})
                </Text>
                {onViewTransactions && (
                  <TouchableOpacity
                    onPress={() => onViewTransactions(cycle.transactions)}
                    style={styles.viewAllButton}
                  >
                    <Text style={styles.viewAllText}>View All</Text>
                    <Ionicons name="chevron-forward" size={16} color="#6366F1" />
                  </TouchableOpacity>
                )}
              </View>

              {cycle.transactions.slice(0, 3).map((tx, index) => (
                <View key={tx.id} style={styles.transactionItem}>
                  <View style={styles.transactionLeft}>
                    <Text style={styles.transactionDescription}>
                      {tx.description || 'Transaction'}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(tx.date)}
                    </Text>
                  </View>
                  <Text style={[styles.transactionAmount, { color: statusColor }]}>
                    {formatCurrency(Math.abs(tx.amount))}
                  </Text>
                </View>
              ))}

              {cycle.transactions.length > 3 && (
                <Text style={styles.moreTransactions}>
                  +{cycle.transactions.length - 3} more
                </Text>
              )}
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
                <Ionicons name="receipt-outline" size={18} color="#FFFFFF" />
                <Text style={styles.createBillButtonText}>Create Bill</Text>
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
                  size={18}
                  color="#6366F1"
                />
                <Text style={styles.addNoteText}>
                  {cycle.notes ? 'Edit Note' : 'Add Note'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </GlassmorphCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
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
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
    marginBottom: 2,
  },
  dateRange: {
    fontSize: 13,
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
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  amountValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
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
  statusText: {
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
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
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F2937',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
  },
  transactionAmount: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
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
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#000000',
  },
  createBillButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  addNoteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  addNoteText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
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
});

