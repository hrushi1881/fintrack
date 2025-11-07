import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';

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
}: TransactionCardProps) {
  
  const getFundSourceBadge = () => {
    if (!metadata || type === 'income') return null;
    
    const bucketType = metadata.bucket_type || metadata.bucket;
    if (!bucketType || bucketType === 'personal') return null;
    
    const bucketId = metadata.bucket_id || metadata.liability_id || metadata.goal_id;
    
    let iconName = 'card';
    let color = '#6366F1';
    let label = 'Liability';
    
    if (bucketType === 'goal') {
      iconName = 'flag';
      color = '#F59E0B';
      label = 'Goal';
    }
    
    return (
      <View style={[styles.fundBadge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
        <Ionicons name={iconName as any} size={12} color={color} />
        <Text style={[styles.fundBadgeText, { color }]}>{label}</Text>
      </View>
    );
  };
  const { currency } = useSettings();
  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getTransactionIcon = (category: string, icon?: string) => {
    if (icon) return icon;
    
    const iconMap: { [key: string]: string } = {
      'food': 'restaurant',
      'entertainment': 'film',
      'transport': 'car',
      'shopping': 'bag',
      'utilities': 'flash',
      'health': 'medical',
      'education': 'school',
      'income': 'arrow-down',
      'transfer': 'swap-horizontal',
    };
    
    return iconMap[category.toLowerCase()] || 'receipt';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'income':
        return '#10B981';
      case 'expense':
        return '#F59E0B';
      case 'transfer':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Left Icon */}
      <View style={styles.iconContainer}>
        <Ionicons 
          name={getTransactionIcon(category, icon) as any} 
          size={20} 
          color="#FFFFFF" 
        />
      </View>

      {/* Center Content */}
      <View style={styles.content}>
        <View style={styles.amountRow}>
          <Text style={styles.amount}>
            {formatCurrency(Math.abs(amount))}
          </Text>
          <View style={styles.badgesRow}>
            {getFundSourceBadge()}
            <View style={[styles.typeBadge, { backgroundColor: getTypeColor(type) }]}>
              <Text style={styles.typeText}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </View>
          </View>
        </View>
        
        <Text style={styles.categoryDescription}>
          {category}. {description}
        </Text>
      </View>

      {/* Right Section */}
      <View style={styles.rightSection}>
        <Text style={styles.date}>{formatDate(date)}</Text>
        <View style={styles.arrowContainer}>
          <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#99D795',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    textDecorationLine: 'underline',
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  fundBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  categoryDescription: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#000000',
    fontFamily: 'serif',
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  date: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  arrowContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
