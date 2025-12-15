import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatCurrencyAmount } from '@/utils/currency';

export interface BalanceCardProps {
  /**
   * The balance amount to display
   */
  amount: number | string;
  
  /**
   * Currency code (e.g., 'INR', 'USD')
   * If not provided, will format as number
   */
  currency?: string;
  
  /**
   * Currency symbol override (optional)
   * If provided, will use this instead of currency code lookup
   */
  currencySymbol?: string;
  
  /**
   * Label text (default: "Current Balance")
   */
  label?: string;
  
  /**
   * Callback when drag handle is pressed
   * Will open interactive dashboard (to be implemented)
   */
  onDragHandlePress?: () => void;
  
  /**
   * Custom container style
   */
  style?: ViewStyle;
  
  /**
   * Loading state - shows loading indicator
   */
  loading?: boolean;
  
  /**
   * Show drag handle (default: true)
   */
  showDragHandle?: boolean;
}

/**
 * BalanceCard - Stylish dashboard card for displaying total balance
 * 
 * Features:
 * - Pure black card with 40px corner radius
 * - Interactive grey drag handle at top
 * - Instrument Serif typography for elegant numbers
 * - Super stylish design with shadows and spacing
 */
const BalanceCard: React.FC<BalanceCardProps> = ({
  amount,
  currency,
  currencySymbol,
  label = 'Current Balance',
  onDragHandlePress,
  style,
  loading = false,
  showDragHandle = true,
}) => {
  const handleDragPress = () => {
    if (onDragHandlePress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onDragHandlePress();
    }
  };

  const displayAmount = loading
    ? '...'
    : typeof amount === 'number'
    ? currency
      ? formatCurrencyAmount(amount, currency)
      : currencySymbol
      ? `${currencySymbol}${amount.toLocaleString('en-IN')}`
      : amount.toLocaleString('en-IN')
    : amount;

  return (
    <View style={[styles.card, style]}>
      {/* Interactive Drag Handle */}
      {showDragHandle && (
        <TouchableOpacity
          style={styles.dragHandleContainer}
          onPress={handleDragPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open interactive dashboard"
          accessibilityHint="Tap to open the interactive dashboard view"
        >
          <View style={styles.dragHandle} />
        </TouchableOpacity>
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* Label */}
        <Text style={styles.label}>{label}</Text>

        {/* Amount */}
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
          {displayAmount}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#000000', // Pure black
    borderRadius: 40, // Corner radius 40
    padding: 32,
    paddingTop: 40, // Extra top padding for drag handle
    marginVertical: 0, // Remove vertical margin, let parent handle
    width: '100%', // Full width of parent container
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
    position: 'relative',
    overflow: 'hidden',
    // Subtle inner glow effect
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  dragHandleContainer: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center', // Center horizontally
    justifyContent: 'center',
    zIndex: 10,
  },
  dragHandle: {
    width: 63,
    height: 10,
    backgroundColor: '#979292', // Grey color
    borderRadius: 26, // Corner radius 26
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
    // Subtle inner highlight for depth
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    marginTop: 8, // Space below drag handle
  },
  label: {
    fontSize: 16,
    fontFamily: Platform.select({
      ios: 'InstrumentSans-Bold',
      android: 'InstrumentSans-Bold',
      default: 'InstrumentSans-Bold',
    }) || 'System',
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 16,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  amount: {
    fontSize: 64, // Larger for more impact
    fontFamily: Platform.select({
      ios: 'InstrumentSans-ExtraBold',
      android: 'InstrumentSans-ExtraBold',
      default: 'InstrumentSans-ExtraBold',
    }) || 'System',
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 72,
    textShadowColor: 'rgba(255, 255, 255, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});

export default BalanceCard;

