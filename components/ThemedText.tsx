import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { theme } from '@/theme';

interface ThemedTextProps extends TextProps {
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'bodySecondary' | 'cardTitle' | 'currency' | 'currencyLarge' | 'caption' | 'crazyText';
  color?: string;
}

export default function ThemedText({ 
  variant = 'body', 
  color, 
  style, 
  children, 
  ...props 
}: ThemedTextProps) {
  const textStyle = [
    theme.typography[variant],
    color && { color },
    style,
  ];

  return (
    <Text style={textStyle} {...props}>
      {children}
    </Text>
  );
}

// Predefined text components for common use cases
export const Heading1 = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="h1" {...props} />
);

export const Heading2 = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="h2" {...props} />
);

export const Heading3 = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="h3" {...props} />
);

export const BodyText = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="body" {...props} />
);

export const SecondaryText = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="bodySecondary" {...props} />
);

export const CardTitle = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="cardTitle" {...props} />
);

export const CurrencyText = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="currency" {...props} />
);

export const LargeCurrencyText = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="currencyLarge" {...props} />
);

export const CaptionText = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="caption" {...props} />
);

export const CrazyText = (props: Omit<ThemedTextProps, 'variant'>) => (
  <ThemedText variant="crazyText" {...props} />
);
