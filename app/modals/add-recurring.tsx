import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { Bill } from '@/types';
import BillBulkGenerator from '@/components/bills/BillBulkGenerator';

type RecurringNature = 'subscription' | 'bill' | 'payment' | 'income' | 'custom';
type AmountType = 'fixed' | 'variable';
type FundType = 'personal' | 'liability' | 'goal';
type EndType = 'never' | 'on_date' | 'after_count';

interface FormState {
  template: RecurringNature;
  direction: 'income' | 'expense';
  name: string;
  description: string;
  categoryId?: string;
  color: string;
  icon: string;
  amountType: AmountType;
  amount?: string;
  estimatedAmount?: string;
  accountId?: string;
  fundType: FundType;
  frequency: string;
  interval: string;
  startDate: string;
  endType: EndType;
  endDate?: string;
  occurrenceCount?: string;
  customUnit: 'days' | 'weeks' | 'months';
  customEvery: string;
  customWeekdays: string[];
  customMonthDay?: string;
  autoCreate: boolean;
  autoCreateDays: string;
  reminders: number[];
  tags: string;
  notes: string;
  createBill: boolean;
  scheduleNext: boolean;
  scheduleDate?: string;
  scheduleAmount?: string;
  scheduleNotes?: string;
  payNow?: boolean;
}

const templateOptions: {
  key: RecurringNature;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  defaults: Partial<FormState>;
}[] = [
  {
    key: 'subscription',
    title: 'Subscription',
    subtitle: 'Streaming, software, memberships',
    icon: 'play-circle',
    accent: '#EC4899',
    defaults: {
      direction: 'expense',
      amountType: 'fixed',
      frequency: 'monthly',
      autoCreate: true,
      autoCreateDays: '3',
      reminders: [3, 1],
    },
  },
  {
    key: 'bill',
    title: 'Utility/Bill',
    subtitle: 'Electricity, internet, rent',
    icon: 'flash',
    accent: '#F59E0B',
    defaults: {
      direction: 'expense',
      amountType: 'variable',
      frequency: 'monthly',
      autoCreate: true,
      autoCreateDays: '3',
      reminders: [7, 3, 1],
    },
  },
  {
    key: 'payment',
    title: 'Loan / EMI',
    subtitle: 'Home, car, insurance',
    icon: 'business',
    accent: '#0EA5E9',
    defaults: {
      direction: 'expense',
      amountType: 'fixed',
      frequency: 'monthly',
      autoCreate: true,
      autoCreateDays: '3',
      reminders: [7, 3],
      fundType: 'liability',
    },
  },
  {
    key: 'income',
    title: 'Income',
    subtitle: 'Salary, retainers, rent received',
    icon: 'briefcase',
    accent: '#22C55E',
    defaults: {
      direction: 'income',
      amountType: 'fixed',
      frequency: 'monthly',
      autoCreate: true,
      autoCreateDays: '0',
      reminders: [0],
    },
  },
  {
    key: 'custom',
    title: 'Start from scratch',
    subtitle: 'Fully custom settings',
    icon: 'apps',
    accent: '#A855F7',
    defaults: {
      direction: 'expense',
    },
  },
];

const frequencies = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'halfyearly',
  'yearly',
  'custom',
];

