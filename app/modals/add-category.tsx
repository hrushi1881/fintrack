import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Modal,
  Alert,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { Category } from '../../types';
import { createCategory, checkCategoryExists } from '../../utils/categories';
import { supabase } from '../../lib/supabase';

const PRESET_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F97316', '#6366F1', '#84CC16', '#06B6D4', '#F43F5E', '#8B5A2B'
];

const COMMON_ICONS = [
  'home', 'car', 'restaurant', 'bag', 'medical', 'school',
  'airplane', 'gift', 'card', 'cash', 'trending-up', 'receipt',
  'wifi', 'call', 'flash', 'shield', 'play', 'time', 'flag',
  'briefcase', 'laptop', 'musical-notes', 'ellipsis-horizontal',
  'pizza', 'beer', 'game-controller', 'book', 'fitness', 'camera',
  'heart', 'star', 'moon', 'sunny', 'rainy', 'snow'
];

const ACTIVITY_TYPES = [
  { key: 'income', label: 'Income', icon: 'trending-up', color: '#10B981' },
  { key: 'expense', label: 'Expense', icon: 'trending-down', color: '#EF4444' },
  { key: 'goal', label: 'Goal', icon: 'flag', color: '#3B82F6' },
  { key: 'bill', label: 'Bill', icon: 'receipt', color: '#F59E0B' },
  { key: 'liability', label: 'Liability', icon: 'card', color: '#8B5CF6' },
  { key: 'budget', label: 'Budget', icon: 'pie-chart', color: '#EC4899' },
];

const activityTypeConfig = {
  income: { label: 'Income', icon: 'trending-up', color: '#10B981' },
  expense: { label: 'Expense', icon: 'trending-down', color: '#EF4444' },
  goal: { label: 'Goal', icon: 'flag', color: '#3B82F6' },
  bill: { label: 'Bill', icon: 'receipt', color: '#F59E0B' },
  liability: { label: 'Liability', icon: 'card', color: '#8B5CF6' },
  budget: { label: 'Budget', icon: 'pie-chart', color: '#EC4899' },
};

