import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, TextInput, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLiabilityCycles } from '@/hooks/useLiabilityCycles';
import { Transaction } from '@/types';
// Flat card style replaces glassmorphism
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import { Cycle } from '@/utils/cycles';
import LiabilityPaymentModal from '@/app/modals/liability-payment-modal';
import CycleSnapshot from './CycleSnapshot';

interface LiabilityCyclesProps {
  liabilityId: string;
  maxCycles?: number;
}

export default function LiabilityCycles({
  liabilityId,
  maxCycles = 12,
}: LiabilityCyclesProps) {
  const {
    liability,
    cycles,
    currentCycle,
    statistics,
    loading,
    error,
    updateCycleNote,
    updateCycleTarget,
    refresh,
  } = useLiabilityCycles({ liabilityId, maxCycles });

  const { currency } = useSettings();

  const [selectedCycleForNote, setSelectedCycleForNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [selectedCycleForBill, setSelectedCycleForBill] = useState<Cycle | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [editTargetModalVisible, setEditTargetModalVisible] = useState(false);
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [targetDateInput, setTargetDateInput] = useState('');
  const [targetDate, setTargetDate] = useState<Date>(new Date());
  const [minimumAmountInput, setMinimumAmountInput] = useState('');
  const [targetCycle, setTargetCycle] = useState<Cycle | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

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

  const handleOpenTarget = (cycle: Cycle) => {
    setTargetCycle(cycle);
    setTargetAmountInput(String(cycle.expectedAmount ?? ''));
    setMinimumAmountInput(String(cycle.minimumAmount ?? ''));
    const cycleDate = new Date(cycle.expectedDate);
    setTargetDate(cycleDate);
    setTargetDateInput(cycleDate.toISOString().split('T')[0]);
    setEditTargetModalVisible(true);
  };

  const handleSaveTarget = async () => {
    if (!targetCycle) return;
    const amt = parseFloat(targetAmountInput);
    if (isNaN(amt) || amt <= 0) {
      alert('Enter a valid target amount');
      return;
    }
    
    // Minimum is optional but must be valid if provided
    let minAmt: number | undefined;
    if (minimumAmountInput && minimumAmountInput !== '') {
      minAmt = parseFloat(minimumAmountInput);
      if (isNaN(minAmt) || minAmt < 0) {
        alert('Enter a valid minimum amount');
        return;
      }
      if (minAmt > amt) {
        alert('Minimum cannot be greater than target');
      return;
    }
    }
    
    const dateString = targetDate.toISOString().split('T')[0];
    try {
      await updateCycleTarget(targetCycle.cycleNumber, amt, dateString, minAmt);
      setEditTargetModalVisible(false);
      setTargetCycle(null);
      setTargetAmountInput('');
      setMinimumAmountInput('');
      setTargetDateInput('');
      setTargetDate(new Date());
    } catch (err) {
      console.error('Failed to update target:', err);
      alert('Failed to update target. Please try again.');
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setTargetDate(selectedDate);
      setTargetDateInput(selectedDate.toISOString().split('T')[0]);
      if (Platform.OS === 'ios') {
        setShowDatePicker(false);
      }
    }
  };

  const handleBillSuccess = async () => {
    // Refresh cycles data after bill is created or payment is made
    console.log('[LiabilityCycles] Bill success - refreshing cycles data');
    await refresh();
    handleBillModalClose();
    // Force a small delay then refresh again to ensure all data is updated
    setTimeout(() => {
    refresh();
    }, 500);
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

  if (!liability || cycles.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="calendar-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>No cycles to display</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stacked Cycle Snapshots */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <Text style={styles.title}>Payment Cycles</Text>
        <Text style={styles.subtitle}>Each cycle shows target vs paid, bills, and payments.</Text>
        <View style={styles.snapshotStack}>
          {cycles.map((cycle) => (
            <View key={cycle.cycleNumber} style={{ marginBottom: 16 }}>
              <CycleSnapshot
                cycle={cycle}
                bills={cycle.bills}
                payments={paymentsForCycle(cycle)}
                onViewSchedule={() => {
                  // opens unified save/pay for this cycle
                  handleCreateBill(cycle);
                }}
                onGenerateBill={() => handleCreateBill(cycle)}
                onPayBill={(bill) => {
                  setSelectedCycleForBill(cycle);
                  setSelectedBillId(bill.id);
                  setShowBillModal(true);
                }}
                onSeeAllPayments={() => {}}
                onEditRules={() => handleOpenTarget(cycle)}
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

      {/* Save/Pay Modal for Cycle */}
      {selectedCycleForBill && liability && (
        <LiabilityPaymentModal
          visible={showBillModal}
          onClose={handleBillModalClose}
          onSuccess={handleBillSuccess}
          liabilityId={liability.id}
          billId={selectedBillId || undefined}
          cycleNumber={selectedCycleForBill.cycleNumber}
          expectedAmount={selectedCycleForBill.expectedAmount}
          expectedDate={selectedCycleForBill.expectedDate}
          prefillAmount={selectedCycleForBill.expectedAmount}
          prefillDate={
            selectedBill?.dueDate ? new Date(selectedBill.dueDate) : new Date(selectedCycleForBill.expectedDate)
          }
        />
      )}

      {/* Edit Target Modal */}
      <Modal
        visible={editTargetModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditTargetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Cycle Rules</Text>
              <TouchableOpacity
                onPress={() => setEditTargetModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Cycle {targetCycle?.cycleNumber}
            </Text>
            
            <Text style={styles.modalLabel}>Target Amount</Text>
            <Text style={styles.modalHint}>Full payment expected for this cycle</Text>
            <TextInput
              style={styles.amountInput}
              value={targetAmountInput}
              onChangeText={setTargetAmountInput}
              placeholder="Enter target amount"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
            />
            
            <Text style={styles.modalLabel}>Minimum Payment</Text>
            <Text style={styles.modalHint}>Optional - minimum accepted to avoid late status</Text>
            <TextInput
              style={styles.amountInput}
              value={minimumAmountInput}
              onChangeText={setMinimumAmountInput}
              placeholder="Leave empty for no minimum"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
            />
            
            <Text style={styles.modalLabel}>Due Date</Text>
            <Text style={styles.modalHint}>Payment due date for this cycle</Text>
            <TouchableOpacity
              style={styles.dateInputButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.dateInputContent}>
                <Ionicons name="calendar-outline" size={20} color="#6366F1" />
                <Text style={styles.dateInputText}>
                  {targetDate.toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
            
            {Platform.OS === 'ios' && showDatePicker && (
              <DateTimePicker
                value={targetDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                style={styles.iosDatePicker}
              />
            )}
            {Platform.OS === 'android' && showDatePicker && (
              <DateTimePicker
                value={targetDate}
                mode="date"
                display="default"
                onChange={handleDateChange}
              />
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setEditTargetModalVisible(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveTarget}
              >
                <Text style={styles.modalButtonTextSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    backgroundColor: '#FFFFFF',
    shadowColor: '#1A331F',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    color: '#1F2937',
  },
  summaryDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  summaryDetailLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  summaryDetailValue: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#1F2937',
  },
  statsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    backgroundColor: '#FFFFFF',
    shadowColor: '#1A331F',
    shadowOpacity: 0.05,
    shadowRadius: 6,
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
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#EF4444',
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
    color: '#EF4444',
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
    fontSize: Platform.OS === 'ios' ? 22 : 20,
    fontFamily: 'Poppins-Bold',
    color: '#1F2937',
    letterSpacing: 0.2,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: Platform.OS === 'ios' ? 15 : 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
    marginBottom: 4,
    marginTop: 16,
  },
  modalHint: {
    fontSize: Platform.OS === 'ios' ? 12 : 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
    marginBottom: 10,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: Platform.OS === 'ios' ? 16 : 14,
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F2937',
    minHeight: Platform.OS === 'ios' ? 52 : 50,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  dateInputButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: Platform.OS === 'ios' ? 16 : 14,
    minHeight: Platform.OS === 'ios' ? 52 : 50,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  dateInputContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dateInputText: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F2937',
  },
  iosDatePicker: {
    width: '100%',
    height: 200,
    marginVertical: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: Platform.OS === 'ios' ? 16 : 14,
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#1F2937',
    minHeight: Platform.OS === 'ios' ? 120 : 100,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
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
    backgroundColor: '#EF4444',
  },
  modalButtonTextCancel: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#6B7280',
    letterSpacing: 0.2,
  },
  modalButtonTextSave: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

