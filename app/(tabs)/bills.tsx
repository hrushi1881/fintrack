import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useSettings } from '../../contexts/SettingsContext';
import { Bill } from '../../types';
import { calculateBillStatistics } from '../../utils/bills';
import { formatCurrencyAmount } from '../../utils/currency';

export default function BillsScreen() {
  const { bills, categories, globalRefresh } = useRealtimeData();
  const { currency } = useSettings();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [billStats, setBillStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const filters = [
    { key: 'all', label: 'All', count: bills ? bills.length : 0 },
    { key: 'upcoming', label: 'Upcoming', count: bills ? bills.filter(b => b.status === 'upcoming').length : 0 },
    { key: 'due_today', label: 'Due Today', count: bills ? bills.filter(b => b.status === 'due_today').length : 0 },
    { key: 'overdue', label: 'Overdue', count: bills ? bills.filter(b => b.status === 'overdue').length : 0 },
    { key: 'paid', label: 'Paid', count: bills ? bills.filter(b => b.status === 'paid').length : 0 },
  ];

  useEffect(() => {
    if (bills !== null) {
      if (bills.length > 0) {
        loadBillStats();
      } else {
        setLoading(false);
      }
    }
  }, [bills]);

  const loadBillStats = async () => {
    try {
      setLoading(true);
      if (bills && bills.length > 0) {
        const stats = await calculateBillStatistics(bills[0].user_id, '1 month');
        setBillStats(stats);
      } else {
        setBillStats(null);
      }
    } catch (error) {
      console.error('Error loading bill stats:', error);
      setBillStats(null);
    } finally {
      setLoading(false);
    }
  };

  const filteredBills = bills ? bills.filter(bill => {
    if (selectedFilter === 'all') return true;
    return bill.status === selectedFilter;
  }) : [];

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Uncategorized';
  };

  const getCategoryColor = (categoryId?: string) => {
    if (!categoryId) return '#6B7280';
    const category = categories.find(c => c.id === categoryId);
    return category?.color || '#6B7280';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#10B981';
      case 'overdue': return '#EF4444';
      case 'due_today': return '#F59E0B';
      case 'upcoming': return '#3B82F6';
      case 'skipped': return '#6B7280';
      case 'cancelled': return '#6B7280';
      case 'postponed': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'overdue': return 'Overdue';
      case 'due_today': return 'Due Today';
      case 'upcoming': return 'Upcoming';
      case 'skipped': return 'Skipped';
      case 'cancelled': return 'Cancelled';
      case 'postponed': return 'Postponed';
      default: return 'Unknown';
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderBillCard = ({ item }: { item: Bill }) => (
    <TouchableOpacity 
      style={styles.billItem}
      onPress={() => router.push(`/bill/${item.id}` as any)}
    >
      <View style={styles.billHeader}>
        <View style={[styles.billIcon, { backgroundColor: item.color + '20' }]}>
          <Ionicons name={item.icon as any} size={24} color={item.color} />
        </View>
        <View style={styles.billInfo}>
          <Text style={styles.billTitle}>{item.title}</Text>
          <Text style={styles.billCategory}>{getCategoryName(item.category_id)}</Text>
          <Text style={styles.billDueDate}>Due: {formatDate(item.due_date)}</Text>
        </View>
        <View style={styles.billAmount}>
          <Text style={styles.amountText}>
            {item.amount ? formatCurrency(item.amount) : 'Variable'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusText(item.status)}
            </Text>
          </View>
        </View>
      </View>
      
      {item.status !== 'paid' && item.status !== 'cancelled' && (
        <View style={styles.billActions}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#10B981' }]}
            onPress={() => router.push(`/modals/mark-bill-paid?id=${item.id}` as any)}
          >
            <Ionicons name="checkmark" size={16} color="white" />
            <Text style={styles.actionText}>Pay Bill</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
            onPress={() => router.push(`/modals/postpone-bill?id=${item.id}` as any)}
          >
            <Ionicons name="calendar" size={16} color="white" />
            <Text style={styles.actionText}>Postpone</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Bills & Liabilities</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => router.push('/modals/add-bill' as any)}
            >
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Filter Tabs */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterButton,
                  selectedFilter === filter.key && styles.activeFilterButton,
                ]}
                onPress={() => setSelectedFilter(filter.key)}
              >
                <Text style={[
                  styles.filterText,
                  selectedFilter === filter.key && styles.activeFilterText,
                ]}>
                  {filter.label}
                </Text>
                <View style={[
                  styles.filterCount,
                  selectedFilter === filter.key && styles.activeFilterCount,
                ]}>
                  <Text style={[
                    styles.filterCountText,
                    selectedFilter === filter.key && styles.activeFilterCountText,
                  ]}>
                    {filter.count}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Summary Cards */}
          <View style={styles.summaryCards}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Upcoming</Text>
              <Text style={styles.summaryAmount}>
                {billStats ? formatCurrency(billStats.upcoming_amount) : formatCurrency(0)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Overdue</Text>
              <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>
                {billStats ? formatCurrency(billStats.overdue_amount) : formatCurrency(0)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Due Today</Text>
              <Text style={[styles.summaryAmount, { color: '#F59E0B' }]}>
                {bills ? bills.filter(b => b.status === 'due_today').length : 0}
              </Text>
            </View>
          </View>

          {/* Bills List */}
          <View style={styles.billsList}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading bills...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredBills}
                keyExtractor={(item) => item.id}
                renderItem={renderBillCard}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyText}>
                      {selectedFilter === 'all' ? 'No bills found' : `No ${selectedFilter} bills`}
                    </Text>
                    <Text style={styles.emptySubtext}>
                      {selectedFilter === 'all' ? 'Add your first bill to get started' : 'Try a different filter'}
                    </Text>
                    {selectedFilter === 'all' && (
                      <TouchableOpacity
                        style={styles.createFirstButton}
                        onPress={() => router.push('/modals/add-bill' as any)}
                      >
                        <Text style={styles.createFirstButtonText}>Add Bill</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
              />
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/modals/add-bill' as any)}
            >
              <Ionicons name="add-circle" size={24} color="#10B981" />
              <Text style={styles.actionText}>Add Bill</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/categories' as any)}
            >
              <Ionicons name="folder" size={24} color="#3B82F6" />
              <Text style={styles.actionText}>Categories</Text>
            </TouchableOpacity>
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
  filterContainer: {
    marginBottom: 20,
  },
  filterContent: {
    paddingRight: 20,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  activeFilterButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  filterText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  activeFilterText: {
    color: '#10B981',
  },
  filterCount: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeFilterCount: {
    backgroundColor: '#10B981',
  },
  filterCountText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  activeFilterCountText: {
    color: 'white',
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
  summaryAmount: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  billsList: {
    marginBottom: 30,
  },
  billItem: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  billIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  billInfo: {
    flex: 1,
  },
  billTitle: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  billCategory: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  billDueDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  billAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  billActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  actionText: {
    color: 'white',
    marginLeft: 4,
    fontSize: 12,
    fontWeight: 'bold',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
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
