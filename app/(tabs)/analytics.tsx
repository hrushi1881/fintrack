import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassmorphCard from '@/components/GlassmorphCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { theme, BACKGROUND_MODES } from '@/theme';
import { supabase } from '@/lib/supabase';

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const { backgroundMode } = useBackgroundMode();
  const { accounts, transactions, totalBalance, loading } = useRealtimeData();
  const { currency } = useSettings();
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [categoryStats, setCategoryStats] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);

  const periods = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ];

  const getInterval = useMemo(() => {
    switch (selectedPeriod) {
      case 'week':
        return '7 days';
      case 'year':
        return '12 months';
      case 'month':
      default:
        return '1 month';
    }
  }, [selectedPeriod]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user?.id) return;
      setFetching(true);
      try {
        const { data, error } = await supabase.rpc('get_category_stats', {
          user_uuid: user.id,
          time_range: getInterval as any,
        });
        if (error) {
          console.error('Error fetching category stats:', error);
          setCategoryStats([]);
        } else {
          setCategoryStats(data || []);
        }
      } finally {
        setFetching(false);
      }
    };
    fetchStats();
  }, [user?.id, getInterval]);

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [] as any[];
    const now = new Date();
    const start = new Date();
    if (selectedPeriod === 'week') start.setDate(now.getDate() - 7);
    if (selectedPeriod === 'month') start.setMonth(now.getMonth() - 1);
    if (selectedPeriod === 'year') start.setFullYear(now.getFullYear() - 1);
    return transactions.filter((t: any) => {
      const d = new Date(t.date || t.created_at);
      return d >= start && d <= now;
    });
  }, [transactions, selectedPeriod]);

  const totals = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const t of filteredTransactions) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') income += amt;
      if (t.type === 'expense') expenses += Math.abs(amt);
    }
    const net = income - expenses;
    const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;
    return { income, expenses, net, savingsRate };
  }, [filteredTransactions]);

  const expenseCategories = useMemo(() => {
    // Fall back to simple aggregation if RPC not available
    if (categoryStats && categoryStats.length > 0) {
      return categoryStats.map((c: any) => ({
        name: c.category_name,
        population: Number(c.percentage) || 0,
        color: c.color || '#10B981',
      }));
    }
    const map: Record<string, { amount: number; color: string }> = {};
    for (const t of filteredTransactions) {
      if (t.type !== 'expense') continue;
      const key = t.category?.name || 'Other';
      if (!map[key]) map[key] = { amount: 0, color: '#10B981' };
      map[key].amount += Math.abs(Number(t.amount) || 0);
    }
    const total = Object.values(map).reduce((s, v) => s + v.amount, 0) || 1;
    return Object.entries(map)
      .map(([name, v]) => ({ name, population: Math.round((v.amount / total) * 100), color: v.color }))
      .sort((a, b) => b.population - a.population)
      .slice(0, 8);
  }, [categoryStats, filteredTransactions]);


  const stats = [
    { title: 'Total Income', value: formatCurrencyAmount(totals.income, currency), change: '', color: '#10B981' },
    { title: 'Total Expenses', value: formatCurrencyAmount(totals.expenses, currency), change: '', color: '#EF4444' },
    { title: 'Net Savings', value: formatCurrencyAmount(totals.net, currency), change: '', color: '#3B82F6' },
    { title: 'Savings Rate', value: `${totals.savingsRate}%`, change: '', color: '#8B5CF6' },
  ];

  const renderBackground = () => {
    if (backgroundMode === BACKGROUND_MODES.IOS_GRADIENT) {
      return (
        <IOSGradientBackground gradientType="default" animated={true} shimmer={true}>
          {renderContent()}
        </IOSGradientBackground>
      );
    } else {
      return (
        <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
          {renderContent()}
        </LinearGradient>
      );
    }
  };

  const renderContent = () => (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="filter" size={24} color="white" />
          </TouchableOpacity>
        </View>

          {/* Period Selector */}
          <View style={styles.periodSelector}>
            {periods.map((period) => (
              <TouchableOpacity
                key={period.key}
                style={[
                  styles.periodButton,
                  selectedPeriod === period.key && styles.activePeriodButton
                ]}
                onPress={() => setSelectedPeriod(period.key)}
              >
                <Text style={[
                  styles.periodText,
                  selectedPeriod === period.key && styles.activePeriodText
                ]}>
                  {period.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Key Stats */}
          <View style={styles.statsGrid}>
            {stats.map((stat, index) => (
              <GlassmorphCard key={index} style={styles.statCard}>
                <Text style={styles.statTitle}>{stat.title}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={[styles.statChange, { color: stat.color }]}>
                  {stat.change}
                </Text>
              </GlassmorphCard>
            ))}
          </View>

          {/* Expense Trend Chart */}
          <GlassmorphCard style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Expense Trend</Text>
            <View style={styles.simpleChart}>
              <View style={styles.chartBars}>
                {expenseCategories.slice(0, 6).map((c, index) => (
                  <View key={index} style={styles.chartBarContainer}>
                    <View
                      style={[
                        styles.chartBar,
                        { height: Math.max(6, c.population), backgroundColor: c.color }
                      ]}
                    />
                    <Text style={styles.chartLabel}>{c.name.substring(0, 3)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </GlassmorphCard>

          {/* Income vs Expenses */}
          <GlassmorphCard style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Income vs Expenses</Text>
            <View style={styles.comparisonChart}>
              <View style={styles.comparisonItem}>
                <View style={[styles.comparisonBar, { backgroundColor: '#3B82F6', width: `${Math.min(100, totals.income === 0 ? 0 : 80)}%` }]} />
                <Text style={styles.comparisonLabel}>Income: {formatCurrencyAmount(totals.income, currency)}</Text>
              </View>
              <View style={styles.comparisonItem}>
                <View style={[styles.comparisonBar, { backgroundColor: '#10B981', width: `${Math.min(100, totals.expenses === 0 ? 0 : 45)}%` }]} />
                <Text style={styles.comparisonLabel}>Expenses: {formatCurrencyAmount(totals.expenses, currency)}</Text>
              </View>
            </View>
          </GlassmorphCard>

          {/* Expense Categories */}
          <GlassmorphCard style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Expense Categories</Text>
            <View style={styles.categoriesList}>
              {(fetching ? [] : expenseCategories).map((category, index) => (
                <View key={index} style={styles.categoryItem}>
                  <View style={[styles.categoryColor, { backgroundColor: category.color }]} />
                  <Text style={styles.categoryName}>{category.name}</Text>
                  <Text style={styles.categoryPercentage}>{category.population}%</Text>
                </View>
              ))}
            </View>
          </GlassmorphCard>

          {/* Insights */}
          <GlassmorphCard style={styles.insightsContainer}>
            <Text style={styles.insightsTitle}>Insights</Text>
            <View style={styles.insightItem}>
              <Ionicons name="trending-up" size={20} color="#10B981" />
              <Text style={styles.insightText}>
                Your savings rate has improved by 8% this month
              </Text>
            </View>
            <View style={styles.insightItem}>
              <Ionicons name="warning" size={20} color="#F59E0B" />
              <Text style={styles.insightText}>
                Entertainment spending is 25% above budget
              </Text>
            </View>
            <View style={styles.insightItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.insightText}>
                You're on track to meet your financial goals
              </Text>
            </View>
          </GlassmorphCard>
        </ScrollView>
      </SafeAreaView>
  );

  return renderBackground();
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
    ...theme.typography.h1,
    color: '#FFFFFF',
  },
  filterButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 30,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activePeriodButton: {
    backgroundColor: '#10B981',
  },
  periodText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  activePeriodText: {
    color: 'white',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  statCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 16,
    width: '48%',
    marginBottom: 12,
  },
  statTitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statChange: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  chartContainer: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  chart: {
    borderRadius: 16,
  },
  simpleChart: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
    justifyContent: 'space-between',
    width: '100%',
  },
  chartBarContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  chartBar: {
    width: 20,
    backgroundColor: '#10B981',
    borderRadius: 4,
    marginBottom: 8,
    minHeight: 4,
  },
  chartLabel: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  comparisonChart: {
    height: 120,
    justifyContent: 'center',
  },
  comparisonItem: {
    marginBottom: 16,
  },
  comparisonBar: {
    height: 20,
    borderRadius: 10,
    marginBottom: 8,
  },
  comparisonLabel: {
    color: 'white',
    fontSize: 12,
  },
  categoriesList: {
    marginTop: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  categoryName: {
    color: 'white',
    flex: 1,
    fontSize: 14,
  },
  categoryPercentage: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  insightsContainer: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
  },
  insightsTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  insightText: {
    color: 'white',
    marginLeft: 12,
    flex: 1,
    fontSize: 14,
  },
});
