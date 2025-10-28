import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Category } from '../types';
import { fetchCategories } from '../utils/categories';
import { supabase } from '../lib/supabase';

interface CategoryPickerProps {
  selectedCategoryId?: string;
  onCategorySelect: (category: Category | null) => void;
  activityType?: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget';
  placeholder?: string;
  disabled?: boolean;
  style?: any;
}

const PRESET_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F97316', '#6366F1', '#84CC16', '#06B6D4', '#F43F5E', '#8B5A2B'
];

const COMMON_ICONS = [
  'home', 'car', 'restaurant', 'bag', 'medical', 'school',
  'airplane', 'gift', 'card', 'cash', 'trending-up', 'receipt',
  'wifi', 'call', 'flash', 'shield', 'play', 'time', 'flag',
  'briefcase', 'laptop', 'musical-notes', 'ellipsis-horizontal'
];

export default function CategoryPicker({
  selectedCategoryId,
  onCategorySelect,
  activityType,
  placeholder = 'Select Category',
  disabled = false,
  style,
}: CategoryPickerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  useEffect(() => {
    loadCategories();
  }, [activityType]);

  useEffect(() => {
    if (selectedCategoryId && categories.length > 0) {
      const category = categories.find(c => c.id === selectedCategoryId);
      setSelectedCategory(category || null);
    }
  }, [selectedCategoryId, categories]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = categories.filter(category =>
        category.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCategories(filtered);
    } else {
      setFilteredCategories(categories);
    }
  }, [searchTerm, categories]);

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fetchedCategories = await fetchCategories(user.id, {
        activityType,
      });
      setCategories(fetchedCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    onCategorySelect(category);
    setIsModalVisible(false);
    setSearchTerm('');
  };

  const handleClear = () => {
    setSelectedCategory(null);
    onCategorySelect(null);
  };

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={[
        styles.categoryItem,
        selectedCategory?.id === item.id && styles.selectedCategoryItem,
      ]}
      onPress={() => handleCategorySelect(item)}
    >
      <View style={[styles.categoryIcon, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon as any} size={20} color="white" />
      </View>
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryName}>{item.name}</Text>
        <View style={styles.activityTypes}>
          {item.activity_types.map((type, index) => (
            <View key={index} style={styles.activityTypeBadge}>
              <Text style={styles.activityTypeText}>{type}</Text>
            </View>
          ))}
        </View>
      </View>
      {selectedCategory?.id === item.id && (
        <Ionicons name="checkmark" size={20} color="#10B981" />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={[
          styles.pickerButton,
          disabled && styles.disabledButton,
        ]}
        onPress={() => !disabled && setIsModalVisible(true)}
        disabled={disabled}
      >
        {selectedCategory ? (
          <View style={styles.selectedCategory}>
            <View style={[styles.selectedIcon, { backgroundColor: selectedCategory.color }]}>
              <Ionicons name={selectedCategory.icon as any} size={16} color="white" />
            </View>
            <Text style={styles.selectedText}>{selectedCategory.name}</Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Ionicons name="folder-outline" size={16} color="#9CA3AF" />
            <Text style={styles.placeholderText}>{placeholder}</Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setIsModalVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Category</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search categories..."
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <FlatList
            data={filteredCategories}
            keyExtractor={(item) => item.id}
            renderItem={renderCategoryItem}
            style={styles.categoriesList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-outline" size={48} color="#9CA3AF" />
                <Text style={styles.emptyText}>
                  {searchTerm ? 'No categories found' : 'No categories available'}
                </Text>
                {!searchTerm && (
                  <Text style={styles.emptySubtext}>
                    Create your first category to get started
                  </Text>
                )}
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  pickerButton: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 56,
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  selectedCategory: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  selectedText: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  clearButton: {
    padding: 4,
  },
  placeholderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeholderText: {
    flex: 1,
    fontSize: 16,
    color: '#9CA3AF',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  placeholder: {
    width: 32,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 12,
  },
  categoriesList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  selectedCategoryItem: {
    backgroundColor: '#F0FDF4',
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  activityTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  activityTypeBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 2,
  },
  activityTypeText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
