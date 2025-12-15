import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import FloatingTopBar from '@/components/FloatingTopBar';
import BalanceCard from '@/components/BalanceCard';
import RecentTransactions from '@/components/RecentTransactions';
import { TransactionItemProps } from '@/components/TransactionItem';
import DashboardModal from '@/components/DashboardModal';
import PayModal from '@/app/modals/pay';
import ReceiveModal from '@/app/modals/receive';
import TransferModal from '@/app/modals/transfer';

export default function HomeScreen() {
  const { totalBalance, loading, transactions, accounts } = useRealtimeData();
  const { currency } = useSettings();
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);

  const topBarOptions = [
    {
      id: 'profile',
      label: 'Profile',
      icon: 'person-outline' as const,
      onPress: () => router.push('/profile'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings-outline' as const,
      onPress: () => router.push('/settings'),
    },
  ];

  // Transform transactions to TransactionItemProps format
  const recentTransactions: TransactionItemProps[] = useMemo(() => {
    return transactions.map((tx: any) => ({
      id: tx.id,
      amount: tx.amount,
      type: tx.type,
      description: tx.description,
      date: tx.date,
      category: tx.category
        ? {
            name: tx.category.name,
            color: tx.category.color,
            icon: tx.category.icon,
          }
        : undefined,
      account: tx.account
        ? {
            name: tx.account.name,
            color: tx.account.color,
            icon: tx.account.icon,
          }
        : undefined,
      currency: currency || 'INR',
      // Include metadata if available (for cycle_number from liability payments)
      metadata: tx.metadata || undefined,
    }));
  }, [transactions, currency]);

      return (
        <View style={styles.container}>
    <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* App Name - Interactive (design later) */}
          <View style={styles.appNameContainer}>
            <Text style={styles.appName}>Fintrack</Text>
          </View>

          {/* Balance Card Component */}
          <View style={styles.balanceCardContainer}>
            <BalanceCard
              amount={totalBalance}
              currency={currency || 'INR'}
              label="Current Balance"
              loading={loading}
              onDragHandlePress={() => setDashboardVisible(true)}
            />
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActionsContainer}>
            <Text style={styles.quickActionsTitle}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => setPayModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(0, 0, 0, 0.05)' }]}>
                  <Ionicons name="arrow-up" size={24} color="#000000" />
                </View>
                <Text style={styles.quickActionLabel}>Pay</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => setReceiveModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(0, 0, 0, 0.05)' }]}>
                  <Ionicons name="arrow-down" size={24} color="#000000" />
                </View>
                <Text style={styles.quickActionLabel}>Receive</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => setTransferModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(0, 0, 0, 0.05)' }]}>
                  <Ionicons name="swap-horizontal" size={24} color="#000000" />
                </View>
                <Text style={styles.quickActionLabel}>Transfer</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Recent Transactions Section */}
          <RecentTransactions
            transactions={recentTransactions}
            limit={5}
            loading={loading}
            onViewAll={() => router.push('/(tabs)/transactions')}
          />
        </ScrollView>
      </SafeAreaView>

      {/* Floating Top Bar */}
      <FloatingTopBar options={topBarOptions} />

      {/* Dashboard Modal */}
      <DashboardModal
        visible={dashboardVisible}
        onClose={() => setDashboardVisible(false)}
        accounts={accounts}
        transactions={transactions.map((tx) => ({
          id: tx.id,
          amount: tx.amount,
          type: tx.type,
          date: tx.date,
        }))}
        currency={currency || 'INR'}
        loading={loading}
      />

      {/* Transaction Modals */}
      <PayModal
        visible={payModalVisible}
        onClose={() => setPayModalVisible(false)}
        onSuccess={() => {
          // Modal will stay open for multiple transactions
        }}
      />
      <ReceiveModal
        visible={receiveModalVisible}
        onClose={() => setReceiveModalVisible(false)}
        onSuccess={() => {
          // Modal will stay open for multiple transactions
        }}
      />
      <TransferModal
        visible={transferModalVisible}
        onClose={() => setTransferModalVisible(false)}
        onSuccess={() => {
          // Modal will stay open for multiple transactions
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingTop: 60, // Space for top bar
    paddingBottom: 120, // Space for floating nav bar
  },
  appNameContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  appName: {
    fontSize: 22,
    // Don't use fontWeight with custom fonts on Android - the font file determines the weight
    color: '#000000',
    fontFamily: 'Archivo Black', // This font is already 900 weight (Black)
    letterSpacing: 0.5,
    textAlign: 'center',
    // Interactive - will design later
  },
  balanceCardContainer: {
    width: '100%',
    paddingHorizontal: 0,
  },
  quickActionsContainer: {
    marginTop: 32,
    marginBottom: 24,
  },
  quickActionsTitle: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: 'rgba(0, 0, 0, 0.6)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  quickActionIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickActionLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
  },
});
