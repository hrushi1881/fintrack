import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Goal } from '@/types';

interface WhatsNextModalProps {
  visible: boolean;
  onClose: () => void;
  onExtendGoal: () => void;
  onArchiveGoal: () => void;
  onWithdrawFunds: () => void;
  onDeleteGoal: () => void;
  goal: Goal;
}

export default function WhatsNextModal({
  visible,
  onClose,
  onExtendGoal,
  onArchiveGoal,
  onWithdrawFunds,
  onDeleteGoal,
  goal,
}: WhatsNextModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#000000', '#1F2937']}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>What's Next?</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>

            {/* Goal Info */}
            <View style={styles.goalInfo}>
              <View style={[styles.goalIcon, { backgroundColor: goal.color }]}>
                <Ionicons name={goal.icon as any} size={24} color="white" />
              </View>
              <View style={styles.goalDetails}>
                <Text style={styles.goalTitle}>{goal.title}</Text>
                <Text style={styles.goalStatus}>✅ Goal Achieved</Text>
              </View>
            </View>

            {/* Options */}
            <View style={styles.optionsContainer}>
              {/* Extend Goal */}
              <TouchableOpacity style={styles.optionButton} onPress={onExtendGoal}>
                <View style={styles.optionIcon}>
                  <Ionicons name="trending-up" size={24} color="#10B981" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Extend Goal</Text>
                  <Text style={styles.optionDescription}>
                    Keep the streak alive — add more or extend time
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </TouchableOpacity>

              {/* Archive Goal */}
              <TouchableOpacity style={styles.optionButton} onPress={onArchiveGoal}>
                <View style={styles.optionIcon}>
                  <Ionicons name="archive" size={24} color="#F59E0B" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Archive Goal</Text>
                  <Text style={styles.optionDescription}>
                    We'll save this story for later
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </TouchableOpacity>

              {/* Withdraw Funds */}
              <TouchableOpacity style={styles.optionButton} onPress={onWithdrawFunds}>
                <View style={styles.optionIcon}>
                  <Ionicons name="cash" size={24} color="#3B82F6" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Withdraw Funds</Text>
                  <Text style={styles.optionDescription}>
                    Make it real — withdraw your savings
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </TouchableOpacity>

              {/* Delete Goal */}
              <TouchableOpacity style={styles.optionButton} onPress={onDeleteGoal}>
                <View style={styles.optionIcon}>
                  <Ionicons name="trash" size={24} color="#EF4444" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Delete Goal</Text>
                  <Text style={styles.optionDescription}>
                    Remove this goal and all its history
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalContent: {
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
  },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  goalDetails: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  goalStatus: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
});

