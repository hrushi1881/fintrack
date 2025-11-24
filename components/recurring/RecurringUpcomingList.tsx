import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecurringTransaction } from '@/types';

interface Props {
  items: RecurringTransaction[];
  onItemPress?: (id: string) => void;
}

const RecurringUpcomingList: React.FC<Props> = ({ items, onItemPress }) => {
  if (items.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="checkmark-circle-outline" size={32} color="rgba(255,255,255,0.4)" />
        <Text style={styles.emptyTitle}>No upcoming items in the next 7 days</Text>
        <Text style={styles.emptySubtitle}>Sit back and relax</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upcoming (Next 7 days)</Text>
        <Text style={styles.counter}>{items.length} scheduled</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 20 }}
        renderItem={({ item }) => {
          const amount = item.amount ?? item.estimated_amount ?? 0;
          const date = new Date(item.next_transaction_date).toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
          });

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => onItemPress?.(item.id)}
            >
              <View style={[styles.icon, { backgroundColor: `${item.color}22` }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.amount}>₹{amount.toLocaleString()}</Text>
              <Text style={styles.meta}>{item.account_name}</Text>
              <View style={styles.footerRow}>
                <Text style={styles.date}>{date}</Text>
                <Text style={styles.nature}>{item.nature}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  counter: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  card: {
    width: 200,
    borderRadius: 20,
    padding: 16,
    marginRight: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 4,
  },
  amount: {
    fontSize: 18,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#FFFFFF',
  },
  meta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  date: {
    fontSize: 13,
    color: '#FCD34D',
  },
  nature: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'capitalize',
  },
  emptyState: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  emptyTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
});

export default RecurringUpcomingList;

