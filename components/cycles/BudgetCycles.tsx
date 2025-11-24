import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetCycles } from '@/hooks/useBudgetCycles';
import CycleCard from './CycleCard';
import { Transaction } from '@/types';
import GlassmorphCard from '../GlassmorphCard';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';

interface BudgetCyclesProps {
  budgetId: string;
  maxCycles?: number;
}

export default function BudgetCycles({
  budgetId,
  maxCycles = 12,
}: BudgetCyclesProps) {
  const {
    budget,
    cycles,
    currentCycle,
    statistics,
    loading,
    error,
    updateCycleNote,
  } = useBudgetCycles({ budgetId, maxCycles });

  const { currency } = useSettings();

  const [selectedCycleForNote, setSelectedCycleForNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

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

  if (!budget || cycles.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="calendar-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>No cycles to display</Text>
      </View>
    );
  }

  const currentCycleData = currentCycle?.metadata;
  const percentUsed = currentCycleData?.percentUsed || 0;
  const isOverBudget = percentUsed > 100;
  const isWarning = percentUsed > 90 && percentUsed <= 100;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Budget Cycles</Text>
        <Text style={styles.subtitle}>
          Track spending across budget periods
        </Text>
      </View>

      {/* Current Budget Progress */}
      {currentCycle && currentCycleData && (
        <GlassmorphCard
          style={styles.progressCard}
          overlayColor={isOverBudget ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)'}
          borderRadius={16}
        >
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Current Period</Text>
            <Text style={[
              styles.progressPercentage,
              { color: isOverBudget ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981' }
            ]}>
              {percentUsed}%
            </Text>
          </View>

          <View style={styles.progressAmounts}>
            <View>
              <Text style={styles.progressLabel}>Spent</Text>
              <Text style={[
                styles.progressValue,
                { color: isOverBudget ? '#EF4444' : '#1F2937' }
              ]}>
                {formatCurrency(currentCycleData.spent)}
              </Text>
            </View>
            <View style={styles.progressDivider} />
            <View>
              <Text style={styles.progressLabel}>Budget</Text>
              <Text style={styles.progressValue}>
                {formatCurrency(currentCycleData.budgetAmount)}
              </Text>
            </View>
          </View>

          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${Math.min(percentUsed, 100)}%`,
                  backgroundColor: isOverBudget ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981',
                },
              ]}
            />
          </View>

          {!isOverBudget && (
            <Text style={styles.remainingText}>
              {formatCurrency(currentCycleData.remaining)} remaining
            </Text>
          )}
          {isOverBudget && (
            <Text style={styles.overbudgetText}>
              {formatCurrency(currentCycleData.spent - currentCycleData.budgetAmount)} over budget!
            </Text>
          )}
        </GlassmorphCard>
      )}

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
              {statistics.withinBudget}
            </Text>
            <Text style={styles.statLabel}>Within</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>
              {statistics.overBudget}
            </Text>
            <Text style={styles.statLabel}>Over</Text>
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
            <Text style={styles.statsRowLabel}>Total Spent</Text>
            <Text style={styles.statsRowValue}>{formatCurrency(statistics.totalActual)}</Text>
          </View>
          <View style={styles.statsRowItem}>
            <Text style={styles.statsRowLabel}>Avg. Usage</Text>
            <Text style={styles.statsRowValue}>{statistics.averageUsage}%</Text>
          </View>
        </View>
      </GlassmorphCard>

      {/* Current Cycle Highlight */}
      {currentCycle && (
        <View style={styles.currentCycleContainer}>
          <View style={styles.currentCycleHeader}>
            <Ionicons name="time" size={20} color="#10B981" />
            <Text style={styles.currentCycleTitle}>Current Period</Text>
          </View>
          <CycleCard
            cycle={currentCycle}
            onAddNote={handleAddNote}
            onViewTransactions={handleViewTransactions}
            expanded={true}
          />
        </View>
      )}

      {/* All Cycles List */}
      <View style={styles.cyclesListContainer}>
        <Text style={styles.cyclesListTitle}>All Periods</Text>
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
              Period {selectedCycleForNote}
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
  progressCard: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
  },
  progressPercentage: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
  },
  progressAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  progressLabel: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
    marginBottom: 4,
    textAlign: 'center',
  },
  progressValue: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: '#1F2937',
    textAlign: 'center',
  },
  progressBarContainer: {
    height: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 5,
  },
  remainingText: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#10B981',
    textAlign: 'center',
  },
  overbudgetText: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#EF4444',
    textAlign: 'center',
    fontWeight: '600',
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
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#10B981',
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
    color: '#10B981',
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
    backgroundColor: '#10B981',
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

