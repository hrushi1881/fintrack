import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';

export type FundBucketType = 'personal' | 'goal' | 'borrowed' | 'reserved' | 'sinking';

export interface FundBucket {
  type: FundBucketType;
  id: string;
  name: string;
  amount: number;
  color?: string;
  spendable: boolean;
  lockedReason?: string;
}

interface FundPickerProps {
  visible: boolean;
  onClose: () => void;
  accountId: string;
  onSelect: (bucket: FundBucket) => void;
  amount?: number; // Optional: amount being spent/transferred
  excludeGoalFunds?: boolean; // If true, exclude goal funds from selection (for payments/transfers)
  allowGoalFunds?: boolean; // If true, allow goal funds (for withdrawals only)
  excludeBorrowedFunds?: boolean; // If true, exclude borrowed/liability funds from selection (for income allocation)
}

export default function FundPicker({
  visible,
  onClose,
  accountId,
  onSelect,
  amount = 0,
  excludeGoalFunds = true, // Default: exclude goal funds (they cannot be spent/transferred)
  allowGoalFunds = false, // Default: don't allow goal funds
  excludeBorrowedFunds = false, // Default: allow borrowed funds (for payments)
}: FundPickerProps) {
  const { currency } = useSettings();
  const { liabilities } = useLiabilities();
  const { accountFunds, goals } = useRealtimeData();

  const accountFundsForAccount = useMemo(() => {
    if (!accountId) return [];
    return (accountFunds || []).filter((fund) => fund.account_id === accountId);
  }, [accountFunds, accountId]);

  const buildBuckets = (): FundBucket[] => {
    if (!accountId) return [];

    const buckets: FundBucket[] = [];
    const liabilitiesById = new Map(liabilities.map((liability) => [liability.id, liability]));
    const goalsById = new Map(goals.map((goal) => [goal.id, goal]));

    accountFundsForAccount.forEach((fund) => {
      const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance ?? 0;
      if (balance <= 0) return;

      // STRICT RULE: Goal funds are NEVER selectable in FundPicker for payments/transfers
      // They are locked and can only be withdrawn (not spent/transferred)
      // Goal funds should never appear for payments, transfers, or bill payments
      if (fund.fund_type === 'goal') {
        // Only include goal funds if explicitly allowed (withdrawals don't use FundPicker)
        if (!(allowGoalFunds === true && excludeGoalFunds === false)) {
          return; // Skip goal funds - they cannot be used for spending/transfers
        }
      }

      // Exclude borrowed/liability funds if requested (e.g., for income allocation)
      if (excludeBorrowedFunds && (fund.fund_type === 'borrowed' || fund.fund_type === 'liability')) {
        return; // Skip borrowed funds - income cannot be allocated to liability funds
      }

      const bucket: FundBucket = {
        type: fund.fund_type as FundBucketType,
        // For personal funds, use 'personal' as ID
        // For liability funds, use linked_liability_id as ID (for matching with liability)
        // For goal funds, use linked_goal_id as ID (for matching with goal)
        // For other funds, use fund.id
        id: fund.fund_type === 'personal' 
          ? 'personal' 
          : fund.fund_type === 'borrowed' && fund.linked_liability_id
          ? fund.linked_liability_id
          : fund.fund_type === 'goal' && fund.linked_goal_id
          ? fund.linked_goal_id
          : fund.id,
        name: fund.display_name || fund.name,
        amount: balance,
        color: fund.metadata?.color,
        spendable: fund.spendable,
        lockedReason: undefined,
      };

      if (bucket.type === 'goal') {
        // This should only happen if allowGoalFunds is explicitly true (rare case)
        const goal = fund.linked_goal_id ? goalsById.get(fund.linked_goal_id) : undefined;
        bucket.name = goal?.title || bucket.name || 'Goal Fund';
        bucket.color = goal?.color || '#F59E0B';
        bucket.lockedReason = 'Goal funds are locked. Withdraw to personal funds to use this money.';
        bucket.spendable = false; // Goal funds are never spendable
      } else if (bucket.type === 'borrowed') {
        const liability = fund.linked_liability_id
          ? liabilitiesById.get(fund.linked_liability_id)
          : undefined;
        bucket.name = liability?.title || bucket.name || 'Borrowed Funds';
        bucket.color = '#EF4444';
        bucket.lockedReason = fund.spendable
          ? undefined
          : 'Review the loan to unlock spendable balance.';
      } else if (bucket.type === 'reserved') {
        bucket.color = '#1C4B6C';
        if (!fund.spendable) {
          bucket.lockedReason = 'Reserved funds need to be released before spending.';
        }
      } else if (bucket.type === 'sinking') {
        bucket.color = '#4F6F3E';
        if (!fund.spendable) {
          bucket.lockedReason = 'Convert a portion to personal funds before spending.';
        }
      } else if (bucket.type === 'personal') {
        bucket.name = fund.display_name || 'Personal Funds';
        bucket.color = '#10B981';
      }

      buckets.push(bucket);
    });

    return buckets.sort((a, b) => {
      if (a.spendable === b.spendable) {
        return a.name.localeCompare(b.name);
      }
      return a.spendable ? -1 : 1;
    });
  };

  const buckets = buildBuckets();
  const hasEnoughFunds = (bucket: FundBucket) => {
    if (!bucket.spendable) return false;
    if (amount === 0) return true;
    return bucket.amount >= amount;
  };

  if (!visible || !accountId) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.container}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.title}>Select Fund Source</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {buckets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="wallet-outline" size={48} color="rgba(255,255,255,0.5)" />
                <Text style={styles.emptyText}>No funds available</Text>
              </View>
            ) : (
              <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {buckets.map((bucket) => {
                  const canUse = hasEnoughFunds(bucket);
                  const palette = (() => {
                    if (bucket.type === 'goal') {
                      return { icon: 'lock-closed-outline', color: bucket.color || '#F59E0B' };
                    }
                    if (bucket.type === 'borrowed') {
                      return { icon: 'card-outline', color: bucket.color || '#EF4444' };
                    }
                    if (bucket.type === 'reserved') {
                      return { icon: 'shield-outline', color: bucket.color || '#1C4B6C' };
                    }
                    if (bucket.type === 'sinking') {
                      return { icon: 'calendar-outline', color: bucket.color || '#4F6F3E' };
                    }
                    return { icon: 'wallet-outline', color: bucket.color || '#10B981' };
                  })();

                  return (
                    <TouchableOpacity
                      key={`${bucket.type}-${bucket.id}`}
                      style={[
                        styles.bucketItem,
                        !canUse && styles.bucketItemDisabled,
                      ]}
                      onPress={() => {
                        if (canUse) {
                          onSelect(bucket);
                          onClose();
                        }
                      }}
                      disabled={!canUse}
                    >
                      <View style={styles.bucketInfo}>
                        <View style={styles.bucketHeader}>
                          <View style={[styles.bucketIcon, { backgroundColor: (palette.color || '#6366F1') + '20' }]}>
                            <Ionicons
                              name={palette.icon as any}
                              size={20}
                              color={palette.color || '#6366F1'}
                            />
                          </View>
                          <View style={styles.bucketCopy}>
                          <Text style={styles.bucketName}>{bucket.name}</Text>
                            {!bucket.spendable ? (
                              <Text style={styles.bucketBadge}>Locked</Text>
                            ) : null}
                          </View>
                        </View>
                        <Text style={[styles.bucketAmount, !canUse && styles.bucketAmountDisabled]}>
                          {formatCurrencyAmount(bucket.amount, currency)}
                        </Text>
                      </View>
                      {(!bucket.spendable || (amount > 0 && !canUse)) && (
                        <Text style={styles.insufficientText}>
                          {bucket.spendable ? 'Insufficient funds' : bucket.lockedReason || 'Locked fund'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '85%',
    maxWidth: 400,
    maxHeight: '70%',
    backgroundColor: 'rgba(30, 30, 40, 0.95)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginTop: 12,
  },
  scrollView: {
    maxHeight: 400,
  },
  bucketItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  bucketItemDisabled: {
    opacity: 0.5,
  },
  bucketInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bucketCopy: {
    flex: 1,
  },
  bucketIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bucketName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    flex: 1,
  },
  bucketAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  bucketAmountDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  bucketBadge: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
  },
  insufficientText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
    marginLeft: 48,
  },
});

