import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import LiquidGlassCard from './LiquidGlassCard';

interface TransactionCardProps {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  description: string;
  date: string;
  icon?: string;
  currency?: string;
  metadata?: any;
  onPress?: () => void;
  compact?: boolean;
}

export default function TransactionCard({
  amount,
  type,
  category,
  description,
  date,
  icon,
  metadata,
  onPress,
  compact = false,
}: TransactionCardProps) {
  const { currency } = useSettings();
  
  const getFundSourceBadge = () => {
    if (!metadata || type === 'income') return null;
    
    const bucketType = metadata.bucket_type || metadata.bucket;
    if (!bucketType || bucketType === 'personal') return null;
    
    let iconName = 'card';
    let color = '#6366F1';
    let label = 'Liability';
    
    if (bucketType === 'goal') {
      iconName = 'flag';
      color = '#F59E0B';
      label = 'Goal';
    }
    
    return (
      <View style={[styles.fundBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
        <Ionicons name={iconName as any} size={10} color={color} />
        <Text style={[styles.fundBadgeText, { color }]}>{label}</Text>
      </View>
    );
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    const dateObj = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateObj.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (dateObj.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getTransactionIcon = (category: string, iconOverride?: string) => {
    if (iconOverride) return iconOverride;
    
    const iconMap: { [key: string]: string } = {
      'food': 'restaurant',
      'dining': 'restaurant',
      'entertainment': 'game-controller',
      'transport': 'car',
      'transportation': 'car',
      'shopping': 'bag-handle',
      'utilities': 'flash',
      'health': 'fitness',
      'healthcare': 'fitness',
      'education': 'school',
      'income': 'trending-up',
      'salary': 'cash',
      'transfer': 'swap-horizontal',
      'groceries': 'cart',
      'travel': 'airplane',
      'subscription': 'card',
      'bills': 'receipt',
    };
    
    return iconMap[category.toLowerCase()] || 'receipt-outline';
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'income':
        return {
          color: '#10B981',
          bgColor: 'rgba(16, 185, 129, 0.12)',
          icon: 'arrow-down',
          prefix: '+',
        };
      case 'expense':
        return {
          color: '#EF4444',
          bgColor: 'rgba(239, 68, 68, 0.12)',
          icon: 'arrow-up',
          prefix: '-',
        };
      case 'transfer':
        return {
          color: '#3B82F6',
          bgColor: 'rgba(59, 130, 246, 0.12)',
          icon: 'swap-horizontal',
          prefix: '',
        };
      default:
        return {
          color: '#6B7280',
          bgColor: 'rgba(107, 114, 128, 0.12)',
          icon: 'ellipse',
          prefix: '',
        };
    }
  };

  const typeConfig = getTypeConfig(type);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <LiquidGlassCard
        variant="light"
        size={compact ? 'sm' : 'md'}
        elevation="low"
        borderRadius={16}
        marginVertical={6}
        marginHorizontal={0}
      >
        <View style={styles.cardContent}>
          {/* Transaction Icon */}
          <View style={[styles.iconContainer, { backgroundColor: typeConfig.bgColor }]}>
        <Ionicons 
          name={getTransactionIcon(category, icon) as any} 
              size={compact ? 18 : 22}
              color={typeConfig.color}
        />
      </View>

          {/* Main Content */}
      <View style={styles.content}>
            {/* Top Row: Description & Amount */}
            <View style={styles.topRow}>
              <View style={styles.descriptionContainer}>
                <Text style={styles.description} numberOfLines={1}>
                  {description || category}
          </Text>
            {getFundSourceBadge()}
              </View>
              <Text style={[styles.amount, { color: typeConfig.color }]}>
                {typeConfig.prefix}{formatCurrency(Math.abs(amount))}
              </Text>
            </View>

            {/* Bottom Row: Category, Date & Type Badge */}
            <View style={styles.bottomRow}>
              <View style={styles.metaContainer}>
                <Text style={styles.category}>{category}</Text>
                <View style={styles.dotSeparator} />
                <Text style={styles.date}>{formatDate(date)}</Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: typeConfig.bgColor }]}>
                <Ionicons
                  name={typeConfig.icon as any}
                  size={10}
                  color={typeConfig.color}
                />
                <Text style={[styles.typeText, { color: typeConfig.color }]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
          </View>
        </View>
      </View>

          {/* Arrow Indicator */}
        <View style={styles.arrowContainer}>
            <Ionicons name="chevron-forward" size={16} color="rgba(0, 0, 0, 0.3)" />
          </View>
        </View>
      </LiquidGlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  descriptionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
    gap: 8,
  },
  description: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  amount: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    fontWeight: '700',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  category: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.55)',
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  date: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(0, 0, 0, 0.55)',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  typeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  fundBadgeText: {
    fontSize: 9,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  arrowContainer: {
    marginLeft: 8,
    padding: 4,
  },
});
