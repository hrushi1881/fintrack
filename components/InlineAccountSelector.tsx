import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Account } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';

interface InlineAccountSelectorProps {
  accounts: Account[];
  selectedAccountId: string | null;
  onSelect: (account: Account) => void;
  label: string;
  excludeAccountIds?: string[];
  showBalance?: boolean;
}

export default function InlineAccountSelector({
  accounts,
  selectedAccountId,
  onSelect,
  label,
  excludeAccountIds = [],
  showBalance = true,
}: InlineAccountSelectorProps) {
  const { currency } = useSettings();

  const filteredAccounts = accounts.filter(
    (account) => !excludeAccountIds.includes(account.id)
  );

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

  if (filteredAccounts.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={24} color="#9CA3AF" />
          <Text style={styles.emptyStateText}>No accounts available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.accountsContainer}
      >
        {filteredAccounts.map((account) => {
          const isSelected = selectedAccountId === account.id;
          return (
            <TouchableOpacity
              key={account.id}
              style={[
                styles.accountItem,
                isSelected && styles.accountItemSelected,
              ]}
              onPress={() => onSelect(account)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.accountIcon,
                  isSelected && styles.accountIconSelected,
                  { backgroundColor: account.color },
                ]}
              >
                <Ionicons name={account.icon as any} size={28} color="white" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Archivo Black',
    color: '#1F3A24',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  accountsContainer: {
    paddingVertical: 4,
    gap: 12,
  },
  accountItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F7F9F2',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accountItemSelected: {
    backgroundColor: '#E5ECD6',
    borderColor: '#4F6F3E',
  },
  accountIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  accountIconSelected: {
    borderColor: '#FFFFFF',
    shadowColor: '#4F6F3E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  accountName: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
    textAlign: 'center',
    marginBottom: 4,
    maxWidth: 90,
  },
  accountNameSelected: {
    color: '#1F3A24',
    fontFamily: 'InstrumentSerif-Regular',
  },
  accountBalance: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: 90,
  },
  accountBalanceSelected: {
    color: '#4F6F3E',
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#F7F9F2',
    borderRadius: 16,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
  },
});

