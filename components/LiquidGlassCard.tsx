import React, { useEffect, useRef } from 'react';
import {
  View,
  ViewStyle,
  StyleSheet,
  ViewProps,
  Animated,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * iOS 26 Style Liquid Glass Card Component
 * Premium glassmorphism with liquid-like reflections and subtle animations
 * Used throughout FinTrack for a modern, luxurious feel
 */

type GlassVariant = 'light' | 'dark' | 'frosted' | 'crystal' | 'mint';
type GlassSize = 'sm' | 'md' | 'lg' | 'xl';

interface LiquidGlassCardProps extends ViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: GlassVariant;
  size?: GlassSize;
  padding?: number;
  margin?: number;
  marginVertical?: number;
  marginHorizontal?: number;
  borderRadius?: number;
  blurIntensity?: number;
  animated?: boolean;
  shimmer?: boolean;
  elevation?: 'none' | 'low' | 'medium' | 'high';
  borderWidth?: number;
  onPress?: () => void;
}

const sizeConfig = {
  sm: { padding: 12, borderRadius: 16 },
  md: { padding: 16, borderRadius: 20 },
  lg: { padding: 20, borderRadius: 24 },
  xl: { padding: 24, borderRadius: 28 },
};

const variantConfig = {
  light: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
    overlayGradient: ['rgba(255, 255, 255, 0.4)', 'rgba(255, 255, 255, 0.1)'],
    shimmerColor: 'rgba(255, 255, 255, 0.6)',
    tint: 'light' as const,
    blurIntensity: 25,
  },
  dark: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overlayGradient: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)'],
    shimmerColor: 'rgba(255, 255, 255, 0.15)',
    tint: 'dark' as const,
    blurIntensity: 30,
  },
  frosted: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderColor: 'rgba(200, 200, 200, 0.4)',
    overlayGradient: ['rgba(255, 255, 255, 0.5)', 'rgba(240, 240, 240, 0.2)'],
    shimmerColor: 'rgba(255, 255, 255, 0.7)',
    tint: 'light' as const,
    blurIntensity: 35,
  },
  crystal: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.6)',
    overlayGradient: ['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.15)'],
    shimmerColor: 'rgba(255, 255, 255, 0.8)',
    tint: 'light' as const,
    blurIntensity: 20,
  },
  mint: {
    backgroundColor: 'rgba(153, 215, 149, 0.35)',
    borderColor: 'rgba(153, 215, 149, 0.5)',
    overlayGradient: ['rgba(255, 255, 255, 0.35)', 'rgba(153, 215, 149, 0.15)'],
    shimmerColor: 'rgba(255, 255, 255, 0.5)',
    tint: 'light' as const,
    blurIntensity: 25,
  },
};

const elevationConfig = {
  none: {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  low: {
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  high: {
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
};

export default function LiquidGlassCard({
  children,
  style,
  variant = 'light',
  size = 'md',
  padding,
  margin,
  marginVertical,
  marginHorizontal,
  borderRadius,
  blurIntensity,
  animated = false,
  shimmer = false,
  elevation = 'medium',
  borderWidth = 1,
  ...props
}: LiquidGlassCardProps) {
  const shimmerAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  const sizeStyles = sizeConfig[size];
  const variantStyles = variantConfig[variant];
  const elevationStyles = elevationConfig[elevation];

  const finalPadding = padding ?? sizeStyles.padding;
  const finalBorderRadius = borderRadius ?? sizeStyles.borderRadius;
  const finalBlurIntensity = blurIntensity ?? variantStyles.blurIntensity;

  useEffect(() => {
    if (shimmer) {
      const shimmerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnimation, {
            toValue: 1,
            duration: 2500,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnimation, {
            toValue: 0,
            duration: 2500,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
        ])
      );
      shimmerLoop.start();
      return () => shimmerLoop.stop();
    }
  }, [shimmer]);

  useEffect(() => {
    if (animated) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.02,
            duration: 3000,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 3000,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    }
  }, [animated]);

  const shimmerTranslateX = shimmerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  const shimmerOpacity = shimmerAnimation.interpolate({
    inputRange: [0, 0.3, 0.5, 0.7, 1],
    outputRange: [0, 0.4, 0.6, 0.4, 0],
  });

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          margin,
          marginVertical,
          marginHorizontal,
          borderRadius: finalBorderRadius,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: elevationStyles.shadowOpacity,
          shadowRadius: elevationStyles.shadowRadius,
          elevation: elevationStyles.elevation,
          transform: animated ? [{ scale: pulseAnimation }] : undefined,
        },
        style,
      ]}
      {...props}
    >
      {/* Base blur layer */}
      <BlurView
        intensity={finalBlurIntensity}
        tint={variantStyles.tint}
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: finalBorderRadius,
            overflow: 'hidden',
          },
        ]}
      />

      {/* Background color layer */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: finalBorderRadius,
            backgroundColor: variantStyles.backgroundColor,
            overflow: 'hidden',
          },
        ]}
      />

      {/* Liquid gradient overlay - creates the glass depth */}
      <LinearGradient
        colors={variantStyles.overlayGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: finalBorderRadius,
            overflow: 'hidden',
          },
        ]}
      />

      {/* Top highlight - creates liquid shine effect */}
      <LinearGradient
        colors={[
          'rgba(255, 255, 255, 0.4)',
          'rgba(255, 255, 255, 0.1)',
          'transparent',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: finalBorderRadius,
            overflow: 'hidden',
          },
        ]}
      />

      {/* Glass border with inner glow */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: finalBorderRadius,
            borderWidth: borderWidth,
            borderColor: variantStyles.borderColor,
          },
        ]}
      />

      {/* Inner shadow for depth */}
      <View
        style={[
          styles.innerShadow,
          {
            borderRadius: finalBorderRadius,
          },
        ]}
      />

      {/* Shimmer effect */}
      {shimmer && (
        <Animated.View
          style={[
            styles.shimmer,
            {
              borderRadius: finalBorderRadius,
              backgroundColor: variantStyles.shimmerColor,
              transform: [
                { translateX: shimmerTranslateX },
                { skewX: '-20deg' },
              ],
              opacity: shimmerOpacity,
            },
          ]}
        />
      )}

      {/* Content */}
      <View
        style={[
          styles.content,
          {
            padding: finalPadding,
            borderRadius: finalBorderRadius,
          },
        ]}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    position: 'relative',
  },
  content: {
    zIndex: 10,
    position: 'relative',
  },
  innerShadow: {
    ...StyleSheet.absoluteFillObject,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 0,
  },
  shimmer: {
    position: 'absolute',
    top: -50,
    bottom: -50,
    width: 100,
    zIndex: 5,
  },
});

/**
 * Preset configurations for common use cases
 */
export const LiquidGlassPresets = {
  // Transaction card - subtle, clean
  transactionCard: {
    variant: 'light' as const,
    size: 'md' as const,
    elevation: 'low' as const,
    borderRadius: 16,
  },
  // Summary card - more prominent
  summaryCard: {
    variant: 'frosted' as const,
    size: 'lg' as const,
    elevation: 'medium' as const,
    shimmer: true,
  },
  // Detail card - crystal clear
  detailCard: {
    variant: 'crystal' as const,
    size: 'md' as const,
    elevation: 'medium' as const,
  },
  // Hero card - with mint accent
  heroCard: {
    variant: 'mint' as const,
    size: 'xl' as const,
    elevation: 'high' as const,
    shimmer: true,
    animated: true,
  },
  // Dark card - for contrast sections
  darkCard: {
    variant: 'dark' as const,
    size: 'lg' as const,
    elevation: 'high' as const,
  },
};
