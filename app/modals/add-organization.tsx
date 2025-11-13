import React, { useMemo, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';

export interface OrganizationFormValues {
  name: string;
  currency: string;
  logoUrl?: string;
  themeColor?: string;
}

interface AddOrganizationModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: OrganizationFormValues) => void;
}

const AddOrganizationModal: React.FC<AddOrganizationModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const { currency: userCurrency } = useSettings();
  const [name, setName] = useState('');
  const [themeColor, setThemeColor] = useState<string | undefined>();

  const resolvedCurrency = useMemo(() => userCurrency || 'USD', [userCurrency]);
  const isValid = useMemo(() => name.trim().length > 0, [name]);

  const handleSave = () => {
    if (!isValid) {
      return;
    }
    onSubmit({
      name: name.trim(),
      currency: resolvedCurrency,
      themeColor,
    });
    setName('');
    setThemeColor(undefined);
  };

  const handleClose = () => {
    setName('');
    setThemeColor(undefined);
    onClose();
  };

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
            <Text style={styles.headerTitle}>Add Organization</Text>
            <View style={styles.iconPlaceholder} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Organization Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Chase Bank"
                placeholderTextColor="#9AA88B"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Accent Color (optional)</Text>
              <View style={styles.colorGrid}>
                {['#4F6F3E', '#8A614D', '#2B6777', '#6A7FDB', '#B83228', '#0E4D64'].map((colorOption) => {
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
            </View>

            <View style={styles.logoPlaceholder}>
              <Ionicons name="cloud-upload-outline" size={24} color="#8BA17B" />
              <Text style={styles.logoText}>Logo upload coming soon</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!isValid}
            >
              <Text style={styles.saveButtonText}>Save Organization</Text>
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

export default AddOrganizationModal;
