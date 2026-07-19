/**
 * Liquid Effect Component
 * 
 * Beautiful animated liquid background effect for React Native
 * Mimics the Three.js liquid effect using native animations
 * Perfect for premium backgrounds and hero sections
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

// Rain Drop Component
function RainDrop({ index }: { index: number }) {
  const dropAnim = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    const delay = index * 100;
    const duration = 1000 + Math.random() * 500;
    
    const dropLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dropAnim, {
          toValue: height + 20,
          duration: duration,
          useNativeDriver: true,
        }),
        Animated.timing(dropAnim, {
          toValue: -20,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    
    dropLoop.start();
    return () => dropLoop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.rainDrop,
        {
          left: `${(index * 100) / 20}%`,
          transform: [{ translateY: dropAnim }],
        },
      ]}
    />
  );
}

interface LiquidEffectProps {
  /** Background image URL (optional) */
  imageUrl?: string;
  /** Metalness effect intensity (0-1) */
  metalness?: number;
  /** Roughness effect intensity (0-1) */
  roughness?: number;
  /** Displacement scale for wave effect */
  displacementScale?: number;
  /** Enable rain effect */
  rain?: boolean;
  /** Custom colors for liquid effect */
  colors?: string[];
  /** Opacity of the effect */
  opacity?: number;
  /** Style override */
  style?: ViewStyle;
  /** Children to render on top */
  children?: React.ReactNode;
}

