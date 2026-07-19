import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeadlineItem } from '@/utils/deadlinesExtractor';
import LiquidGlassCard from '@/components/LiquidGlassCard';
import { Fonts } from '@/utils/fonts';

interface Props {
  deadlines: DeadlineItem[];
  onViewDetail?: (deadline: DeadlineItem) => void;
}

export default function DeadlinesSection({ deadlines }: Props) {
  if (!deadlines.length) return null;

  const byType: Record<string, DeadlineItem[]> = {};
  deadlines.forEach((d) => {
    if (!byType[d.type]) byType[d.type] = [];
    byType[d.type].push(d);
  });

  const typeLabel: Record<string, string> = {
    recurring_start: 'New recurring starting',
    goal_target: 'Goals ending',
    liability_payoff: 'Loans finishing',
    budget_end: 'Budgets ending',
  };

  const typeIcon: Record<string, keyof typeof Ionicons.glyphMap> = {
    recurring_start: 'repeat',
    goal_target: 'flag',
    liability_payoff: 'card',
    budget_end: 'pie-chart',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Deadlines & new obligations</Text>
      {Object.entries(byType).map(([type, items]) => (
        <LiquidGlassCard key={type} style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name={typeIcon[type] || 'alert-circle'} size={18} color="#111827" />
            <Text style={styles.cardTitle}>{typeLabel[type] || type}</Text>
            <Text style={styles.badge}>{items.length}</Text>
          </View>
          {items.map((d) => (
            <View key={d.id} style={styles.itemRow}>
              <View style={styles.dot} />
              <View style={styles.itemText}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {d.title}
                </Text>
                <Text style={styles.itemSubtitle}>{d.date}</Text>
              </View>
            </View>
          ))}
        </LiquidGlassCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  heading: {
    fontSize: 18,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
    flex: 1,
  },
  badge: {
    fontSize: 11,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
  },
  itemSubtitle: {
    fontSize: 11,
    fontFamily: Fonts.instrumentSerifRegular,
    color: 'rgba(15,23,42,0.6)',
  },
});

