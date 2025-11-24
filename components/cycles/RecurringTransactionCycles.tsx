import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRecurringTransactionCycles } from '@/hooks/useRecurringTransactionCycles';
import CycleCard from './CycleCard';
import { Transaction } from '@/types';
import { Cycle } from '@/utils/cycles';
import GlassmorphCard from '../GlassmorphCard';
import UnifiedPaymentModal from '@/app/modals/unified-payment-modal';

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
    updateCycleNote,
  } = useRecurringTransactionCycles({ recurringTransactionId, maxCycles });

  const [selectedCycleForNote, setSelectedCycleForNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [selectedCycleForBill, setSelectedCycleForBill] = useState<Cycle | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);

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
    setShowBillModal(true);
  };

  const handleBillModalClose = () => {
    setShowBillModal(false);
    setSelectedCycleForBill(null);
  };

  const handleBillSuccess = () => {
    handleBillModalClose();
  };

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

      {/* Statistics Card */}
      <GlassmorphCard
        style={styles.statsCard}
        overlayColor="rgba(99, 102, 241, 0.05)"
        borderRadius={16}
      >
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{statistics.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>
              {statistics.paid}
            </Text>
            <Text style={styles.statLabel}>Paid</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>
              {statistics.notPaid}
            </Text>
            <Text style={styles.statLabel}>Not Paid</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#6B7280' }]}>
              {statistics.upcoming}
            </Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statsRowItem}>
            <Text style={styles.statsRowLabel}>Completion Rate</Text>
            <Text style={styles.statsRowValue}>{statistics.completionRate}%</Text>
          </View>
          <View style={styles.statsRowItem}>
            <Text style={styles.statsRowLabel}>On-Time Rate</Text>
            <Text style={styles.statsRowValue}>{statistics.onTimeRate}%</Text>
          </View>
        </View>
      </GlassmorphCard>

      {/* Current Cycle Highlight */}
      {currentCycle && (
        <View style={styles.currentCycleContainer}>
          <View style={styles.currentCycleHeader}>
            <Ionicons name="time" size={20} color="#6366F1" />
            <Text style={styles.currentCycleTitle}>Current Cycle</Text>
          </View>
          <CycleCard
            cycle={currentCycle}
            onAddNote={handleAddNote}
            onViewTransactions={handleViewTransactions}
            onCreateBill={handleCreateBill}
            expanded={true}
          />
        </View>
      )}

      {/* All Cycles List */}
      <View style={styles.cyclesListContainer}>
        <Text style={styles.cyclesListTitle}>All Cycles</Text>
        <ScrollView
          style={styles.cyclesList}
          showsVerticalScrollIndicator={false}
        >
          {cycles.map((cycle) => (
            <CycleCard
              key={cycle.cycleNumber}
              cycle={cycle}
              onAddNote={handleAddNote}
              onViewTransactions={handleViewTransactions}
              onCreateBill={handleCreateBill}
            />
          ))}
        </ScrollView>
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

      {/* Create Bill Modal */}
      {selectedCycleForBill && recurringTransaction && (
        <UnifiedPaymentModal
          visible={showBillModal}
          onClose={handleBillModalClose}
          onSuccess={handleBillSuccess}
          createBillFromCycle={{
            cycleNumber: selectedCycleForBill.cycleNumber,
            expectedAmount: selectedCycleForBill.expectedAmount,
            expectedDate: selectedCycleForBill.expectedDate,
            recurringTransactionId: recurringTransaction.id,
          }}
          prefillAmount={selectedCycleForBill.expectedAmount}
          prefillDate={new Date(selectedCycleForBill.expectedDate)}
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

