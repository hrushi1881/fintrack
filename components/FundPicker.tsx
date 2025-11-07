import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';

export type FundBucketType = 'personal' | 'liability' | 'goal';

export interface FundBucket {
  type: FundBucketType;
  id: string; // liability_id or goal_id, or 'personal' for personal funds
  name: string;
  amount: number;
  color?: string;
}

interface FundPickerProps {
  visible: boolean;
  onClose: () => void;
  accountId: string;
  onSelect: (bucket: FundBucket) => void;
  amount?: number; // Optional: amount being spent/transferred
}

export default function FundPicker({
  visible,
  onClose,
  accountId,
  onSelect,
  amount = 0,
}: FundPickerProps) {
  const { currency } = useSettings();
  const { getAccountBreakdown } = useLiabilities();
  const { goals } = useRealtimeData();
  const [breakdown, setBreakdown] = useState<any>(null);
  const [goalPortions, setGoalPortions] = useState<Array<{ goal_id: string; amount: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && accountId) {
      loadBreakdown();
    }
  }, [visible, accountId]);

  const loadBreakdown = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const accountBreakdown = await getAccountBreakdown(accountId);
      setBreakdown(accountBreakdown);

      // Also fetch goal portions for this account
      const { data: goalPortionsData } = await supabase
        .from('account_goal_portions')
        .select('goal_id, amount')
        .eq('account_id', accountId);

      setGoalPortions(goalPortionsData || []);
    } catch (error) {
      console.error('Error loading account breakdown:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildBuckets = (): FundBucket[] => {
    const buckets: FundBucket[] = [];

    // Personal funds
    if (breakdown && breakdown.personal > 0) {
      buckets.push({
        type: 'personal',
        id: 'personal',
        name: 'Personal Funds',
        amount: breakdown.personal,
      });
    }

    // Liability portions
    if (breakdown?.liabilityPortions) {
      breakdown.liabilityPortions.forEach((portion: any) => {
        if (portion.amount > 0) {
          buckets.push({
            type: 'liability',
            id: portion.liabilityId,
            name: portion.liabilityName || 'Liability',
            amount: portion.amount,
            color: '#EF4444',
          });
        }
      });
    }

    // Goal portions
    if (goalPortions.length > 0) {
      goalPortions.forEach((gp) => {
        const goal = goals.find((g) => g.id === gp.goal_id);
        if (goal && parseFloat(gp.amount) > 0) {
          buckets.push({
            type: 'goal',
            id: gp.goal_id,
            name: goal.name || 'Goal',
            amount: parseFloat(gp.amount),
            color: goal.color || '#10B981',
          });
        }
      });
    }

    return buckets;
  };

  const buckets = buildBuckets();
  const hasEnoughFunds = (bucket: FundBucket) => {
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

            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : buckets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="wallet-outline" size={48} color="rgba(255,255,255,0.5)" />
                <Text style={styles.emptyText}>No funds available</Text>
              </View>
            ) : (
              <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {buckets.map((bucket) => {
                  const canUse = hasEnoughFunds(bucket);
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
                          <View style={[styles.bucketIcon, { backgroundColor: (bucket.color || '#6366F1') + '20' }]}>
                            <Ionicons
                              name={
                                bucket.type === 'personal'
                                  ? 'person'
                                  : bucket.type === 'liability'
                                  ? 'card'
                                  : 'flag'
                              }
                              size={20}
                              color={bucket.color || '#6366F1'}
                            />
                          </View>
                          <Text style={styles.bucketName}>{bucket.name}</Text>
                        </View>
                        <Text style={[styles.bucketAmount, !canUse && styles.bucketAmountDisabled]}>
                          {formatCurrencyAmount(bucket.amount, currency)}
                        </Text>
                      </View>
                      {amount > 0 && !canUse && (
                        <Text style={styles.insufficientText}>
                          Insufficient funds
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
  insufficientText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
    marginLeft: 48,
  },
});

