import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '@/utils/fonts';

type PeriodType = 'week' | 'month' | 'quarter' | 'custom';

interface Period {
  start: string;
  end: string;
  label: string;
  type: PeriodType;
}

interface PeriodSelectorProps {
  period: Period;
  onPrevious: () => void;
  onNext: () => void;
  onChangeType?: (type: PeriodType) => void;
}

export default function PeriodSelector({
  period,
  onPrevious,
  onNext,
  onChangeType,
}: PeriodSelectorProps) {
  const types: { id: PeriodType; label: string }[] = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        <TouchableOpacity
          style={styles.arrowButton}
          onPress={onPrevious}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#000" />
        </TouchableOpacity>

        <View style={styles.labelContainer}>
          <Text style={styles.label}>{period.label}</Text>
          <Text style={styles.subLabel}>
            {period.start} – {period.end}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.arrowButton}
          onPress={onNext}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={18} color="#000" />
        </TouchableOpacity>
      </View>

      {onChangeType && (
        <View style={styles.typeRow}>
          {types.map((t) => {
            const active = period.type === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => onChangeType(t.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontSize: 18,
    color: '#000',
    fontFamily: Fonts.poppinsSemiBold,
  },
  subLabel: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.6)',
    fontFamily: Fonts.instrumentSerifRegular,
    marginTop: 2,
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  pillActive: {
    backgroundColor: '#000',
  },
  pillText: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.7)',
    fontFamily: Fonts.poppinsSemiBold,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
});

