import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/theme';

interface iOSGradientBackgroundProps extends ViewProps {
  children: React.ReactNode;
  gradientType?: 'default' | 'purple' | 'blue' | 'green' | 'orange';
  animated?: boolean;
  shimmer?: boolean;
  style?: any;
}

export default function IOSGradientBackground({
  children,
  gradientType = 'default',
  animated = true,
  shimmer = true,
  style,
  ...props
}: iOSGradientBackgroundProps) {
  const shimmerAnimation = useRef(new Animated.Value(0)).current;
  const gradientAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      // Gradient animation
      const gradientLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(gradientAnimation, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: false,
          }),
          Animated.timing(gradientAnimation, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: false,
          }),
        ])
      );

      // Shimmer animation
      const shimmerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnimation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnimation, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );

      gradientLoop.start();
      if (shimmer) {
        shimmerLoop.start();
      }

      return () => {
        gradientLoop.stop();
        shimmerLoop.stop();
      };
    }
  }, [animated, shimmer]);

  const getGradientColors = () => {
    return theme.colors.iosGradient[gradientType];
  };

  const shimmerTranslateX = shimmerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  const shimmerOpacity = shimmerAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.3, 0],
  });

  return (
    <View style={[styles.container, style]} {...props}>
      <LinearGradient
        colors={getGradientColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {children}
        
        {shimmer && (
          <Animated.View
            style={[
              styles.shimmer,
              {
                transform: [{ translateX: shimmerTranslateX }],
                opacity: shimmerOpacity,
              },
            ]}
          />
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    transform: [{ skewX: '-15deg' }],
  },
});

