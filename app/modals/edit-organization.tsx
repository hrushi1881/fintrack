import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  updateOrganization,
  deleteOrganization,
  validateOrganizationData,
  getSuggestedOrganizationSettings,
  type UpdateOrganizationData,
  type OrganizationWithAccounts,
} from '@/utils/organizations';

interface EditOrganizationModalProps {
  visible: boolean;
  onClose: () => void;
  organization: OrganizationWithAccounts | null;
  onSuccess?: () => void;
}

const ORGANIZATION_TYPES: {
  value: 'bank' | 'wallet' | 'investment' | 'cash' | 'custom';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'bank', label: 'Bank', icon: 'business-outline' },
  { value: 'wallet', label: 'Wallet', icon: 'wallet-outline' },
  { value: 'investment', label: 'Investment', icon: 'trending-up-outline' },
  { value: 'cash', label: 'Cash', icon: 'cash-outline' },
  { value: 'custom', label: 'Custom', icon: 'add-circle-outline' },
];

const COLOR_OPTIONS = [
  '#4F6F3E',
  '#0E4D8B',
  '#FF6B35',
  '#00BAF2',
  '#5F259F',
  '#2E7D32',
  '#E4002B',
  '#FBBF24',
  '#8A614D',
  '#2B6777',
  '#6A7FDB',
  '#B83228',
];

const EditOrganizationModal: React.FC<EditOrganizationModalProps> = ({
  visible,
  onClose,
  organization,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { currency: userCurrency } = useSettings();
  const [name, setName] = useState('');
  const [type, setType] = useState<'bank' | 'wallet' | 'investment' | 'cash' | 'custom'>('custom');
  const [themeColor, setThemeColor] = useState<string | undefined>();
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (organization && visible) {
      setName(organization.name || '');
      setType(organization.type || 'custom');
      setThemeColor(organization.theme_color || undefined);
      setDescription(organization.description || '');
      setErrors([]);
    }
  }, [organization, visible]);

  const isValid = useMemo(() => name.trim().length > 0, [name]);

  // Get suggested settings when name or type changes
  const suggestions = useMemo(() => {
    if (name.trim().length > 0) {
      return getSuggestedOrganizationSettings(name.trim(), type);
    }
    return {};
  }, [name, type]);

  const handleSave = async () => {
    if (!isValid || !user?.id || !organization) {
      return;
    }

    const formData: UpdateOrganizationData = {
      id: organization.id,
      name: name.trim(),
      type,
      color_theme: themeColor,
      description: description.trim() || undefined,
    };

    const validation = validateOrganizationData(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      Alert.alert('Validation Error', validation.errors.join('\n'));
      return;
    }

    setIsSaving(true);
    setErrors([]);

    try {
      await updateOrganization(formData, user.id);

      Alert.alert('Success', 'Organization updated successfully!');

      // Call onSuccess callback
      if (onSuccess) {
        onSuccess();
      }

      // Modal stays open - user can continue editing
    } catch (error: any) {
      console.error('Failed to update organization:', error);
      const message =
        (error && typeof error === 'object' && 'message' in error && error.message) ||
        'Something went wrong while updating the organization.';
      Alert.alert('Could not update organization', String(message));
      setErrors([message]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!organization || !user?.id) return;

    Alert.alert(
      'Delete Organization',
      `Are you sure you want to delete "${organization.name}"? This action cannot be undone.${
        organization.accountCount > 0
          ? `\n\nThis organization has ${organization.accountCount} account(s). Please move or delete them first.`
          : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSaving(true);
              await deleteOrganization(organization.id, user.id);
              Alert.alert('Success', 'Organization deleted successfully!');
              if (onSuccess) {
                onSuccess();
              }
              onClose();
            } catch (error: any) {
              console.error('Error deleting organization:', error);
              Alert.alert('Error', error.message || 'Failed to delete organization. Please try again.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    if (organization) {
      setName(organization.name || '');
      setType(organization.type || 'custom');
      setThemeColor(organization.theme_color || undefined);
      setDescription(organization.description || '');
    }
    setErrors([]);
    setIsSaving(false);
    onClose();
  };

  if (!organization) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.iconButton} onPress={handleClose}>
              <Ionicons name="close" size={20} color="#0E401C" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Organization</Text>
            <View style={styles.iconPlaceholder} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Organization Name</Text>
              <TextInput
                style={[styles.input, errors.length > 0 && styles.inputError]}
                placeholder="e.g., HDFC Bank, Paytm"
                placeholderTextColor="#9AA88B"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setErrors([]);
                }}
              />
              {errors.length > 0 && <Text style={styles.errorText}>{errors[0]}</Text>}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Organization Type</Text>
              <View style={styles.typeRow}>
                {ORGANIZATION_TYPES.map((orgType) => {
                  const isActive = type === orgType.value;
                  return (
                    <TouchableOpacity
                      key={orgType.value}
                      style={[styles.typeChip, isActive && styles.typeChipActive]}
                      onPress={() => setType(orgType.value)}
                    >
                      <Ionicons
                        name={orgType.icon}
                        size={16}
                        color={isActive ? '#FFFFFF' : '#0E401C'}
                      />
                      <Text style={[styles.typeChipText, isActive && styles.typeChipTextActive]}>
                        {orgType.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Theme Color</Text>
              <View style={styles.colorGrid}>
                {COLOR_OPTIONS.map((colorOption) => {
                  const active = themeColor === colorOption;
                  return (
                    <TouchableOpacity
                      key={colorOption}
                      style={[styles.colorSwatch, { backgroundColor: colorOption }, active && styles.colorSwatchActive]}
                      onPress={() => setThemeColor(active ? undefined : colorOption)}
                    >
                      {active ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {suggestions.color_theme && (
                <Text style={styles.helperText}>
                  Suggested: {suggestions.color_theme} (based on name/type)
                </Text>
              )}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Add a description for this organization"
                placeholderTextColor="#9AA88B"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.logoPlaceholder}>
              <Ionicons name="cloud-upload-outline" size={24} color="#8BA17B" />
              <Text style={styles.logoText}>Logo upload coming soon</Text>
            </View>

            <View style={styles.deleteSection}>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text style={styles.deleteButtonText}>Delete Organization</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveButton, (!isValid || isSaving) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!isValid || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
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
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  fieldBlock: {
    marginBottom: 20,
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
  inputError: {
    borderColor: '#EF4444',
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: '#EF4444',
    fontFamily: 'Poppins-Regular',
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
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#1A331F',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  logoPlaceholder: {
    marginTop: 8,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    borderStyle: 'dashed',
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAF4',
  },
  logoText: {
    fontSize: 12,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  deleteSection: {
    marginTop: 24,
    marginBottom: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#EF4444',
    fontFamily: 'Poppins-SemiBold',
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

export default EditOrganizationModal;

