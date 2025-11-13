import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import {
  checkLiabilitySettlementStatus,
  executeLiabilitySettlement,
  SettlementAdjustment,
  SettlementAdjustmentType,
} from '@/utils/liabilities';
import CalendarDatePicker from '@/components/CalendarDatePicker';

interface LiabilityRecord {
  id: string;
  title: string;
  description?: string;
  liability_type: string;
  current_balance: number;
  original_amount?: number;
  disbursed_amount?: number;
  interest_rate_apy?: number;
  periodical_payment?: number;
  start_date?: string;
  targeted_payoff_date?: string;
  next_due_date?: string;
  last_payment_date?: string;
  status: string;
  color?: string;
  icon?: string;
  currency?: string;
}

interface LiabilitySettlementModalProps {
  visible: boolean;
  liability: LiabilityRecord | null;
  onClose: () => void;
  onComplete: () => void;
}

const ADJUSTMENT_TYPES: Array<{
  type: SettlementAdjustmentType;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    type: 'repayment',
    label: 'Repayment',
    icon: 'card-outline',
    description: 'Reduce remaining liability',
  },
  {
    type: 'refund',
    label: 'Refund / Remove Funds',
    icon: 'arrow-undo-outline',
    description: 'Remove liability-tagged money from account',
  },
  {
    type: 'convert_to_personal',
    label: 'Convert to Personal',
    icon: 'swap-horizontal-outline',
    description: 'Reclassify borrowed to personal funds',
  },
  {
    type: 'expense_writeoff',
    label: 'Expense / Write-off',
    icon: 'receipt-outline',
    description: 'Mark used-up money as spent',
  },
];