export default function AddCategoryModal() {
  const { globalRefresh } = useRealtimeData();
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState(COMMON_ICONS[0]);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>(['expense']);
  const [loading, setLoading] = useState(false);

  const handleActivityTypeToggle = (type: string) => {
    setSelectedActivityTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }

    if (selectedActivityTypes.length === 0) {
      Alert.alert('Error', 'Please select at least one activity type');
      return;
    }

    try {
      setLoading(true);
      
      // Check if category already exists
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      const checkResult = await checkCategoryExists(
        user.user.id,
        name.trim(),
        selectedActivityTypes
      );

      if (checkResult.exists) {
        Alert.alert(
          'Category Already Exists',
          checkResult.suggestion || 'A category with this name already exists',
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Edit Existing',
              onPress: () => {
                // Navigate to edit the existing category
                router.push(`/modals/edit-category?id=${checkResult.existingCategory?.id}`);
              }
            }
          ]
        );
        return;
      }

      await createCategory({
        name: name.trim(),
        color: selectedColor,
        icon: selectedIcon,
        activity_types: selectedActivityTypes as any,
      });

      await globalRefresh();
      router.back();
    } catch (error: any) {
      console.error('Error creating category:', error);
      Alert.alert('Error', error.message || 'Failed to create category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF0F0" />
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Add Category</Text>
              <TouchableOpacity
                style={[styles.saveButton, loading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.form}>
              {/* Name Input */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Category Name</Text>
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter category name"
                  placeholderTextColor="#999999"
                  maxLength={50}
                />
                <Text style={styles.characterCount}>{name.length}/50</Text>
              </View>

              {/* Color Picker */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Color</Text>
                <View style={styles.colorGrid}>
                  {PRESET_COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        selectedColor === color && styles.selectedColorOption,
                      ]}
                      onPress={() => setSelectedColor(color)}
                    >
                      {selectedColor === color && (
                        <Ionicons name="checkmark" size={20} color="white" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Icon Picker */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Icon</Text>
                <View style={styles.iconGrid}>
                  {COMMON_ICONS.map((icon) => (
                    <TouchableOpacity
                      key={icon}
                      style={[
                        styles.iconOption,
                        selectedIcon === icon && styles.selectedIconOption,
                      ]}
                      onPress={() => setSelectedIcon(icon)}
                    >
                      <Ionicons
                        name={icon as any}
                        size={24}
                        color={selectedIcon === icon ? selectedColor : '#666666'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Activity Types */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Activity Types</Text>
                <Text style={styles.sectionSubtitle}>
                  Select which activities this category can be used for
                </Text>
                <View style={styles.activityTypesGrid}>
                  {ACTIVITY_TYPES.map((type) => {
                    const isSelected = selectedActivityTypes.includes(type.key);
                    const config = activityTypeConfig[type.key as keyof typeof activityTypeConfig];
                    return (
                      <TouchableOpacity
                        key={type.key}
                        style={[
                          styles.activityTypePill,
                          isSelected && styles.activityTypePillSelected,
                          isSelected && { backgroundColor: config.color },
                        ]}
                        onPress={() => handleActivityTypeToggle(type.key)}
                      >
                        <Ionicons
                          name={config.icon as any}
                          size={16}
                          color={isSelected ? '#FFFFFF' : config.color}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={[
                            styles.activityTypeText,
                            isSelected && styles.activityTypeTextSelected,
                          ]}
                        >
                          {config.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.activityTypesHint}>
                  Select how you'll use this category (e.g., Pay for expenses, Set goals, etc.)
                </Text>
              </View>

              {/* Preview */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Preview</Text>
                <View style={styles.previewCard}>
                  <View style={[styles.previewIcon, { backgroundColor: selectedColor }]}>
                    <Ionicons name={selectedIcon as any} size={24} color="white" />
                  </View>
                  <View style={styles.previewInfo}>
                    <Text style={styles.previewName}>{name || 'Category Name'}</Text>
                    <View style={styles.previewActivityTypes}>
                      {selectedActivityTypes.map((type) => {
                        const activityType = ACTIVITY_TYPES.find(t => t.key === type);
                        const config = activityTypeConfig[type as keyof typeof activityTypeConfig];
                        return (
                          <View 
                            key={type} 
                            style={[
                              styles.previewActivityType,
                              { backgroundColor: config.color + '20', borderColor: config.color + '40' }
                            ]}
                          >
                            <Ionicons name={config.icon as any} size={12} color={config.color} style={{ marginRight: 4 }} />
                            <Text style={[styles.previewActivityTypeText, { color: config.color }]}>
                              {activityType?.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF0F0',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  cancelButton: {
    padding: 8,
  },
  cancelText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 20,
    color: '#000000',
    fontFamily: 'Helvetica Neue',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  disabledButton: {
    backgroundColor: '#666666',
    opacity: 0.6,
  },
  saveText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  form: {
    flex: 1,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Helvetica Neue',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Instrument Serif',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000000',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    fontFamily: 'Instrument Serif',
  },
  characterCount: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'right',
    marginTop: 4,
    fontFamily: 'Poppins',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedColorOption: {
    borderColor: '#000000',
    borderWidth: 3,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconOption: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  selectedIconOption: {
    borderColor: '#000000',
    borderWidth: 2,
    backgroundColor: '#F5F5F5',
  },
  activityTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  activityTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
  },
  activityTypePillSelected: {
    borderColor: 'transparent',
  },
  activityTypeText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  activityTypeTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  activityTypesHint: {
    fontSize: 12,
    color: '#999999',
    fontFamily: 'Instrument Serif',
    fontStyle: 'italic',
    marginTop: 8,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  previewIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Helvetica Neue',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  previewActivityTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  previewActivityType: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 6,
  },
  previewActivityTypeText: {
    fontSize: 12,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
});