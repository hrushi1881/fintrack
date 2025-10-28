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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useSettings } from '../../contexts/SettingsContext';
import { Category, CategoryStats } from '../../types';
import { getCategoryStats } from '../../utils/categories';
import { formatCurrencyAmount } from '../../utils/currency';

export default function CategoriesScreen() {
  const { categories, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivityType, setSelectedActivityType] = useState<string>('all');
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [loading, setLoading] = useState(true);

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

  const renderCategoryCard = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={styles.categoryCard}
      onPress={() => router.push(`/category/${item.id}` as any)}
    >
      <View style={styles.categoryHeader}>
        <View style={[styles.categoryIcon, { backgroundColor: item.color }]}>
          <Ionicons name={item.icon as any} size={24} color="white" />
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
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>
      
      <View style={styles.categoryStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Spent</Text>
          <Text style={styles.statValue}>{formatCurrency(item.total_spent)}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Received</Text>
          <Text style={styles.statValue}>{formatCurrency(item.total_received)}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Transactions</Text>
          <Text style={styles.statValue}>{item.transaction_count}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderStatsCard = (title: string, category: CategoryStats | undefined, color: string) => (
    <View style={[styles.statsCard, { borderLeftColor: color }]}>
      <Text style={styles.statsTitle}>{title}</Text>
      {loading ? (
        <Text style={styles.statsEmpty}>Loading...</Text>
      ) : category ? (
        <>
          <Text style={styles.statsCategoryName}>{category.category_name}</Text>
          <Text style={styles.statsAmount}>{formatCurrency(category.total_amount)}</Text>
          <Text style={styles.statsPercentage}>{category.percentage}% of total</Text>
        </>
      ) : (
        <Text style={styles.statsEmpty}>No data</Text>
      )}
    </View>
  );

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#99D795" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Categories</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/modals/add-category' as any)}
            >
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
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
                  color={selectedActivityType === type.key ? '#10B981' : '#9CA3AF'}
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
            {renderStatsCard(
              'Most Spent',
              getMostSpentCategory(),
              '#EF4444'
            )}
            {renderStatsCard(
              'Most Received',
              getMostReceivedCategory(),
              '#10B981'
            )}
            {renderStatsCard(
              'Most Saved',
              getMostSavedCategory(),
              '#3B82F6'
            )}
          </View>

          {/* Categories List */}
          <View style={styles.categoriesSection}>
            <Text style={styles.sectionTitle}>
              {selectedActivityType === 'all' ? 'All Categories' : `${selectedActivityType.charAt(0).toUpperCase() + selectedActivityType.slice(1)} Categories`}
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
    </LinearGradient>
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
  headerTitle: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: 'white',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  activeActivityTypeButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  activityTypeText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  activeActivityTypeText: {
    color: '#10B981',
  },
  summaryCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  summaryCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    flex: 1,
    marginHorizontal: 8,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  topCategories: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  statsCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  statsTitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  statsCategoryName: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginBottom: 4,
  },
  statsAmount: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statsPercentage: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  statsEmpty: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  categoriesSection: {
    marginBottom: 30,
  },
  categoryCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  activityTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  activityTypeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  categoryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  createFirstButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  createFirstButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
