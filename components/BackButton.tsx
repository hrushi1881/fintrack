import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';

interface BackButtonProps {
  onPress?: () => void;
  color?: string;
  size?: number;
  style?: ViewStyle;
}

/**
 * Contextual Back Button Component
 * 
 * Automatically handles back navigation using the navigation stack.
 * Falls back to custom onPress handler if provided.
 * 
 * @example
 * ```tsx
 * <BackButton />
 * <BackButton color="#FFFFFF" size={24} />
 * <BackButton onPress={() => router.push('/custom')} />
 * ```
 */
export default function BackButton({ 
  onPress, 
  color = '#000000', 
  size = 24,
  style 
}: BackButtonProps) {
  const handleBack = useBackNavigation();

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress || handleBack}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="arrow-back" size={size} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

