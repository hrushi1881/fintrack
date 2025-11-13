import React from 'react';
import { View, ViewStyle, StyleSheet, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

/**
 * iOS 26 Style Glass Card Component
 * White background with subtle glass effect
 * Used throughout the liability system
 */
interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
  margin?: number;
  marginVertical?: number;
  marginHorizontal?: number;
  borderRadius?: number;
  intensity?: number;
}

export default function GlassCard({
  children,
  style,
  padding = 20,
  margin,
  marginVertical,
  marginHorizontal,
  borderRadius = 24,
  intensity = 20,
  ...props
}: GlassCardProps) {
  return (
    <View
      style={[
        styles.wrapper,
        {
          margin,
          marginVertical,
          marginHorizontal,
          borderRadius,
        },
        style,
      ]}
      {...props}
    >
      <BlurView
        intensity={intensity}
        tint="light"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            overflow: 'hidden',
          },
        ]}
      />
      
      {/* Glass border effect */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: 0.5,
            borderColor: 'rgba(0, 0, 0, 0.08)',
          },
        ]}
      />
      
      {/* Content */}
      <View style={[styles.content, { padding, borderRadius }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  content: {
    zIndex: 1,
    position: 'relative',
  },
});

