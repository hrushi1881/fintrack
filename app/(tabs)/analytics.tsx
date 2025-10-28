import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassmorphCard from '@/components/GlassmorphCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { theme, BACKGROUND_MODES } from '@/theme';

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const { backgroundMode } = useBackgroundMode();
  const { accounts, transactions, totalBalance, loading } = useRealtimeData();
  const { currency } = useSettings();
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  const periods = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ];

  const expenseData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        data: [1200, 1500, 1100, 1800, 1600, 1400],
        color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
        strokeWidth: 2,
      },
    ],
  };

  const incomeData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        data: [3000, 3200, 2800, 3500, 3300, 3100],
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        strokeWidth: 2,
      },
    ],
  };

  const expenseCategories = [
    { name: 'Food', population: 35, color: '#F59E0B', legendFontColor: '#FFFFFF' },
    { name: 'Transport', population: 25, color: '#3B82F6', legendFontColor: '#FFFFFF' },
    { name: 'Entertainment', population: 20, color: '#8B5CF6', legendFontColor: '#FFFFFF' },
    { name: 'Shopping', population: 15, color: '#EF4444', legendFontColor: '#FFFFFF' },
    { name: 'Utilities', population: 5, color: '#10B981', legendFontColor: '#FFFFFF' },
  ];


  const stats = [
    { title: 'Total Income', value: formatCurrencyAmount(18500, currency), change: '+12%', color: '#10B981' },
    { title: 'Total Expenses', value: formatCurrencyAmount(8800, currency), change: '-5%', color: '#EF4444' },
    { title: 'Net Savings', value: formatCurrencyAmount(9700, currency), change: '+18%', color: '#3B82F6' },
    { title: 'Savings Rate', value: '52%', change: '+8%', color: '#8B5CF6' },
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
                {expenseData.datasets[0].data.map((value, index) => (
                  <View key={index} style={styles.chartBarContainer}>
                    <View 
                      style={[
                        styles.chartBar, 
                        { height: (value / 2000) * 100 }
                      ]} 
                    />
                    <Text style={styles.chartLabel}>{expenseData.labels[index]}</Text>
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
                <View style={[styles.comparisonBar, { backgroundColor: '#3B82F6', width: '80%' }]} />
                <Text style={styles.comparisonLabel}>Income: {formatCurrencyAmount(3100, currency)}</Text>
              </View>
              <View style={styles.comparisonItem}>
                <View style={[styles.comparisonBar, { backgroundColor: '#10B981', width: '45%' }]} />
                <Text style={styles.comparisonLabel}>Expenses: {formatCurrencyAmount(1400, currency)}</Text>
              </View>
            </View>
          </GlassmorphCard>

          {/* Expense Categories */}
          <GlassmorphCard style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Expense Categories</Text>
            <View style={styles.categoriesList}>
              {expenseCategories.map((category, index) => (
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
