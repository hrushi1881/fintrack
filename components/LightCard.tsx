import React from 'react';
import { View, ViewStyle, StyleSheet, ViewProps } from 'react-native';

/**
 * Light Gray Card Component
 * Minimalist design matching the reference image style
 * Light gray background with black text
 */
interface LightCardProps extends ViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
  margin?: number;
  marginVertical?: number;
  marginHorizontal?: number;
  borderRadius?: number;
}

export default function LightCard({
  children,
  style,
  padding = 24,
  margin,
  marginVertical,
  marginHorizontal,
  borderRadius = 20,
  ...props
}: LightCardProps) {
  return (
    <View
      style={[
        styles.wrapper,
        {
          margin,
          marginVertical,
          marginHorizontal,
          borderRadius,
          padding,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF', // White background // Light gray background
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
});

