import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Bill } from '@/types';
import { createBill, generatePaymentBillFromContainer } from '@/utils/bills';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';

type FrequencyUnit = 'days' | 'weeks' | 'months';

interface BillBulkGeneratorProps {
  visible: boolean;
  onClose: () => void;
  template: Bill | null;
  onSuccess?: () => void;
}

interface ScheduleRow {
  id: string;
  dueDate: string;
  amount: string;
}

const formatISO = (date: Date) => date.toISOString().split('T')[0];

const generateId = () => Math.random().toString(36).slice(2);

export const BillBulkGenerator: React.FC<BillBulkGeneratorProps> = ({
  visible,
  onClose,
  template,
  onSuccess,
}) => {
  const { currency } = useSettings();
  const [startDate, setStartDate] = useState(formatISO(new Date()));
  const [unit, setUnit] = useState<FrequencyUnit>('months');
  const [every, setEvery] = useState('1');
  const [occurrences, setOccurrences] = useState('3');
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);

  const baseAmount = template?.amount ?? null;

  const previewRows = useMemo(() => {
    const count = Math.max(1, parseInt(occurrences || '1', 10));
    const everyValue = Math.max(1, parseInt(every || '1', 10));
    const rowsPreview: ScheduleRow[] = [];
    const base = startDate ? new Date(startDate) : new Date();
    for (let i = 0; i < count; i += 1) {
      const date = new Date(base);
      if (i > 0) {
        if (unit === 'days') {
          date.setDate(base.getDate() + everyValue * i);
        } else if (unit === 'weeks') {
          date.setDate(base.getDate() + everyValue * 7 * i);
        } else {
          date.setMonth(base.getMonth() + everyValue * i);
        }
      }
      rowsPreview.push({
        id: generateId(),
        dueDate: formatISO(date),
        amount: baseAmount ? String(baseAmount) : '',
      });
    }
    return rowsPreview;
  }, [startDate, unit, every, occurrences, baseAmount]);

  useEffect(() => {
    if (visible) {
      setRows(previewRows);
    }
  }, [visible, previewRows]);

  useEffect(() => {
    if (template) {
      const nextDate =
        template.next_due_date || template.due_date || formatISO(new Date());
      setStartDate(nextDate);
    }
  }, [template]);

  const handleRowChange = (id: string, field: 'dueDate' | 'amount', value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: generateId(),
        dueDate: prev.length ? prev[prev.length - 1].dueDate : startDate,
        amount: baseAmount ? String(baseAmount) : '',
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const handleCreate = async () => {
    if (!template) return;
    const validRows = rows.filter((row) => row.dueDate);
    if (!validRows.length) {
      Alert.alert('Select dates', 'Please provide at least one due date.');
      return;
    }

    // Check if this is a container bill (parent_bill_id is null and it's recurring)
    const hasFrequencyInfo = Boolean(template.frequency || template.recurrence_pattern);
    const isContainerBill =
      !template.parent_bill_id &&
      template.bill_type !== 'one_time' &&
      hasFrequencyInfo;

    try {
      setLoading(true);
      for (const row of validRows) {
        if (isContainerBill) {
          // For container bills, create payment bills using generatePaymentBillFromContainer
          await generatePaymentBillFromContainer(
            template.id,
            row.dueDate,
            row.amount ? parseFloat(row.amount) : undefined
          );
        } else {
          // For non-container bills, create regular bills
          await createBill({
            title: template.title,
            description: template.description || undefined,
            amount: row.amount ? parseFloat(row.amount) : undefined,
            currency: template.currency,
            category_id: template.category_id || undefined,
            bill_type: template.bill_type,
            recurrence_pattern: template.recurrence_pattern || undefined,
            recurrence_interval: template.recurrence_interval || undefined,
            due_date: row.dueDate,
            original_due_date: row.dueDate,
            reminder_days: template.reminder_days || [1, 3, 7],
            goal_id: template.goal_id || undefined,
            linked_account_id: template.linked_account_id || undefined,
            color: template.color,
            icon: template.icon,
            notes: template.notes || undefined,
            metadata: template.metadata || undefined,
          });
        }
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to generate bills. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!template) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Generate Bills</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.label}>Start date</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Repeat every</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  value={every}
                  onChangeText={setEvery}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(['days', 'weeks', 'months'] as FrequencyUnit[]).map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.pill,
                        unit === option && styles.pillActive,
                      ]}
                      onPress={() => setUnit(option)}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          unit === option && styles.pillTextActive,
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Occurrences</Text>
              <TextInput
                style={styles.input}
                value={occurrences}
                onChangeText={setOccurrences}
                keyboardType="numeric"
                placeholder="3"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.section}>
              <View style={styles.listHeader}>
                <Text style={styles.label}>Bills to create</Text>
                <TouchableOpacity onPress={handleAddRow}>
                  <Text style={styles.addRow}>+ Add Row</Text>
                </TouchableOpacity>
              </View>
              {rows.map((row, index) => (
                <View key={row.id} style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowIndex}>#{index + 1}</Text>
                    {rows.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemoveRow(row.id)}>
                        <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.6)" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={styles.input}
                    value={row.dueDate}
                    onChangeText={(value) => handleRowChange(row.id, 'dueDate', value)}
                    placeholder="Due date"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                  />
                  <TextInput
                    style={styles.input}
                    value={row.amount}
                    onChangeText={(value) => handleRowChange(row.id, 'amount', value)}
                    placeholder="Amount"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    keyboardType="numeric"
                  />
                  {row.amount ? (
                    <Text style={styles.helper}>
                      {formatCurrencyAmount(parseFloat(row.amount) || 0, currency)}
                    </Text>
                  ) : (
                    <Text style={styles.helper}>Leave empty if variable</Text>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primary, loading && styles.primaryDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#041B11" />
              ) : (
                <Text style={styles.primaryText}>
                  Create {rows.length > 1 ? `${rows.length} Bills` : 'Bill'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#020617',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
    fontSize: 14,
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  smallInput: {
    width: 80,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginRight: 8,
  },
  pillActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  pillText: {
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'capitalize',
  },
  pillTextActive: {
    color: '#10B981',
    fontWeight: '600',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addRow: {
    color: '#10B981',
    fontWeight: '600',
  },
  rowCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rowIndex: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  helper: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  secondary: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    paddingVertical: 16,
  },
  secondaryText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  primary: {
    flex: 1.2,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryDisabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: '#041B11',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BillBulkGenerator;



