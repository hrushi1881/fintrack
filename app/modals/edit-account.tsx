import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  color: string;
  icon: string;
  description?: string;
  include_in_totals: boolean;
}

interface EditAccountModalProps {
  visible: boolean;
  onClose: () => void;
  account: Account | null;
  onSuccess: () => void;
}

const accountTypes = [
  { value: 'checking', label: 'Checking Account', icon: 'card' },
  { value: 'savings', label: 'Savings Account', icon: 'wallet' },
  { value: 'credit_card', label: 'Credit Card', icon: 'card-outline' },
  { value: 'investment', label: 'Investment', icon: 'trending-up' },
  { value: 'cash', label: 'Cash', icon: 'cash' },
  { value: 'loan', label: 'Loan', icon: 'document-text' },
];

const colorOptions = [
  '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#8B5CF6', '#EC4899'
];

const iconOptions = [
  'card', 'wallet', 'cash', 'trending-up', 'home', 'car',
  'airplane', 'restaurant', 'bag', 'medical', 'school', 'game-controller'
];

export default function EditAccountModal({ visible, onClose, account, onSuccess }: EditAccountModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    type: 'checking',
    balance: '',
    color: '#10B981',
    icon: 'card',
    description: '',
    include_in_totals: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (account && visible) {
      setFormData({
        name: account.name,
        type: account.type,
        balance: account.balance.toString(),
        color: account.color,
        icon: account.icon,
        description: account.description || '',
        include_in_totals: account.include_in_totals,
      });
    }
  }, [account, visible]);

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Account name is required';
    }

    if (!formData.balance.trim()) {
      newErrors.balance = 'Balance is required';
    } else if (isNaN(parseFloat(formData.balance))) {
      newErrors.balance = 'Please enter a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm() || !account) return;

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('accounts')
        .update({
          name: formData.name.trim(),
          type: formData.type,
          balance: parseFloat(formData.balance),
          color: formData.color,
          icon: formData.icon,
          description: formData.description.trim() || null,
          include_in_totals: formData.include_in_totals,
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id)
        .eq('user_id', user?.id);

      if (error) throw error;

      Alert.alert('Success', 'Account updated successfully!', [
        { text: 'OK', onPress: () => {
          onSuccess();
          onClose();
        }}
      ]);

    } catch (error) {
      console.error('Error updating account:', error);
      Alert.alert('Error', 'Failed to update account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (!account) return;

    Alert.alert(
      'Delete Account',
      `Are you sure you want to delete "${account.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('accounts')
                .update({ is_active: false })
                .eq('id', account.id)
                .eq('user_id', user?.id);

              if (error) throw error;

              Alert.alert('Success', 'Account deleted successfully!', [
                { text: 'OK', onPress: () => {
                  onSuccess();
                  onClose();
                }}
              ]);
            } catch (error) {
              console.error('Error deleting account:', error);
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          }
        }
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <LinearGradient
        colors={['#99D795', '#99D795', '#99D795']}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Edit Account</Text>
              <TouchableOpacity
                style={[styles.saveButton, isLoading && styles.disabledButton]}
                onPress={handleSave}
                disabled={isLoading}
              >
                <Text style={styles.saveText}>
                  {isLoading ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Account Name */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Account Name</Text>
              <TextInput
                style={[styles.textInput, errors.name && styles.errorInput]}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter account name"
                placeholderTextColor="#6B7280"
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>

            {/* Account Type */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Account Type</Text>
              <View style={styles.typeGrid}>
                {accountTypes.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.typeButton,
                      formData.type === type.value && styles.selectedType
                    ]}
                    onPress={() => setFormData({ ...formData, type: type.value, icon: type.icon })}
                  >
                    <Ionicons 
                      name={type.icon as any} 
                      size={20} 
                      color={formData.type === type.value ? 'white' : '#6B7280'} 
                    />
                    <Text style={[
                      styles.typeText,
                      formData.type === type.value && styles.selectedTypeText
                    ]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Balance */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Current Balance</Text>
              <View style={styles.balanceInput}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={[styles.balanceTextInput, errors.balance && styles.errorInput]}
                  value={formData.balance}
                  onChangeText={(text) => setFormData({ ...formData, balance: text })}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  keyboardType="numeric"
                />
              </View>
              {errors.balance && <Text style={styles.errorText}>{errors.balance}</Text>}
            </View>

            {/* Color Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Color</Text>
              <View style={styles.colorGrid}>
                {colorOptions.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorButton,
                      { backgroundColor: color },
                      formData.color === color && styles.selectedColor
                    ]}
                    onPress={() => setFormData({ ...formData, color })}
                  >
                    {formData.color === color && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Icon Selection */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Icon</Text>
              <View style={styles.iconGrid}>
                {iconOptions.map((icon) => (
                  <TouchableOpacity
                    key={icon}
                    style={[
                      styles.iconButton,
                      formData.icon === icon && styles.selectedIcon
                    ]}
                    onPress={() => setFormData({ ...formData, icon })}
                  >
                    <Ionicons 
                      name={icon as any} 
                      size={24} 
                      color={formData.icon === icon ? 'white' : '#6B7280'} 
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Description */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Add a description for this account"
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Include in Totals */}
            <View style={styles.inputCard}>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setFormData({ ...formData, include_in_totals: !formData.include_in_totals })}
              >
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>Include in Totals</Text>
                  <Text style={styles.toggleDescription}>
                    Include this account balance in your total balance calculation
                  </Text>
                </View>
                <View style={[
                  styles.toggle,
                  formData.include_in_totals && styles.toggleActive
                ]}>
                  <View style={[
                    styles.toggleThumb,
                    formData.include_in_totals && styles.toggleThumbActive
                  ]} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Delete Button */}
            <View style={styles.deleteSection}>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash" size={20} color="#EF4444" />
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  headerTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
  inputCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
  },
  errorInput: {
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  balanceInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  currencySymbol: {
    fontSize: 20,
    color: 'white',
    marginRight: 8,
    fontWeight: 'bold',
  },
  balanceTextInput: {
    flex: 1,
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: '30%',
    flex: 1,
  },
  selectedType: {
    backgroundColor: '#10B981',
  },
  typeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  selectedTypeText: {
    color: 'white',
    fontWeight: 'bold',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedColor: {
    borderWidth: 3,
    borderColor: 'white',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
  },
  selectedIcon: {
    backgroundColor: '#10B981',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: '#10B981',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'white',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  deleteSection: {
    marginTop: 20,
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});









