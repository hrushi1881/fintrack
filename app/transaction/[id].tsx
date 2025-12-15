import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  SafeAreaView, 
  Modal, 
  Alert,
  Pressable,
  StatusBar,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import { useBackNavigation, useAndroidBackButton } from '@/hooks/useBackNavigation';
import EditTransactionModal from '../modals/edit-transaction';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import LiquidGlassCard from '@/components/LiquidGlassCard';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  account_id: string;
  category_id: string;
  notes?: string;
  location?: string;
  reference_number?: string;
  tags?: string[];
  created_at?: string;
  balance_before?: number;
  balance_after?: number;
  metadata?: {
    bucket_type?: 'personal' | 'liability' | 'goal';
    bucket_id?: string;
    [key: string]: any;
  };
  account?: {
    name: string;
    color: string;
    icon: string;
  };
  category?: {
    name: string;
    color?: string;
    icon?: string;
  };
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { currency } = useSettings();
  const handleBack = useBackNavigation();
  useAndroidBackButton();
  const { accounts, refreshAccounts, goals, refreshGoals } = useRealtimeData();
  const { liabilities, fetchLiabilities } = useLiabilities();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedTransactions, setRelatedTransactions] = useState<Transaction[]>([]);
  const [dailyTransactionCount, setDailyTransactionCount] = useState(0);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [beforeBalance, setBeforeBalance] = useState<number | null>(null);
  const [afterBalance, setAfterBalance] = useState<number | null>(null);
  const [currentAccountBalance, setCurrentAccountBalance] = useState<number | null>(null);
  const [fundInfo, setFundInfo] = useState<{
    fundName: string;
    fundType: 'personal' | 'liability' | 'goal' | null;
    fundId: string | null;
  } | null>(null);

  // Update current account balance from real-time accounts data
  const updateCurrentAccountBalance = React.useCallback(() => {
    if (transaction?.account_id && accounts && accounts.length > 0) {
      const account = accounts.find(acc => acc.id === transaction.account_id);
      if (account) {
        const newBalance = Number(account.balance) || 0;
        setCurrentAccountBalance(newBalance);
      }
    }
  }, [transaction?.account_id, accounts]);

  useEffect(() => {
    updateCurrentAccountBalance();
  }, [updateCurrentAccountBalance]);

  useFocusEffect(
    React.useCallback(() => {
      refreshAccounts();
    }, [refreshAccounts])
  );

  useEffect(() => {
    if (id && user) {
      fetchTransactionDetails();
    }
  }, [id, user]);

  const fetchTransactionDetails = async () => {
    try {
      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .select(`
          *,
          account:accounts!transactions_account_id_fkey(name, color, icon),
          category:categories!transactions_category_id_fkey_new(name, color, icon)
        `)
        .eq('id', id)
        .eq('user_id', user?.id)
        .single();

      if (transactionError) {
        console.error('Error fetching transaction:', transactionError);
        Alert.alert('Error', 'Failed to load transaction details');
        return;
      }

      if (transactionData && !transactionData.created_at) {
        transactionData.created_at = transactionData.date;
      }

      setTransaction(transactionData);

      if (transactionData?.metadata?.bucket_type && transactionData.metadata.bucket_type !== 'personal') {
        await Promise.all([fetchLiabilities(), refreshGoals()]);
      }

      if (transactionData?.metadata) {
        const bucketType = transactionData.metadata.bucket_type;
        const bucketId = transactionData.metadata.bucket_id;
        
        if (bucketType && bucketType !== 'personal') {
          let fundName = 'Unknown Fund';
          
          if (bucketType === 'liability' && bucketId) {
            const { data: liabilityData } = await supabase
              .from('liabilities')
              .select('title')
              .eq('id', bucketId)
              .eq('user_id', user?.id)
              .single();
            
            fundName = liabilityData?.title 
              ? `Liability Fund (${liabilityData.title})` 
              : (liabilities?.find(l => l.id === bucketId)?.title 
                ? `Liability Fund (${liabilities.find(l => l.id === bucketId)!.title})`
                : 'Liability Fund');
          } else if (bucketType === 'goal' && bucketId) {
            const { data: goalData } = await supabase
              .from('goals')
              .select('title')
              .eq('id', bucketId)
              .eq('user_id', user?.id)
              .single();
            
            fundName = goalData?.title 
              ? `Goal Fund (${goalData.title})` 
              : (goals?.find(g => g.id === bucketId)?.title 
                ? `Goal Fund (${goals.find(g => g.id === bucketId)!.title})`
                : 'Goal Fund');
          }
          
          setFundInfo({
            fundName,
            fundType: bucketType as 'liability' | 'goal',
            fundId: bucketId || null,
          });
        } else {
          setFundInfo({
            fundName: 'Personal Fund',
            fundType: 'personal',
            fundId: null,
          });
        }
      } else {
        setFundInfo({
          fundName: 'Personal Fund',
          fundType: 'personal',
          fundId: null,
        });
      }

      await refreshAccounts();

      if (transactionData) {
        await calculateBalanceImpact(transactionData);
      }
      
      if (transactionData) {
        const { data: relatedData, error: relatedError } = await supabase
          .from('transactions')
          .select(`
            *,
            account:accounts!transactions_account_id_fkey(name, color, icon),
            category:categories!transactions_category_id_fkey_new(name, color, icon)
          `)
          .eq('user_id', user?.id)
          .eq('date', transactionData.date)
          .neq('id', id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!relatedError) {
          setRelatedTransactions(relatedData || []);
        }

        const { count } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user?.id)
          .eq('date', transactionData.date);

        setDailyTransactionCount(count || 0);
      }
    } catch (error) {
      console.error('Error fetching transaction details:', error);
      Alert.alert('Error', 'Failed to load transaction details');
    } finally {
      setLoading(false);
    }
  };

  const calculateBalanceImpact = async (transaction: Transaction) => {
    try {
      if (transaction.balance_before !== null && transaction.balance_before !== undefined &&
          transaction.balance_after !== null && transaction.balance_after !== undefined) {
        setBeforeBalance(Number(transaction.balance_before));
        setAfterBalance(Number(transaction.balance_after));
        return;
      }

      const { data: allTransactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('id, amount, type, date, created_at, balance_before, balance_after')
        .eq('account_id', transaction.account_id)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      if (transactionsError) throw transactionsError;

      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('balance, created_at')
        .eq('id', transaction.account_id)
        .single();

      if (accountError) throw accountError;

      const currentBalance = Number(accountData.balance) || 0;
      
      const signedTransactions = (allTransactions || []).map(t => ({
        ...t,
        signedAmount: t.type === 'expense' ? -Math.abs(Number(t.amount) || 0) : Math.abs(Number(t.amount) || 0)
      }));
      
      const sumOfAllTransactions = signedTransactions.reduce(
        (sum, t) => sum + t.signedAmount,
        0
      );
      const initialBalance = currentBalance - sumOfAllTransactions;

      const transactionDate = transaction.date;
      const transactionCreatedAt = transaction.created_at || transaction.date;
      
      let runningBalance = initialBalance;
      let beforeBal = initialBalance;
      let afterBal = initialBalance;
      let foundTransaction = false;

      for (const txn of signedTransactions) {
        const txnDate = txn.date;
        const txnCreatedAt = txn.created_at || txn.date;
        
        const isTargetTransaction = txn.id === transaction.id;
        
        if (isTargetTransaction) {
          if (txn.balance_before !== null && txn.balance_before !== undefined &&
              txn.balance_after !== null && txn.balance_after !== undefined) {
            beforeBal = Number(txn.balance_before);
            afterBal = Number(txn.balance_after);
          } else {
            beforeBal = runningBalance;
            afterBal = runningBalance + txn.signedAmount;
          }
          foundTransaction = true;
          break;
        } else {
          const isBefore = 
            txnDate < transactionDate || 
            (txnDate === transactionDate && txnCreatedAt < transactionCreatedAt);
          
          if (isBefore) {
            if (txn.balance_after !== null && txn.balance_after !== undefined) {
              runningBalance = Number(txn.balance_after);
            } else {
              runningBalance = runningBalance + txn.signedAmount;
            }
          } else {
            break;
          }
        }
      }

      if (!foundTransaction) {
        const transactionsAfter = signedTransactions.filter(t => {
          if (t.id === transaction.id) return false;
          const txnDate = t.date;
          const txnCreatedAt = t.created_at || t.date;
          return (
            txnDate > transactionDate ||
            (txnDate === transactionDate && txnCreatedAt > transactionCreatedAt)
          );
        });

        const sumAfter = transactionsAfter.reduce(
          (sum, t) => sum + t.signedAmount,
          0
        );
        
        const transactionSignedAmount = transaction.type === 'expense' 
          ? -Math.abs(Number(transaction.amount) || 0) 
          : Math.abs(Number(transaction.amount) || 0);
        
        afterBal = currentBalance - sumAfter;
        beforeBal = afterBal - transactionSignedAmount;
      }

      setBeforeBalance(beforeBal);
      setAfterBalance(afterBal);

    } catch (error) {
      console.error('Error calculating balance impact:', error);
      setBeforeBalance(null);
      setAfterBalance(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type: string, category?: string) => {
      const categoryName = (category || '').toLowerCase();
    if (type === 'income') return 'trending-up';
    if (type === 'expense') {
      if (categoryName.includes('food') || categoryName.includes('dining')) return 'restaurant';
      if (categoryName.includes('transport') || categoryName.includes('gas')) return 'car';
      if (categoryName.includes('entertainment')) return 'game-controller';
      if (categoryName.includes('utilities') || categoryName.includes('bills')) return 'flash';
      if (categoryName.includes('shopping')) return 'bag-handle';
      if (categoryName.includes('health')) return 'fitness';
      return 'trending-down';
    }
    return 'swap-horizontal';
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'income':
        return {
          color: '#10B981',
          bgColor: 'rgba(16, 185, 129, 0.12)',
          label: 'Income',
          prefix: '+',
        };
      case 'expense':
        return {
          color: '#EF4444',
          bgColor: 'rgba(239, 68, 68, 0.12)',
          label: 'Expense',
          prefix: '-',
        };
      case 'transfer':
        return {
          color: '#3B82F6',
          bgColor: 'rgba(59, 130, 246, 0.12)',
          label: 'Transfer',
          prefix: '',
        };
      default:
        return {
          color: '#6B7280',
          bgColor: 'rgba(107, 114, 128, 0.12)',
          label: 'Other',
          prefix: '',
        };
    }
  };

  const getFundConfig = (fundType: string | null) => {
    switch (fundType) {
      case 'personal':
        return { color: '#10B981', icon: 'wallet-outline', bgColor: 'rgba(16, 185, 129, 0.12)' };
      case 'liability':
        return { color: '#EF4444', icon: 'card-outline', bgColor: 'rgba(239, 68, 68, 0.12)' };
      case 'goal':
        return { color: '#3B82F6', icon: 'flag-outline', bgColor: 'rgba(59, 130, 246, 0.12)' };
      default:
        return { color: '#6B7280', icon: 'layers-outline', bgColor: 'rgba(107, 114, 128, 0.12)' };
    }
  };

  if (loading) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.container}>
          <StatusBar barStyle="dark-content" />
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.loadingContainer}>
              <LiquidGlassCard variant="frosted" size="lg" elevation="medium">
                <View style={styles.loadingContent}>
                  <Ionicons name="hourglass-outline" size={32} color="rgba(0, 0, 0, 0.4)" />
                  <Text style={styles.loadingText}>Loading transaction...</Text>
                </View>
              </LiquidGlassCard>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    );
  }

  if (!transaction) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.container}>
          <StatusBar barStyle="dark-content" />
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.errorContainer}>
              <LiquidGlassCard variant="light" size="xl" elevation="medium">
                <View style={styles.errorContent}>
                  <View style={styles.errorIconContainer}>
                    <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
                  </View>
                  <Text style={styles.errorTitle}>Transaction Not Found</Text>
                  <Text style={styles.errorDescription}>
                    This transaction may have been deleted or doesn't exist.
                  </Text>
                  <Pressable 
                    style={({ pressed }) => [styles.errorButton, { opacity: pressed ? 0.9 : 1 }]}
                    onPress={handleBack}
                  >
                    <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
                    <Text style={styles.errorButtonText}>Go Back</Text>
                  </Pressable>
                </View>
              </LiquidGlassCard>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    );
  }

  const typeConfig = getTypeConfig(transaction.type);
  const fundConfig = getFundConfig(fundInfo?.fundType || null);

  return (
    <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable 
                style={({ pressed }) => [styles.headerButton, { opacity: pressed ? 0.7 : 1 }]}
                onPress={handleBack}
              >
                <Ionicons name="chevron-back" size={24} color="#000000" />
              </Pressable>
              <Text style={styles.headerTitle}>Transaction</Text>
              <Pressable 
                style={({ pressed }) => [styles.headerButton, { opacity: pressed ? 0.7 : 1 }]}
                      onPress={() => setEditModalVisible(true)}
                    >
                <Ionicons name="create-outline" size={22} color="#000000" />
              </Pressable>
            </View>

            {/* Hero Amount Card */}
            <LiquidGlassCard
              variant="frosted"
              size="xl"
              elevation="high"
              shimmer
              marginVertical={16}
            >
              <View style={styles.heroCard}>
                {/* Transaction Icon */}
                <View style={[styles.heroIcon, { backgroundColor: typeConfig.bgColor }]}>
                  <Ionicons 
                    name={getTransactionIcon(transaction.type, transaction.category?.name) as any} 
                    size={32} 
                    color={typeConfig.color} 
                  />
              </View>
              
                {/* Amount */}
                <Text style={[styles.heroAmount, { color: typeConfig.color }]}>
                  {typeConfig.prefix}{formatCurrency(Math.abs(transaction.amount))}
                </Text>

                {/* Type Badge */}
                <View style={[styles.heroBadge, { backgroundColor: typeConfig.bgColor }]}>
                  <Text style={[styles.heroBadgeText, { color: typeConfig.color }]}>
                    {typeConfig.label}
                  </Text>
              </View>
              
                {/* Description */}
                <Text style={styles.heroDescription}>{transaction.description || 'No description'}</Text>
                <Text style={styles.heroDate}>{formatDate(transaction.date)}</Text>
              </View>
            </LiquidGlassCard>

            {/* Quick Info Row */}
            <View style={styles.quickInfoRow}>
              <LiquidGlassCard variant="light" size="sm" elevation="low" style={styles.quickInfoCard}>
                <View style={styles.quickInfoContent}>
                  <Ionicons name="pricetag-outline" size={16} color="rgba(0, 0, 0, 0.5)" />
                  <Text style={styles.quickInfoLabel}>Category</Text>
                  <Text style={styles.quickInfoValue}>{transaction.category?.name || 'Other'}</Text>
              </View>
              </LiquidGlassCard>

              <LiquidGlassCard variant="light" size="sm" elevation="low" style={styles.quickInfoCard}>
                <View style={styles.quickInfoContent}>
                  <Ionicons name="wallet-outline" size={16} color="rgba(0, 0, 0, 0.5)" />
                  <Text style={styles.quickInfoLabel}>Account</Text>
                  <Text style={styles.quickInfoValue}>{transaction.account?.name || 'Unknown'}</Text>
              </View>
              </LiquidGlassCard>
                </View>

            {/* Fund Source */}
              {fundInfo && (
              <LiquidGlassCard variant="mint" size="md" elevation="low" marginVertical={8}>
                <View style={styles.fundSourceRow}>
                  <View style={[styles.fundSourceIcon, { backgroundColor: fundConfig.bgColor }]}>
                    <Ionicons name={fundConfig.icon as any} size={18} color={fundConfig.color} />
                  </View>
                  <View style={styles.fundSourceInfo}>
                    <Text style={styles.fundSourceLabel}>Fund Source</Text>
                    <Text style={[styles.fundSourceValue, { color: fundConfig.color }]}>
                      {fundInfo.fundName}
                    </Text>
                  </View>
                </View>
              </LiquidGlassCard>
            )}

            {/* Balance Impact */}
            <LiquidGlassCard variant="crystal" size="lg" elevation="medium" marginVertical={8}>
              <View style={styles.sectionHeader}>
                <Ionicons name="analytics-outline" size={18} color="rgba(0, 0, 0, 0.6)" />
              <Text style={styles.sectionTitle}>Balance Impact</Text>
              </View>
              
              {beforeBalance !== null && afterBalance !== null ? (
                <View style={styles.balanceImpact}>
                  {/* Before */}
                  <View style={styles.balanceRow}>
                    <View style={styles.balanceLabel}>
                      <View style={styles.balanceDot} />
                      <Text style={styles.balanceLabelText}>Before</Text>
                    </View>
                    <Text style={styles.balanceValue}>{formatCurrency(beforeBalance)}</Text>
                  </View>
                  
                  {/* Arrow with Transaction Amount */}
                  <View style={styles.balanceArrow}>
                    <View style={styles.balanceArrowLine} />
                    <View style={[styles.transactionBadge, { backgroundColor: typeConfig.bgColor }]}>
                      <Text style={[styles.transactionBadgeText, { color: typeConfig.color }]}>
                        {typeConfig.prefix}{formatCurrency(Math.abs(transaction.amount))}
                    </Text>
                    </View>
                    <View style={styles.balanceArrowLine} />
                  </View>
                  
                  {/* After */}
                  <View style={styles.balanceRow}>
                    <View style={styles.balanceLabel}>
                      <View style={[styles.balanceDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.balanceLabelText}>After</Text>
                    </View>
                    <Text style={[styles.balanceValue, styles.balanceValueHighlight]}>
                      {formatCurrency(afterBalance)}
                    </Text>
                  </View>
                  
                  {/* Current Balance */}
                  {currentAccountBalance !== null && (
                    <View style={styles.currentBalanceSection}>
                      <View style={styles.currentBalanceRow}>
                        <Text style={styles.currentBalanceLabel}>Current Account Balance</Text>
                      <Text style={styles.currentBalanceValue}>{formatCurrency(currentAccountBalance)}</Text>
                      </View>
                    </View>
                  )}
                        </View>
              ) : (
                <View style={styles.balanceUnavailable}>
                  <Ionicons name="information-circle-outline" size={18} color="rgba(0, 0, 0, 0.4)" />
                  <Text style={styles.balanceUnavailableText}>Balance information unavailable</Text>
                      </View>
              )}
            </LiquidGlassCard>

            {/* Additional Details */}
            {(transaction.notes || transaction.location || transaction.reference_number) && (
              <LiquidGlassCard variant="light" size="md" elevation="low" marginVertical={8}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="document-text-outline" size={18} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.sectionTitle}>Additional Details</Text>
                </View>

                <View style={styles.detailsList}>
                  {transaction.notes && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Notes</Text>
                      <Text style={styles.detailValue}>{transaction.notes}</Text>
                  </View>
                  )}
                  {transaction.location && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Location</Text>
                      <Text style={styles.detailValue}>{transaction.location}</Text>
                </View>
              )}
                  {transaction.reference_number && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Reference</Text>
                      <Text style={styles.detailValue}>{transaction.reference_number}</Text>
            </View>
                  )}
                </View>
              </LiquidGlassCard>
            )}

            {/* Tags */}
            {transaction.tags && transaction.tags.length > 0 && (
              <LiquidGlassCard variant="light" size="md" elevation="low" marginVertical={8}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="pricetags-outline" size={18} color="rgba(0, 0, 0, 0.6)" />
                  <Text style={styles.sectionTitle}>Tags</Text>
                </View>
                <View style={styles.tagsContainer}>
                  {transaction.tags.map((tag, index) => (
                    <View key={index} style={styles.tag}>
                      <Ionicons name="bookmark" size={12} color="#10B981" />
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </LiquidGlassCard>
            )}

            {/* Daily Activity */}
            <LiquidGlassCard variant="light" size="md" elevation="low" marginVertical={8}>
              <View style={styles.dailyActivity}>
                <View style={styles.dailyActivityIcon}>
                <Ionicons name="calendar" size={20} color="#3B82F6" />
                </View>
                <View style={styles.dailyActivityInfo}>
                  <Text style={styles.dailyActivityCount}>
                    {dailyTransactionCount} transaction{dailyTransactionCount !== 1 ? 's' : ''} on this day
                  </Text>
                  <Text style={styles.dailyActivitySubtext}>
                    {dailyTransactionCount > 1 
                      ? `You had ${dailyTransactionCount} transactions on ${formatDate(transaction.date)}`
                      : 'This was your only transaction this day'}
                  </Text>
                </View>
              </View>
            </LiquidGlassCard>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
              <Pressable 
                style={({ pressed }) => [styles.actionButton, styles.actionButtonPrimary, { opacity: pressed ? 0.9 : 1 }]}
                      onPress={() => setEditModalVisible(true)}
                    >
                <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                <Text style={styles.actionButtonTextPrimary}>Edit</Text>
              </Pressable>
                  
              <Pressable 
                style={({ pressed }) => [styles.actionButton, styles.actionButtonSecondary, { opacity: pressed ? 0.9 : 1 }]}
              >
                <Ionicons name="copy-outline" size={18} color="#000000" />
                <Text style={styles.actionButtonTextSecondary}>Duplicate</Text>
              </Pressable>
                  
              <Pressable 
                style={({ pressed }) => [styles.actionButton, styles.actionButtonDanger, { opacity: pressed ? 0.9 : 1 }]}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={styles.actionButtonTextDanger}>Delete</Text>
              </Pressable>
                </View>

            {/* Related Transactions */}
            {relatedTransactions.length > 0 && (
              <LiquidGlassCard variant="light" size="md" elevation="low" marginVertical={8}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="git-branch-outline" size={18} color="rgba(0, 0, 0, 0.6)" />
                <Text style={styles.sectionTitle}>Related Transactions</Text>
                </View>

                <View style={styles.relatedList}>
                  {relatedTransactions.map((relatedTxn) => {
                    const relatedConfig = getTypeConfig(relatedTxn.type);
                    return (
                      <Pressable 
                        key={relatedTxn.id} 
                        style={({ pressed }) => [styles.relatedItem, { opacity: pressed ? 0.8 : 1 }]}
                        onPress={() => router.push(`/transaction/${relatedTxn.id}`)}
                      >
                        <View style={[styles.relatedIcon, { backgroundColor: relatedConfig.bgColor }]}>
                      <Ionicons 
                            name={getTransactionIcon(relatedTxn.type, relatedTxn.category?.name) as any} 
                            size={16} 
                            color={relatedConfig.color} 
                      />
                        </View>
                      <View style={styles.relatedInfo}>
                          <Text style={styles.relatedDescription}>{relatedTxn.description}</Text>
                          <Text style={styles.relatedCategory}>{relatedTxn.category?.name || 'Other'}</Text>
                      </View>
                        <Text style={[styles.relatedAmount, { color: relatedConfig.color }]}>
                          {relatedConfig.prefix}{formatCurrency(Math.abs(relatedTxn.amount))}
                      </Text>
                        <Ionicons name="chevron-forward" size={16} color="rgba(0, 0, 0, 0.3)" />
                      </Pressable>
                    );
                  })}
                </View>
              </LiquidGlassCard>
            )}

            {/* Bottom Spacing */}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>

        {/* Edit Transaction Modal */}
        <EditTransactionModal
          visible={editModalVisible}
          onClose={() => setEditModalVisible(false)}
          transaction={transaction}
          onSuccess={() => {
            fetchTransactionDetails();
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  // Hero Card
  heroCard: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroAmount: {
    fontSize: 40,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 12,
  },
  heroBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
  },
  heroBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroDescription: {
    fontSize: 17,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
    textAlign: 'center',
  },
  heroDate: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  // Quick Info
  quickInfoRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 8,
  },
  quickInfoCard: {
    flex: 1,
  },
  quickInfoContent: {
    alignItems: 'center',
    gap: 6,
  },
  quickInfoLabel: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickInfoValue: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  // Fund Source
  fundSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fundSourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fundSourceInfo: {
    flex: 1,
  },
  fundSourceLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 2,
  },
  fundSourceValue: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  // Balance Impact
  balanceImpact: {
    gap: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  balanceLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  balanceLabelText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  balanceValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  balanceValueHighlight: {
    color: '#10B981',
    fontSize: 18,
  },
  balanceArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  balanceArrowLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  transactionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 12,
  },
  transactionBadgeText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  currentBalanceSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  currentBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    padding: 12,
    borderRadius: 12,
  },
  currentBalanceLabel: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: '#3B82F6',
  },
  currentBalanceValue: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
    color: '#3B82F6',
  },
  balanceUnavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: 12,
  },
  balanceUnavailableText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  // Details
  detailsList: {
    gap: 12,
  },
  detailItem: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.45)',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    lineHeight: 20,
  },
  // Tags
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  tagText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: '#10B981',
  },
  // Daily Activity
  dailyActivity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dailyActivityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dailyActivityInfo: {
    flex: 1,
  },
  dailyActivityCount: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  dailyActivitySubtext: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
  },
  actionButtonPrimary: {
    backgroundColor: '#000000',
  },
  actionButtonSecondary: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  actionButtonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  actionButtonTextPrimary: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionButtonTextSecondary: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  actionButtonTextDanger: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#EF4444',
  },
  // Related Transactions
  relatedList: {
    gap: 8,
  },
  relatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
  },
  relatedIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  relatedInfo: {
    flex: 1,
  },
  relatedDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    color: '#000000',
    marginBottom: 2,
  },
  relatedCategory: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  relatedAmount: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    marginRight: 8,
  },
  // Loading & Error States
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingContent: {
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorContent: {
    alignItems: 'center',
    gap: 12,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  errorDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
  },
  errorButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
