import React, { useState, useEffect } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { Category } from '../../types';
import { updateCategory, deleteCategory, checkCategoryExists } from '../../utils/categories';
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

export default function EditCategoryModal() {
  const { id } = useLocalSearchParams();
  const { categories, globalRefresh } = useRealtimeData();
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState(COMMON_ICONS[0]);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>(['expense']);
  const [loading, setLoading] = useState(false);

  const category = categories.find(c => c.id === id);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setSelectedColor(category.color);
      setSelectedIcon(category.icon);
      setSelectedActivityTypes(category.activity_types);
    }
  }, [category]);

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
    if (!category) return;

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
      
      // Check if another category with the same name exists (excluding current category)
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Only check for duplicates if the name has changed
      if (name.trim() !== category.name) {
        const { data: existing } = await supabase
          .from('categories')
          .select('id, activity_types')
          .eq('user_id', user.user.id)
          .eq('name', name.trim())
          .eq('is_deleted', false)
          .neq('id', category.id)
          .single();

        if (existing) {
          const existingTypes = existing.activity_types || [];
          const requestedTypes = selectedActivityTypes;
          const hasAllTypes = requestedTypes.every(type => existingTypes.includes(type));
          
          if (hasAllTypes) {
            Alert.alert(
              'Category Name Already Exists',
              'Another category with this name already exists with the same activity types. Please choose a different name.',
              [{ text: 'OK' }]
            );
            return;
          } else {
            Alert.alert(
              'Category Name Already Exists',
              `Another category with this name already exists with activity types: ${existingTypes.join(', ')}. Please choose a different name.`,
              [{ text: 'OK' }]
            );
            return;
          }
        }
      }

      await updateCategory({
        id: category.id,
        name: name.trim(),
        color: selectedColor,
        icon: selectedIcon,
        activity_types: selectedActivityTypes as any,
      });

      await globalRefresh();
      router.back();
    } catch (error: any) {
      console.error('Error updating category:', error);
      Alert.alert('Error', error.message || 'Failed to update category');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Category',
      'Are you sure you want to delete this category? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  };

  const confirmDelete = async () => {
    if (!category) return;

    try {
      setLoading(true);
      await deleteCategory(category.id);
      await globalRefresh();
      router.back();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      Alert.alert('Error', error.message || 'Failed to delete category');
    } finally {
      setLoading(false);
    }
  };

  const renderColorPicker = () => (
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
  );

  const renderIconPicker = () => (
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
              color={selectedIcon === icon ? '#10B981' : '#6B7280'}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderActivityTypes = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Activity Types</Text>
      <Text style={styles.sectionSubtitle}>Select which activities this category can be used for</Text>
      <View style={styles.activityTypesGrid}>
        {ACTIVITY_TYPES.map((type) => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.activityTypeOption,
              selectedActivityTypes.includes(type.key) && styles.selectedActivityTypeOption,
            ]}
            onPress={() => handleActivityTypeToggle(type.key)}
          >
            <View style={[styles.activityTypeIcon, { backgroundColor: type.color }]}>
              <Ionicons name={type.icon as any} size={20} color="white" />
            </View>
            <Text style={[
              styles.activityTypeLabel,
              selectedActivityTypes.includes(type.key) && styles.selectedActivityTypeLabel,
            ]}>
              {type.label}
            </Text>
            {selectedActivityTypes.includes(type.key) && (
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  if (!category) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
        <LinearGradient
          colors={['#99D795', '#99D795', '#99D795']}
          style={styles.container}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={48} color="#EF4444" />
              <Text style={styles.errorText}>Category not found</Text>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Text style={styles.backButtonText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Modal>
    );
  }

  return (
    <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
      <LinearGradient
        colors={['#99D795', '#99D795', '#99D795']}
        style={styles.container}
      >
        <StatusBar barStyle="light-content" backgroundColor="#99D795" />
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
              <Text style={styles.headerTitle}>Edit Category</Text>
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
                  placeholderTextColor="#9CA3AF"
                  maxLength={50}
                />
                <Text style={styles.characterCount}>{name.length}/50</Text>
              </View>

              {/* Color Picker */}
              {renderColorPicker()}

              {/* Icon Picker */}
              {renderIconPicker()}

              {/* Activity Types */}
              {renderActivityTypes()}

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
                        return (
                          <View key={type} style={styles.previewActivityType}>
                            <Text style={styles.previewActivityTypeText}>
                              {activityType?.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>

              {/* Delete Button */}
              <View style={styles.section}>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}
                  disabled={loading}
                >
                  <Ionicons name="trash" size={20} color="white" />
                  <Text style={styles.deleteText}>Delete Category</Text>
                </TouchableOpacity>
              </View>
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
    color: 'white',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  disabledButton: {
    backgroundColor: '#6B7280',
  },
  saveText: {
    fontSize: 16,
    color: 'white',
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
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  characterCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedColorOption: {
    borderColor: 'white',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedIconOption: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  activityTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  activityTypeOption: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  selectedActivityTypeOption: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  activityTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  activityTypeLabel: {
    flex: 1,
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  selectedActivityTypeLabel: {
    color: '#10B981',
  },
  previewCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  previewActivityTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  previewActivityType: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  previewActivityTypeText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
  },
  deleteText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
