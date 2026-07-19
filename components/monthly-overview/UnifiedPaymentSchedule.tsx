import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PaymentScheduleItem } from '@/utils/paymentScheduleDashboard';
import { groupSchedulesByDate } from '@/utils/scheduleVisualization';
import PaymentItem from './PaymentItem';
import { Fonts } from '@/utils/fonts';

interface UnifiedPaymentScheduleProps {
  payments: PaymentScheduleItem[];
  currency: string;
  onPay: (item: PaymentScheduleItem) => void;
  onSkip?: (item: PaymentScheduleItem) => void;
  onReschedule?: (item: PaymentScheduleItem) => void;
  onViewDetail?: (item: PaymentScheduleItem) => void;
}

export default function UnifiedPaymentSchedule({
  payments,
  currency,
  onPay,
  onSkip,
  onReschedule,
  onViewDetail,
}: UnifiedPaymentScheduleProps) {
  const grouped = useMemo(() => groupSchedulesByDate(payments), [payments]);

  if (!payments.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No payments this period 🎉</Text>
        <Text style={styles.emptySubtitle}>
          You’re all clear. New bills and goals will show up here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {grouped.map((group) => (
        <View key={group.date} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionDate}>{group.dateLabel}</Text>
            <Text style={styles.sectionAmount}>
              {group.totalAmount.toLocaleString('en-IN', {
                maximumFractionDigits: 2,
              })}
            </Text>
          </View>
          {group.schedules.map((item) => (
            <PaymentItem
              key={item.id}
              item={item}
              currency={currency}
              onPay={onPay}
              onSkip={onSkip}
              onReschedule={onReschedule}
              onViewDetail={onViewDetail}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  sectionDate: {
    fontSize: 15,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
  },
  sectionAmount: {
    fontSize: 13,
    fontFamily: Fonts.instrumentSansBold,
    color: 'rgba(15,23,42,0.6)',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: Fonts.instrumentSerifRegular,
    color: 'rgba(15,23,42,0.6)',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});

