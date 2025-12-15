import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ThemedCard from './ThemedCard';
import { CardTitle, CurrencyText, SecondaryText } from './ThemedText';
import { theme } from '@/theme';

interface ProfileCardProps {
  accountName: string;
  accountType: string;
  balance: number;
  icon: string;
  iconColor: string;
  onPress?: () => void;
}

export default function ProfileCard({
  accountName,
  accountType,
  balance,
  icon,
  iconColor,
  onPress,
}: ProfileCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <ThemedCard onPress={onPress} style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.leftSection}>
          <View style={[styles.iconContainer, { backgroundColor: iconColor }]}>
            <Ionicons name={icon as any} size={24} color="#FFFFFF" />
          </View>
          <View style={styles.textSection}>
            <CardTitle>{accountName}</CardTitle>
            <SecondaryText style={styles.accountType}>{accountType}</SecondaryText>
          </View>
        </View>
        
        <View style={styles.rightSection}>
          <CurrencyText style={styles.balance}>
            {formatCurrency(balance)}
          </CurrencyText>
          <Ionicons name="chevron-forward" size={20} color="rgba(255, 255, 255, 0.6)" />
        </View>
      </View>
    </ThemedCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: theme.spacing.sm,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  textSection: {
    flex: 1,
  },
  accountType: {
    marginTop: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balance: {
    marginRight: theme.spacing.sm,
  },
});