const AddRecurringModal = () => {
  const router = useRouter();
  const { accounts, categories } = useRealtimeData();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    template: 'subscription',
    direction: 'expense',
    name: '',
    description: '',
    color: '#EC4899',
    icon: 'play-circle',
    amountType: 'fixed',
    amount: '',
    estimatedAmount: '',
    fundType: 'personal',
    frequency: 'monthly',
    interval: '1',
    startDate: new Date().toISOString().split('T')[0],
    endType: 'never',
    customUnit: 'months',
    customEvery: '1',
    customWeekdays: ['mon'],
    customMonthDay: '1',
    autoCreate: true,
    autoCreateDays: '3',
    reminders: [3, 1],
    tags: '',
    notes: '',
    createBill: false,
    scheduleNext: true,
    scheduleDate: new Date().toISOString().split('T')[0],
    scheduleAmount: '',
    scheduleNotes: '',
    payNow: false,
  });
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);
  const [showBillGenerator, setShowBillGenerator] = useState(false);
  const [billTemplate, setBillTemplate] = useState<Partial<Bill> | null>(null);

  const steps = useMemo(
    () => [
      'Choose Type',
      'Basics',
      'Amount',
      'Account & Fund',
      'Schedule',
      'Reminders',
      'Review',
    ],
    [],
  );

  const updateForm = (patch: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleTemplateSelect = (key: RecurringNature) => {
    const tpl = templateOptions.find((t) => t.key === key);
    if (!tpl) return;
    updateForm({
      template: key,
      icon: tpl.icon,
      color: tpl.accent,
      ...tpl.defaults,
    });
  };

  const toggleReminder = (day: number) => {
    updateForm({
      reminders: form.reminders.includes(day)
        ? form.reminders.filter((d) => d !== day)
        : [...form.reminders, day].sort((a, b) => a - b),
    });
  };

  const canContinue = () => {
    if (step === 0) return true;
    if (step === 1) return form.name.trim().length > 0;
    if (step === 2) {
      return form.amountType === 'fixed'
        ? !!form.amount && Number(form.amount) > 0
        : !!form.estimatedAmount && Number(form.estimatedAmount) > 0;
    }
    if (step === 3) return true;
    if (step === 4) return !!form.frequency && !!form.interval && !!form.startDate;
    return true;
  };

  const baseAmountValue =
    form.amountType === 'fixed'
      ? Number(form.amount || 0)
      : Number(form.estimatedAmount || 0);

  const previewDates = useMemo(() => generatePreviewDates(form), [form]);

  const guardEndDate = (date: string) => {
    if (form.endType === 'on_date' && form.endDate) {
      const end = new Date(form.endDate);
      if (new Date(date) > end) {
        Alert.alert(
          'Beyond end date',
          'This occurrence is after the configured end date. Update the end date if you want to continue.',
        );
        return false;
      }
    }
    return true;
  };

  const handleScheduleOpen = () => {
    updateForm({
      scheduleDate: form.scheduleDate || previewDates[0] || form.startDate,
      scheduleAmount: form.scheduleAmount || (baseAmountValue ? String(baseAmountValue) : ''),
    });
    setShowScheduleSheet(true);
  };

  const handleSubmit = () => {
    if (form.scheduleNext && form.scheduleDate && !guardEndDate(form.scheduleDate)) {
      return;
    }
    console.log('Recurring payload', form, { previewDates });
    Alert.alert('Recurring Created', 'Generate bills for upcoming dates now?', [
      {
        text: 'Generate',
        onPress: () => {
          setBillTemplate(formToBill(form));
          setShowBillGenerator(true);
        },
      },
      {
        text: 'Later',
        style: 'cancel',
        onPress: () => router.back(),
      },
    ]);
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <View>
            <Text style={styles.sectionTitle}>What are you setting up?</Text>
            {templateOptions.map((tpl) => {
              const active = form.template === tpl.key;
              return (
                <TouchableOpacity
                  key={tpl.key}
                  style={[
                    styles.templateCard,
                    active && { borderColor: tpl.accent, backgroundColor: `${tpl.accent}22` },
                  ]}
                  onPress={() => handleTemplateSelect(tpl.key)}
                >
                  <View style={styles.templateHeader}>
                    <View style={[styles.templateIcon, { backgroundColor: `${tpl.accent}22` }]}>
                      <Ionicons name={tpl.icon as any} size={20} color={tpl.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateTitle}>{tpl.title}</Text>
                      <Text style={styles.templateSubtitle}>{tpl.subtitle}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={tpl.accent} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      case 1:
        return (
          <View>
            <Text style={styles.sectionTitle}>Basic information</Text>
            <Text style={styles.fieldLabel}>Flow</Text>
            <View style={styles.toggleRow}>
              {(['expense', 'income'] as const).map((direction) => (
                <TouchableOpacity
                  key={direction}
                  style={[
                    styles.toggleButton,
                    form.direction === direction && styles.toggleButtonActive,
                  ]}
                  onPress={() => updateForm({ direction })}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      form.direction === direction && styles.toggleTextActive,
                    ]}
                  >
                    {direction === 'expense' ? 'Expense (money out)' : 'Income (money in)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Name e.g. Netflix Premium"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.name}
              onChangeText={(name) => updateForm({ name })}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Description / Notes"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.description}
              onChangeText={(description) => updateForm({ description })}
              multiline
            />
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {categories.map((cat) => {
                  const active = form.categoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.pill,
                        active && { borderColor: cat.color, backgroundColor: `${cat.color}22` },
                      ]}
                      onPress={() => updateForm({ categoryId: cat.id })}
                    >
                      <Text style={styles.pillText}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        );
      case 2:
        return (
          <View>
            <Text style={styles.sectionTitle}>Amount pattern</Text>
            <View style={styles.toggleRow}>
              {(['fixed', 'variable'] satisfies AmountType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleButton,
                    form.amountType === type && styles.toggleButtonActive,
                  ]}
                  onPress={() => updateForm({ amountType: type })}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      form.amountType === type && styles.toggleTextActive,
                    ]}
                  >
                    {type === 'fixed' ? 'Fixed amount' : 'Variable (estimate)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.amountType === 'fixed' ? (
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Amount e.g. 649"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={form.amount}
                onChangeText={(amount) => updateForm({ amount })}
              />
            ) : (
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Estimated amount e.g. 2500"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={form.estimatedAmount}
                onChangeText={(estimatedAmount) => updateForm({ estimatedAmount })}
              />
            )}
          </View>
        );
      case 3:
        return (
          <View>
            <Text style={styles.sectionTitle}>Account & fund</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {accounts.map((account) => {
                const active = form.accountId === account.id;
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[
                      styles.accountCard,
                      active && { borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.15)' },
                    ]}
                    onPress={() => updateForm({ accountId: account.id })}
                  >
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountType}>{account.type}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={styles.fieldLabel}>Fund type</Text>
            <View style={styles.toggleRow}>
              {(['personal', 'liability', 'goal'] satisfies FundType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleButton,
                    form.fundType === type && styles.toggleButtonActive,
                  ]}
                  onPress={() => updateForm({ fundType: type })}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      form.fundType === type && styles.toggleTextActive,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 4:
        return (
          <View>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <Text style={styles.fieldLabel}>Frequency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {frequencies.map((freq) => {
                const active = form.frequency === freq;
                return (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => updateForm({ frequency: freq })}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        active && { color: '#10B981', fontWeight: '600' },
                      ]}
                    >
                      {freq}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="Repeat every (e.g. 1)"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.interval}
              onChangeText={(interval) => updateForm({ interval })}
            />
            <TextInput
              style={styles.input}
              placeholder="First occurrence (YYYY-MM-DD)"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.startDate}
              onChangeText={(startDate) => updateForm({ startDate, scheduleDate: startDate })}
            />
            <Text style={styles.fieldLabel}>End</Text>
            <View style={styles.toggleRow}>
              {(['never', 'on_date', 'after_count'] satisfies EndType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleButton,
                    form.endType === type && styles.toggleButtonActive,
                  ]}
                  onPress={() => updateForm({ endType: type })}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      form.endType === type && styles.toggleTextActive,
                    ]}
                  >
                    {type === 'never'
                      ? 'Never'
                      : type === 'on_date'
                      ? 'On date'
                      : 'After count'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.endType === 'on_date' && (
              <TextInput
                style={styles.input}
                placeholder="End date (YYYY-MM-DD)"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={form.endDate}
                onChangeText={(endDate) => updateForm({ endDate })}
              />
            )}
            {form.endType === 'after_count' && (
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Number of occurrences"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={form.occurrenceCount}
                onChangeText={(occurrenceCount) => updateForm({ occurrenceCount })}
              />
            )}
            {form.frequency === 'custom' && (
              <View>
                <Text style={styles.fieldLabel}>Custom interval</Text>
                <View style={styles.customRow}>
                  <TextInput
                    style={[styles.input, styles.customInput]}
                    keyboardType="numeric"
                    placeholder="Every"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={form.customEvery}
                    onChangeText={(customEvery) => updateForm({ customEvery })}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {(['days', 'weeks', 'months'] as const).map((unit) => (
                      <TouchableOpacity
                        key={unit}
                        style={[
                          styles.pill,
                          form.customUnit === unit && styles.pillActive,
                        ]}
                        onPress={() => updateForm({ customUnit: unit })}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            form.customUnit === unit && { color: '#10B981', fontWeight: '600' },
                          ]}
                        >
                          {unit}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                {form.customUnit === 'weeks' && (
                  <>
                    <Text style={styles.fieldLabel}>Weekdays</Text>
                    <View style={styles.toggleRow}>
                      {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => {
                        const active = form.customWeekdays.includes(day);
                        return (
                          <TouchableOpacity
                            key={day}
                            style={[styles.toggleButton, active && styles.toggleButtonActive]}
                            onPress={() =>
                              updateForm({
                                customWeekdays: active
                                  ? form.customWeekdays.filter((d) => d !== day)
                                  : [...form.customWeekdays, day],
                              })
                            }
                          >
                            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                              {day.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
                {form.customUnit === 'months' && (
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="Day of month (1-31)"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={form.customMonthDay}
                    onChangeText={(customMonthDay) => updateForm({ customMonthDay })}
                  />
                )}
              </View>
            )}
            <Text style={styles.fieldLabel}>Upcoming preview</Text>
            <View style={styles.previewCard}>
              {previewDates.map((date) => (
                <Text style={styles.previewLine} key={date}>
                  • {date}
                </Text>
              ))}
              {!previewDates.length && (
                <Text style={styles.previewLine}>Unable to calculate dates</Text>
              )}
            </View>
            <TouchableOpacity style={styles.scheduleButton} onPress={handleScheduleOpen}>
              <Ionicons name="calendar-outline" size={18} color="#10B981" />
              <Text style={styles.scheduleButtonText}>Plan first payment / bill</Text>
            </TouchableOpacity>
          </View>
        );
      case 5:
        return (
          <View>
            <Text style={styles.sectionTitle}>Reminders & automation</Text>
            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Auto-create transactions</Text>
              <Switch
                value={form.autoCreate}
                onValueChange={(autoCreate) => updateForm({ autoCreate })}
                thumbColor="#10B981"
              />
            </View>
            {form.autoCreate && (
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Create X days before"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={form.autoCreateDays}
                onChangeText={(autoCreateDays) => updateForm({ autoCreateDays })}
              />
            )}
            <Text style={styles.fieldLabel}>Reminder cadence</Text>
            <View style={styles.toggleRow}>
              {[7, 3, 1, 0].map((day) => {
                const active = form.reminders.includes(day);
                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.toggleButton, active && styles.toggleButtonActive]}
                    onPress={() => toggleReminder(day)}
                  >
                    <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                      {day === 0 ? 'On due date' : `${day} days before`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Tags (comma separated)"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.tags}
              onChangeText={(tags) => updateForm({ tags })}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Notes"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.notes}
              onChangeText={(notes) => updateForm({ notes })}
              multiline
            />
            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Create bill for next cycle</Text>
              <Switch
                value={form.createBill}
                onValueChange={(createBill) => updateForm({ createBill })}
                thumbColor="#fbbf24"
              />
            </View>
          </View>
        );
      case 6:
        return (
          <View>
            <Text style={styles.sectionTitle}>Review</Text>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>{form.name || 'Unnamed transaction'}</Text>
              <Text style={styles.reviewLine}>
                Type • {form.template.charAt(0).toUpperCase() + form.template.slice(1)}
              </Text>
              <Text style={styles.reviewLine}>
                Amount •{' '}
                {form.amountType === 'fixed'
                  ? `₹${form.amount || '0'}`
                  : `Variable (est. ₹${form.estimatedAmount || '0'})`}
              </Text>
              <Text style={styles.reviewLine}>
                Schedule • Every {form.interval} {form.frequency}
              </Text>
              <Text style={styles.reviewLine}>
                Flow • {form.direction === 'expense' ? 'Expense' : 'Income'}
              </Text>
              <Text style={styles.reviewLine}>Account • {getAccountName(form.accountId)}</Text>
              <Text style={styles.reviewLine}>
                Auto-create • {form.autoCreate ? `Yes (${form.autoCreateDays} days before)` : 'Manual'}
              </Text>
              <Text style={styles.reviewLine}>
                Reminders • {form.reminders.length ? form.reminders.join(', ') : 'None'}
              </Text>
              <Text style={styles.reviewLine}>
                Bill creation • {form.createBill ? 'Yes' : 'No'}
              </Text>
              {form.notes ? <Text style={styles.reviewLine}>Notes • {form.notes}</Text> : null}
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const getAccountName = (accountId?: string) => {
    if (!accountId) return 'Not selected';
    return accounts.find((acc) => acc.id === accountId)?.name ?? 'Unknown';
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Create Recurring Transaction</Text>
          <Text style={styles.headerSubtitle}>
            Step {step + 1} of {steps.length} • {steps[step]}
          </Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressThumb, { width: `${((step + 1) / steps.length) * 100}%` }]} />
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {renderStepContent()}
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerButtonGhost} onPress={() => router.back()}>
          <Text style={styles.footerGhostText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerButtonGhost, step === 0 && styles.footerDisabled]}
          disabled={step === 0}
          onPress={() => setStep((prev) => Math.max(0, prev - 1))}
        >
          <Text style={[styles.footerGhostText, step === 0 && { opacity: 0.4 }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, !canContinue() && styles.footerDisabled]}
          disabled={!canContinue()}
          onPress={() => {
            if (step === steps.length - 1) {
              handleSubmit();
            } else {
              setStep((prev) => Math.min(steps.length - 1, prev + 1));
            }
          }}
        >
          <Text style={styles.primaryButtonText}>
            {step === steps.length - 1 ? 'Create' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
      {showScheduleSheet && (
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Schedule First Payment</Text>
              <TouchableOpacity onPress={() => setShowScheduleSheet(false)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Due date (YYYY-MM-DD)"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.scheduleDate}
              onChangeText={(scheduleDate) => updateForm({ scheduleDate })}
            />
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.scheduleAmount}
              onChangeText={(scheduleAmount) => updateForm({ scheduleAmount })}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Notes"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={form.scheduleNotes}
              onChangeText={(scheduleNotes) => updateForm({ scheduleNotes })}
              multiline
            />
            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Mark as paid now</Text>
              <Switch
                value={!!form.payNow}
                onValueChange={(payNow) => updateForm({ payNow })}
                thumbColor="#10B981"
              />
            </View>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                if (form.scheduleDate && !guardEndDate(form.scheduleDate)) {
                  return;
                }
                setShowScheduleSheet(false);
              }}
            >
              <Text style={styles.primaryButtonText}>Save Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <BillBulkGenerator
        visible={showBillGenerator}
        template={(billTemplate as Bill | null) ?? null}
        onClose={() => {
          setShowBillGenerator(false);
          router.back();
        }}
        onSuccess={() => {
          setShowBillGenerator(false);
          router.back();
        }}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingTop: 48,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    marginLeft: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    marginBottom: 16,
  },
  progressThumb: {
    height: 4,
    backgroundColor: '#10B981',
    borderRadius: 999,
  },
  scroll: {
    flex: 1,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginRight: 10,
  },
  pillActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  pillText: {
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  toggleButtonActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  toggleText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  toggleTextActive: {
    color: '#10B981',
    fontWeight: '600',
  },
  templateCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  templateSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customInput: {
    flex: 1,
  },
  accountCard: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginRight: 12,
  },
  accountName: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  accountType: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reviewTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 12,
  },
  reviewLine: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginBottom: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  footerButtonGhost: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    paddingVertical: 14,
  },
  footerGhostText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1.3,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#041B11',
    fontSize: 16,
    fontWeight: '700',
  },
  footerDisabled: {
    opacity: 0.4,
  },
  previewCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  previewLine: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#10B981',
    padding: 12,
  },
  scheduleButtonText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#020617',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default AddRecurringModal;

function formToBill(form: FormState): Partial<Bill> {
  return {
    title: form.name,
    description: form.description,
    amount:
      form.amountType === 'fixed'
        ? Number(form.amount || 0)
        : undefined,
    currency: 'INR',
    category_id: form.categoryId,
    bill_type: 'recurring_fixed',
    recurrence_pattern: form.frequency as Bill['recurrence_pattern'],
    recurrence_interval: Number(form.interval || '1'),
    due_date: form.startDate,
    original_due_date: form.startDate,
    reminder_days: form.reminders,
    linked_account_id: form.accountId,
    color: form.color,
    icon: form.icon,
    metadata: {
      source_type: 'recurring_transaction',
    },
  };
}

function generatePreviewDates(form: FormState): string[] {
  if (!form.startDate) return [];
  const dates: string[] = [];
  const start = new Date(form.startDate);
  if (Number.isNaN(start.getTime())) return dates;

  const push = (date: Date) => {
    dates.push(date.toISOString().split('T')[0]);
  };

  if (form.frequency === 'custom') {
    const every = Math.max(1, Number(form.customEvery || '1'));
    if (form.customUnit === 'days') {
      for (let i = 0; i < 3; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + every * i);
        push(d);
      }
    } else if (form.customUnit === 'weeks') {
      const weekdays = form.customWeekdays.length ? form.customWeekdays : ['mon'];
      let weekIndex = 0;
      while (dates.length < 3) {
        weekdays.forEach((weekday) => {
          const d = new Date(start);
          d.setDate(
            start.getDate() +
              weekIndex * every * 7 +
              weekdayOffset(start, weekday),
          );
          if (dates.length < 3) push(d);
        });
        weekIndex += 1;
      }
    } else {
      const day = Math.min(
        28,
        Math.max(1, Number(form.customMonthDay || start.getDate())),
      );
      for (let i = 0; i < 3; i += 1) {
        const d = new Date(start);
        d.setMonth(start.getMonth() + every * i, day);
        push(d);
      }
    }
    return dates;
  }

  const repeat = Math.max(1, Number(form.interval || '1'));
  let current = new Date(start);
  for (let i = 0; i < 3; i += 1) {
    if (i === 0) {
      push(current);
      continue;
    }
    const next = new Date(current);
    switch (form.frequency) {
      case 'daily':
        next.setDate(current.getDate() + repeat);
        break;
      case 'weekly':
        next.setDate(current.getDate() + repeat * 7);
        break;
      case 'biweekly':
        next.setDate(current.getDate() + repeat * 14);
        break;
      case 'bimonthly':
        next.setMonth(current.getMonth() + repeat * 2);
        break;
      case 'quarterly':
        next.setMonth(current.getMonth() + repeat * 3);
        break;
      case 'halfyearly':
        next.setMonth(current.getMonth() + repeat * 6);
        break;
      case 'yearly':
        next.setFullYear(current.getFullYear() + repeat);
        break;
      default:
        next.setMonth(current.getMonth() + repeat);
        break;
    }
    current = next;
    push(next);
  }

  return dates;
}

function weekdayOffset(start: Date, weekday: string): number {
  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const target = map[weekday] ?? 1;
  const diff = target - start.getDay();
  return diff >= 0 ? diff : diff + 7;
}

