import React from 'react';
import { View, ViewStyle, StyleSheet, ViewProps } from 'react-native';

/**
 * Dark Card Component for Production Design System
 * Background: #121212 (dark)
 * Used for payment cards, account cards, etc.
 */
interface DarkCardProps extends ViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
  margin?: number;
  marginVertical?: number;
  marginHorizontal?: number;
  borderRadius?: number;
}

export default function DarkCard({
  children,
  style,
  padding = 12,
  margin,
  marginVertical,
  marginHorizontal,
  borderRadius = 16,
  ...props
}: DarkCardProps) {
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
    backgroundColor: '#121212',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
});























