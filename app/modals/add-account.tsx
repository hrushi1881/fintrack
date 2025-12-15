import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import type { Account } from '@/types';

export type AccountTypeOption = 'debit' | 'credit' | 'savings' | 'wallet';

interface OrganizationChoice {
  id: string;
  name: string;
  currency: string;
}

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (account: Account, organizationId: string | null) => void;
  organizationId?: string;
  organizationName?: string;
  organizationOptions?: OrganizationChoice[];
  defaultOrganizationId?: string;
}

interface AccountFormState {
  name: string;
  type: AccountTypeOption;
  initialBalance: string;
  creditLimit: string;
  description?: string;
}

const ACCOUNT_TYPE_OPTIONS: { value: AccountTypeOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'debit', label: 'Debit', icon: 'card-outline' },
  { value: 'credit', label: 'Credit', icon: 'card' },
  { value: 'savings', label: 'Savings', icon: 'cash-outline' },
  { value: 'wallet', label: 'Wallet', icon: 'id-card-outline' },
];

const AddAccountModal: React.FC<AddAccountModalProps> = ({
  visible,
  onClose,
  onSuccess,
  organizationId,
  organizationName,
  organizationOptions = [],
  defaultOrganizationId,
}) => {
  const { user } = useAuth();
  const { currency: userCurrency } = useSettings();
  const { globalRefresh } = useRealtimeData();

  const [formState, setFormState] = useState<AccountFormState>({
    name: '',
    type: 'debit',
    initialBalance: '',
    creditLimit: '',
    description: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(organizationId ?? null);

  const availableOrganizations = useMemo(() => {
    if (!organizationOptions || organizationOptions.length === 0) return [];
    const seen = new Set<string>();
    return organizationOptions.filter((org) => {
      if (seen.has(org.id)) return false;
      seen.add(org.id);
      return true;
    });
  }, [organizationOptions]);

  const resolvedSelectionId =
    selectedOrganizationId ?? organizationId ?? availableOrganizations[0]?.id ?? null;

  const canSubmit = useMemo(() => {
    if (!formState.name.trim()) return false;
    if (formState.type === 'credit') {
      const limit = parseFloat(formState.creditLimit || '0');
      if (!formState.creditLimit || Number.isNaN(limit) || limit <= 0) return false;
    }
    if (availableOrganizations.length === 0) return true;
    return resolvedSelectionId !== undefined;
  }, [formState, availableOrganizations.length, resolvedSelectionId]);

  const handleChange = <Field extends keyof AccountFormState>(field: Field, value: AccountFormState[Field]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleClose = () => {
    setFormState({
      name: '',
      type: 'debit',
      initialBalance: '',
      creditLimit: '',
      description: '',
    });
    setIsSaving(false);
    setSelectedOrganizationId(organizationId ?? null);
    onClose();
  };

  useEffect(() => {
    if (visible) {
      setSelectedOrganizationId(organizationId ?? null);
    }
  }, [organizationId, visible]);

  useEffect(() => {
    if (!visible) return;
    if (!selectedOrganizationId && availableOrganizations.length > 0) {
      setSelectedOrganizationId(availableOrganizations[0]?.id ?? null);
    }
  }, [availableOrganizations, organizationId, visible, selectedOrganizationId]);

  const handleCreateAccount = async () => {
    if (!user || !canSubmit) return;

    setIsSaving(true);

    try {
      const initialBalanceNumber = parseFloat(formState.initialBalance || '0') || 0;
      const creditLimitNumber = parseFloat(formState.creditLimit || '0') || null;

      const finalOrgId =
        resolvedSelectionId === undefined || resolvedSelectionId === null
          ? null
          : resolvedSelectionId === defaultOrganizationId
          ? null
          : resolvedSelectionId;
      const currencyToUse =
        availableOrganizations.find((org) => org.id === resolvedSelectionId)?.currency ||
        organizationOptions.find((org) => org.id === resolvedSelectionId)?.currency ||
        userCurrency ||
        'USD';

      const accountTypeForDb =
        formState.type === 'credit'
          ? 'card'
          : formState.type === 'wallet'
          ? 'wallet'
          : 'bank';

      const payload = {
        user_id: user.id,
        name: formState.name.trim(),
        type: accountTypeForDb,
        balance: initialBalanceNumber,
        currency: currencyToUse,
        include_in_totals: true,
        is_active: true,
        description: formState.description?.trim() || null,
      } as any;

      payload.organization_id = finalOrgId ?? null;

      if (accountTypeForDb === 'card') {
        payload.credit_limit = creditLimitNumber;
      }

      const { data: accountRows, error: accountError } = await supabase
        .from('accounts')
        .insert(payload)
        .select()
        .single();

      if (accountError || !accountRows) {
        console.error('Error creating account row', accountError);
        throw accountError || new Error('Unable to create account');
      }

      await globalRefresh();

      onSuccess?.(accountRows as Account, finalOrgId);

      Alert.alert('Account created', `${formState.name.trim()} added successfully.`);
      
      // Reset form but keep modal open
      setFormState({
        name: '',
        type: 'debit',
        initialBalance: '',
        creditLimit: '',
        description: '',
      });
      setSelectedOrganizationId(organizationId ?? null);
      
      // Modal stays open - user can add another account
    } catch (error: any) {
      console.error('Failed to create account', error);
      const message =
        (error && typeof error === 'object' && 'message' in error && error.message) ||
        'Something went wrong while creating the account.';
      Alert.alert('Could not create account', String(message));
    } finally {
      setIsSaving(false);
    }
  };

  const activeOrganizationName = useMemo(() => {
    if (organizationName && !selectedOrganizationId) return organizationName;
    if (!resolvedSelectionId) return undefined;
    return availableOrganizations.find((org) => org.id === resolvedSelectionId)?.name ?? organizationName;
  }, [organizationName, resolvedSelectionId, availableOrganizations]);

  const shouldShowOrganizationBanner =
    Boolean(activeOrganizationName) &&
    (!defaultOrganizationId || resolvedSelectionId !== defaultOrganizationId);

  const activeCurrency = useMemo(() => {
    if (resolvedSelectionId) {
      const orgMatch =
        availableOrganizations.find((org) => org.id === resolvedSelectionId) ||
        organizationOptions.find((org) => org.id === resolvedSelectionId);
      if (orgMatch?.currency) return orgMatch.currency;
    }
    return userCurrency ?? 'USD';
  }, [availableOrganizations, organizationOptions, resolvedSelectionId, userCurrency]);

  const currencySourceLabel = useMemo(() => {
    if (!activeCurrency) return '';
    if (!resolvedSelectionId || resolvedSelectionId === defaultOrganizationId) {
      return `${activeCurrency} · from your profile settings`;
    }
    return `${activeCurrency} · set by selected organization`;
  }, [activeCurrency, resolvedSelectionId, defaultOrganizationId]);

    return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.iconButton} onPress={handleClose}>
              <Ionicons name="close" size={20} color="#0E401C" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add New Account</Text>
            <View style={styles.iconPlaceholder} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {shouldShowOrganizationBanner ? (
              <View style={styles.subHeaderContainer}>
                <Text style={styles.subHeaderText}>Under {activeOrganizationName}</Text>
            </View>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Account Name</Text>
        <TextInput
          style={styles.input}
                placeholder="e.g., Main Checking"
                placeholderTextColor="#9AA88B"
                value={formState.name}
                onChangeText={(text) => handleChange('name', text)}
        />
      </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Account Type</Text>
              <View style={styles.typeRow}>
                {ACCOUNT_TYPE_OPTIONS.map((option) => {
                  const isActive = formState.type === option.value;
                  return (
            <TouchableOpacity
                      key={option.value}
                      style={[styles.typeChip, isActive && styles.typeChipActive]}
                      onPress={() => handleChange('type', option.value)}
            >
                      <Ionicons
                        name={option.icon}
                        size={16}
                        color={isActive ? '#FFFFFF' : '#0E401C'}
                      />
                      <Text style={[styles.typeChipText, isActive && styles.typeChipTextActive]}>
                        {option.label}
                      </Text>
            </TouchableOpacity>
                  );
                })}
        </View>
      </View>

            {availableOrganizations.length > 0 && (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Organization</Text>
                <View style={styles.typeRow}>
                  {availableOrganizations.map((org) => {
                    const isActive = resolvedSelectionId === org.id;
                    return (
            <TouchableOpacity
                        key={org.id}
                        style={[styles.typeChip, isActive && styles.typeChipActive]}
                        onPress={() => {
                          setSelectedOrganizationId(org.id);
                        }}
            >
                        <Text style={[styles.typeChipText, isActive && styles.typeChipTextActive]}>
                          {org.name}
                        </Text>
            </TouchableOpacity>
                    );
                  })}
        </View>
      </View>
            )}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                Initial Balance {activeCurrency ? `(${activeCurrency})` : ''}
          </Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#9AA88B"
                keyboardType="decimal-pad"
                value={formState.initialBalance}
                onChangeText={(text) => handleChange('initialBalance', text)}
              />
              <Text style={styles.helperText}>We’ll use this as the opening balance for the account.</Text>
      </View>

            {formState.type === 'credit' && (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Credit Limit</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 5000"
                  placeholderTextColor="#9AA88B"
                  keyboardType="decimal-pad"
                  value={formState.creditLimit}
                  onChangeText={(text) => handleChange('creditLimit', text)}
                />
                <Text style={styles.helperText}>Keep this limit in sync with your bank so utilization stays accurate.</Text>
        </View>
            )}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Enter a short note about this account"
                placeholderTextColor="#9AA88B"
                value={formState.description}
                onChangeText={(text) => handleChange('description', text)}
                multiline
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
              style={[styles.saveButton, (!canSubmit || isSaving) && styles.saveButtonDisabled]}
              onPress={handleCreateAccount}
              disabled={!canSubmit || isSaving}
        >
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving…' : 'Save Account'}</Text>
        </TouchableOpacity>
      </View>
        </KeyboardAvoidingView>
    </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7DECC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  fieldBlock: {
    marginBottom: 20,
  },
  subHeaderContainer: {
    marginBottom: 12,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
  },
  subHeaderText: {
    fontSize: 13,
    color: '#4F6F3E',
    fontFamily: 'InstrumentSerif-Regular',
  },
  fieldLabel: {
    fontSize: 14,
    color: '#1F3A24',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7DECC',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: '#1F3A24',
    fontFamily: 'Poppins-Regular',
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D7DECC',
    backgroundColor: '#FFFFFF',
  },
  typeChipActive: {
    backgroundColor: '#4F6F3E',
    borderColor: '#4F6F3E',
  },
  typeChipText: {
    fontSize: 13,
    color: '#0E401C',
    fontFamily: 'Poppins-Medium',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7D5D',
    fontFamily: 'Poppins-Regular',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#4F6F3E',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
});

export default AddAccountModal;
