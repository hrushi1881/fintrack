import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrencyAmount } from '@/utils/currency';
import { Fonts } from '@/utils/fonts';

export interface TransactionItemProps {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description?: string;
  date: string;
  category?: {
    name: string;
    color?: string;
    icon?: string;
  };
  account?: {
    name: string;
    color?: string;
    icon?: string;
  };
  currency?: string;
  onPress?: () => void;
  metadata?: {
    cycle_number?: number;
    liability_id?: string;
    bill_id?: string;
    [key: string]: any;
  };
}

/**
 * Get category icon based on category name
 * Returns appropriate Ionicons name for the category
 */
const getCategoryIcon = (categoryName?: string, type?: 'income' | 'expense' | 'transfer'): keyof typeof Ionicons.glyphMap => {
  if (!categoryName) {
    // Default icons based on transaction type
    if (type === 'income') return 'arrow-down-circle';
    if (type === 'expense') return 'arrow-up-circle';
    return 'swap-horizontal';
  }

  const name = categoryName.toLowerCase();

  // Income categories
  if (name.includes('salary') || name.includes('income') || name.includes('wage')) return 'briefcase';
  if (name.includes('freelance') || name.includes('gig')) return 'laptop';
  if (name.includes('investment') || name.includes('dividend')) return 'trending-up';
  if (name.includes('rent') && type === 'income') return 'home';
  if (name.includes('gift') || name.includes('bonus')) return 'gift';

  // Expense categories
  if (name.includes('food') || name.includes('restaurant') || name.includes('dining') || name.includes('grocery')) return 'restaurant';
  if (name.includes('transport') || name.includes('taxi') || name.includes('uber') || name.includes('fuel') || name.includes('gas')) return 'car';
  if (name.includes('shopping') || name.includes('retail') || name.includes('store')) return 'bag';
  if (name.includes('entertainment') || name.includes('movie') || name.includes('streaming')) return 'film';
  if (name.includes('health') || name.includes('medical') || name.includes('pharmacy') || name.includes('doctor')) return 'medical';
  if (name.includes('education') || name.includes('school') || name.includes('course') || name.includes('tuition')) return 'school';
  if (name.includes('bills') || name.includes('utility') || name.includes('electricity') || name.includes('water')) return 'flash';
  if (name.includes('internet') || name.includes('phone') || name.includes('mobile') || name.includes('telecom')) return 'phone-portrait';
  if (name.includes('subscription') || name.includes('netflix') || name.includes('spotify') || name.includes('premium')) return 'card';
  if (name.includes('rent') && type === 'expense') return 'home';
  if (name.includes('loan') || name.includes('emi') || name.includes('payment')) return 'cash';
  if (name.includes('insurance')) return 'shield-checkmark';
  if (name.includes('travel') || name.includes('hotel') || name.includes('flight')) return 'airplane';
  if (name.includes('fitness') || name.includes('gym') || name.includes('sport')) return 'fitness';
  if (name.includes('coffee') || name.includes('cafe')) return 'cafe';
  if (name.includes('petrol') || name.includes('gasoline')) return 'car-sport';

  // Transfer
  if (type === 'transfer') return 'swap-horizontal';

  // Default fallback
  return 'ellipse';
};

/**
 * TransactionItem - iOS-style transaction row component
 * 
 * Features:
 * - Category icon with colored background
 * - Transaction description
 * - Formatted amount with color coding (green for income, red for expense)
 * - Date formatting
 * - Clean iOS-style design
 */
const TransactionItem: React.FC<TransactionItemProps> = ({
  id,
  amount,
  type,
  description,
  date,
  category,
  account,
  currency = 'INR',
  onPress,
  metadata,
}) => {
  const iconName = getCategoryIcon(category?.name, type);
  const categoryColor = category?.color || (type === 'income' ? '#00B37E' : type === 'expense' ? '#FF6B35' : '#6B8E23');
  const isIncome = type === 'income';
  const isExpense = type === 'expense';
  const isTransfer = type === 'transfer';

  // Format date using native JavaScript
  const transactionDate = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  
  const formatDisplayDate = (d: Date): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };
  
  const transactionDateStr = formatDate(transactionDate);
  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);
  
  let dateText = '';
  if (transactionDateStr === todayStr) {
    dateText = 'Today';
  } else if (transactionDateStr === yesterdayStr) {
    dateText = 'Yesterday';
  } else {
    dateText = formatDisplayDate(transactionDate);
  }

  // Format amount
  const displayAmount = formatCurrencyAmount(Math.abs(amount), currency);
  const amountPrefix = isIncome ? '+' : isExpense ? '-' : '';

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${description || 'Transaction'} ${amountPrefix}${displayAmount}`}
    >
      {/* Icon Container */}
      <View style={[styles.iconContainer, { backgroundColor: `${categoryColor}15` }]}>
        <Ionicons
          name={iconName}
          size={22}
          color={categoryColor}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.mainRow}>
          <Text style={styles.description} numberOfLines={1}>
            {description || 'Transaction'}
          </Text>
          <Text
            style={[
              styles.amount,
              isIncome && styles.amountIncome,
              isExpense && styles.amountExpense,
              isTransfer && styles.amountTransfer,
            ]}
          >
            {amountPrefix}{displayAmount}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <Text style={styles.categoryText}>{category?.name || account?.name || 'Uncategorized'}</Text>
            {metadata?.cycle_number && (
              <View style={styles.cycleBadge}>
                <Ionicons name="repeat" size={10} color="#6366F1" />
                <Text style={styles.cycleBadgeText}>Cycle {metadata.cycle_number}</Text>
              </View>
            )}
          </View>
          <Text style={styles.dateText}>{dateText}</Text>
        </View>
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={18} color="#979292" style={styles.chevron} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  description: {
    fontSize: 16,
    color: '#000000',
    flex: 1,
    marginRight: 12,
    fontFamily: Fonts.poppinsSemiBold,
  },
  amount: {
    fontSize: 16,
    fontFamily: Fonts.instrumentSansBold,
    letterSpacing: 0.2,
  },
  amountIncome: {
    color: '#00B37E',
  },
  amountExpense: {
    color: '#FF6B35',
  },
  amountTransfer: {
    color: '#6B8E23',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  categoryText: {
    fontSize: 13,
    color: '#979292',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  cycleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cycleBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.poppinsMedium,
    color: '#6366F1',
  },
  dateText: {
    fontSize: 13,
    color: '#979292',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  chevron: {
    marginLeft: 8,
  },
});

export default TransactionItem;

