import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRecurringTransactionCycles } from '@/hooks/useRecurringTransactionCycles';
import CycleSnapshot from './CycleSnapshot';
import { Transaction } from '@/types';
import { Cycle } from '@/utils/cycles';
import UnifiedPaymentModal from '@/app/modals/unified-payment-modal';
import ScheduleCyclePaymentModal from '@/app/modals/schedule-cycle-payment';
import SetCycleOverrideModal from '@/app/modals/set-cycle-override';
import { useAuth } from '@/contexts/AuthContext';

interface RecurringTransactionCyclesProps {
  recurringTransactionId: string;
  maxCycles?: number;
}

export default function RecurringTransactionCycles({
  recurringTransactionId,
  maxCycles = 12,
}: RecurringTransactionCyclesProps) {
  const {
    recurringTransaction,
    cycles,
    currentCycle,
    statistics,
    loading,
    error,
    refresh,
    updateCycleNote,
    scheduleCyclePayment,
    setCycleOverride,
    removeCycleOverride,
  } = useRecurringTransactionCycles({ recurringTransactionId, maxCycles });

  const [selectedCycleForNote, setSelectedCycleForNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [selectedCycleForBill, setSelectedCycleForBill] = useState<Cycle | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedCycleForSchedule, setSelectedCycleForSchedule] = useState<Cycle | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedCycleForOverride, setSelectedCycleForOverride] = useState<Cycle | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  const handleAddNote = (cycleNumber: number, currentNote: string) => {
    setSelectedCycleForNote(cycleNumber);
    setNoteText(currentNote);
    setNoteModalVisible(true);
  };

  const handleSaveNote = async () => {
    if (selectedCycleForNote === null) return;

    setSavingNote(true);
    try {
      await updateCycleNote(selectedCycleForNote, noteText);
      setNoteModalVisible(false);
      setSelectedCycleForNote(null);
      setNoteText('');
    } catch (err) {
      console.error('Failed to save note:', err);
      alert('Failed to save note. Please try again.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleViewTransactions = (transactions: Transaction[]) => {
    // TODO: Navigate to transaction list or show transactions modal
    console.log('View transactions:', transactions);
  };

  const handleCreateBill = (cycle: Cycle) => {
    setSelectedCycleForBill(cycle);
    setSelectedBillId(null);
    setShowBillModal(true);
  };

  const handleBillModalClose = () => {
    setShowBillModal(false);
    setSelectedCycleForBill(null);
    setSelectedBillId(null);
  };

  const handleBillSuccess = async () => {
    // Refresh cycles data after bill is created or payment is made
    console.log('[RecurringTransactionCycles] Bill success - refreshing cycles data');
    await refresh();
    handleBillModalClose();
    // Force a small delay then refresh again to ensure all data is updated
    setTimeout(() => {
      refresh();
    }, 500);
  };

  const handleSchedulePayment = (cycle: Cycle) => {
    setSelectedCycleForSchedule(cycle);
    setShowScheduleModal(true);
  };

  const handleScheduleSuccess = async () => {
    // Refresh cycles data after payment is scheduled
    console.log('[RecurringTransactionCycles] Schedule success - refreshing cycles data');
    await refresh();
    setShowScheduleModal(false);
    setSelectedCycleForSchedule(null);
  };

  const handleSetOverride = (cycle: Cycle) => {
    setSelectedCycleForOverride(cycle);
    setShowOverrideModal(true);
  };

  const handleOverrideSuccess = async () => {
    // Refresh cycles data after override is saved
    console.log('[RecurringTransactionCycles] Override success - refreshing cycles data');
    await refresh();
    setShowOverrideModal(false);
    setSelectedCycleForOverride(null);
  };

  const getCycleOverride = (cycle: Cycle) => {
    if (!recurringTransaction) return undefined;
    const { getCycleOverrides } = require('@/utils/recurringCycleScheduling');
    const overrides = getCycleOverrides(recurringTransaction);
    return overrides[cycle.cycleNumber];
  };

  const paymentsForCycle = (cycle?: Cycle) =>
    cycle?.transactions?.map((tx: Transaction) => ({
      id: tx.id,
      amount: tx.amount,
      date: tx.date,
      status: tx.metadata?.payment_status || tx.metadata?.status || 'paid',
      cycleNumber: tx.metadata?.cycle_number,
    })) || [];

  const selectedBill = useMemo(() => {
    if (!selectedBillId) return null;
    for (const c of cycles) {
      const bill = c.bills?.find((b) => b.id === selectedBillId);
      if (bill) return bill;
    }
    return null;
  }, [selectedBillId, cycles]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading cycles...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (cycles.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="calendar-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>No cycles to display</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Cycles</Text>
        <Text style={styles.subtitle}>
          Payment history and upcoming commitments
        </Text>
      </View>

      {/* Stacked Cycle Snapshots */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <Text style={styles.title}>Cycles</Text>
        <Text style={styles.subtitle}>
          {recurringTransaction?.type === 'income' 
            ? 'Expected vs received income per cycle.' 
            : 'Target vs paid, bills, and payments per cycle.'}
        </Text>
        <View style={styles.snapshotStack}>
          {cycles.map((cycle) => (
            <View key={`${cycle.cycleNumber}-${cycle.startDate}-${cycle.endDate}`} style={{ marginBottom: 16 }}>
              <CycleSnapshot
                cycle={cycle}
                bills={cycle.bills}
                payments={paymentsForCycle(cycle)}
                onViewSchedule={() => {
                  handleCreateBill(cycle);
                }}
                onGenerateBill={() => handleCreateBill(cycle)}
                onPayBill={(bill) => {
                  setSelectedCycleForBill(cycle);
                  setSelectedBillId(bill.id);
                  setShowBillModal(true);
                }}
                onSeeAllPayments={() => {}}
                onEditRules={() => handleSetOverride(cycle)}
                transactionType={recurringTransaction?.type as 'income' | 'expense'}
              />
          </View>
          ))}
        </View>
      </View>

      {/* Note Modal */}
      <Modal
        visible={noteModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {noteText ? 'Edit Note' : 'Add Note'}
              </Text>
              <TouchableOpacity
                onPress={() => setNoteModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Cycle {selectedCycleForNote}
            </Text>

            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Enter your note here..."
              placeholderTextColor="#9CA3AF"
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setNoteModalVisible(false)}
                disabled={savingNote}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveNote}
                disabled={savingNote}
              >
                {savingNote ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonTextSave}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save/Pay Modal */}
      {selectedCycleForBill && recurringTransaction && (
        <UnifiedPaymentModal
          visible={showBillModal}
          onClose={handleBillModalClose}
          onSuccess={handleBillSuccess}
          billId={selectedBillId || undefined}
          createBillFromCycle={
            selectedBillId
              ? undefined
              : {
            cycleNumber: selectedCycleForBill.cycleNumber,
            expectedAmount: selectedCycleForBill.expectedAmount,
            expectedDate: selectedCycleForBill.expectedDate,
            recurringTransactionId: recurringTransaction.id,
                }
          }
          recurringTransactionId={recurringTransaction.id}
          prefillAmount={selectedBill?.totalAmount ?? selectedCycleForBill.expectedAmount}
          prefillDate={
            selectedBill?.dueDate
              ? new Date(selectedBill.dueDate)
              : new Date(selectedCycleForBill.expectedDate)
          }
        />
      )}

      {/* Schedule Payment Modal */}
      {selectedCycleForSchedule && recurringTransaction && (
        <ScheduleCyclePaymentModal
          visible={showScheduleModal}
          onClose={handleScheduleSuccess}
          cycle={selectedCycleForSchedule}
          recurringTransaction={recurringTransaction}
          onSuccess={handleScheduleSuccess}
        />
      )}

      {/* Set Cycle Override Modal */}
      {selectedCycleForOverride && recurringTransaction && (
        <SetCycleOverrideModal
          visible={showOverrideModal}
          onClose={handleOverrideSuccess}
          cycle={selectedCycleForOverride}
          currentOverride={getCycleOverride(selectedCycleForOverride)}
          onSuccess={handleOverrideSuccess}
          onSave={async (override) => {
            await setCycleOverride(selectedCycleForOverride.cycleNumber, {
              date: override.expectedDate,
              amount: override.expectedAmount,
              minimumAmount: override.minimumAmount,
              notes: override.notes,
            });
          }}
          onRemove={async () => {
            await removeCycleOverride(selectedCycleForOverride.cycleNumber);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  snapshotStack: {
    gap: 12,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#EF4444',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
    marginTop: 12,
  },
  statsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statsRowItem: {
    alignItems: 'center',
  },
  statsRowLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 4,
  },
  statsRowValue: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#6366F1',
  },
  currentCycleContainer: {
    marginBottom: 16,
  },
  currentCycleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  currentCycleTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#6366F1',
  },
  cyclesListContainer: {
    flex: 1,
  },
  cyclesListTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  cyclesList: {
    flex: 1,
    paddingHorizontal: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    color: '#1F2937',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 16,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F2937',
    minHeight: 120,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalButtonSave: {
    backgroundColor: '#6366F1',
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#6B7280',
  },
  modalButtonTextSave: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
  },
});

