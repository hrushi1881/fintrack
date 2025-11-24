import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  FlatList,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useSettings } from '../../contexts/SettingsContext';
import { Category, CategoryStats } from '../../types';
import { getCategoryStats } from '../../utils/categories';
import { formatCurrencyAmount } from '../../utils/currency';

const ACTIVITY_TYPE_CONFIG = {
  income: { label: 'Receive', icon: 'arrow-down-circle', color: '#10B981' },
  expense: { label: 'Pay', icon: 'arrow-up-circle', color: '#EF4444' },
  goal: { label: 'Goal', icon: 'flag', color: '#3B82F6' },
  bill: { label: 'Bill', icon: 'receipt', color: '#F59E0B' },
  liability: { label: 'Liability', icon: 'card', color: '#8B5CF6' },
  budget: { label: 'Budget', icon: 'pie-chart', color: '#6366F1' },
};

export default function CategoriesScreen() {
  const { categories, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivityType, setSelectedActivityType] = useState<string>('all');
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const activityTypes = [
    { key: 'all', label: 'All', icon: 'grid' },
    { key: 'income', label: 'Income', icon: 'trending-up' },
    { key: 'expense', label: 'Expense', icon: 'trending-down' },
    { key: 'goal', label: 'Goals', icon: 'flag' },
    { key: 'bill', label: 'Bills', icon: 'receipt' },
    { key: 'liability', label: 'Liabilities', icon: 'card' },
    { key: 'budget', label: 'Budgets', icon: 'pie-chart' },
  ];

  useEffect(() => {
    if (categories.length > 0) {
      loadCategoryStats();
    } else {
      setLoading(false);
    }
  }, [categories]);

  const loadCategoryStats = async () => {
    try {
      setLoading(true);
      if (categories.length > 0) {
        const stats = await getCategoryStats(categories[0].user_id, '1 month');
        setCategoryStats(stats);
      }
    } catch (error) {
      console.error('Error loading category stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter(category => {
    const matchesSearch = category.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActivity = selectedActivityType === 'all' || 
      category.activity_types.includes(selectedActivityType as any);
    return matchesSearch && matchesActivity;
  });

  const getMostSpentCategory = () => {
    return categoryStats
      .filter(stat => stat.activity_type === 'expense')
      .sort((a, b) => b.total_amount - a.total_amount)[0];
  };

  const getMostReceivedCategory = () => {
    return categoryStats
      .filter(stat => stat.activity_type === 'income')
      .sort((a, b) => b.total_amount - a.total_amount)[0];
  };

  const getMostSavedCategory = () => {
    return categoryStats
      .filter(stat => stat.activity_type === 'goal')
      .sort((a, b) => b.total_amount - a.total_amount)[0];
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const renderCategoryCard = ({ item }: { item: Category }) => {
    const isExpanded = expandedCategory === item.id;
    
    return (
      <View key={item.id} style={styles.categoryCard}>
        {/* Category Header */}
        <TouchableOpacity
          style={[
            styles.categoryHeader,
            isExpanded && styles.categoryHeaderExpanded,
          ]}
          onPress={() => setExpandedCategory(isExpanded ? null : item.id)}
        >
          <View style={styles.categoryHeaderLeft}>
            <View style={[styles.categoryIcon, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon as any} size={20} color="#FFFFFF" />
            </View>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>{item.name}</Text>
              <View style={styles.categoryActivityTypes}>
                {item.activity_types.slice(0, 3).map((type) => {
                  const config = ACTIVITY_TYPE_CONFIG[type as keyof typeof ACTIVITY_TYPE_CONFIG];
                  if (!config) return null;
                  return (
                    <View key={type} style={[styles.activityTypeBadge, { borderColor: config.color }]}>
                      <Ionicons name={config.icon as any} size={12} color={config.color} />
                      <Text style={[styles.activityTypeBadgeText, { color: config.color }]}>
                        {config.label}
                      </Text>
                    </View>
                  );
                })}
                {item.activity_types.length > 3 && (
                  <Text style={styles.moreTypesText}>+{item.activity_types.length - 3}</Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.categoryHeaderRight}>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#666666"
            />
          </View>
        </TouchableOpacity>

        {/* Expanded Category Details */}
        {isExpanded && (
          <View style={styles.categoryDetails}>
            {/* Activity Types */}
            <View style={styles.activityTypesSection}>
              <Text style={styles.sectionLabel}>Activity Types</Text>
              <View style={styles.activityTypesGrid}>
                {item.activity_types.map((type) => {
                  const config = ACTIVITY_TYPE_CONFIG[type as keyof typeof ACTIVITY_TYPE_CONFIG];
                  if (!config) return null;
                  return (
                    <View key={type} style={[styles.activityTypePill, { borderColor: config.color }]}>
                      <Ionicons name={config.icon as any} size={16} color={config.color} />
                      <Text style={[styles.activityTypeText, { color: config.color }]}>
                        {config.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Statistics */}
            <View style={styles.statsSection}>
              <View style={styles.statRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Total Spent</Text>
                  <Text style={[styles.statValue, { color: '#EF4444' }]}>
                    {formatCurrency(item.total_spent || 0)}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Total Received</Text>
                  <Text style={[styles.statValue, { color: '#10B981' }]}>
                    {formatCurrency(item.total_received || 0)}
                  </Text>
                </View>
              </View>
              <View style={styles.statRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Transactions</Text>
                  <Text style={styles.statValue}>{item.transaction_count || 0}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Total Saved</Text>
                  <Text style={[styles.statValue, { color: '#3B82F6' }]}>
                    {formatCurrency(item.total_saved || 0)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/category/${item.id}` as any)}
              >
                <Ionicons name="eye-outline" size={20} color="#000000" />
                <Text style={styles.actionButtonText}>View Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.editButton]}
                onPress={() => router.push(`/modals/edit-category?id=${item.id}` as any)}
              >
                <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderStatsCard = (title: string, category: CategoryStats | undefined, color: string) => (
    <View style={[styles.statsCard, { borderLeftColor: color }]}>
      <Text style={styles.statsTitle}>{title}</Text>
      {loading ? (
        <Text style={styles.statsEmpty}>Loading...</Text>
      ) : category ? (
        <>
          <Text style={styles.statsCategoryName}>{category.category_name}</Text>
          <Text style={[styles.statsAmount, { color }]}>{formatCurrency(category.total_amount)}</Text>
          <Text style={styles.statsPercentage}>{category.percentage}% of total</Text>
        </>
      ) : (
        <Text style={styles.statsEmpty}>No data</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF0F0" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Categories</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/modals/add-category' as any)}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search categories..."
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholderTextColor="#666666"
            />
          </View>

          {/* Activity Type Filter */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.activityFilter}
            contentContainerStyle={styles.activityFilterContent}
          >
            {activityTypes.map((type) => (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.activityTypeButton,
                  selectedActivityType === type.key && styles.activeActivityTypeButton,
                ]}
                onPress={() => setSelectedActivityType(type.key)}
              >
                <Ionicons
                  name={type.icon as any}
                  size={16}
                  color={selectedActivityType === type.key ? '#000000' : '#666666'}
                />
                <Text
                  style={[
                    styles.activityTypeText,
                    selectedActivityType === type.key && styles.activeActivityTypeText,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Summary Cards */}
          <View style={styles.summaryCards}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Categories</Text>
              <Text style={styles.summaryValue}>{categories.length}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Active</Text>
              <Text style={styles.summaryValue}>
                {categories.filter(c => c.activity_types.length > 0).length}
              </Text>
            </View>
          </View>

          {/* Top Categories */}
          <View style={styles.topCategories}>
            <Text style={styles.sectionTitle}>Top Categories</Text>
            {renderStatsCard('Most Spent', getMostSpentCategory(), '#EF4444')}
            {renderStatsCard('Most Received', getMostReceivedCategory(), '#10B981')}
            {renderStatsCard('Most Saved', getMostSavedCategory(), '#3B82F6')}
          </View>

          {/* Categories List */}
          <View style={styles.categoriesSection}>
            <Text style={styles.sectionTitle}>
              {selectedActivityType === 'all' 
                ? 'All Categories' 
                : `${selectedActivityType.charAt(0).toUpperCase() + selectedActivityType.slice(1)} Categories`}
            </Text>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading categories...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredCategories}
                keyExtractor={(item) => item.id}
                renderItem={renderCategoryCard}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="folder-outline" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyText}>
                      {searchTerm ? 'No categories found' : 'No categories available'}
                    </Text>
                    <Text style={styles.emptySubtext}>
                      {searchTerm ? 'Try a different search term' : 'Create your first category to get started'}
                    </Text>
                    {!searchTerm && (
                      <TouchableOpacity
                        style={styles.createFirstButton}
                        onPress={() => router.push('/modals/add-category' as any)}
                      >
                        <Text style={styles.createFirstButtonText}>Create Category</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
              />
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
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Helvetica Neue',
    fontWeight: '900',
    color: '#000000',
    letterSpacing: -0.5,
  },
  addButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Instrument Serif',
    color: '#000000',
    paddingVertical: 12,
  },
  activityFilter: {
    marginBottom: 20,
  },
  activityFilterContent: {
    paddingRight: 20,
  },
  activityTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  activeActivityTypeButton: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  activityTypeText: {
    color: '#666666',
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '500',
    marginLeft: 6,
  },
  activeActivityTypeText: {
    color: '#FFFFFF',
  },
  summaryCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flex: 1,
    marginHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Poppins',
    color: '#666666',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontFamily: 'Helvetica Neue',
    fontWeight: '900',
    color: '#000000',
  },
  topCategories: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'Helvetica Neue',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statsTitle: {
    fontSize: 14,
    fontFamily: 'Poppins',
    color: '#666666',
    marginBottom: 4,
  },
  statsCategoryName: {
    fontSize: 16,
    fontFamily: 'Helvetica Neue',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  statsAmount: {
    fontSize: 20,
    fontFamily: 'Helvetica Neue',
    fontWeight: '900',
    marginBottom: 2,
  },
  statsPercentage: {
    fontSize: 12,
    fontFamily: 'Instrument Serif',
    color: '#666666',
  },
  statsEmpty: {
    fontSize: 14,
    fontFamily: 'Instrument Serif',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  categoriesSection: {
    marginBottom: 30,
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryHeaderExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 18,
    fontFamily: 'Helvetica Neue',
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  categoryActivityTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  activityTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 4,
  },
  activityTypeBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins',
    fontWeight: '500',
    marginLeft: 4,
  },
  moreTypesText: {
    fontSize: 12,
    fontFamily: 'Instrument Serif',
    color: '#666666',
    marginLeft: 4,
  },
  categoryHeaderRight: {
    marginLeft: 12,
  },
  categoryDetails: {
    padding: 16,
    paddingTop: 0,
  },
  activityTypesSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '600',
    color: '#666666',
    marginBottom: 12,
  },
  activityTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  activityTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  activityTypeText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '500',
    marginLeft: 6,
  },
  statsSection: {
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    marginHorizontal: 8,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Poppins',
    color: '#666666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'Helvetica Neue',
    fontWeight: '700',
    color: '#000000',
  },
  actionsSection: {
    flexDirection: 'row',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 10,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  editButton: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  actionButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '600',
    color: '#000000',
    marginLeft: 6,
  },
  editButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Helvetica Neue',
    fontWeight: '600',
    color: '#666666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Instrument Serif',
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Instrument Serif',
    color: '#666666',
  },
  createFirstButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  createFirstButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Helvetica Neue',
    fontWeight: '700',
  },
});
