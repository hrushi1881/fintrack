import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { getBillsForNotification, generateBillNotificationMessage } from '@/utils/bills';
import PayModal from '../modals/pay';
import ReceiveModal from '../modals/receive';
import TransferModal from '../modals/transfer';
import AddAccountModal from '../modals/add-account';
import DropdownMenu from '@/components/DropdownMenu';
import GlassmorphCard from '@/components/GlassmorphCard';
import FinancialCard from '@/components/FinancialCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { theme, BACKGROUND_MODES } from '@/theme';
import { textStyles, viewStyles } from '@/utils/themeUtils';

export default function HomeScreen() {
  const { user } = useAuth();
  const { backgroundMode } = useBackgroundMode();
  const { accounts, totalBalance, loading, refreshAccounts } = useRealtimeData();
  const { currency } = useSettings();
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);
  const [billsAlerts, setBillsAlerts] = useState<{
    dueToday: any[];
    overdue: any[];
    upcoming: any[];
  }>({ dueToday: [], overdue: [], upcoming: [] });
  const [billsLoading, setBillsLoading] = useState(false);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  // Refresh accounts when screen comes into focus to ensure latest balances
  useFocusEffect(
    React.useCallback(() => {
      refreshAccounts().catch(console.error);
    }, [refreshAccounts])
  );

  // Load bills alerts
  useEffect(() => {
    const loadBillsAlerts = async () => {
      if (!user?.id) return;
      
      try {
        setBillsLoading(true);
        const alerts = await getBillsForNotification(user.id);
        setBillsAlerts(alerts);
      } catch (error) {
        console.error('Error loading bills alerts:', error);
      } finally {
        setBillsLoading(false);
      }
    };

    loadBillsAlerts();
  }, [user?.id]);

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
          <DropdownMenu style={styles.dropdownMenu} />
          <View style={styles.profileSection}>
            <View style={styles.welcomeText}>
              <Text style={styles.welcomeBack}>Welcome Back,</Text>
              <Text style={styles.userName}>Hruhsi</Text>
            </View>
            <View style={styles.profileActions}>
              <TouchableOpacity 
                style={styles.settingsButton}
                onPress={() => router.push('/settings')}
              >
                <Ionicons name="settings" size={20} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.profileImage}
                onPress={() => router.push('/profile')}
              >
                <Ionicons name="person" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Current Balance Card */}
        <GlassmorphCard style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceAmount}>
            {loading ? 'Loading...' : formatCurrency(totalBalance)}
          </Text>
        </GlassmorphCard>

            {/* Action Circles */}
            <View style={styles.actionCircles}>
              <TouchableOpacity 
                style={styles.actionCircle}
                onPress={() => setReceiveModalVisible(true)}
              >
                <View style={[styles.circle, { backgroundColor: '#10B981' }]}>
                  <Ionicons name="arrow-down" size={20} color="white" />
                </View>
                <Text style={styles.circleLabel}>Receive</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionCircle}
                onPress={() => setPayModalVisible(true)}
              >
                <View style={[styles.circle, { backgroundColor: '#EF4444' }]}>
                  <Ionicons name="arrow-up" size={20} color="white" />
                </View>
                <Text style={styles.circleLabel}>Pay</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionCircle}
                onPress={() => setTransferModalVisible(true)}
              >
                <View style={[styles.circle, { backgroundColor: '#3B82F6' }]}>
                  <Ionicons name="swap-horizontal" size={20} color="white" />
                </View>
                <Text style={styles.circleLabel}>Transfer</Text>
              </TouchableOpacity>
            </View>

          {/* Your Accounts Section */}
          <View style={styles.accountsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Accounts</Text>
              <TouchableOpacity 
                style={styles.addAccountButton}
                onPress={() => setAddAccountModalVisible(true)}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.addAccountText}>Add Account</Text>
              </TouchableOpacity>
            </View>
            
            {loading ? (
              <GlassmorphCard style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading accounts...</Text>
              </GlassmorphCard>
            ) : accounts.length > 0 ? (
              <View style={styles.accountsList}>
                {accounts.map((account, index) => {
                  // Determine icon type based on account type
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
                        liabilityFunds: (account as any).liability_funds,
                        ownFunds: (account as any).own_funds,
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
                })}
              </View>
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

          {/* Bills Alerts Section */}
          {(billsAlerts.overdue.length > 0 || billsAlerts.dueToday.length > 0 || billsAlerts.upcoming.length > 0) && (
            <View style={styles.billsAlertsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Bills Alerts</Text>
                <TouchableOpacity 
                  style={styles.viewAllButton}
                  onPress={() => router.push('/(tabs)/bills')}
                >
                  <Text style={styles.viewAllText}>View All</Text>
                  <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              
              {billsLoading ? (
                <GlassmorphCard style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading bills...</Text>
                </GlassmorphCard>
              ) : (
                <View style={styles.alertsList}>
                  {billsAlerts.overdue.length > 0 && (
                    <GlassmorphCard style={[styles.alertCard, styles.overdueAlert]}>
                      <View style={styles.alertHeader}>
                        <Ionicons name="alert-circle" size={20} color="#EF4444" />
                        <Text style={styles.alertTitle}>Overdue Bills</Text>
                      </View>
                      <Text style={styles.alertText}>
                        {billsAlerts.overdue.length} bill{billsAlerts.overdue.length > 1 ? 's' : ''} overdue
                      </Text>
                      <Text style={styles.alertAmount}>
                        {formatCurrency(billsAlerts.overdue.reduce((sum, bill) => sum + (bill.amount || 0), 0))}
                      </Text>
                    </GlassmorphCard>
                  )}
                  
                  {billsAlerts.dueToday.length > 0 && (
                    <GlassmorphCard style={[styles.alertCard, styles.dueTodayAlert]}>
                      <View style={styles.alertHeader}>
                        <Ionicons name="time" size={20} color="#F59E0B" />
                        <Text style={styles.alertTitle}>Due Today</Text>
                      </View>
                      <Text style={styles.alertText}>
                        {billsAlerts.dueToday.length} bill{billsAlerts.dueToday.length > 1 ? 's' : ''} due today
                      </Text>
                      <Text style={styles.alertAmount}>
                        {formatCurrency(billsAlerts.dueToday.reduce((sum, bill) => sum + (bill.amount || 0), 0))}
                      </Text>
                    </GlassmorphCard>
                  )}
                  
                  {billsAlerts.upcoming.length > 0 && (
                    <GlassmorphCard style={[styles.alertCard, styles.upcomingAlert]}>
                      <View style={styles.alertHeader}>
                        <Ionicons name="calendar" size={20} color="#3B82F6" />
                        <Text style={styles.alertTitle}>Upcoming This Week</Text>
                      </View>
                      <Text style={styles.alertText}>
                        {billsAlerts.upcoming.length} bill{billsAlerts.upcoming.length > 1 ? 's' : ''} due this week
                      </Text>
                      <Text style={styles.alertAmount}>
                        {formatCurrency(billsAlerts.upcoming.reduce((sum, bill) => sum + (bill.amount || 0), 0))}
                      </Text>
                    </GlassmorphCard>
                  )}
                </View>
              )}
            </View>
          )}

        </ScrollView>
      </SafeAreaView>

      {/* Modals */}
         <PayModal 
           visible={payModalVisible} 
           onClose={() => {
             setPayModalVisible(false);
           }}
           onSuccess={async () => {
             // Refresh accounts and transactions to update balances immediately
             await Promise.all([
               refreshAccounts(),
               // Transactions refresh is handled by the modal, but we ensure accounts refresh
             ]);
           }}
         />
         <ReceiveModal 
           visible={receiveModalVisible} 
           onClose={() => {
             setReceiveModalVisible(false);
           }}
           onSuccess={async () => {
             // Refresh accounts and transactions to update balances immediately
             await Promise.all([
               refreshAccounts(),
               // Transactions refresh is handled by the modal, but we ensure accounts refresh
             ]);
           }}
         />
         <TransferModal 
           visible={transferModalVisible} 
           onClose={() => {
             setTransferModalVisible(false);
           }}
           onSuccess={async () => {
             // Refresh accounts and transactions to update balances immediately
             await Promise.all([
               refreshAccounts(),
               // Transactions refresh is handled by the modal, but we ensure accounts refresh
             ]);
           }}
         />
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
    paddingTop: 20,
    paddingBottom: 30,
  },
  dropdownMenu: {
    marginBottom: 20,
  },
  profileSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeText: {
    flex: 1,
  },
  welcomeBack: {
    fontSize: 16,
    color: 'white',
    fontStyle: 'italic',
    fontFamily: 'serif',
  },
  userName: {
    fontSize: 20,
    color: 'white',
    fontFamily: 'serif',
    fontWeight: 'normal',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    backgroundColor: '#000000',
    borderRadius: 20,
    padding: 24,
    marginBottom: 30,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 16,
    color: 'white',
    fontFamily: 'serif',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    color: 'white',
    fontFamily: 'serif',
    fontWeight: 'bold',
  },
  accountsSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  accountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addAccountButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addAccountText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  accountCard: {
    width: '48%',
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  accountCardContent: {
    flex: 1,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  accountIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {
    ...theme.typography.glassTitle,
    marginBottom: 4,
  },
  accountType: {
    ...theme.typography.glassCaption,
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  accountBalance: {
    ...theme.typography.currency,
    fontSize: 18,
  },
  emptyAccountsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyAccountsTitle: {
    ...theme.typography.glassTitle,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyAccountsDescription: {
    ...theme.typography.glassBody,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyAddButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  accountsList: {
    gap: 12,
  },
  actionCircles: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  actionCircle: {
    alignItems: 'center',
    flex: 1,
  },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  circleLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.9,
  },
  // Bills Alerts Styles
  billsAlertsSection: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  alertsList: {
    gap: 12,
  },
  alertCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  overdueAlert: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  dueTodayAlert: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  upcomingAlert: {
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  alertTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  alertText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  alertAmount: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
