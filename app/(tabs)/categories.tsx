import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getParentCategories, getSubcategories, createCategory, updateCategory, deleteCategoryWithSubcategories, findOrCreateCategory } from '../../utils/categories';
import { Category } from '../../types';
import { router } from 'expo-router';

const ACTIVITY_TYPE_CONFIG = {
  income: { label: 'Receive', icon: 'arrow-down-circle', color: '#10B981' },
  expense: { label: 'Pay', icon: 'arrow-up-circle', color: '#EF4444' },
  goal: { label: 'Goal', icon: 'flag', color: '#3B82F6' },
  bill: { label: 'Bill', icon: 'receipt', color: '#F59E0B' },
  liability: { label: 'Liability', icon: 'card', color: '#8B5CF6' },
  budget: { label: 'Budget', icon: 'pie-chart', color: '#6366F1' },
};

const PRESET_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
  '#6366F1', '#14B8A6', '#F97316', '#84CC16', '#EF4444', '#6B7280'
];

const COMMON_ICONS = [
  'restaurant', 'car', 'home', 'shirt', 'school', 'musical-notes',
  'trending-up', 'trending-down', 'wallet', 'card', 'cash', 'folder'
];

export default function CategoriesScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isMountedRef = useRef(true);
  const loadRequestId = useRef(0);
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [subcategoriesMap, setSubcategoriesMap] = useState<Map<string, Category[]>>(new Map());
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [customSubInput, setCustomSubInput] = useState<{ [categoryId: string]: string }>({});
  const [addingCustomCategory, setAddingCustomCategory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget'>('all');
  const [newCategoryData, setNewCategoryData] = useState<{
    name: string;
    icon: string;
    color: string;
    activityTypes: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
  }>({
    name: '',
    icon: 'folder',
    color: '#3B82F6',
    activityTypes: ['expense'],
  });
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (user) {
      loadCategories();
    }
  }, [user]);

  const loadCategories = async () => {
    if (!user) return;

    const requestId = ++loadRequestId.current;
    try {
      setLoading(true);
      const parents = await getParentCategories(user.id);
      const subMap = new Map<string, Category[]>();

      await Promise.all(
        parents.map(async (parent) => {
          const subs = await getSubcategories(user.id, parent.id);
          subMap.set(parent.id, subs);
        })
      );

      if (!isMountedRef.current || requestId !== loadRequestId.current) return;
      setParentCategories(parents);
      setSubcategoriesMap(subMap);
    } catch (error) {
      console.error('Error loading categories:', error);
      Alert.alert('Error', 'Failed to load categories');
    } finally {
      if (isMountedRef.current && requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  };

  const refreshSubcategories = async (parentId: string) => {
    if (!user) return;
    const subs = await getSubcategories(user.id, parentId);
    setSubcategoriesMap((prev) => {
      const next = new Map(prev);
      next.set(parentId, subs);
      return next;
    });
    return subs;
  };

  const filteredParents = useMemo(() => {
    const term = debouncedSearchTerm;
    return parentCategories.filter((parent) => {
      const matchesActivity = activityFilter === 'all' || (parent.activity_types || []).includes(activityFilter);
      const subs = subcategoriesMap.get(parent.id) || [];
      const matchesSearch =
        !term ||
        parent.name.toLowerCase().includes(term) ||
        subs.some((s) => s.name.toLowerCase().includes(term));
      return matchesActivity && matchesSearch;
    });
  }, [parentCategories, subcategoriesMap, debouncedSearchTerm, activityFilter]);

  const toggleSubcategory = async (parentId: string, subcategoryName: string) => {
    if (!user) return;

    const subs = subcategoriesMap.get(parentId) || [];
    const existingSub = subs.find(s => s.name === subcategoryName);

    if (existingSub) {
      // Remove subcategory
      try {
        await deleteCategoryWithSubcategories(existingSub.id);
        await refreshSubcategories(parentId);
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to remove subcategory');
      }
    } else {
      // Add subcategory
      try {
        const parent = parentCategories.find(p => p.id === parentId);
        if (!parent) return;

        await findOrCreateCategory(
          user.id,
          subcategoryName,
          parent.activity_types as ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[],
          {
            parent_id: parentId,
            color: parent.color,
            icon: parent.icon,
          }
        );
        await refreshSubcategories(parentId);
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to add subcategory');
      }
    }
  };

  const addCustomSubcategory = async (parentId: string) => {
    const input = customSubInput[parentId]?.trim();
    if (!input) {
      Alert.alert('Error', 'Please enter a subcategory name');
      return;
    }

    await toggleSubcategory(parentId, input);
    setCustomSubInput({ ...customSubInput, [parentId]: '' });
  };

  const handleCreateCategory = async () => {
    const name = newCategoryData.name.trim();
    if (!user || !name) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }

    if (name.length > 50) {
      Alert.alert('Error', 'Category name must be 50 characters or fewer');
      return;
    }

    const duplicate = parentCategories.some(
      (c) => c.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      Alert.alert('Error', 'A category with this name already exists');
      return;
    }

    try {
      await createCategory({
        name,
        color: newCategoryData.color,
        icon: newCategoryData.icon,
        activity_types: newCategoryData.activityTypes,
        parent_id: null,
      });

      // Refresh parents list (subs remain; new category starts empty)
      const parents = await getParentCategories(user.id);
      setParentCategories(parents);
      setSubcategoriesMap((prev) => {
        const next = new Map(prev);
        parents.forEach((p) => {
          if (!next.has(p.id)) next.set(p.id, []);
        });
        return next;
      });

      setAddingCustomCategory(false);
      setNewCategoryData({
        name: '',
        icon: 'folder',
        color: '#3B82F6',
        activityTypes: ['expense'],
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create category');
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${categoryName}"? This will also delete all its subcategories.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategoryWithSubcategories(categoryId);
              setParentCategories((prev) => prev.filter((c) => c.id !== categoryId));
              setSubcategoriesMap((prev) => {
                const next = new Map(prev);
                next.delete(categoryId);
                return next;
              });
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete category');
            }
          },
        },
      ]
    );
  };

  const toggleActivityType = async (categoryId: string, activityType: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget') => {
    const category = parentCategories.find(c => c.id === categoryId);
    if (!category) return;

    const currentTypes = category.activity_types || [];
    const newTypes = currentTypes.includes(activityType)
      ? currentTypes.filter(t => t !== activityType)
      : [...currentTypes, activityType];

    if (newTypes.length === 0) {
      return; // prevent removing the last type; UX: no-op instead of alert
    }

    try {
      await updateCategory({
        id: categoryId,
        activity_types: newTypes as ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[],
      });
      setParentCategories((prev) =>
        prev.map((p) =>
          p.id === categoryId ? { ...p, activity_types: newTypes } : p
        )
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update activity types');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF0F0" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading categories...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.safeArea}>
        {/* Filters */}
        <View style={styles.topBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#6B7280" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search categories or subs..."
              placeholderTextColor="#9CA3AF"
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChips}
            snapToAlignment="start"
            decelerationRate="fast"
          >
            {(['all', 'expense', 'income', 'goal', 'bill', 'liability', 'budget'] as const).map((type) => {
              const isActive = activityFilter === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setActivityFilter(type)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter ${type === 'all' ? 'all' : type} categories`}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView style={[styles.scrollView, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>CATEGORY SETTINGS</Text>
            <Text style={styles.headerSubtitle}>Customize your categories</Text>
            <Text style={styles.sectionDescription}>
              Select how you want to organize your finances. You can customize everything later.
            </Text>
          </View>

          {/* Categories List */}
          <View style={styles.content}>
            {filteredParents.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No categories found</Text>
                <Text style={styles.emptySubtitle}>Adjust filters or add a new category.</Text>
              </View>
            )}

            {filteredParents.map((category) => {
              const isExpanded = expandedCategory === category.id;
              const subcategories = subcategoriesMap.get(category.id) || [];
              const subCount = subcategories.length;

              const hasSelection = subCount > 0;

              return (
                <View key={category.id} style={styles.categoryCard}>
                  {/* Category Header */}
                  <TouchableOpacity
                    style={[
                      styles.categoryHeader,
                      hasSelection && styles.categoryHeaderSelected,
                    ]}
                      onPress={() => setExpandedCategory(isExpanded ? null : category.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${category.name}, ${subCount} subcategories, ${isExpanded ? 'collapse' : 'expand'}`}
                  >
                    <View style={styles.categoryHeaderLeft}>
                      <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
                        <Ionicons name={category.icon as any} size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryName}>{category.name}</Text>
                        <Text style={styles.categorySubtext}>
                          {subCount > 0
                            ? `${subCount} ${subCount === 1 ? 'subcategory' : 'subcategories'}`
                            : 'No subcategories yet'}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.categoryToggleButton,
                        isExpanded && styles.categoryToggleButtonSelected,
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        setExpandedCategory(isExpanded ? null : category.id);
                      }}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={isExpanded ? '#000000' : '#666666'}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {/* Expanded Subcategories */}
                  {isExpanded && (
                    <View style={styles.subcategoriesContainer}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.actionsRow}
                      >
                        <TouchableOpacity
                          style={styles.secondaryChip}
                          onPress={() => router.push(`/category/${category.id}`)}
                          accessibilityRole="button"
                          accessibilityLabel={`View transactions for ${category.name}`}
                        >
                          <Ionicons name="list" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                          <Text style={styles.secondaryChipText}>Transactions</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.secondaryChip}
                          onPress={() => router.push(`/modals/add-budget?categoryId=${category.id}`)}
                          accessibilityRole="button"
                          accessibilityLabel={`Add budget for ${category.name}`}
                        >
                          <Ionicons name="pie-chart" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                          <Text style={styles.secondaryChipText}>Budget</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.secondaryChip}
                          onPress={() => handleDeleteCategory(category.id, category.name)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete category ${category.name}`}
                        >
                          <Ionicons name="trash-outline" size={14} color="#EF4444" style={{ marginRight: 6 }} />
                          <Text style={[styles.secondaryChipText, { color: '#EF4444' }]}>Delete</Text>
                        </TouchableOpacity>
                      </ScrollView>

                      {subCount === 0 && (
                        <Text style={styles.selectedSubsText}>Subcategories: None</Text>
                      )}

                      {subCount > 0 && (
                        <>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.subcategoriesGrid}
                          >
                            {subcategories.map((sub) => (
                              <TouchableOpacity
                                key={sub.id}
                                style={[
                                  styles.subcategoryPill,
                                  styles.subcategoryPillSelected,
                                ]}
                                onPress={() => toggleSubcategory(category.id, sub.name)}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove subcategory ${sub.name}`}
                              >
                                <Text
                                  style={[
                                    styles.subcategoryText,
                                    styles.subcategoryTextSelected,
                                  ]}
                                >
                                  {sub.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>

                          <Text style={styles.selectedSubsText}>
                            {`Subcategories: ${subcategories.map(s => s.name).join(', ')}`}
                          </Text>

                          {/* Activity Types Selection */}
                          <View style={styles.activityTypesSection}>
                            <Text style={styles.activityTypesLabel}>Use this category for:</Text>
                            <View style={styles.activityTypesGrid}>
                              {Object.entries(ACTIVITY_TYPE_CONFIG).map(([key, config]) => {
                                const activityType = key as 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget';
                                const isSelected = (category.activity_types || []).includes(activityType);
                                return (
                                  <TouchableOpacity
                                    key={key}
                                    style={[
                                      styles.activityTypePill,
                                      isSelected && styles.activityTypePillSelected,
                                      { borderColor: config.color },
                                    ]}
                                    onPress={() => toggleActivityType(category.id, activityType)}
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
                                        !isSelected && { color: config.color },
                                      ]}
                                    >
                                      {config.label}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        </>
                      )}

                      {/* Custom Subcategory Input */}
                      <View style={styles.customSubcategoryRow}>
                        <TextInput
                          style={styles.customSubcategoryInput}
                          value={customSubInput[category.id] || ''}
                          onChangeText={(value) =>
                            setCustomSubInput({ ...customSubInput, [category.id]: value })
                          }
                          placeholder="Add custom"
                          placeholderTextColor="#666666"
                          returnKeyType="done"
                        />
                        <TouchableOpacity
                          style={styles.addCustomButton}
                          onPress={() => addCustomSubcategory(category.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Add custom subcategory to ${category.name}`}
                        >
                          <Text style={styles.addCustomButtonText}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add Custom Category */}
            {addingCustomCategory ? (
              <View style={styles.addCustomCategoryCard}>
                <View style={styles.addCustomCategoryHeader}>
                  <Text style={styles.addCustomCategoryTitle}>Create New Category</Text>
                  <TouchableOpacity onPress={() => setAddingCustomCategory(false)}>
                    <Ionicons name="close" size={24} color="#000000" />
                  </TouchableOpacity>
                </View>

                <View style={styles.addCustomCategoryForm}>
                  <Text style={styles.inputLabel}>Category Name</Text>
                  <TextInput
                    style={styles.addInput}
                    value={newCategoryData.name}
                    onChangeText={(value) => setNewCategoryData({ ...newCategoryData, name: value })}
                    placeholder="e.g., Pets, Gaming, etc."
                    placeholderTextColor="#666666"
                  />

                  <Text style={styles.inputLabel}>Color</Text>
                  <View style={styles.colorGrid}>
                    {PRESET_COLORS.map((color) => (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorOption,
                          { backgroundColor: color },
                          newCategoryData.color === color && styles.selectedColorOption,
                        ]}
                        onPress={() => setNewCategoryData({ ...newCategoryData, color })}
                      >
                        {newCategoryData.color === color && (
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Icon</Text>
                  <View style={styles.iconGrid}>
                    {COMMON_ICONS.map((icon) => (
                      <TouchableOpacity
                        key={icon}
                        style={[
                          styles.iconOption,
                          newCategoryData.icon === icon && styles.selectedIconOption,
                        ]}
                        onPress={() => setNewCategoryData({ ...newCategoryData, icon })}
                      >
                        <Ionicons
                          name={icon as any}
                          size={24}
                          color={newCategoryData.icon === icon ? newCategoryData.color : '#6B7280'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Activity Types</Text>
                  <View style={styles.activityTypesGrid}>
                    {Object.entries(ACTIVITY_TYPE_CONFIG).map(([key, config]) => {
                      const activityType = key as 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget';
                      const isSelected = newCategoryData.activityTypes.includes(activityType);
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.activityTypePill,
                            isSelected && styles.activityTypePillSelected,
                            { borderColor: config.color },
                          ]}
                          onPress={() => {
                            const current = newCategoryData.activityTypes;
                            if (current.includes(activityType)) {
                              if (current.length === 1) {
                                Alert.alert('Error', 'At least one activity type must be selected');
                                return;
                              }
                              setNewCategoryData({ ...newCategoryData, activityTypes: current.filter(t => t !== activityType) });
                            } else {
                              setNewCategoryData({ ...newCategoryData, activityTypes: [...current, activityType] });
                            }
                          }}
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
                              !isSelected && { color: config.color },
                            ]}
                          >
                            {config.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity style={styles.addButton} onPress={handleCreateCategory}>
                    <Text style={styles.addButtonText}>Create Category</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addCategoryButton}
                onPress={() => setAddingCustomCategory(true)}
              >
                <Ionicons name="add-circle-outline" size={24} color="#000000" />
                <Text style={styles.addCategoryButtonText}>Add Category</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 120, // leave room for bottom nav
  },
  header: {
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    fontFamily: 'InstrumentSerif-Regular',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 24,
    fontFamily: 'InstrumentSerif-Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingVertical: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#000000',
    marginTop: 20,
    fontWeight: '600',
    fontFamily: 'Poppins-SemiBold',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  summaryPill: {
    width: '30%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
    minWidth: 100,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  filterRow: {
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  filterChips: {
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    paddingBottom: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryHeaderSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 4,
  },
  categorySubtext: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  categoryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
  },
  secondaryChipText: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
  },
  deleteCategoryButton: {
    padding: 4,
  },
  categoryToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  categoryToggleButtonSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#648687',
  },
  categoryToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    fontFamily: 'Poppins-SemiBold',
  },
  categoryToggleTextSelected: {
    color: '#000000',
  },
  subcategoriesContainer: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    gap: 8,
  },
  subcategoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  subcategoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: 'transparent',
  },
  subcategoryPillSelected: {
    backgroundColor: '#648687',
    borderColor: '#648687',
  },
  subcategoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-Medium',
  },
  subcategoryTextSelected: {
    color: '#FFFFFF',
  },
  customSubcategoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  customSubcategoryInput: {
    flex: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000000',
    fontFamily: 'InstrumentSerif-Regular',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    minHeight: 40,
  },
  addCustomButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#000000',
    minHeight: 40,
    justifyContent: 'center',
  },
  addCustomButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  selectedSubsText: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    marginTop: 4,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  activityTypesSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  activityTypesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 12,
  },
  activityTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  activityTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  activityTypePillSelected: {
    backgroundColor: '#648687',
    borderColor: '#648687',
  },
  activityTypeText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Poppins-Medium',
  },
  activityTypeTextSelected: {
    color: '#FFFFFF',
  },
  addCategoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.2)',
    borderStyle: 'dashed',
    borderRadius: 12,
    gap: 8,
  },
  addCategoryButtonText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
  },
  addCustomCategoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    padding: 16,
  },
  addCustomCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addCustomCategoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
  },
  addCustomCategoryForm: {
    gap: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
    fontFamily: 'Poppins-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addInput: {
    backgroundColor: '#2E2E2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'InstrumentSerif-Regular',
    minHeight: 52,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedColorOption: {
    borderColor: '#000000',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedIconOption: {
    borderColor: '#000000',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  addButton: {
    backgroundColor: '#000000',
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    gap: 8,
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
});
