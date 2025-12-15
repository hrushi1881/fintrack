import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import TransactionItem, { TransactionItemProps } from './TransactionItem';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '@/utils/fonts';

export interface RecentTransactionsProps {
  transactions: TransactionItemProps[];
  limit?: number;
  onViewAll?: () => void;
  loading?: boolean;
}

/**
 * RecentTransactions - iOS-style section component for displaying recent transactions
 * 
 * Features:
 * - Section header with "Recent Transactions" title
 * - List of transaction items
 * - "View All" button to navigate to full transactions page
 * - Empty state handling
 * - Loading state
 */
const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  transactions,
  limit = 5,
  onViewAll,
  loading = false,
}) => {
  const displayTransactions = transactions.slice(0, limit);

  const handleViewAll = () => {
    if (onViewAll) {
      onViewAll();
    } else {
      router.push('/(tabs)/transactions');
    }
  };

  const handleTransactionPress = (transaction: TransactionItemProps) => {
    router.push(`/transaction/${transaction.id}`);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Recent Transactions</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Recent Transactions</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={48} color="#D3D3D3" />
          <Text style={styles.emptyText}>No transactions yet</Text>
          <Text style={styles.emptySubtext}>Your recent transactions will appear here</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Recent Transactions</Text>
        {transactions.length > limit && (
          <TouchableOpacity
            onPress={handleViewAll}
            activeOpacity={0.7}
            style={styles.viewAllButton}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={16} color="#979292" />
          </TouchableOpacity>
        )}
      </View>

      {/* Transactions List */}
      <View style={styles.listContainer}>
        {displayTransactions.map((transaction, index) => (
          <View key={transaction.id}>
            <TransactionItem
              {...transaction}
              onPress={() => handleTransactionPress(transaction)}
            />
            {index < displayTransactions.length - 1 && <View style={styles.separator} />}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 20,
    color: '#000000',
    fontFamily: Fonts.poppinsBold,
    letterSpacing: -0.3,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 15,
    color: '#979292',
    fontFamily: Fonts.poppinsSemiBold,
  },
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#F5F5F5',
    marginLeft: 60, // Align with content after icon
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: '#979292',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 17,
    color: '#000000',
    marginTop: 16,
    fontFamily: Fonts.poppinsSemiBold,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#979292',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: Fonts.instrumentSerifRegular,
  },
});

export default RecentTransactions;

