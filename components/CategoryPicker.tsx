import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Category } from '../types';
import { supabase } from '../lib/supabase';
import { getParentCategories, getSubcategories } from '../utils/categories';

interface CategoryPickerProps {
  selectedCategoryId?: string;
  onCategorySelect?: (category: Category | null) => void;
  activityType?: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget';
  placeholder?: string;
  disabled?: boolean;
  style?: any;
}

export default function CategoryPicker({
  selectedCategoryId,
  onCategorySelect,
  activityType,
  placeholder = 'Select Category',
  disabled = false,
  style,
}: CategoryPickerProps) {
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [subcategoriesMap, setSubcategoriesMap] = useState<Map<string, Category[]>>(new Map());
  const [allItems, setAllItems] = useState<{ category: Category; parent?: Category }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, [activityType]);

  useEffect(() => {
    if (selectedCategoryId && allItems.length > 0) {
      const category = allItems.find(c => c.category.id === selectedCategoryId)?.category;
      setSelectedCategory(category || null);
    }
  }, [selectedCategoryId, allItems]);

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load parents
      const parents = await getParentCategories(user.id, activityType);

      // Load subs for each parent
      const subMap = new Map<string, Category[]>();
      const items: { category: Category; parent?: Category }[] = [];

      for (const parent of parents) {
        items.push({ category: parent });
        try {
          const subs = await getSubcategories(user.id, parent.id);
          subMap.set(parent.id, subs);
          subs.forEach((sub) => items.push({ category: sub, parent }));
        } catch {
          subMap.set(parent.id, []);
        }
      }

      setParentCategories(parents);
      setSubcategoriesMap(subMap);
      setAllItems(items);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    if (onCategorySelect) {
      onCategorySelect(category);
    }
    setIsModalVisible(false);
    setSearchTerm('');
  };

  const handleClear = () => {
    setSelectedCategory(null);
    if (onCategorySelect) {
      onCategorySelect(null);
    }
  };

  const filteredItems = searchTerm
    ? allItems.filter(({ category, parent }) => {
        const parentLabel = parent?.name || parentCategories.find((p) => p.id === category.parent_id)?.name;
        const path = parentLabel ? `${parentLabel} ${category.name}` : category.name;
        return path.toLowerCase().includes(searchTerm.toLowerCase());
      })
    : null;

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
            <Text style={styles.selectedText}>
              {selectedCategory.parent_id
                ? `${parentCategories.find((p) => p.id === selectedCategory.parent_id)?.name || 'Category'} › ${selectedCategory.name}`
                : selectedCategory.name}
            </Text>
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

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#000000" />
              <Text style={styles.loadingText}>Loading categories...</Text>
            </View>
          ) : (
            <ScrollView style={styles.categoriesList} showsVerticalScrollIndicator={false}>
              {(filteredItems || parentCategories.map((p) => ({ category: p })) ).map(({ category, parent }) => {
                const inSearch = !!filteredItems;
                const parentForItem = parent || parentCategories.find((p) => p.id === category.parent_id);

                if (inSearch) {
                  const isSelected = selectedCategory?.id === category.id;
                  return (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryItem,
                        isSelected && styles.selectedCategoryItem,
                      ]}
                      onPress={() => handleCategorySelect(category)}
                    >
                      <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
                        <Ionicons name={category.icon as any} size={20} color="white" />
                      </View>
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryName}>
                          {parentForItem ? `${parentForItem.name} › ${category.name}` : category.name}
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark" size={20} color="#10B981" />}
                    </TouchableOpacity>
                  );
                }

                const subs = subcategoriesMap.get(category.id) || [];
                const isExpanded = expandedParentId === category.id;
                const isSelected = selectedCategory?.id === category.id;

                return (
                  <View key={category.id} style={styles.parentBlock}>
                    <TouchableOpacity
                      style={[
                        styles.parentRow,
                        isSelected && styles.selectedCategoryItem,
                      ]}
                      onPress={() => setExpandedParentId(isExpanded ? null : category.id)}
                    >
                      <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
                        <Ionicons name={category.icon as any} size={20} color="white" />
                      </View>
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryName}>{category.name}</Text>
                        <Text style={styles.categorySubtext}>
                          {subs.length > 0 ? `${subs.length} subcategories` : 'No subcategories'}
                        </Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#6B7280"
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.subList}>
                        <TouchableOpacity
                          style={[
                            styles.subItem,
                            selectedCategory?.id === category.id && styles.selectedCategoryItem,
                          ]}
                          onPress={() => handleCategorySelect(category)}
                        >
                          <Ionicons name="remove-outline" size={16} color="#6B7280" style={{ marginRight: 8 }} />
                          <Text style={styles.subItemText}>Use “{category.name}” (no subcategory)</Text>
                          {selectedCategory?.id === category.id && (
                            <Ionicons name="checkmark" size={18} color="#10B981" />
                          )}
                        </TouchableOpacity>

                        {subs.map((sub) => {
                          const isSubSelected = selectedCategory?.id === sub.id;
                          return (
                            <TouchableOpacity
                              key={sub.id}
                              style={[
                                styles.subItem,
                                isSubSelected && styles.selectedCategoryItem,
                              ]}
                              onPress={() => handleCategorySelect(sub)}
                            >
                              <Ionicons
                                name={(sub.icon as any) || 'ellipse-outline'}
                                size={16}
                                color="#6B7280"
                                style={{ marginRight: 8 }}
                              />
                              <Text style={styles.subItemText}>{category.name} › {sub.name}</Text>
                              {isSubSelected && (
                                <Ionicons name="checkmark" size={18} color="#10B981" />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}

              {(filteredItems ? filteredItems.length === 0 : parentCategories.length === 0) && (
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
              )}
            </ScrollView>
          )}
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
  categorySubtext: {
    fontSize: 12,
    color: '#6B7280',
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
  parentBlock: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  subList: {
    marginLeft: 48,
    paddingVertical: 8,
    gap: 6,
  },
  subItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subItemText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#111827',
  },
});
