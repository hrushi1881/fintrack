/**
 * Liquid Glass Component
 * 
 * iOS-style Liquid Glass material with:
 * - Real-time specular highlights
 * - Dynamic lensing effect
 * - Adaptive light/dark modes
 * - Interactive touch response
 * - Gel-like flexibility
 * - Content-aware tinting
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  ViewStyle,
  PanResponder,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LiquidGlassProps {
  /** Children to render on top */
  children?: React.ReactNode;
  /** Style override */
  style?: ViewStyle;
  /** Variant: light or dark */
  variant?: 'light' | 'dark' | 'adaptive';
  /** Intensity of glass effect (0-1) */
  intensity?: number;
  /** Enable interactive touch response */
  interactive?: boolean;
  /** Enable lensing effect */
  lensing?: boolean;
  /** Enable specular highlights */
  specular?: boolean;
  /** Border radius */
  borderRadius?: number;
  /** Padding */
  padding?: number;
  /** Enable gel-like flex animation */
  flexible?: boolean;
  /** Tint color (auto-adapts if not provided) */
  tintColor?: string;
  /** Elevation/shadow depth */
  elevation?: 'none' | 'low' | 'medium' | 'high';
}

export default function LiquidGlass({
  children,
  style,
  variant = 'light',
  intensity = 0.8,
  interactive = true,
  lensing = true,
  specular = true,
  borderRadius = 20,
  padding = 16,
  flexible = true,
  tintColor,
  elevation = 'medium',
}: LiquidGlassProps) {
  // Animation values
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const flexAnim = useRef(new Animated.Value(0)).current;
  const specularAnim = useRef(new Animated.Value(0)).current;
  const lensAnim = useRef(new Animated.Value(0)).current;
  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;

  // Touch state
  const [touchPosition, setTouchPosition] = useState({ x: 0.5, y: 0.5 });
  const [isPressed, setIsPressed] = useState(false);

  // Ambient animation loop
  useEffect(() => {
    if (specular) {
      const specularLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(specularAnim, {
            toValue: 1,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(specularAnim, {
            toValue: 0,
            duration: 4000,
            useNativeDriver: true,
          }),
        ])
      );
      specularLoop.start();
      return () => specularLoop.stop();
    }
  }, [specular]);

  // Lensing animation
  useEffect(() => {
    if (lensing) {
      const lensLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(lensAnim, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(lensAnim, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      );
      lensLoop.start();
      return () => lensLoop.stop();
    }
  }, [lensing]);

  // Flexible gel animation
  useEffect(() => {
    if (flexible) {
      const flexLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(flexAnim, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(flexAnim, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ])
      );
      flexLoop.start();
      return () => flexLoop.stop();
    }
  }, [flexible]);

  // Pan responder for device tilt simulation
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interactive,
      onMoveShouldSetPanResponder: () => interactive,
      onPanResponderGrant: (evt) => {
        if (!interactive) return;
        setIsPressed(true);
        const { locationX, locationY } = evt.nativeEvent;
        setTouchPosition({
          x: locationX / SCREEN_WIDTH,
          y: locationY / SCREEN_HEIGHT,
        });

        // Glow animation on touch
        Animated.spring(glowAnim, {
          toValue: 1,
          friction: 5,
          tension: 40,
          useNativeDriver: true,
        }).start();

        // Scale animation
        Animated.spring(scaleAnim, {
          toValue: 0.98,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!interactive) return;
        const { moveX, moveY } = gestureState;
        setTouchPosition({
          x: moveX / SCREEN_WIDTH,
          y: moveY / SCREEN_HEIGHT,
        });

        // Tilt effect based on gesture
        Animated.parallel([
          Animated.spring(tiltX, {
            toValue: gestureState.dx / 100,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.spring(tiltY, {
            toValue: gestureState.dy / 100,
            friction: 7,
            useNativeDriver: true,
          }),
        ]).start();
      },
      onPanResponderRelease: () => {
        if (!interactive) return;
        setIsPressed(false);

        // Reset animations
        Animated.parallel([
          Animated.spring(glowAnim, {
            toValue: 0,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }),
          Animated.spring(tiltX, {
            toValue: 0,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.spring(tiltY, {
            toValue: 0,
            friction: 7,
            useNativeDriver: true,
          }),
        ]).start();
      },
    })
  ).current;

  // Interpolations
  const specularX = specularAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-0.5, 1.5],
  });

  const specularY = specularAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-0.3, 1.3],
  });

  const lensScale = lensAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
  });

  const flexRotate = flexAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '2deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  // Variant-specific colors
  const variantConfig = {
    light: {
      backgroundColor: 'rgba(255, 255, 255, 0.75)',
      borderColor: 'rgba(255, 255, 255, 0.8)',
      tint: 'light' as const,
      blurIntensity: 30,
      shadowColor: 'rgba(0, 0, 0, 0.1)',
      specularColor: 'rgba(255, 255, 255, 0.9)',
      glowColor: 'rgba(255, 255, 255, 0.8)',
    },
    dark: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      borderColor: 'rgba(255, 255, 255, 0.15)',
      tint: 'dark' as const,
      blurIntensity: 40,
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      specularColor: 'rgba(255, 255, 255, 0.3)',
      glowColor: 'rgba(255, 255, 255, 0.4)',
    },
    adaptive: {
      backgroundColor: 'rgba(255, 255, 255, 0.65)',
      borderColor: 'rgba(255, 255, 255, 0.6)',
      tint: 'light' as const,
      blurIntensity: 35,
      shadowColor: 'rgba(0, 0, 0, 0.15)',
      specularColor: 'rgba(255, 255, 255, 0.7)',
      glowColor: 'rgba(255, 255, 255, 0.6)',
    },
  };

  const config = variantConfig[variant];
  const elevationStyles = getElevationStyles(elevation);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          borderRadius,
          shadowColor: config.shadowColor,
          ...elevationStyles,
          transform: [
            { scale: scaleAnim },
            { perspective: 1000 },
            { rotateX: tiltY },
            { rotateY: tiltX },
            { rotate: flexible ? flexRotate : '0deg' },
          ],
        },
        style,
      ]}
      {...(interactive ? panResponder.panHandlers : {})}
    >
      {/* Base blur layer */}
      <BlurView
        intensity={config.blurIntensity * intensity}
        tint={config.tint}
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            overflow: 'hidden',
          },
        ]}
      />

      {/* Background tint layer */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: config.backgroundColor,
            opacity: intensity,
          },
        ]}
      />

      {/* Lensing effect - dynamic light concentration */}
      {lensing && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              overflow: 'hidden',
              transform: [{ scale: lensScale }],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255, 255, 255, 0.2)',
              'rgba(255, 255, 255, 0.05)',
              'rgba(255, 255, 255, 0)',
            ]}
            start={{ x: 0.3, y: 0.3 }}
            end={{ x: 0.7, y: 0.7 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {/* Specular highlights - shifts with device movement */}
      {specular && (
        <Animated.View
          style={[
            styles.specularLayer,
            {
              borderRadius,
              opacity: 0.4,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.specularHighlight,
              {
                transform: [
                  { translateX: Animated.multiply(specularX, 100) },
                  { translateY: Animated.multiply(specularY, 100) },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={[
                config.specularColor,
                'rgba(255, 255, 255, 0.3)',
                'rgba(255, 255, 255, 0)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.specularGradient}
            />
          </Animated.View>
        </Animated.View>
      )}

      {/* Interactive glow - spreads from touch point */}
      {interactive && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              opacity: glowOpacity,
              overflow: 'hidden',
            },
          ]}
        >
          <View
            style={[
              styles.glowCircle,
              {
                left: `${touchPosition.x * 100}%`,
                top: `${touchPosition.y * 100}%`,
                backgroundColor: config.glowColor,
              },
            ]}
          />
        </Animated.View>
      )}

      {/* Border with inner glow */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: 0.5,
            borderColor: config.borderColor,
          },
        ]}
      />

      {/* Inner shadow for depth */}
      <View
        style={[
          styles.innerShadow,
          {
            borderRadius,
          },
        ]}
      />

      {/* Content layer */}
      <View
        style={[
          styles.content,
          {
            padding,
            borderRadius,
          },
        ]}
      >
        {children}
      </View>

      {/* Adaptive shadow overlay - increases with scroll */}
      <View
        style={[
          styles.adaptiveShadow,
          {
            borderRadius,
            backgroundColor: variant === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)',
          },
        ]}
      />
    </Animated.View>
  );
}

