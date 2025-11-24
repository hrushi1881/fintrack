import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecurringTransaction } from '@/types';

interface Props {
  title: string;
  subtitle: string;
  totalLabel: string;
  totalValue: number;
  transactions: RecurringTransaction[];
  accentColor: string;
  onItemPress?: (id: string) => void;
  onViewAll?: () => void;
}

const RecurringTypeSection: React.FC<Props> = ({
  title,
  subtitle,
  totalLabel,
  totalValue,
  transactions,
  accentColor,
  onItemPress,
  onViewAll,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <TouchableOpacity onPress={onViewAll}>
          <Text style={styles.link}>View all</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.totalCard, { borderColor: `${accentColor}44` }]}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <Text style={[styles.totalValue, { color: accentColor }]}>
          ₹{totalValue.toLocaleString()}
        </Text>
      </View>

      {transactions.slice(0, 4).map((item) => {
        const amount = item.amount ?? item.estimated_amount ?? 0;
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            onPress={() => onItemPress?.(item.id)}
          >
            <View style={[styles.rowIcon, { backgroundColor: `${item.color}22` }]}>
              <Ionicons name={item.icon as any} size={20} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                Next: {new Date(item.next_transaction_date).toLocaleDateString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>
            <Text style={styles.rowAmount}>₹{amount.toLocaleString()}</Text>
          </TouchableOpacity>
        );
      })}

      {transactions.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No items yet</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  link: {
    color: '#38BDF8',
    fontSize: 14,
  },
  totalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  totalValue: {
    fontSize: 26,
    fontFamily: 'InstrumentSerif-Regular',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  rowAmount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
  },
  empty: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
  },
});

export default RecurringTypeSection;

