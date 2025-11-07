import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';

type ActionType = 'add' | 'delete' | 'draw' | 'increase';

export default function ActivityActionModal() {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { accounts, goals, categories } = useRealtimeData();

  const [action, setAction] = useState<ActionType>('add');
  const [amount, setAmount] = useState('');
  const [targetType, setTargetType] = useState<'goal' | 'category' | 'account'>('category');
  const [targetId, setTargetId] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const targets = useMemo(() => {
    if (targetType === 'goal') return goals || [];
    if (targetType === 'account') return accounts || [];
    return categories || [];
  }, [targetType, goals, accounts, categories]);

  const handleSubmit = async () => {
    if (!user?.id) return Alert.alert('Error', 'Please sign in');
    const amt = Number(amount);
    if (!targetId) return Alert.alert('Validation', 'Please select a target');
    if (!amount || isNaN(amt) || amt <= 0) return Alert.alert('Validation', 'Enter a valid amount');

    try {
      setLoading(true);
      // Frontend-first stub: backend wiring to be added
      Alert.alert('Queued', `Action: ${action} ${formatCurrencyAmount(amt, currency)} on ${targetType}`);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#99D795", "#99D795", "#99D795"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Activity Action</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Action</Text>
          <View style={styles.segment}>
            {(['add', 'delete', 'draw', 'increase'] as ActionType[]).map((t) => (
              <TouchableOpacity key={t} style={[styles.segmentBtn, action === t && styles.segmentBtnActive]} onPress={() => setAction(t)}>
                <Text style={[styles.segmentText, action === t && styles.segmentTextActive]}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Target</Text>
          <View style={styles.segment}>
            {(['category', 'goal', 'account'] as const).map((t) => (
              <TouchableOpacity key={t} style={[styles.segmentBtn, targetType === t && styles.segmentBtnActive]} onPress={() => { setTargetType(t); setTargetId(''); }}>
                <Text style={[styles.segmentText, targetType === t && styles.segmentTextActive]}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.targetsRow}>
            {targets.slice(0, 5).map((t: any) => (
              <TouchableOpacity key={t.id} style={[styles.targetPill, targetId === t.id && styles.targetPillActive]} onPress={() => setTargetId(t.id)}>
                <Text style={[styles.targetPillText, targetId === t.id && styles.targetPillTextActive]}>{t.name || t.title}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Amount</Text>
          <TextInput
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder={`Amount in ${currency}`}
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note"
            placeholderTextColor="#9CA3AF"
            style={[styles.input, { height: 44 }]}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Submitting...' : 'Submit'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 8,
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#000000',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 16,
  },
  label: { color: 'white', fontSize: 14, marginTop: 8, marginBottom: 8 },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#10B981' },
  segmentText: { color: 'white', fontWeight: '600', fontSize: 12 },
  segmentTextActive: { color: 'white' },
  targetsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  targetPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', marginRight: 8, marginBottom: 8 },
  targetPillActive: { backgroundColor: '#10B981' },
  targetPillText: { color: 'white', fontSize: 12 },
  targetPillTextActive: { color: 'white', fontWeight: '700' },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
    marginBottom: 8,
  },
  primaryButton: { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: 'white', fontWeight: 'bold' },
});