function getElevationStyles(elevation: 'none' | 'low' | 'medium' | 'high') {
  switch (elevation) {
    case 'none':
      return {
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      };
    case 'low':
      return {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
      };
    case 'medium':
      return {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 4,
      };
    case 'high':
      return {
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 8,
      };
  }
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  specularLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  specularHighlight: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  specularGradient: {
    width: '100%',
    height: '100%',
  },
  glowCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    marginLeft: -150,
    marginTop: -150,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 60,
    elevation: 0,
  },
  innerShadow: {
    ...StyleSheet.absoluteFillObject,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 0,
  },
  content: {
    zIndex: 10,
    position: 'relative',
  },
  adaptiveShadow: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
});

/**
 * Preset configurations for common use cases
 */
export const LiquidGlassPresets = {
  // Card - standard glass card
  card: {
    variant: 'light' as const,
    intensity: 0.8,
    borderRadius: 20,
    padding: 20,
    elevation: 'medium' as const,
    interactive: true,
    lensing: true,
    specular: true,
  },
  // Button - interactive with strong response
  button: {
    variant: 'light' as const,
    intensity: 0.9,
    borderRadius: 16,
    padding: 16,
    elevation: 'low' as const,
    interactive: true,
    lensing: true,
    specular: true,
    flexible: true,
  },
  // Modal - prominent with high elevation
  modal: {
    variant: 'light' as const,
    intensity: 0.95,
    borderRadius: 24,
    padding: 24,
    elevation: 'high' as const,
    interactive: false,
    lensing: true,
    specular: true,
  },
  // Toolbar - floating with subtle effect
  toolbar: {
    variant: 'adaptive' as const,
    intensity: 0.7,
    borderRadius: 16,
    padding: 12,
    elevation: 'medium' as const,
    interactive: true,
    lensing: false,
    specular: true,
  },
  // Hero - large prominent section
  hero: {
    variant: 'light' as const,
    intensity: 0.85,
    borderRadius: 28,
    padding: 32,
    elevation: 'high' as const,
    interactive: true,
    lensing: true,
    specular: true,
    flexible: true,
  },
};
