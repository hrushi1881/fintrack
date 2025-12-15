import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Button - Professional button component for FinTrack design system
 * 
 * Follows the design system with dark teal background, purple accent,
 * and smooth iOS-style interactions.
 * 
 * @example
 * ```tsx
 * <Button variant="primary" onPress={handleSubmit}>
 *   Create Account
 * </Button>
 * 
 * <Button variant="secondary" size="small" onPress={handleCancel}>
 *   Cancel
 * </Button>
 * ```
 */

export interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  /** Button text content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Show loading state */
  loading?: boolean;
  /** Disable button */
  disabled?: boolean;
  /** Enable haptic feedback */
  hapticFeedback?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Custom text style */
  textStyle?: TextStyle;
  /** Full width button */
  fullWidth?: boolean;
  /** Icon to show before text */
  icon?: React.ReactNode;
}

/**
 * Button color constants matching design system
 */
export const BUTTON_COLORS = {
  primary: {
    background: '#C4B5FD',
    text: '#0A2E2E',
    pressed: '#A78BFA',
  },
  secondary: {
    background: 'transparent',
    text: '#C4B5FD',
    border: 'rgba(196, 181, 253, 0.3)',
    pressed: 'rgba(196, 181, 253, 0.1)',
  },
  tertiary: {
    background: 'transparent',
    text: '#64748B',
    pressed: 'rgba(100, 116, 139, 0.1)',
  },
  danger: {
    background: '#DC2626',
    text: '#FFFFFF',
    pressed: '#B91C1C',
  },
} as const;

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  hapticFeedback = true,
  style,
  textStyle,
  fullWidth = false,
  icon,
  onPress,
  ...props
}) => {
  const handlePress = (e: any) => {
    if (disabled || loading) return;
    
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    onPress?.(e);
  };

  const colors = BUTTON_COLORS[variant];
  const isSecondary = variant === 'secondary';
  const isTertiary = variant === 'tertiary';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={colors.text}
          size={size === 'small' ? 'small' : 'small'}
        />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text
            style={[
              styles.text,
              styles[`text${size.charAt(0).toUpperCase() + size.slice(1)}`],
              { color: colors.text },
              icon && styles.textWithIcon,
              textStyle,
            ]}
          >
            {children}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    backgroundColor: BUTTON_COLORS.primary.background,
  },
  secondary: {
    backgroundColor: BUTTON_COLORS.secondary.background,
    borderWidth: 2,
    borderColor: BUTTON_COLORS.secondary.border,
  },
  tertiary: {
    backgroundColor: BUTTON_COLORS.tertiary.background,
  },
  danger: {
    backgroundColor: BUTTON_COLORS.danger.background,
  },
  small: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 40,
  },
  medium: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    minHeight: 48,
  },
  large: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    minHeight: 56,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    textAlign: 'center',
  },
  textSmall: {
    fontSize: 13,
  },
  textMedium: {
    fontSize: 15,
  },
  textLarge: {
    fontSize: 16,
  },
  textWithIcon: {
    marginLeft: 0,
  },
});

export default Button;

