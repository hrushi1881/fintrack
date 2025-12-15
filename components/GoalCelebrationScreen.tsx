import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrencyAmount } from '@/utils/currency';
import { Goal } from '@/types';

interface GoalCelebrationScreenProps {
  goal: Goal;
  onViewSummary: () => void;
  onWhatsNext: () => void;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

export default function GoalCelebrationScreen({ 
  goal, 
  onViewSummary, 
  onWhatsNext, 
  onClose 
}: GoalCelebrationScreenProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [shimmerAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    // Celebration animation sequence
    Animated.sequence([
      // Fade in background
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      // Scale in content
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      // Start shimmer effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();
  }, []);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, goal.currency);
  };

  const getDaysTaken = () => {
    if (!goal.completed_at) return 0;
    const start = new Date(goal.created_at);
    const end = new Date(goal.completed_at);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <View style={styles.overlay}>
      <Animated.View 
        style={[
          styles.darkOverlay,
          { opacity: fadeAnim }
        ]} 
      />
      
      <Animated.View
        style={[
          styles.celebrationContainer,
          {
            transform: [{ scale: scaleAnim }],
            opacity: fadeAnim,
          },
        ]}
      >
        <LinearGradient
          colors={['#10B981', '#059669', '#047857']}
          style={styles.celebrationCard}
        >
          {/* Shimmer Effect */}
          <Animated.View
            style={[
              styles.shimmer,
              {
                opacity: shimmerAnim,
                transform: [
                  {
                    translateX: shimmerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-width, width],
                    }),
                  },
                ],
              },
            ]}
          />

          {/* Celebration Content */}
          <View style={styles.celebrationContent}>
            {/* Confetti Icon */}
            <View style={styles.confettiContainer}>
              <Ionicons name="trophy" size={80} color="white" />
              <Text style={styles.confettiEmoji}>🎉</Text>
            </View>

            {/* Achievement Text */}
            <Text style={styles.achievementTitle}>
              You did it — {goal.title} complete!
            </Text>

            <Text style={styles.achievementSubtitle}>
              {formatCurrency(goal.target_amount)} achieved
            </Text>

            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{getDaysTaken()}</Text>
                <Text style={styles.statLabel}>Days</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{goal.total_contributions}</Text>
                <Text style={styles.statLabel}>Contributions</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {formatCurrency(goal.avg_monthly_saving)}
                </Text>
                <Text style={styles.statLabel}>Monthly Avg</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={onViewSummary}
              >
                <Ionicons name="analytics" size={20} color="white" />
                <Text style={styles.primaryButtonText}>View Summary</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onWhatsNext}
              >
                <Ionicons name="arrow-forward" size={20} color="#10B981" />
                <Text style={styles.secondaryButtonText}>What&apos;s Next?</Text>
              </TouchableOpacity>
            </View>

            {/* Microcopy */}
            <Text style={styles.microcopy}>
              You stayed consistent for {getDaysTaken()} days. That deserves more than a checkmark.
            </Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  celebrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  celebrationCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: 100,
  },
  celebrationContent: {
    alignItems: 'center',
    width: '100%',
  },
  confettiContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  confettiEmoji: {
    position: 'absolute',
    top: -10,
    right: -10,
    fontSize: 24,
  },
  achievementTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 32,
  },
  achievementSubtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 32,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  actionButtons: {
    width: '100%',
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 8,
  },
  microcopy: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },
});

