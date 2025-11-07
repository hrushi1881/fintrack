import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

type AccountItem = {
  id: string;
  name: string;
  total: number;
  liabilityPortion: number;
};

type Props = {
  accounts: AccountItem[];
  selectedAccountId?: string | null;
  onSelect?: (accountId: string) => void;
};

export default function LiabilityAccountPicker({ accounts, selectedAccountId, onSelect }: Props) {
  return (
    <View style={styles.container}>
      {accounts.map((acc) => (
        <TouchableOpacity
          key={acc.id}
          style={[styles.row, selectedAccountId === acc.id && styles.rowActive]}
          onPress={() => onSelect && onSelect(acc.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{acc.name}</Text>
            <Text style={styles.sub}>
              Total: {acc.total} • Liability portion: {acc.liabilityPortion}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  row: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  sub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
});