export default function LiabilitySettlementModal({
  visible,
  liability,
  onClose,
  onComplete,
}: LiabilitySettlementModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { showNotification } = useNotification();
  const { accounts, refreshAccounts, refreshAccountFunds, refreshTransactions, globalRefresh } = useRealtimeData();

  const [loading, setLoading] = useState(true);
  const [settlementStatus, setSettlementStatus] = useState<any>(null);
  const [adjustments, setAdjustments] = useState<SettlementAdjustment[]>([]);
  const [showAddAdjustment, setShowAddAdjustment] = useState(false);
  const [currentAdjustment, setCurrentAdjustment] = useState<Partial<SettlementAdjustment>>({
    type: 'repayment',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    accountId: null,
    note: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showFinalPreview, setShowFinalPreview] = useState(false);
  const [finalAction, setFinalAction] = useState<'forgive_debt' | 'erase_funds' | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [executing, setExecuting] = useState(false);

  // Load settlement status when modal opens
  useEffect(() => {
    if (visible && liability && user) {
      loadSettlementStatus();
    }
  }, [visible, liability, user]);

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setAdjustments([]);
      setShowAddAdjustment(false);
      setShowFinalPreview(false);
      setDeleteConfirmation('');
      setFinalAction(null);
      setCurrentAdjustment({
        type: 'repayment',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        accountId: null,
        note: '',
      });
    }
  }, [visible]);

  const loadSettlementStatus = async () => {
    if (!liability || !user) return;

    setLoading(true);
    try {
      const status = await checkLiabilitySettlementStatus(liability.id, user.id);
      setSettlementStatus(status);
    } catch (error: any) {
      console.error('Error loading settlement status:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to load settlement status',
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate projected balances after adjustments
  const projectedBalances = useMemo(() => {
    if (!settlementStatus) return null;

    let projectedRemaining = settlementStatus.remainingOwed;
    let projectedFunds = settlementStatus.liabilityFundsInAccounts;

    adjustments.forEach((adj) => {
      switch (adj.type) {
        case 'repayment':
          projectedRemaining = Math.max(0, projectedRemaining - adj.amount);
          break;
        case 'refund':
          projectedFunds = Math.max(0, projectedFunds - adj.amount);
          break;
        case 'convert_to_personal':
          projectedFunds = Math.max(0, projectedFunds - adj.amount);
          break;
        case 'expense_writeoff':
          projectedFunds = Math.max(0, projectedFunds - adj.amount);
          break;
      }
    });

    const isBalanced = projectedRemaining === 0 && projectedFunds === 0;
    const unaccountedAmount = Math.abs(projectedRemaining - projectedFunds);

    return {
      projectedRemaining,
      projectedFunds,
      isBalanced,
      unaccountedAmount,
    };
  }, [settlementStatus, adjustments]);

  const handleAddAdjustment = () => {
    if (!currentAdjustment.type || !currentAdjustment.amount || currentAdjustment.amount <= 0) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Please select a type and enter a valid amount',
      });
      return;
    }

    if (currentAdjustment.type !== 'repayment' && !currentAdjustment.accountId) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Please select an account for this adjustment',
      });
      return;
    }

    const newAdjustment: SettlementAdjustment = {
      id: Date.now().toString(),
      type: currentAdjustment.type!,
      amount: currentAdjustment.amount!,
      date: currentAdjustment.date || new Date().toISOString().split('T')[0],
      accountId: currentAdjustment.accountId || null,
      note: currentAdjustment.note,
    };

    setAdjustments([...adjustments, newAdjustment]);
    setCurrentAdjustment({
      type: 'repayment',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      accountId: null,
      note: '',
    });
    setShowAddAdjustment(false);
  };

  const handleRemoveAdjustment = (id: string) => {
    setAdjustments(adjustments.filter((adj) => adj.id !== id));
  };

  const handleExecuteSettlement = async () => {
    if (!liability || !user || !settlementStatus || !projectedBalances) return;

    if (deleteConfirmation !== 'DELETE') {
      showNotification({
        type: 'error',
        title: 'Confirmation Required',
        description: 'Please type DELETE to confirm',
      });
      return;
    }

    setExecuting(true);
    try {
      await executeLiabilitySettlement(
        liability.id,
        user.id,
        adjustments,
        finalAction || null,
        projectedBalances.unaccountedAmount > 0 ? projectedBalances.unaccountedAmount : undefined
      );

      showNotification({
        type: 'success',
        title: 'Liability Deleted',
        description: 'Liability has been settled and deleted successfully',
      });

      // Refresh all data
      await Promise.all([
        refreshAccounts(),
        refreshAccountFunds(),
        refreshTransactions(),
        globalRefresh(),
      ]);

      onComplete();
      onClose();
    } catch (error: any) {
      console.error('Error executing settlement:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to execute settlement',
      });
    } finally {
      setExecuting(false);
    }
  };

  // Filter accounts for adjustment selection
  const availableAccounts = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter(
      (acc) =>
        acc.type !== 'liability' &&
        acc.type !== 'goals_savings' &&
        (acc.is_active === true || acc.is_active === null) &&
        acc.currency === liability?.currency
    );
  }, [accounts, liability]);

  if (!liability || !settlementStatus) {
    return null;
  }

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, liability.currency || currency);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settle Liability</Text>
          <View style={styles.headerRight} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading settlement status...</Text>
          </View>
        ) : showFinalPreview ? (
          /* Final Preview */
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Final Preview</Text>
              <Text style={styles.sectionDescription}>
                Review the changes before confirming deletion. This action is final.
              </Text>

              <View style={styles.previewTable}>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Total Liability</Text>
                  <View style={styles.previewValues}>
                    <Text style={styles.previewBefore}>{formatCurrency(settlementStatus.totalLoan)}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#6B7280" />
                    <Text style={styles.previewAfter}>{formatCurrency(0)}</Text>
                  </View>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Remaining Owed</Text>
                  <View style={styles.previewValues}>
                    <Text style={styles.previewBefore}>{formatCurrency(settlementStatus.remainingOwed)}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#6B7280" />
                    <Text style={styles.previewAfter}>
                      {formatCurrency(projectedBalances?.projectedRemaining || 0)}
                    </Text>
                  </View>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Liability Funds in Accounts</Text>
                  <View style={styles.previewValues}>
                    <Text style={styles.previewBefore}>{formatCurrency(settlementStatus.liabilityFundsInAccounts)}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#6B7280" />
                    <Text style={styles.previewAfter}>
                      {formatCurrency(projectedBalances?.projectedFunds || 0)}
                    </Text>
                  </View>
                </View>
              </View>

              {projectedBalances && projectedBalances.unaccountedAmount > 0 && (
                <View style={styles.unaccountedWarning}>
                  <Ionicons name="warning-outline" size={20} color="#F59E0B" />
                  <Text style={styles.unaccountedText}>
                    Unaccounted amount: {formatCurrency(projectedBalances.unaccountedAmount)}
                  </Text>
                  {finalAction === 'forgive_debt' && (
                    <Text style={styles.unaccountedAction}>Debt will be forgiven</Text>
                  )}
                  {finalAction === 'erase_funds' && (
                    <Text style={styles.unaccountedAction}>Funds will be erased from accounts</Text>
                  )}
                </View>
              )}

              <View style={styles.confirmationSection}>
                <Text style={styles.confirmationLabel}>
                  Type <Text style={styles.confirmationBold}>DELETE</Text> to confirm
                </Text>
                <TextInput
                  style={styles.confirmationInput}
                  value={deleteConfirmation}
                  onChangeText={setDeleteConfirmation}
                  placeholder="DELETE"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="characters"
                />
                <Text style={styles.confirmationNote}>
                  This action is final and will adjust your accounts accordingly.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  (deleteConfirmation !== 'DELETE' || executing) && styles.deleteButtonDisabled,
                ]}
                onPress={handleExecuteSettlement}
                disabled={deleteConfirmation !== 'DELETE' || executing}
              >
                {executing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.deleteButtonText}>Confirm Deletion</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Warning Note */}
            <View style={styles.warningNote}>
              <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
              <Text style={styles.warningText}>
                Deleting a liability permanently removes its history. Before deleting, make sure your balances reflect
                the real world.
              </Text>
            </View>

            {/* Header Message */}
            <View style={styles.headerSection}>
              <Text style={styles.headerMessage}>
                Let's make sure your numbers are exact before deleting this liability.
              </Text>
              <Text style={styles.headerSubtext}>
                You still owe {formatCurrency(settlementStatus.remainingOwed)} and have{' '}
                {formatCurrency(settlementStatus.liabilityFundsInAccounts)} of borrowed funds distributed across
                accounts. You can add transactions to correct or balance these before confirming deletion.
              </Text>
            </View>

            {/* Section 1: Overview Snapshot */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Overview Snapshot</Text>
              <View style={styles.snapshotTable}>
                <View style={styles.snapshotRow}>
                  <Text style={styles.snapshotLabel}>Total Loan</Text>
                  <Text style={styles.snapshotValue}>{formatCurrency(settlementStatus.totalLoan)}</Text>
                  <View style={styles.snapshotStatus}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={styles.snapshotStatusText}>✓</Text>
                  </View>
                </View>
                <View style={styles.snapshotRow}>
                  <Text style={styles.snapshotLabel}>Remaining Owed</Text>
                  <Text style={styles.snapshotValue}>{formatCurrency(settlementStatus.remainingOwed)}</Text>
                  <View style={styles.snapshotStatus}>
                    {settlementStatus.remainingOwed > 0 ? (
                      <>
                        <Ionicons name="warning" size={16} color="#F59E0B" />
                        <Text style={[styles.snapshotStatusText, styles.snapshotStatusWarning]}>⚠ Needs check</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={styles.snapshotStatusText}>✓</Text>
                      </>
                    )}
                  </View>
                </View>
                <View style={styles.snapshotRow}>
                  <Text style={styles.snapshotLabel}>Liability Funds in Accounts</Text>
                  <Text style={styles.snapshotValue}>{formatCurrency(settlementStatus.liabilityFundsInAccounts)}</Text>
                  <View style={styles.snapshotStatus}>
                    {settlementStatus.overfundedBy > 0 ? (
                      <>
                        <Ionicons name="warning" size={16} color="#EF4444" />
                        <Text style={[styles.snapshotStatusText, styles.snapshotStatusError]}>
                          Overfunded by {formatCurrency(settlementStatus.overfundedBy)}
                        </Text>
                      </>
                    ) : settlementStatus.liabilityFundsInAccounts > 0 ? (
                      <>
                        <Ionicons name="warning" size={16} color="#F59E0B" />
                        <Text style={[styles.snapshotStatusText, styles.snapshotStatusWarning]}>
                          Should equal or less than remaining
                        </Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={styles.snapshotStatusText}>✓</Text>
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* Section 2: Add Adjustment Transactions */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Add Settlement Transactions</Text>
                <Text style={styles.sectionDescription}>
                  You can add transactions below to fix these differences.
                </Text>
              </View>

              {adjustments.length > 0 && (
                <View style={styles.adjustmentsList}>
                  {adjustments.map((adj) => {
                    const typeInfo = ADJUSTMENT_TYPES.find((t) => t.type === adj.type);
                    const account = adj.accountId ? accounts.find((a) => a.id === adj.accountId) : null;
                    return (
                      <View key={adj.id} style={styles.adjustmentCard}>
                        <View style={styles.adjustmentHeader}>
                          <View style={styles.adjustmentTypeInfo}>
                            <Ionicons name={typeInfo?.icon as any} size={20} color="#10B981" />
                            <Text style={styles.adjustmentTypeLabel}>{typeInfo?.label}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.removeAdjustmentButton}
                            onPress={() => handleRemoveAdjustment(adj.id)}
                          >
                            <Ionicons name="close-circle" size={20} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.adjustmentAmount}>{formatCurrency(adj.amount)}</Text>
                        {account && <Text style={styles.adjustmentAccount}>{account.name}</Text>}
                        {adj.note && <Text style={styles.adjustmentNote}>{adj.note}</Text>}
                        <Text style={styles.adjustmentDate}>{new Date(adj.date).toLocaleDateString()}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {!showAddAdjustment ? (
                <TouchableOpacity
                  style={styles.addAdjustmentButton}
                  onPress={() => setShowAddAdjustment(true)}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#10B981" />
                  <Text style={styles.addAdjustmentButtonText}>Add Adjustment Transaction</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.adjustmentForm}>
                  <Text style={styles.formLabel}>Adjustment Type</Text>
                  <View style={styles.typeButtons}>
                    {ADJUSTMENT_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.type}
                        style={[
                          styles.typeButton,
                          currentAdjustment.type === type.type && styles.typeButtonActive,
                        ]}
                        onPress={() => setCurrentAdjustment({ ...currentAdjustment, type: type.type })}
                      >
                        <Ionicons
                          name={type.icon as any}
                          size={18}
                          color={currentAdjustment.type === type.type ? '#FFFFFF' : '#6B7280'}
                        />
                        <Text
                          style={[
                            styles.typeButtonText,
                            currentAdjustment.type === type.type && styles.typeButtonTextActive,
                          ]}
                        >
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {currentAdjustment.type && (
                    <Text style={styles.typeDescription}>
                      {ADJUSTMENT_TYPES.find((t) => t.type === currentAdjustment.type)?.description}
                    </Text>
                  )}

                  {(currentAdjustment.type === 'refund' ||
                    currentAdjustment.type === 'convert_to_personal' ||
                    currentAdjustment.type === 'expense_writeoff') && (
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Account</Text>
                      <View style={styles.accountList}>
                        {availableAccounts.length === 0 ? (
                          <Text style={styles.emptyText}>No accounts available</Text>
                        ) : (
                          availableAccounts.map((account) => (
                            <TouchableOpacity
                              key={account.id}
                              style={[
                                styles.accountOption,
                                currentAdjustment.accountId === account.id && styles.accountOptionActive,
                              ]}
                              onPress={() => setCurrentAdjustment({ ...currentAdjustment, accountId: account.id })}
                            >
                              <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                                <Ionicons name={account.icon as any} size={16} color="white" />
                              </View>
                              <Text style={styles.accountOptionText}>{account.name}</Text>
                              {currentAdjustment.accountId === account.id && (
                                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                              )}
                            </TouchableOpacity>
                          ))
                        )}
                      </View>
                    </View>
                  )}

                  {currentAdjustment.type === 'repayment' && (
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Payment Account</Text>
                      <View style={styles.accountList}>
                        {availableAccounts.length === 0 ? (
                          <Text style={styles.emptyText}>No accounts available</Text>
                        ) : (
                          availableAccounts.map((account) => (
                            <TouchableOpacity
                              key={account.id}
                              style={[
                                styles.accountOption,
                                currentAdjustment.accountId === account.id && styles.accountOptionActive,
                              ]}
                              onPress={() => setCurrentAdjustment({ ...currentAdjustment, accountId: account.id })}
                            >
                              <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                                <Ionicons name={account.icon as any} size={16} color="white" />
                              </View>
                              <Text style={styles.accountOptionText}>{account.name}</Text>
                              {currentAdjustment.accountId === account.id && (
                                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                              )}
                            </TouchableOpacity>
                          ))
                        )}
                      </View>
                    </View>
                  )}

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Amount</Text>
                    <TextInput
                      style={styles.amountInput}
                      keyboardType="numeric"
                      value={currentAdjustment.amount?.toString() || ''}
                      onChangeText={(text) =>
                        setCurrentAdjustment({ ...currentAdjustment, amount: parseFloat(text) || 0 })
                      }
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Date</Text>
                    <TouchableOpacity
                      style={styles.dateInput}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={styles.dateInputText}>
                        {currentAdjustment.date
                          ? new Date(currentAdjustment.date).toLocaleDateString()
                          : 'Select Date'}
                      </Text>
                      <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Note (Optional)</Text>
                    <TextInput
                      style={styles.noteInput}
                      value={currentAdjustment.note || ''}
                      onChangeText={(text) => setCurrentAdjustment({ ...currentAdjustment, note: text })}
                      placeholder="Add a note..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      numberOfLines={2}
                    />
                  </View>

                  <View style={styles.formActions}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        setShowAddAdjustment(false);
                        setCurrentAdjustment({
                          type: 'repayment',
                          amount: 0,
                          date: new Date().toISOString().split('T')[0],
                          accountId: null,
                          note: '',
                        });
                      }}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addButton} onPress={handleAddAdjustment}>
                      <Text style={styles.addButtonText}>Add Adjustment</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Auto-Validation Display */}
            {projectedBalances && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Projected Balances</Text>
                <View style={styles.projectedBalances}>
                  <View style={styles.projectedRow}>
                    <Text style={styles.projectedLabel}>Remaining Owed</Text>
                    <Text
                      style={[
                        styles.projectedValue,
                        projectedBalances.projectedRemaining === 0
                          ? styles.projectedValueSuccess
                          : styles.projectedValueWarning,
                      ]}
                    >
                      {formatCurrency(projectedBalances.projectedRemaining)}
                    </Text>
                  </View>
                  <View style={styles.projectedRow}>
                    <Text style={styles.projectedLabel}>Liability Funds in Accounts</Text>
                    <Text
                      style={[
                        styles.projectedValue,
                        projectedBalances.projectedFunds === 0
                          ? styles.projectedValueSuccess
                          : styles.projectedValueWarning,
                      ]}
                    >
                      {formatCurrency(projectedBalances.projectedFunds)}
                    </Text>
                  </View>
                  {projectedBalances.isBalanced && (
                    <View style={styles.balancedIndicator}>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                      <Text style={styles.balancedText}>All Balanced - Ready for Deletion</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Section 3: If Still Unbalanced */}
            {projectedBalances &&
              !projectedBalances.isBalanced &&
              projectedBalances.unaccountedAmount > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Handle Unaccounted Amount</Text>
                  <Text style={styles.unaccountedPrompt}>
                    You still have {formatCurrency(projectedBalances.unaccountedAmount)} unaccounted. How should we
                    handle this difference?
                  </Text>
                  <View style={styles.finalActionButtons}>
                    <TouchableOpacity
                      style={[
                        styles.finalActionButton,
                        finalAction === 'forgive_debt' && styles.finalActionButtonActive,
                      ]}
                      onPress={() => setFinalAction('forgive_debt')}
                    >
                      <Ionicons
                        name="heart-outline"
                        size={20}
                        color={finalAction === 'forgive_debt' ? '#FFFFFF' : '#6B7280'}
                      />
                      <Text
                        style={[
                          styles.finalActionButtonText,
                          finalAction === 'forgive_debt' && styles.finalActionButtonTextActive,
                        ]}
                      >
                        Forgive / Write off debt
                      </Text>
                      <Text
                        style={[
                          styles.finalActionButtonSubtext,
                          finalAction === 'forgive_debt' && styles.finalActionButtonSubtextActive,
                        ]}
                      >
                        Convert that {formatCurrency(projectedBalances.unaccountedAmount)} into personal money
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.finalActionButton,
                        finalAction === 'erase_funds' && styles.finalActionButtonActive,
                      ]}
                      onPress={() => setFinalAction('erase_funds')}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={finalAction === 'erase_funds' ? '#FFFFFF' : '#6B7280'}
                      />
                      <Text
                        style={[
                          styles.finalActionButtonText,
                          finalAction === 'erase_funds' && styles.finalActionButtonTextActive,
                        ]}
                      >
                        Erase borrowed funds
                      </Text>
                      <Text
                        style={[
                          styles.finalActionButtonSubtext,
                          finalAction === 'erase_funds' && styles.finalActionButtonSubtextActive,
                        ]}
                      >
                        Deduct {formatCurrency(projectedBalances.unaccountedAmount)} from linked accounts
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.finalActionButton}
                      onPress={() => {
                        setFinalAction(null);
                        setShowFinalPreview(false);
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={20} color="#6B7280" />
                      <Text style={styles.finalActionButtonText}>Cancel delete</Text>
                      <Text style={styles.finalActionButtonSubtext}>Go back and fix manually</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

            {/* Continue to Preview Button */}
            {projectedBalances && (
              <TouchableOpacity
                style={[
                  styles.continueButton,
                  (!projectedBalances.isBalanced &&
                    projectedBalances.unaccountedAmount > 0 &&
                    !finalAction) &&
                    styles.continueButtonDisabled,
                ]}
                onPress={() => setShowFinalPreview(true)}
                disabled={
                  !projectedBalances.isBalanced &&
                  projectedBalances.unaccountedAmount > 0 &&
                  !finalAction
                }
              >
                <Text style={styles.continueButtonText}>Continue to Preview</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {/* Footer Note */}
            <View style={styles.footerNote}>
              <Text style={styles.footerText}>Everything in FinTrack balances — even when you walk away.</Text>
            </View>
          </ScrollView>
        )}

        {/* Date Picker */}
        <CalendarDatePicker
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onSelectDate={(date) => {
            setCurrentAdjustment({ ...currentAdjustment, date: date.toISOString().split('T')[0] });
            setShowDatePicker(false);
          }}
          title="Select Date"
          initialDate={currentAdjustment.date ? new Date(currentAdjustment.date) : new Date()}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    fontWeight: '900',
    color: '#000000',
  },
  headerRight: {
    width: 34,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  warningNote: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#92400E',
    lineHeight: 18,
  },
  headerSection: {
    marginBottom: 24,
  },
  headerMessage: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  headerSubtext: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 16,
  },
  snapshotTable: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  snapshotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  snapshotLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#374151',
  },
  snapshotValue: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginRight: 12,
  },
  snapshotStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  snapshotStatusText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#10B981',
  },
  snapshotStatusWarning: {
    color: '#F59E0B',
  },
  snapshotStatusError: {
    color: '#EF4444',
  },
  adjustmentsList: {
    gap: 12,
    marginBottom: 16,
  },
  adjustmentCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  adjustmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  adjustmentTypeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustmentTypeLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  removeAdjustmentButton: {
    padding: 4,
  },
  adjustmentAmount: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 4,
  },
  adjustmentAccount: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 4,
  },
  adjustmentNote: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#374151',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  adjustmentDate: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
  },
  addAdjustmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    gap: 8,
  },
  addAdjustmentButtonText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#10B981',
  },
  adjustmentForm: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 6,
  },
  typeButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  typeButtonText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  typeDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  formGroup: {
    marginBottom: 16,
  },
  accountList: {
    gap: 8,
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 12,
  },
  accountOptionActive: {
    borderColor: '#10B981',
    borderWidth: 2,
    backgroundColor: '#ECFDF5',
  },
  accountIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountOptionText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  amountInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  dateInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  dateInputText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
  },
  noteInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  addButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#FFFFFF',
  },
  projectedBalances: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  projectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  projectedLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#374151',
  },
  projectedValue: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  projectedValueSuccess: {
    color: '#10B981',
  },
  projectedValueWarning: {
    color: '#F59E0B',
  },
  balancedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    gap: 8,
  },
  balancedText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  unaccountedPrompt: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#374151',
    marginBottom: 16,
    lineHeight: 20,
  },
  finalActionButtons: {
    gap: 12,
  },
  finalActionButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  finalActionButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  finalActionButtonText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  finalActionButtonTextActive: {
    color: '#FFFFFF',
  },
  finalActionButtonSubtext: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  finalActionButtonSubtextActive: {
    color: '#FFFFFF',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
    gap: 8,
  },
  continueButtonDisabled: {
    backgroundColor: '#D1D5DB',
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#FFFFFF',
  },
  previewTable: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  previewLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#374151',
  },
  previewValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewBefore: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#6B7280',
  },
  previewAfter: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  unaccountedWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  unaccountedText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#92400E',
  },
  unaccountedAction: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#92400E',
    fontStyle: 'italic',
  },
  confirmationSection: {
    marginBottom: 20,
  },
  confirmationLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  confirmationBold: {
    fontFamily: 'Archivo Black',
    fontWeight: '900',
  },
  confirmationInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmationNote: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  deleteButtonDisabled: {
    backgroundColor: '#D1D5DB',
    opacity: 0.6,
  },
  deleteButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#FFFFFF',
  },
  footerNote: {
    padding: 20,
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    textAlign: 'center',
    padding: 20,
  },
});

