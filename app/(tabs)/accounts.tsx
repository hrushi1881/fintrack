import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import AddAccountModal from '../modals/add-account';
import GlassmorphCard from '@/components/GlassmorphCard';
import FinancialCard from '@/components/FinancialCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { theme, BACKGROUND_MODES } from '@/theme';

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  color: string;
  icon: string;
  description?: string;
  include_in_totals: boolean;
}

export default function AccountsScreen() {
  const { user } = useAuth();
  const { backgroundMode } = useBackgroundMode();
  const { accounts, totalBalance, loading, refreshAccounts } = useRealtimeData();
  const { currency } = useSettings();
  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const getAccountTypeDisplay = (type: string) => {
    return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const renderBackground = () => {
    if (backgroundMode === BACKGROUND_MODES.IOS_GRADIENT) {
      return (
        <IOSGradientBackground gradientType="default" animated={true} shimmer={true}>
          {renderContent()}
        </IOSGradientBackground>
      );
    } else {
      return (
        <LinearGradient
          colors={['#99D795', '#99D795', '#99D795']}
          style={styles.container}
        >
          {renderContent()}
        </LinearGradient>
      );
    }
  };

  const renderContent = () => (
    <>
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Accounts</Text>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setAddAccountModalVisible(true)}
          >
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* Total Balance */}
        <GlassmorphCard style={styles.totalBalanceCard}>
          <Text style={styles.totalBalanceLabel}>Total Balance</Text>
          <Text style={styles.totalBalanceAmount}>{formatCurrency(totalBalance)}</Text>
        </GlassmorphCard>

          {/* Accounts List */}
          <View style={styles.accountsList}>
            {accounts.length > 0 ? (
              accounts.map((account, index) => {
                // Special handling for Goals Savings Account
                if (account.type === 'goals_savings') {
                  return (
                    <TouchableOpacity
                      key={account.id}
                      style={styles.goalsAccountCard}
                      onPress={() => router.push(`/account/${account.id}`)}
                    >
                      <View style={styles.goalsAccountHeader}>
                        <View style={[styles.goalsAccountIcon, { backgroundColor: account.color }]}>
                          <Ionicons name="trophy" size={24} color="white" />
                        </View>
                        <View style={styles.goalsAccountInfo}>
                          <Text style={styles.goalsAccountName}>{account.name}</Text>
                          <Text style={styles.goalsAccountSubtitle}>Saving for your goals</Text>
                        </View>
                        <View style={styles.goalsAccountBalance}>
                          <Text style={styles.goalsAccountAmount}>
                            {formatCurrency(account.balance)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.goalsAccountFooter}>
                        <Text style={styles.goalsAccountDescription}>
                          Tap to view your goals and progress
                        </Text>
                        <Ionicons name="arrow-forward" size={16} color="#10B981" />
                      </View>
                    </TouchableOpacity>
                  );
                }

                // Regular account handling
                let iconType: 'card' | 'wallet' | 'bank' | 'cash' = 'bank';
                if (account.type.toLowerCase().includes('card')) iconType = 'card';
                else if (account.type.toLowerCase().includes('wallet')) iconType = 'wallet';
                else if (account.type.toLowerCase().includes('cash')) iconType = 'cash';
                else iconType = 'bank';

                return (
                  <FinancialCard
                    key={account.id}
                    data={{
                      id: account.id,
                      name: account.name,
                      amount: Math.abs(account.balance),
                      icon: iconType,
                      backgroundColor: 'rgba(153, 215, 149, 1)',
                      iconBackgroundColor: '#000',
                    }}
                    onPress={(id) => router.push(`/account/${id}`)}
                    style={{ marginBottom: index === accounts.length - 1 ? 0 : 12 }}
                    blurIntensity={10}
                    cardHeight={100}
                    borderRadius={25}
                    iconSize={72}
                    iconBorderRadius={20}
                    arrowButtonSize={40}
                    arrowButtonColor="#000"
                    arrowColor="#fff"
                    textColor="#000"
                    amountColor="#1a1a1a"
                  />
                );
              })
            ) : (
              <GlassmorphCard style={styles.emptyAccountsContainer}>
                <Ionicons name="wallet-outline" size={48} color="rgba(255,255,255,0.5)" />
                <Text style={styles.emptyAccountsTitle}>No Accounts Yet</Text>
                <Text style={styles.emptyAccountsDescription}>
                  Add your first account to start tracking your finances
                </Text>
                <TouchableOpacity
                  style={styles.emptyAddButton}
                  onPress={() => setAddAccountModalVisible(true)}
                >
                  <Text style={styles.emptyAddButtonText}>Add Your First Account</Text>
                </TouchableOpacity>
              </GlassmorphCard>
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => setAddAccountModalVisible(true)}
            >
              <Ionicons name="add-circle" size={24} color="#10B981" />
              <Text style={styles.actionText}>Add Account</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/(tabs)/transactions')}
            >
              <Ionicons name="swap-horizontal" size={24} color="#3B82F6" />
              <Text style={styles.actionText}>Transfer</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Add Account Modal */}
           <AddAccountModal
             visible={addAccountModalVisible}
             onClose={() => {
               setAddAccountModalVisible(false);
             }}
             onSuccess={() => {
               refreshAccounts(); // Refresh accounts after adding
             }}
           />
    </>
  );

  if (loading) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <GlassmorphCard style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading accounts...</Text>
          </GlassmorphCard>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return renderBackground();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  totalBalanceCard: {
    backgroundColor: '#000000',
    borderRadius: 20,
    padding: 24,
    marginBottom: 30,
    alignItems: 'center',
  },
  totalBalanceLabel: {
    fontSize: 16,
    color: 'white',
    fontFamily: 'serif',
    marginBottom: 8,
  },
  totalBalanceAmount: {
    fontSize: 32,
    color: 'white',
    fontFamily: 'serif',
    fontWeight: 'bold',
  },
  accountsList: {
    marginBottom: 30,
  },
  accountItem: {
    marginBottom: 12,
  },
  accountItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    ...theme.typography.glassTitle,
    marginBottom: 4,
  },
  accountType: {
    ...theme.typography.glassCaption,
  },
  accountBalance: {
    marginRight: 12,
  },
  balanceAmount: {
    ...theme.typography.currency,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    marginHorizontal: 8,
    alignItems: 'center',
  },
  actionText: {
    color: 'white',
    marginTop: 8,
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(0,0,0,0.7)',
  },
  accountDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  excludedText: {
    fontSize: 10,
    color: '#F59E0B',
    marginTop: 2,
  },
  emptyAccountsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#000000',
    borderRadius: 16,
    marginBottom: 20,
  },
  emptyAccountsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyAccountsDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyAddButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyAddButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  goalsAccountCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#10B981',
    borderStyle: 'dashed',
  },
  goalsAccountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  goalsAccountIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  goalsAccountInfo: {
    flex: 1,
  },
  goalsAccountName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  goalsAccountSubtitle: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  goalsAccountBalance: {
    alignItems: 'flex-end',
  },
  goalsAccountAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  goalsAccountFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalsAccountDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    flex: 1,
  },
});