export function LiquidEffect({
  imageUrl,
  metalness = 0.75,
  roughness = 0.25,
  displacementScale = 5,
  rain = false,
  colors,
  opacity = 1,
  style,
  children,
}: LiquidEffectProps) {
  // Animation values for multiple wave layers
  const wave1Anim = useRef(new Animated.Value(0)).current;
  const wave2Anim = useRef(new Animated.Value(0)).current;
  const wave3Anim = useRef(new Animated.Value(0)).current;
  const wave4Anim = useRef(new Animated.Value(0)).current;
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Helper function to validate hex color
  const isValidHexColor = (color: string): boolean => {
    if (!color || typeof color !== 'string') return false;
    // Reject literal null/undefined strings
    if (color.toLowerCase() === 'null' || color.toLowerCase() === 'undefined') return false;
    const trimmed = color.trim();
    if (trimmed.length === 0) return false;
    const hex = trimmed.replace('#', '');
    return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/i.test(hex);
  };

  // Helper function to convert hex to rgba
  const hexToRgba = (hex: string | undefined, alpha: number): string => {
    // Ensure we have a valid hex string
    if (!hex || typeof hex !== 'string' || hex.trim() === '') {
      return `rgba(102, 126, 234, ${Math.max(0, Math.min(1, alpha))})`; // Fallback color
    }
    
    // Remove # if present
    let cleanHex = hex.replace('#', '').trim();
    
    // Handle 3-digit hex colors
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map(char => char + char).join('');
    }
    
    // Validate hex color
    if (cleanHex.length !== 6 || !/^[0-9A-Fa-f]{6}$/i.test(cleanHex)) {
      return `rgba(102, 126, 234, ${Math.max(0, Math.min(1, alpha))})`; // Fallback color
    }
    
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    
    // Validate parsed values and alpha
    const validAlpha = Math.max(0, Math.min(1, alpha));
    if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(validAlpha)) {
      return `rgba(102, 126, 234, ${validAlpha})`; // Fallback color
    }
    
    return `rgba(${r}, ${g}, ${b}, ${validAlpha})`;
  };

  // Default liquid colors (inspired by the PDF example)
  const defaultColorsArray = [
    '#667eea', // Purple-blue
    '#764ba2', // Purple
    '#f093fb', // Pink
    '#4facfe', // Blue
    '#00f2fe', // Cyan
  ];

  // Filter and validate colors
  const providedColors = colors && colors.length > 0 
    ? colors.filter(c => isValidHexColor(c))
    : [];

  // Ensure we have at least 5 valid colors - filter and validate each one
  let safeColors: string[] = [];
  
  for (let i = 0; i < 5; i++) {
    const color = providedColors[i] || defaultColorsArray[i];
    if (color && isValidHexColor(color)) {
      safeColors.push(color);
    } else {
      safeColors.push(defaultColorsArray[i]); // Use default if invalid
    }
  }
  
  // Final validation - ensure all colors are valid strings
  safeColors = safeColors
    .map(c => {
      if (!c || typeof c !== 'string') return defaultColorsArray[0];
      return c.trim();
    })
    .filter(c => c && c.length > 0 && isValidHexColor(c));
  
  // If somehow we still don't have colors, use defaults
  if (safeColors.length === 0) {
    safeColors = [...defaultColorsArray];
  }
  
  // Ensure we have exactly 5 colors
  while (safeColors.length < 5) {
    safeColors.push(defaultColorsArray[safeColors.length] || defaultColorsArray[0]);
  }

  useEffect(() => {
    // Wave 1 - Slow, large waves
    const wave1Loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave1Anim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(wave1Anim, {
          toValue: 0,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    );

    // Wave 2 - Medium speed waves
    const wave2Loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave2Anim, {
          toValue: 1,
          duration: 6000,
          useNativeDriver: true,
        }),
        Animated.timing(wave2Anim, {
          toValue: 0,
          duration: 6000,
          useNativeDriver: true,
        }),
      ])
    );

    // Wave 3 - Fast waves
    const wave3Loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave3Anim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(wave3Anim, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    );

    // Wave 4 - Very slow, deep waves
    const wave4Loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave4Anim, {
          toValue: 1,
          duration: 12000,
          useNativeDriver: true,
        }),
        Animated.timing(wave4Anim, {
          toValue: 0,
          duration: 12000,
          useNativeDriver: true,
        }),
      ])
    );

    // Rotation animation for depth
    const rotationLoop = Animated.loop(
      Animated.timing(rotationAnim, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    );

    // Scale pulse for breathing effect
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );

    // Start all animations
    wave1Loop.start();
    wave2Loop.start();
    wave3Loop.start();
    wave4Loop.start();
    rotationLoop.start();
    scaleLoop.start();

    return () => {
      wave1Loop.stop();
      wave2Loop.stop();
      wave3Loop.stop();
      wave4Loop.stop();
      rotationLoop.stop();
      scaleLoop.stop();
    };
  }, []);

  // Interpolate wave positions
  const wave1Y = wave1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, displacementScale * 20],
  });

  const wave2Y = wave2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, displacementScale * -15],
  });

  const wave3Y = wave3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, displacementScale * 10],
  });

  const wave4Y = wave4Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, displacementScale * -25],
  });

  const rotation = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Calculate opacity based on metalness and roughness
  const layerOpacity = opacity * (metalness * 0.5 + roughness * 0.3);

  // Helper to ensure gradient colors array is always valid
  const ensureValidGradientColors = (colorArray: string[]): string[] => {
    const validated: string[] = [];
    
    for (const c of colorArray) {
      if (c && typeof c === 'string') {
        const trimmed = c.trim();
        if (trimmed.length > 0 && isValidHexColor(trimmed)) {
          validated.push(trimmed);
        }
      }
    }
    
    // Ensure we have at least 2 colors
    while (validated.length < 2) {
      const defaultColor = defaultColorsArray[validated.length] || defaultColorsArray[0];
      if (defaultColor && isValidHexColor(defaultColor)) {
        validated.push(defaultColor);
      } else {
        validated.push('#667eea'); // Ultimate fallback
      }
    }
    
    return validated.slice(0, 5); // Max 5 colors
  };

  // Helper to create rgba gradient colors array safely
  const createRgbaGradientColors = (
    color1: string | undefined,
    color2: string | undefined,
    alpha1: number,
    alpha2: number
  ): string[] => {
    // Ensure colors are valid, not null/undefined strings
    let c1 = color1;
    let c2 = color2;
    
    if (!c1 || typeof c1 !== 'string' || !isValidHexColor(c1)) {
      c1 = defaultColorsArray[0];
    }
    if (!c2 || typeof c2 !== 'string' || !isValidHexColor(c2)) {
      c2 = defaultColorsArray[1];
    }
    
    const a1 = Math.max(0, Math.min(1, alpha1));
    const a2 = Math.max(0, Math.min(1, alpha2));
    
    const rgba1 = hexToRgba(c1, a1);
    const rgba2 = hexToRgba(c2, a2);
    
    // Final validation - ensure all returned values are valid strings
    return [
      rgba1 && typeof rgba1 === 'string' ? rgba1 : 'rgba(102, 126, 234, 0.5)',
      rgba2 && typeof rgba2 === 'string' ? rgba2 : 'rgba(118, 75, 162, 0.38)',
      'rgba(0, 0, 0, 0)'
    ];
  };

  // Final validation - ensure base colors array is valid
  const baseGradientColors = ensureValidGradientColors(safeColors);

  return (
    <View style={[styles.container, style]}>
      {/* Base gradient background */}
      <Animated.View
        style={[
          styles.baseLayer,
          {
            opacity: layerOpacity,
            transform: [{ scale: scaleAnim }, { rotate: rotation }],
          },
        ]}
      >
        {baseGradientColors.length >= 2 && (
          <LinearGradient
            colors={baseGradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Wave Layer 1 - Large, slow */}
      <Animated.View
        style={[
          styles.waveLayer,
          {
            opacity: layerOpacity * 0.8,
            transform: [{ translateY: wave1Y }],
          },
        ]}
      >
        {safeColors.length >= 2 && (
          <LinearGradient
            colors={createRgbaGradientColors(safeColors[0], safeColors[1], 0.5, 0.38)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Wave Layer 2 - Medium */}
      <Animated.View
        style={[
          styles.waveLayer,
          {
            opacity: layerOpacity * 0.7,
            transform: [{ translateY: wave2Y }],
          },
        ]}
      >
        {safeColors.length >= 4 && (
          <LinearGradient
            colors={createRgbaGradientColors(safeColors[2], safeColors[3], 0.44, 0.31)}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Wave Layer 3 - Fast */}
      <Animated.View
        style={[
          styles.waveLayer,
          {
            opacity: layerOpacity * 0.6,
            transform: [{ translateY: wave3Y }],
          },
        ]}
      >
        {safeColors.length >= 5 && (
          <LinearGradient
            colors={createRgbaGradientColors(safeColors[4], safeColors[0], 0.38, 0.25)}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Wave Layer 4 - Deep, slow */}
      <Animated.View
        style={[
          styles.waveLayer,
          {
            opacity: layerOpacity * 0.5,
            transform: [{ translateY: wave4Y }],
          },
        ]}
      >
        {safeColors.length >= 3 && (
          <LinearGradient
            colors={createRgbaGradientColors(safeColors[1], safeColors[2], 0.31, 0.19)}
            start={{ x: 1, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Blur overlay for glass effect */}
      <BlurView intensity={roughness * 20} tint="light" style={styles.blurOverlay} />

      {/* Metallic shine overlay */}
      <Animated.View
        style={[
          styles.metallicOverlay,
          {
            opacity: metalness * 0.3,
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.4)', 'transparent', 'rgba(255, 255, 255, 0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Rain effect */}
      {rain && (
        <View style={styles.rainContainer}>
          {Array.from({ length: 20 }).map((_, i) => (
            <RainDrop key={i} index={i} />
          ))}
        </View>
      )}

      {/* Content */}
      {children && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  baseLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  waveLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  metallicOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  rainContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  rainDrop: {
    position: 'absolute',
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1,
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
});

export default LiquidEffect;
