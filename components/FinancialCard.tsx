import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

interface CardData {
  id: string;
  name: string;
  amount: number;
  icon: 'card' | 'wallet' | 'bank' | 'cash';
  backgroundColor?: string;
  iconBackgroundColor?: string;
}

interface FinancialCardProps {
  data: CardData;
  onPress: (id: string) => void;
  style?: ViewStyle;
  blurIntensity?: number;
  cardHeight?: number;
  borderRadius?: number;
  iconSize?: number;
  iconBorderRadius?: number;
  arrowButtonSize?: number;
  arrowButtonColor?: string;
  arrowColor?: string;
  textColor?: string;
  amountColor?: string;
}

const FinancialCard: React.FC<FinancialCardProps> = ({ 
  data, 
  onPress, 
  style,
  blurIntensity = 10,
  cardHeight = 100,
  borderRadius = 25,
  iconSize = 72,
  iconBorderRadius = 20,
  arrowButtonSize = 40,
  arrowButtonColor = '#000',
  arrowColor = '#fff',
  textColor = '#000',
  amountColor = '#1a1a1a',
}) => {
  const getIconComponent = () => {
    switch (data.icon) {
      case 'card':
        return (
          <View style={styles.cardIcon}>
            <View style={styles.cardStripe} />
            <View style={[styles.cardStripe, styles.cardStripeBottom]} />
          </View>
        );
      case 'wallet':
        return (
          <View style={styles.walletIcon}>
            <View style={styles.walletTriangle1} />
            <View style={styles.walletTriangle2} />
          </View>
        );
      case 'bank':
        return (
          <View style={styles.bankIcon}>
            <View style={styles.bankBuilding} />
            <View style={styles.bankColumns} />
          </View>
        );
      case 'cash':
        return (
          <View style={styles.cashIcon}>
            <View style={styles.cashBill} />
            <View style={[styles.cashBill, styles.cashBill2]} />
            <View style={[styles.cashBill, styles.cashBill3]} />
          </View>
        );
      default:
        return <Ionicons name="wallet" size={32} color="#E0E0E0" />;
    }
  };

  return (
    <View style={[styles.cardWrapper, { height: cardHeight, borderRadius }, style]}>
      <BlurView
        intensity={blurIntensity}
        tint="light"
        style={[
          StyleSheet.absoluteFill, 
          { 
            borderRadius,
            backgroundColor: data.backgroundColor || 'rgba(153, 215, 149, 1)',
          }
        ]}
      />
      
      {/* Drop Shadow */}
      <View style={[styles.dropShadow, { borderRadius }]} />
      
      {/* Inner Shadow */}
      <View style={[styles.innerShadow, { borderRadius: borderRadius - 7 }]} />
      
      <View style={styles.cardContent}>
        {/* Icon Container */}
        <View style={[
          styles.iconContainer,
          { 
            width: iconSize, 
            height: iconSize, 
            borderRadius: iconBorderRadius,
            backgroundColor: data.iconBackgroundColor || '#000',
          }
        ]}>
          {getIconComponent()}
        </View>

        {/* Card Info */}
        <View style={styles.infoContainer}>
          <Text style={[styles.cardName, { color: textColor }]}>{data.name}</Text>
          <Text style={[styles.cardAmount, { color: amountColor }]}>
            ₹{data.amount.toLocaleString('en-IN')}
          </Text>
        </View>

        {/* Arrow Button */}
        <TouchableOpacity
          style={[
            styles.arrowButton,
            { 
              width: arrowButtonSize,
              height: arrowButtonSize,
              borderRadius: arrowButtonSize / 2,
              backgroundColor: arrowButtonColor,
            }
          ]}
          onPress={() => onPress(data.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-forward" size={20} color={arrowColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default FinancialCard;

const styles = StyleSheet.create({
  cardWrapper: {
    overflow: 'visible',
  },
  dropShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 25,
    zIndex: -1,
  },
  innerShadow: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: 7,
    bottom: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 18,
    zIndex: 1,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  // Card Icon Styles
  cardIcon: {
    width: 48,
    height: 40,
    justifyContent: 'center',
  },
  cardStripe: {
    width: '100%',
    height: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
  cardStripeBottom: {
    marginTop: 8,
    backgroundColor: '#B0B0B0',
  },
  // Wallet Icon Styles
  walletIcon: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  walletTriangle1: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 24,
    borderRightWidth: 24,
    borderBottomWidth: 40,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FF6B35',
    position: 'absolute',
    left: 0,
  },
  walletTriangle2: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 20,
    borderRightWidth: 20,
    borderBottomWidth: 35,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#8B5CF6',
    position: 'absolute',
    left: 4,
    top: 3,
  },
  // Bank Icon Styles
  bankIcon: {
    width: 48,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bankBuilding: {
    width: 40,
    height: 30,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
  },
  bankColumns: {
    position: 'absolute',
    top: 5,
    left: 8,
    right: 8,
    height: 20,
    backgroundColor: '#B0B0B0',
    borderRadius: 2,
  },
  // Cash Icon Styles
  cashIcon: {
    width: 48,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cashBill: {
    width: 35,
    height: 25,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    position: 'absolute',
  },
  cashBill2: {
    backgroundColor: '#B0B0B0',
    top: 3,
    left: 3,
  },
  cashBill3: {
    backgroundColor: '#909090',
    top: 6,
    left: 6,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  cardAmount: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  arrowButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
});
