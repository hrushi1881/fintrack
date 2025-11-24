import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import DateTimePicker from '@react-native-community/datetimepicker';
import GlassCard from '@/components/GlassCard';
import InlineAccountSelector from '@/components/InlineAccountSelector';
import CategoryPicker from '@/components/CategoryPicker';
import { getLiabilityAccounts } from '@/utils/liabilityFunds';

interface DrawLiabilityFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  liabilityId: string;
}

interface Distribution {
  accountId: string;
  amount: string;
}

export default function DrawLiabilityFundsModal({
  visible,
  onClose,
  onSuccess,
  liabilityId,
}: DrawLiabilityFundsModalProps) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { currency } = useSettings();
  const {
    accounts: realtimeAccounts,
    globalRefresh,
    refreshAccounts,
    refreshAccountFunds,
  } = useRealtimeData();

  const [liability, setLiability] = useState<any>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [liabilityAccounts, setLiabilityAccounts] = useState<Array<{ account: any; balance: number }>>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([{ accountId: '', amount: '' }]);
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (visible && liabilityId && user) {
      fetchLiability();
      fetchLiabilityAccounts();
    }
  }, [visible, liabilityId, user]);

  useEffect(() => {
    if (visible) {
      setDistributions([{ accountId: '', amount: '' }]);
      setDate(new Date());
      setNotes('');
      setCategory('');
      setErrors({});
    }
  }, [visible]);

  const fetchLiabilityAccounts = async () => {
    if (!liabilityId || !user) return;
    try {
      const accountsWithFunds = await getLiabilityAccounts(liabilityId, true);
      setLiabilityAccounts(accountsWithFunds);
    } catch (error) {
      console.error('Error fetching liability accounts:', error);
      setLiabilityAccounts([]);
    }
  };

  // Compute destination accounts: Show accounts with liability funds first, then all other accounts
  const destinationAccounts = useMemo(() => {
    const accountMap = new Map<string, any & { liabilityFundBalance?: number }>();

    // First priority: Add accounts that have liability funds for this liability
    liabilityAccounts.forEach(({ account, balance }) => {
      if (
        account &&
        account.type !== 'liability' &&
        account.type !== 'goals_savings' &&
        (account.is_active === true || account.is_active === undefined || account.is_active === null)
      ) {
        accountMap.set(account.id, {
          ...account,
          liabilityFundBalance: balance,
        });
      }
    });

    // Second priority: Add all other active accounts (from realtimeAccounts)
    if (realtimeAccounts && realtimeAccounts.length > 0) {
      realtimeAccounts.forEach((acc) => {
        if (
          acc.type !== 'goals_savings' &&
          acc.type !== 'liability' &&
          (acc.is_active === true || acc.is_active === undefined || acc.is_active === null)
        ) {
          if (!accountMap.has(acc.id)) {
            accountMap.set(acc.id, {
              ...acc,
              liabilityFundBalance: 0,
            });
          }
        }
      });
    }

    const result = Array.from(accountMap.values());

    // Sort: accounts with liability funds first, then others
    result.sort((a, b) => {
      const aHasFunds = (a.liabilityFundBalance ?? 0) > 0;
      const bHasFunds = (b.liabilityFundBalance ?? 0) > 0;

      if (aHasFunds && !bHasFunds) return -1;
      if (bHasFunds && !aHasFunds) return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [liabilityAccounts, realtimeAccounts]);

  const fetchLiability = async () => {
    try {
      const { data, error } = await supabase
        .from('liabilities')
        .select('*')
        .eq('id', liabilityId)
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      setLiability(data);
    } catch (error) {
      console.error('Error fetching liability:', error);
      Alert.alert('Error', 'Failed to load liability details');
    }
  };

  const calculateAvailable = () => {
    if (!liability) return 0;
    if (liability.available_funds !== null && liability.available_funds !== undefined) {
      return Math.max(0, parseFloat(liability.available_funds.toString()));
    }
    const original = parseFloat(liability.original_amount || '0');
    const disbursed = parseFloat(liability.disbursed_amount || '0');
    return Math.max(0, original - disbursed);
  };

  const calculateTotalDistribution = () => {
    return distributions.reduce((sum, dist) => {
      const amt = parseFloat(dist.amount || '0');
      return sum + amt;
    }, 0);
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    const totalDistributed = calculateTotalDistribution();
    const available = calculateAvailable();

    if (distributions.length === 0 || distributions.every((d) => !d.accountId || !d.amount)) {
      newErrors.distributions = 'Please add at least one account distribution';
    }

    distributions.forEach((dist, index) => {
      if (!dist.accountId) {
        newErrors[`account_${index}`] = 'Please select an account';
      }
      if (!dist.amount || isNaN(parseFloat(dist.amount)) || parseFloat(dist.amount) <= 0) {
        newErrors[`amount_${index}`] = 'Please enter a valid amount';
      }
    });

    if (totalDistributed <= 0) {
      newErrors.total = 'Total distribution must be greater than 0';
    }

    if (totalDistributed > available && available > 0) {
      newErrors.total = `⚠️ Overdrawing by ${formatCurrencyAmount(totalDistributed - available, currency)}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddAccount = () => {
    setDistributions([...distributions, { accountId: '', amount: '' }]);
  };

  const handleRemoveAccount = (index: number) => {
    if (distributions.length > 1) {
      const newDistributions = distributions.filter((_, i) => i !== index);
      setDistributions(newDistributions);
    }
  };

  const handleDistributionChange = (index: number, field: 'accountId' | 'amount', value: string) => {
    const newDistributions = [...distributions];
    newDistributions[index] = { ...newDistributions[index], [field]: value };
    setDistributions(newDistributions);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const totalDistributed = calculateTotalDistribution();
    const available = calculateAvailable();
    const isOverdraw = totalDistributed > available && available > 0;
    const overdrawAmount = isOverdraw ? totalDistributed - available : 0;

    if (isOverdraw) {
      Alert.alert(
        'Overdraw Limit',
        `You're trying to draw ${formatCurrencyAmount(totalDistributed, currency)}, but only ${formatCurrencyAmount(available, currency)} is available.\n\nDo you want to raise your total loan limit by ${formatCurrencyAmount(overdrawAmount, currency)}?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Yes, Raise Limit',
            onPress: () => executeDraw(totalDistributed, overdrawAmount),
          },
        ]
      );
      return;
    }

    executeDraw(totalDistributed, 0);
  };

  const executeDraw = async (totalDistributed: number, overdrawAmount: number) => {
    setIsLoading(true);

    try {
      const distributionsArray = distributions
        .filter((d) => d.accountId && d.amount)
        .map((d) => ({
          account_id: d.accountId,
          amount: parseFloat(d.amount),
        }));

      // ✅ FIXED: Use receive_to_account_bucket to ADD funds to accounts (not spend)
      for (const distribution of distributionsArray) {
        // Get account details
        const account = destinationAccounts.find((a) => a.id === distribution.account_id);
        if (!account) {
          throw new Error(`Account not found: ${distribution.account_id}`);
        }

        // Use receive_to_account_bucket to add funds to the account's liability fund
        const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
          p_user_id: user?.id,
          p_account_id: distribution.account_id,
          p_bucket_type: 'borrowed', // Liability funds are 'borrowed' type
          p_bucket_id: liabilityId, // Reference to the liability
          p_amount: distribution.amount,
          p_category: category || 'Loan Disbursement',
          p_description: notes.trim() || `Draw funds from ${liability?.title || 'liability'}`,
          p_date: date.toISOString().split('T')[0],
          p_currency: account.currency || currency || 'INR',
        });

        if (receiveError) {
          throw new Error(`Failed to draw funds to account: ${receiveError.message}`);
        }
      }

      // Update liability available_funds (decrease by total drawn)
      const { data: currentLiability, error: fetchError } = await supabase
        .from('liabilities')
        .select('available_funds, original_amount, disbursed_amount')
        .eq('id', liabilityId)
        .eq('user_id', user?.id)
        .single();

      if (!fetchError && currentLiability) {
        const currentAvailable =
          currentLiability.available_funds !== null && currentLiability.available_funds !== undefined
            ? parseFloat(currentLiability.available_funds.toString())
            : (currentLiability.original_amount || 0) - (currentLiability.disbursed_amount || 0);

        const newAvailable = Math.max(0, currentAvailable - totalDistributed);

        // If overdrawing, increase original_amount
        const updateData: any = {
          available_funds: newAvailable,
          updated_at: new Date().toISOString(),
        };

        if (overdrawAmount > 0) {
          const currentOriginal = parseFloat(currentLiability.original_amount || '0');
          updateData.original_amount = currentOriginal + overdrawAmount;
        }

        const { error: updateLiabilityError } = await supabase
          .from('liabilities')
          .update(updateData)
          .eq('id', liabilityId)
          .eq('user_id', user?.id);

        if (updateLiabilityError) {
          console.error('Error updating liability:', updateLiabilityError);
        }
      }

      // Refresh data
      await Promise.all([refreshAccounts(), refreshAccountFunds()]);
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (overdrawAmount > 0) {
        Alert.alert(
          'Limit Increased',
          `Limit increased by ${formatCurrencyAmount(overdrawAmount, currency)}.\n\nDo you want to update loan terms?`,
          [
            {
              text: 'Not Now',
              style: 'cancel',
              onPress: handleDrawComplete,
            },
            {
              text: 'Update Terms',
              onPress: handleDrawComplete,
            },
          ]
        );
      } else {
        showNotification({
          type: 'success',
          title: 'Funds Drawn',
          amount: totalDistributed,
          currency: currency,
          description: liability?.title || 'Liability',
          account: `${distributionsArray.length} account(s)`,
          date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
        handleDrawComplete();
      }
    } catch (error) {
      console.error('Error drawing funds:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to draw funds. Please try again.';
      Alert.alert('Error', errorMessage);
      setIsLoading(false);
    }
  };

  const handleDrawComplete = async () => {
    await Promise.all([refreshAccounts(), refreshAccountFunds()]);
    await globalRefresh();
    await new Promise((resolve) => setTimeout(resolve, 100));

    onSuccess?.();
    setDistributions([{ accountId: '', amount: '' }]);
    setDate(new Date());
    setNotes('');
    setErrors({});
    setIsLoading(false);
    onClose();
  };

  const available = calculateAvailable();
  const totalDistributed = calculateTotalDistribution();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Draw Funds</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Liability Info */}
          {liability && (
            <GlassCard padding={20} marginVertical={12}>
              <Text style={styles.infoLabel}>Liability</Text>
              <Text style={styles.infoValue}>{liability.title}</Text>
              <View style={styles.infoRow}>
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxLabel}>Available</Text>
                  <Text style={styles.infoBoxValue}>
                    {formatCurrencyAmount(available, currency)}
                  </Text>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxLabel}>Total Owed</Text>
                  <Text style={styles.infoBoxValue}>
                    {formatCurrencyAmount(parseFloat(liability.original_amount || '0'), currency)}
                  </Text>
                </View>
              </View>
            </GlassCard>
          )}

          {/* Date Selection */}
          <GlassCard padding={20} marginVertical={12}>
            <Text style={styles.sectionLabel}>Date</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={20} color="#000000" />
              <Text style={styles.dateText}>
                {date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
              <Ionicons name="chevron-down" size={16} color="rgba(0, 0, 0, 0.5)" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) {
                    setDate(selectedDate);
                  }
                }}
                maximumDate={new Date()}
              />
            )}
          </GlassCard>

          {/* Distributions */}
          <GlassCard padding={20} marginVertical={12}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Distribute to Accounts</Text>
              <TouchableOpacity onPress={handleAddAccount} style={styles.addButton}>
                <Ionicons name="add-circle" size={24} color="#10B981" />
              </TouchableOpacity>
            </View>

            {distributions.map((dist, index) => (
              <View key={index} style={styles.distributionCard}>
                <View style={styles.distributionHeader}>
                  <Text style={styles.distributionNumber}>Account {index + 1}</Text>
                  {distributions.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveAccount(index)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.distributionContent}>
                  <View style={styles.accountSelectorContainer}>
                    <Text style={styles.distributionLabel}>Account</Text>
                    {destinationAccounts.length > 0 ? (
                      <>
                        <InlineAccountSelector
                          accounts={destinationAccounts}
                          selectedAccountId={dist.accountId}
                          onSelect={(account) => handleDistributionChange(index, 'accountId', account.id)}
                          label=""
                          showBalance={true}
                        />
                        {/* Show liability fund balance if account has funds */}
                        {dist.accountId && (() => {
                          const selectedAccount = destinationAccounts.find(a => a.id === dist.accountId);
                          const liabilityBalance = selectedAccount?.liabilityFundBalance || 0;
                          if (liabilityBalance > 0) {
                            return (
                              <View style={styles.liabilityFundBadge}>
                                <Ionicons name="card-outline" size={14} color="#6366F1" />
                                <Text style={styles.liabilityFundText}>
                                  {liability.title} Funds: {formatCurrencyAmount(liabilityBalance, currency)}
                                </Text>
                              </View>
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      <View style={styles.emptyAccounts}>
                        <Ionicons name="wallet-outline" size={24} color="rgba(0, 0, 0, 0.3)" />
                        <Text style={styles.emptyAccountsText}>No accounts available</Text>
                      </View>
                    )}
                    {errors[`account_${index}`] && (
                      <Text style={styles.errorText}>{errors[`account_${index}`]}</Text>
                    )}
                  </View>

                  <View style={styles.amountContainer}>
                    <Text style={styles.distributionLabel}>Amount</Text>
                    <TextInput
                      style={[styles.amountInput, errors[`amount_${index}`] && styles.errorInput]}
                      value={dist.amount}
                      onChangeText={(value) => handleDistributionChange(index, 'amount', value)}
                      placeholder="0.00"
                      placeholderTextColor="rgba(0, 0, 0, 0.3)"
                      keyboardType="decimal-pad"
                    />
                    {errors[`amount_${index}`] && (
                      <Text style={styles.errorText}>{errors[`amount_${index}`]}</Text>
                    )}
                  </View>
                </View>
              </View>
            ))}

            {errors.distributions && <Text style={styles.errorText}>{errors.distributions}</Text>}
          </GlassCard>

          {/* Total Distribution */}
          {totalDistributed > 0 && (
            <GlassCard
              padding={20}
              marginVertical={12}
              style={totalDistributed > available && available > 0 ? styles.warningCard : undefined}
            >
              <Text style={styles.totalLabel}>Total Distribution</Text>
              <Text style={styles.totalValue}>
                {formatCurrencyAmount(totalDistributed, currency)}
              </Text>
              {available > 0 ? (
                <>
                  {totalDistributed > available ? (
                    <Text style={styles.totalWarning}>
                      ⚠️ Overdrawing by {formatCurrencyAmount(totalDistributed - available, currency)}
                    </Text>
                  ) : (
                    <Text style={styles.totalRemaining}>
                      Remaining: {formatCurrencyAmount(available - totalDistributed, currency)}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.totalWarning}>⚠️ No funds available to draw</Text>
              )}
            </GlassCard>
          )}

          {/* Category Selection */}
          <GlassCard padding={20} marginVertical={12}>
            <Text style={styles.sectionLabel}>Category</Text>
            <CategoryPicker
              selectedCategoryId={category}
              onCategorySelect={(cat) => setCategory(cat?.id || '')}
              activityType="liability"
              placeholder="Select category (optional)"
            />
            {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}
          </GlassCard>

          {/* Notes */}
          <GlassCard padding={20} marginVertical={12}>
            <Text style={styles.sectionLabel}>Notes (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes about this withdrawal..."
              placeholderTextColor="rgba(0, 0, 0, 0.3)"
              multiline
              numberOfLines={3}
            />
          </GlassCard>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.drawButton, isLoading && styles.drawButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
                <Text style={styles.drawButtonText}>Draw Funds</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoBox: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    padding: 12,
  },
  infoBoxLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 4,
  },
  infoBoxValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  sectionLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addButton: {
    padding: 4,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
  },
  distributionCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  distributionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  distributionNumber: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  removeButton: {
    padding: 4,
  },
  distributionContent: {
    gap: 16,
  },
  accountSelectorContainer: {
    flex: 1,
  },
  distributionLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.7)',
    marginBottom: 8,
  },
  amountContainer: {
    flex: 1,
  },
  amountInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  errorInput: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    marginBottom: 8,
    textAlign: 'center',
  },
  totalValue: {
    fontSize: 24,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
    textAlign: 'center',
    marginBottom: 4,
  },
  totalRemaining: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
  },
  totalWarning: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: '#F59E0B',
    textAlign: 'center',
    marginTop: 4,
  },
  warningCard: {
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  textInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    minHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  drawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 20,
    marginBottom: 32,
  },
  drawButtonDisabled: {
    opacity: 0.6,
  },
  drawButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  liabilityFundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  liabilityFundText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: '#6366F1',
  },
  emptyAccounts: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyAccountsText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.5)',
  },
});
