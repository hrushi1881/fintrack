/**
 * Liquid Effect Background Component
 * 
 * Full-screen liquid effect background wrapper
 * Use this as a background for screens or modals
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LiquidEffect } from './LiquidEffect';

interface LiquidEffectBackgroundProps {
  /** Children to render on top of the liquid effect */
  children?: React.ReactNode;
  /** Custom colors for the liquid effect */
  colors?: string[];
  /** Metalness intensity (0-1) */
  metalness?: number;
  /** Roughness intensity (0-1) */
  roughness?: number;
  /** Displacement scale */
  displacementScale?: number;
  /** Enable rain effect */
  rain?: boolean;
  /** Style override */
  style?: ViewStyle;
}

export default function LiquidEffectBackground({
  children,
  colors,
  metalness = 0.75,
  roughness = 0.25,
  displacementScale = 5,
  rain = false,
  style,
}: LiquidEffectBackgroundProps) {
  return (
    <View style={[styles.container, style]}>
      <LiquidEffect
        colors={colors}
        metalness={metalness}
        roughness={roughness}
        displacementScale={displacementScale}
        rain={rain}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
