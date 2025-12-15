import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { formatCurrencyAmount } from '@/utils/currency';
import { Account } from '@/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.88; // 88% of screen height

export type PeriodType = 'week' | 'month' | 'year';

export interface DashboardModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: Account[];
  transactions: {
    id: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    date: string;
  }[];
  currency?: string;
  loading?: boolean;
}

/**
 * DashboardModal - Premium Royal Interactive Dashboard
 * 
 * Features:
 * - Elegant slide-up animation
 * - Sophisticated black background with gradients
 * - Premium typography and spacing
 * - Royal color accents
 * - Refined visual hierarchy
 */
const DashboardModal: React.FC<DashboardModalProps> = ({
  visible,
  onClose,
  accounts,
  transactions,
  currency = 'INR',
  loading = false,
}) => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<PeriodType>('month');
  const [goalContributions, setGoalContributions] = useState<{
    amount: number;
    date: string;
  }[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const contentOpacity = React.useRef(new Animated.Value(0)).current;

  // Fetch goal contributions when modal opens
  useEffect(() => {
    if (visible && user) {
      fetchGoalContributions();
    }
  }, [visible, user, period]);

  const fetchGoalContributions = async () => {
    if (!user) return;

    try {
      setContributionsLoading(true);
      
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
      }

      const { data: userGoals, error: goalsError } = await supabase
        .from('goals')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_archived', false);

      if (goalsError || !userGoals || userGoals.length === 0) {
        setGoalContributions([]);
        return;
      }

      const goalIds = userGoals.map(g => g.id);

      const { data: contributions, error } = await supabase
        .from('goal_contributions')
        .select(`
          amount,
          transaction_id,
          transactions!goal_contributions_transaction_id_fkey(
            date
          )
        `)
        .in('goal_id', goalIds);

      if (error) {
        console.error('Error fetching goal contributions:', error);
        setGoalContributions([]);
        return;
      }

      const filteredContributions = (contributions || []).filter((contrib: any) => {
        const txDate = new Date(contrib.transactions?.date || contrib.created_at);
        return txDate >= startDate && txDate <= now;
      });

      const contributionsWithDates = filteredContributions.map((contrib: any) => ({
        amount: contrib.amount || 0,
        date: contrib.transactions?.date || contrib.created_at || new Date().toISOString(),
      }));
      setGoalContributions(contributionsWithDates);
    } catch (error) {
      console.error('Error in fetchGoalContributions:', error);
      setGoalContributions([]);
    } finally {
      setContributionsLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 70,
          friction: 12,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 400,
          delay: 150,
          useNativeDriver: true,
        }),
      ]).start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: MODAL_HEIGHT,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const flows = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const filteredTransactions = transactions.filter((tx) => {
      const txDate = new Date(tx.date);
      return txDate >= startDate && txDate <= now;
    });

    const income = filteredTransactions
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const expense = filteredTransactions
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const savings = goalContributions.reduce((sum, contrib) => sum + Math.abs(contrib.amount), 0);

    return { income, expense, savings };
  }, [transactions, period, goalContributions]);

  const activeAccounts = useMemo(() => {
    return accounts.filter((acc) => acc.is_active && acc.include_in_totals !== false);
  }, [accounts]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handlePeriodChange = (newPeriod: PeriodType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPeriod(newPeriod);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Premium Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity,
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.85)', 'rgba(0, 0, 0, 0.92)']}
          style={StyleSheet.absoluteFill}
        />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
      </Animated.View>

      {/* Modal Content */}
      <Animated.View
        style={[
          styles.modalContainer,
          {
            height: MODAL_HEIGHT,
            transform: [{ translateY: slideAnim }],
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        {/* Elegant Handle Bar */}
        <View style={styles.handleBar}>
          <View style={styles.handle} />
        </View>

        {/* Premium Header */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: contentOpacity,
            },
          ]}
        >
          <View>
            <Text style={styles.title}>Financial Overview</Text>
            <Text style={styles.subtitle}>Your complete financial snapshot</Text>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>

        {/* Refined Period Selector */}
        <Animated.View
          style={[
            styles.periodSelector,
            {
              opacity: contentOpacity,
            },
          ]}
        >
          {(['week', 'month', 'year'] as PeriodType[]).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => handlePeriodChange(p)}
              style={[styles.periodButton, period === p && styles.periodButtonActive]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  period === p && styles.periodButtonTextActive,
                ]}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* Scrollable Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: contentOpacity }}>
            {/* Premium Flow Cards */}
            <View style={styles.flowsContainer}>
              {/* Income Flow */}
              <View style={[styles.flowCard, styles.incomeCard]}>
                <LinearGradient
                  colors={['rgba(0, 179, 126, 0.15)', 'rgba(0, 179, 126, 0.05)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.flowContent}>
                  <View style={styles.flowHeader}>
                    <View style={[styles.flowIconContainer, { backgroundColor: 'rgba(0, 179, 126, 0.2)' }]}>
                      <Ionicons name="arrow-down-circle" size={24} color="#00B37E" />
                    </View>
                    <Text style={styles.flowLabel}>Income</Text>
                  </View>
                  <Text style={[styles.flowAmount, styles.incomeAmount]}>
                    {formatCurrencyAmount(flows.income, currency)}
                  </Text>
                </View>
              </View>

              {/* Expense Flow */}
              <View style={[styles.flowCard, styles.expenseCard]}>
                <LinearGradient
                  colors={['rgba(255, 107, 53, 0.15)', 'rgba(255, 107, 53, 0.05)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.flowContent}>
                  <View style={styles.flowHeader}>
                    <View style={[styles.flowIconContainer, { backgroundColor: 'rgba(255, 107, 53, 0.2)' }]}>
                      <Ionicons name="arrow-up-circle" size={24} color="#FF6B35" />
                    </View>
                    <Text style={styles.flowLabel}>Expense</Text>
                  </View>
                  <Text style={[styles.flowAmount, styles.expenseAmount]}>
                    {formatCurrencyAmount(flows.expense, currency)}
                  </Text>
                </View>
              </View>

              {/* Savings Flow */}
              <View style={[styles.flowCard, styles.savingsCard]}>
                <LinearGradient
                  colors={['rgba(107, 142, 35, 0.15)', 'rgba(107, 142, 35, 0.05)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.flowContent}>
                  <View style={styles.flowHeader}>
                    <View style={[styles.flowIconContainer, { backgroundColor: 'rgba(107, 142, 35, 0.2)' }]}>
                      <Ionicons name="trending-up" size={24} color="#6B8E23" />
                    </View>
                    <Text style={styles.flowLabel}>Savings</Text>
                  </View>
                  <Text
                    style={[
                      styles.flowAmount,
                      flows.savings >= 0 ? styles.savingsAmountPositive : styles.savingsAmountNegative,
                    ]}
                  >
                    {formatCurrencyAmount(Math.abs(flows.savings), currency)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Accounts Section */}
            <View style={styles.accountsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your Accounts</Text>
                <Text style={styles.sectionSubtitle}>{activeAccounts.length} active</Text>
              </View>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading accounts...</Text>
                </View>
              ) : activeAccounts.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="wallet-outline" size={56} color="rgba(255, 255, 255, 0.3)" />
                  </View>
                  <Text style={styles.emptyText}>No accounts yet</Text>
                  <Text style={styles.emptySubtext}>Create your first account to get started</Text>
                </View>
              ) : (
                <View style={styles.accountsList}>
                  {activeAccounts.map((account, index) => (
                    <View key={account.id}>
                      <TouchableOpacity
                        style={styles.accountItem}
                        activeOpacity={0.7}
                      >
                        {/* Premium Icon */}
                        <View
                          style={[
                            styles.accountIconContainer,
                            {
                              backgroundColor: `${account.color}25`,
                              borderColor: `${account.color}40`,
                            },
                          ]}
                        >
                          <Ionicons
                            name={(account.icon as any) || 'wallet'}
                            size={26}
                            color={account.color}
                          />
                        </View>

                        {/* Account Info */}
                        <View style={styles.accountInfo}>
                          <Text style={styles.accountName}>{account.name}</Text>
                          <Text style={styles.accountType}>
                            {account.type.charAt(0).toUpperCase() + account.type.slice(1).replace('_', ' ')}
                          </Text>
                        </View>

                        {/* Balance */}
                        <View style={styles.accountBalance}>
                          <Text style={styles.accountBalanceAmount}>
                            {formatCurrencyAmount(account.balance, currency)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      {index < activeAccounts.length - 1 && <View style={styles.accountSeparator} />}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
    overflow: 'hidden',
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingBottom: 20,
  },
  handle: {
    width: 48,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    fontFamily: 'Archivo Black',
    letterSpacing: -1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'System',
    letterSpacing: 0.2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: 28,
    paddingBottom: 28,
    gap: 10,
  },
  periodButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  periodButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  periodButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'System',
    letterSpacing: 0.3,
  },
  periodButtonTextActive: {
    color: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  flowsContainer: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 40,
  },
  flowCard: {
    flex: 1,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative',
  },
  incomeCard: {
    borderColor: 'rgba(0, 179, 126, 0.4)',
  },
  expenseCard: {
    borderColor: 'rgba(255, 107, 53, 0.4)',
  },
  savingsCard: {
    borderColor: 'rgba(107, 142, 35, 0.4)',
  },
  flowContent: {
    position: 'relative',
    zIndex: 1,
  },
  flowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  flowIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: 'System',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  flowAmount: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'InstrumentSans-ExtraBold',
    letterSpacing: -0.8,
    lineHeight: 28,
  },
  incomeAmount: {
    color: '#00B37E',
  },
  expenseAmount: {
    color: '#FF6B35',
  },
  savingsAmountPositive: {
    color: '#6B8E23',
  },
  savingsAmountNegative: {
    color: '#FF6B35',
  },
  accountsSection: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: 'System',
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'System',
  },
  accountsList: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 28,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  accountIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1.5,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'System',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  accountType: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'System',
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  accountBalance: {
    alignItems: 'flex-end',
  },
  accountBalanceAmount: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: 'InstrumentSans-ExtraBold',
    letterSpacing: -0.3,
  },
  accountSeparator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 72,
    marginRight: 12,
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'System',
  },
  emptyContainer: {
    padding: 64,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: 'System',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'System',
    textAlign: 'center',
  },
});

export default DashboardModal;
