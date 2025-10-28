import React from 'react';
import { View, ViewStyle, StyleSheet, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassmorphCardProps extends ViewProps {
  children: React.ReactNode;
  blurIntensity?: 'light' | 'medium' | 'strong';
  tint?: 'light' | 'dark' | 'default';
  style?: ViewStyle;
  intensity?: number;
  overlayColor?: string;
  borderColor?: string;
  borderRadius?: number;
  padding?: number;
  margin?: number;
}

export default function GlassmorphCard({
  children,
  blurIntensity = 'medium',
  tint = 'light',
  style,
  intensity,
  overlayColor = 'rgba(153, 215, 149, 1)', // #99D795
  borderColor = 'rgba(255, 255, 255, 0.2)',
  borderRadius = 20,
  padding = 16,
  margin = 10,
  ...props
}: GlassmorphCardProps) {

  const blurValue = intensity ?? {
    light: 5,
    medium: 5,
    strong: 10,
  }[blurIntensity];

  return (
    <View
      style={[
        styles.wrapper,
        {
          margin,
          borderRadius,
          borderColor,
        },
        style,
      ]}
      {...props}
    >
      {/* Background blur layer */}
      <BlurView
        intensity={blurValue}
        tint={tint}
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: overlayColor,
          },
        ]}
      />
      
      {/* Drop Shadow Effect */}
      <View style={styles.dropShadow} />
      
      {/* Inner Shadow Effect */}
      <View 
        style={[
          styles.innerShadow, 
          { 
            borderRadius,
          }
        ]} 
      />
      
      {/* Content */}
      <View style={[styles.content, { padding }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 0,
    overflow: 'visible',
  },
  content: {
    zIndex: 3,
  },
  dropShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 20,
    zIndex: -1,
  },
  innerShadow: {
    position: 'absolute',
    top: -7,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(164, 180, 125, 0.25)',
    borderRadius: 13,
    zIndex: 1,
  },
});