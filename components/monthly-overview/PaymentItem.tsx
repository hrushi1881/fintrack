import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PaymentScheduleItem } from '@/utils/paymentScheduleDashboard';
import { getStatusColor, getStatusLabel, getSourceTypeIcon } from '@/utils/scheduleVisualization';
import LiquidGlassCard, { LiquidGlassPresets } from '@/components/LiquidGlassCard';
import { formatCurrencyAmount } from '@/utils/currency';
import { Fonts } from '@/utils/fonts';

interface PaymentItemProps {
  item: PaymentScheduleItem;
  currency: string;
  onPay: (item: PaymentScheduleItem) => void;
  onSkip?: (item: PaymentScheduleItem) => void;
  onReschedule?: (item: PaymentScheduleItem) => void;
  onViewDetail?: (item: PaymentScheduleItem) => void;
}

export default function PaymentItem({
  item,
  currency,
  onPay,
  onSkip,
  onReschedule,
  onViewDetail,
}: PaymentItemProps) {
  const isGoal = item.source_type === 'goal_schedule';
  const statusColor = getStatusColor(item.status);
  const statusLabel = getStatusLabel(item.status);
  const iconName = getSourceTypeIcon(item.source_type);

  const amountColor = isGoal ? '#16A34A' : '#111827';
  const amountPrefix = isGoal ? '+' : '-';

  const dueLabel = getDueLabel(item.due_date);

  return (
    <LiquidGlassCard
      {...LiquidGlassPresets.transactionCard}
      style={styles.card}
    >
      <View style={styles.row}>
        <View style={styles.iconWrapper}>
          <View style={styles.iconCircle}>
            <Ionicons name={iconName as any} size={20} color="#0F172A" />
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              {item.source_title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {dueLabel}
            </Text>
          </View>
        </View>

        <View style={styles.rightBlock}>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
          <Text style={[styles.amount, { color: amountColor }]}>
            {amountPrefix}
            {formatCurrencyAmount(Math.abs(item.amount), currency)}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        {onViewDetail && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => onViewDetail(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="information-circle-outline" size={16} color="#4B5563" />
            <Text style={styles.secondaryText}>Details</Text>
          </TouchableOpacity>
        )}
        {onSkip && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => onSkip(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="play-skip-forward-outline" size={16} color="#4B5563" />
            <Text style={styles.secondaryText}>Skip</Text>
          </TouchableOpacity>
        )}
        {onReschedule && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => onReschedule(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={16} color="#4B5563" />
            <Text style={styles.secondaryText}>Move</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => onPay(item)}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text style={styles.primaryText}>Pay</Text>
        </TouchableOpacity>
      </View>
    </LiquidGlassCard>
  );
}

function getDueLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dKey = date.toISOString().split('T')[0];
  const tKey = today.toISOString().split('T')[0];
  const tmKey = tomorrow.toISOString().split('T')[0];

  if (dKey === tKey) return 'Due today';
  if (dKey === tmKey) return 'Due tomorrow';

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };
  return `Due ${date.toLocaleDateString('en-US', options)}`;
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    color: '#0F172A',
    fontFamily: Fonts.poppinsSemiBold,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  rightBlock: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsSemiBold,
  },
  amount: {
    fontSize: 16,
    fontFamily: Fonts.instrumentSansBold,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    gap: 4,
  },
  secondaryText: {
    fontSize: 11,
    color: '#4B5563',
    fontFamily: Fonts.poppinsSemiBold,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
    gap: 6,
  },
  primaryText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: Fonts.poppinsSemiBold,
  },
});

