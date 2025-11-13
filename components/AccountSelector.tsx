import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Account } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';

interface AccountSelectorProps {
  accounts: Account[];
  selectedAccountId?: string;
  onSelect: (account: Account) => void;
  excludeAccountIds?: string[]; // Accounts to exclude from selection
  showBalance?: boolean;
}

export default function AccountSelector({
  accounts,
  selectedAccountId,
  onSelect,
  excludeAccountIds = [],
  showBalance = false,
}: AccountSelectorProps) {
  const { currency } = useSettings();

  // Filter out excluded accounts
  const availableAccounts = accounts.filter(
    (account) => !excludeAccountIds.includes(account.id)
  );

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {availableAccounts.map((account) => {
        const isSelected = selectedAccountId === account.id;
        return (
          <TouchableOpacity
            key={account.id}
            style={[
              styles.accountButton,
              isSelected && styles.accountButtonSelected,
            ]}
            onPress={() => onSelect(account)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.iconContainer,
                isSelected && styles.iconContainerSelected,
                { backgroundColor: account.color },
              ]}
            >
              <Ionicons name={account.icon as any} size={24} color="white" />
            </View>
            <Text
              style={[
                styles.accountName,
                isSelected && styles.accountNameSelected,
              ]}
              numberOfLines={1}
            >
              {account.name}
            </Text>
            {showBalance && (
              <Text
                style={[
                  styles.accountBalance,
                  isSelected && styles.accountBalanceSelected,
                ]}
                numberOfLines={1}
              >
                {formatCurrency(account.balance)}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    gap: 12,
  },
  accountButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  accountButtonSelected: {
    // Selected state styling handled by icon and text
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D1D5DB', // Light gray default
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  iconContainerSelected: {
    borderColor: '#4F6F3E', // Dark olive green border for selected
    backgroundColor: '#4F6F3E', // Dark olive green background when selected
  },
  accountName: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: '#6B7280', // Dark gray
    textAlign: 'center',
    maxWidth: 80,
  },
  accountNameSelected: {
    color: '#4F6F3E', // Dark olive green
    fontFamily: 'Poppins-Bold',
  },
  accountBalance: {
    fontSize: 10,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF', // Light gray
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 80,
  },
  accountBalanceSelected: {
    color: '#637050', // Olive green tint
  },
});

