import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  FlatList,
  StatusBar,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useSettings } from '../../contexts/SettingsContext';
import { Category, CategoryStats } from '../../types';
import { getCategoryStats, getCategoryTransactions, getCategoryConnectedItems } from '../../utils/categories';
import { formatCurrencyAmount } from '../../utils/currency';

export default function CategoryDetailScreen() {
  const { id } = useLocalSearchParams();
  const { categories, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  const [activeTab, setActiveTab] = useState('overview');
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [connectedItems, setConnectedItems] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const category = categories.find(c => c.id === id);

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  useEffect(() => {
    if (category) {
      loadCategoryData();
    }
  }, [category]);

  const loadCategoryData = async () => {
    if (!category) return;

    try {
      setLoading(true);
      const [stats, trans, items] = await Promise.all([
        getCategoryStats(category.user_id, '1 month'),
        getCategoryTransactions(category.id),
        getCategoryConnectedItems(category.id)
      ]);

      setCategoryStats(stats);
      setTransactions(trans);
      setConnectedItems(items);
    } catch (error) {
      console.error('Error loading category data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = () => {
    Alert.alert(
      'Delete Category',
      'Are you sure you want to delete this category? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // TODO: Implement delete category
            console.log('Delete category:', category?.id);
          },
        },
      ]
    );
  };

  const getCategoryStat = () => {
    return categoryStats.find(stat => stat.category_id === category?.id);
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'home' },
    { key: 'transactions', label: 'Transactions', icon: 'list' },
    { key: 'connected', label: 'Connected', icon: 'link' },
  ];

  const renderOverview = () => {
    const stat = getCategoryStat();
    
    return (
      <View style={styles.tabContent}>
        {/* Category Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.categoryHeader}>
            <View style={[styles.categoryIcon, { backgroundColor: category?.color }]}>
              <Ionicons name={category?.icon as any} size={32} color="white" />
            </View>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>{category?.name}</Text>
              <View style={styles.activityTypes}>
                {category?.activity_types.map((type, index) => (
                  <View key={index} style={styles.activityTypeBadge}>
                    <Text style={styles.activityTypeText}>{type}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.categoryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Spent</Text>
              <Text style={styles.statValue}>{formatCurrency(category?.total_spent || 0)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Received</Text>
              <Text style={styles.statValue}>{formatCurrency(category?.total_received || 0)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Saved</Text>
              <Text style={styles.statValue}>{formatCurrency(category?.total_saved || 0)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Transactions</Text>
              <Text style={styles.statValue}>{category?.transaction_count || 0}</Text>
            </View>
          </View>

          {stat && (
            <View style={styles.percentageCard}>
              <Text style={styles.percentageLabel}>Percentage of Total</Text>
              <Text style={styles.percentageValue}>{stat.percentage}%</Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/modals/edit-category?id=${category?.id}` as any)}
          >
            <Ionicons name="create" size={20} color="#3B82F6" />
            <Text style={styles.actionText}>Edit Category</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
            onPress={handleDeleteCategory}
          >
            <Ionicons name="trash" size={20} color="white" />
            <Text style={[styles.actionText, { color: 'white' }]}>Delete Category</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTransactions = () => (
    <View style={styles.tabContent}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.transactionCard}>
            <View style={styles.transactionHeader}>
              <View style={[styles.transactionIcon, { backgroundColor: item.account?.color || '#6B7280' }]}>
                <Ionicons name={item.account?.icon || 'card'} size={20} color="white" />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionDescription}>{item.description || 'No description'}</Text>
                <Text style={styles.transactionAccount}>{item.account?.name}</Text>
                <Text style={styles.transactionDate}>{formatDate(item.date)}</Text>
              </View>
              <Text style={[
                styles.transactionAmount,
                { color: item.type === 'income' ? '#10B981' : '#EF4444' }
              ]}>
                {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
              </Text>
            </View>
          </View>
        )}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No transactions found</Text>
            <Text style={styles.emptySubtext}>Transactions using this category will appear here</Text>
          </View>
        }
      />
    </View>
  );

  const renderConnected = () => (
    <View style={styles.tabContent}>
      {/* Subcategories (frontend scaffold) */}
      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Subcategories</Text>
        {(() => {
          const subs = (categories as any[]).filter((c: any) => c.parent_id === category?.id);
          if (subs.length === 0) {
            return (
              <View>
                <Text style={styles.noItemsText}>No subcategories yet</Text>
                <TouchableOpacity
                  style={[styles.actionButton, { marginTop: 12 }]}
                  onPress={() => router.push(`/modals/add-subcategory?id=${category?.id}` as any)}
                >
                  <Ionicons name="add" size={20} color="#3B82F6" />
                  <Text style={styles.actionText}>Add Subcategory</Text>
                </TouchableOpacity>
              </View>
            );
          }
          return subs.map((sub: any) => (
            <TouchableOpacity
              key={sub.id}
              style={styles.connectedItem}
              onPress={() => router.push(`/category/${sub.id}` as any)}
            >
              <View style={styles.connectedItemInfo}>
                <Text style={styles.connectedItemName}>{sub.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ));
        })()}
      </View>

      {/* Budgets */}
      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Budgets ({connectedItems.budgets?.length || 0})</Text>
        {connectedItems.budgets?.length > 0 ? (
          connectedItems.budgets.map((budget: any) => (
            <TouchableOpacity
              key={budget.id}
              style={styles.connectedItem}
              onPress={() => router.push(`/budget/${budget.id}` as any)}
            >
              <View style={styles.connectedItemInfo}>
                <Text style={styles.connectedItemName}>{budget.name}</Text>
                <Text style={styles.connectedItemAmount}>
                  {formatCurrency(budget.spent_amount)} / {formatCurrency(budget.amount)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.noItemsText}>No budgets linked to this category</Text>
        )}
      </View>

      {/* Bills */}
      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Bills ({connectedItems.bills?.length || 0})</Text>
        {connectedItems.bills?.length > 0 ? (
          connectedItems.bills.map((bill: any) => (
            <TouchableOpacity
              key={bill.id}
              style={styles.connectedItem}
              onPress={() => router.push(`/bill/${bill.id}` as any)}
            >
              <View style={styles.connectedItemInfo}>
                <Text style={styles.connectedItemName}>{bill.title}</Text>
                <Text style={styles.connectedItemAmount}>
                  {bill.amount ? formatCurrency(bill.amount) : 'Variable'} - {bill.status}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.noItemsText}>No bills linked to this category</Text>
        )}
      </View>

      {/* Goals */}
      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Goals ({connectedItems.goals?.length || 0})</Text>
        {connectedItems.goals?.length > 0 ? (
          connectedItems.goals.map((goal: any) => (
            <TouchableOpacity
              key={goal.id}
              style={styles.connectedItem}
              onPress={() => router.push(`/goal/${goal.id}` as any)}
            >
              <View style={styles.connectedItemInfo}>
                <Text style={styles.connectedItemName}>{goal.title}</Text>
                <Text style={styles.connectedItemAmount}>
                  {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.noItemsText}>No goals linked to this category</Text>
        )}
      </View>

      {/* Liabilities */}
      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Liabilities ({connectedItems.liabilities?.length || 0})</Text>
        {connectedItems.liabilities?.length > 0 ? (
          connectedItems.liabilities.map((liability: any) => (
            <TouchableOpacity
              key={liability.id}
              style={styles.connectedItem}
              onPress={() => router.push(`/liability/${liability.id}` as any)}
            >
              <View style={styles.connectedItemInfo}>
                <Text style={styles.connectedItemName}>{liability.title}</Text>
                <Text style={styles.connectedItemAmount}>
                  {formatCurrency(liability.amount)} - {liability.interest_rate}% APR
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.noItemsText}>No liabilities linked to this category</Text>
        )}
      </View>
    </View>
  );

  if (!category) {
    return (
      <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
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
    );
  }

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
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Category Details</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push(`/modals/edit-category?id=${category.id}` as any)}
            >
              <Ionicons name="create" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={20}
                  color={activeTab === tab.key ? '#10B981' : '#6B7280'}
                />
                <Text style={[
                  styles.tabText,
                  activeTab === tab.key && styles.activeTabText
                ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab Content */}
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'transactions' && renderTransactions()}
          {activeTab === 'connected' && renderConnected()}
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
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  headerTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 30,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#10B981',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: 'white',
  },
  tabContent: {
    marginBottom: 30,
  },
  infoCard: {
    backgroundColor: '#000000',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  categoryIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 20,
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
  activityTypeText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  categoryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
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
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
  },
  percentageCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  percentageLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  percentageValue: {
    fontSize: 24,
    color: '#10B981',
    fontWeight: 'bold',
  },
  actionsCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionText: {
    color: '#3B82F6',
    marginLeft: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  transactionCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginBottom: 2,
  },
  transactionAccount: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  connectedSection: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  connectedTitle: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  connectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  connectedItemInfo: {
    flex: 1,
  },
  connectedItemName: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginBottom: 2,
  },
  connectedItemAmount: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  noItemsText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
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
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
