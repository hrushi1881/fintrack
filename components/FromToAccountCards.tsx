import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Account } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';

interface FromToAccountCardsProps {
  fromAccount?: Account;
  toAccount?: Account;
  onFromPress: () => void;
  onToPress: () => void;
  fromLabel?: string;
  toLabel?: string;
}

export default function FromToAccountCards({
  fromAccount,
  toAccount,
  onFromPress,
  onToPress,
  fromLabel = 'From',
  toLabel = 'To',
}: FromToAccountCardsProps) {
  const { currency } = useSettings();

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

  return (
    <View style={styles.container}>
      {/* From Card */}
      <TouchableOpacity
        style={styles.card}
        onPress={onFromPress}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          <View style={styles.iconWrapper}>
            <View style={styles.iconCircle}>
              <Ionicons name="arrow-up" size={20} color="#4F6F3E" />
            </View>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.label}>{fromLabel}</Text>
            {fromAccount ? (
              <>
                <Text style={styles.accountName}>
                  {fromAccount.name}
                </Text>
                <Text style={styles.accountBalance}>
                  {formatCurrency(fromAccount.balance)}
                </Text>
              </>
            ) : (
              <Text style={styles.placeholder}>Select account</Text>
            )}
          </View>
          <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
        </View>
      </TouchableOpacity>

      {/* To Card */}
      <TouchableOpacity
        style={styles.card}
        onPress={onToPress}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          <View style={styles.iconWrapper}>
            <View style={styles.iconCircle}>
              <Ionicons name="arrow-down" size={20} color="#4F6F3E" />
            </View>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.label}>{toLabel}</Text>
            {toAccount ? (
              <>
                <Text style={styles.accountName}>
                  {toAccount.name}
                </Text>
                <Text style={styles.accountBalance}>
                  {formatCurrency(toAccount.balance)}
                </Text>
              </>
            ) : (
              <Text style={styles.placeholder}>Select account</Text>
            )}
          </View>
          <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E7EDDD', // Light olive green
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#9CA3AF',
    marginBottom: 4,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F2937',
    marginBottom: 2,
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#6B7280',
  },
  placeholder: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
});

