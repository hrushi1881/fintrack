/**
 * Income Analytics Dashboard Component
 * 
 * Displays comprehensive income analytics with beautiful visualizations
 */

import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LiquidGlassCard from '@/components/LiquidGlassCard';
import { IncomeAnalytics, IncomeInsight } from '@/utils/incomeAnalytics';
import { formatCurrencyAmount } from '@/utils/currency';

interface IncomeAnalyticsDashboardProps {
  analytics: IncomeAnalytics;
  currency: string;
}

export default function IncomeAnalyticsDashboard({
  analytics,
  currency,
}: IncomeAnalyticsDashboardProps) {
  return (
    <View style={styles.container}>
      {/* Health Score Card */}
      <LiquidGlassCard variant="premium" style={styles.healthCard}>
        <View style={styles.healthHeader}>
          <View style={styles.gradeCircle}>
            <LinearGradient
              colors={getGradeColors(analytics.reliabilityGrade)}
              style={styles.gradeGradient}
            >
              <Text style={styles.gradeText}>{analytics.reliabilityGrade}</Text>
            </LinearGradient>
          </View>
          <View style={styles.healthText}>
            <Text style={styles.healthTitle}>Income Reliability</Text>
            <Text style={styles.healthScore}>{analytics.overallReliabilityScore}%</Text>
            <Text style={styles.healthSubtitle}>
              {getReliabilityMessage(analytics.overallReliabilityScore)}
            </Text>
          </View>
        </View>

        {/* Quick Metrics */}
        <View style={styles.quickMetrics}>
          <View style={styles.quickMetric}>
            <Ionicons name="pie-chart" size={20} color="#3B82F6" />
            <Text style={styles.quickMetricValue}>{analytics.diversificationScore}%</Text>
            <Text style={styles.quickMetricLabel}>Diversification</Text>
          </View>
          <View style={styles.quickMetric}>
            <Ionicons name="trending-up" size={20} color="#10B981" />
            <Text style={styles.quickMetricValue}>
              {analytics.trendPercentage > 0 ? '+' : ''}
              {analytics.trendPercentage.toFixed(1)}%
            </Text>
            <Text style={styles.quickMetricLabel}>Trend</Text>
          </View>
          <View style={styles.quickMetric}>
            <Ionicons name="flash" size={20} color="#F59E0B" />
            <Text style={styles.quickMetricValue}>{analytics.volatilityScore}%</Text>
            <Text style={styles.quickMetricLabel}>Volatility</Text>
          </View>
        </View>
      </LiquidGlassCard>

      {/* Forecast Card */}
      <LiquidGlassCard variant="frosted" style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="telescope" size={24} color="#6366F1" />
          <Text style={styles.cardTitle}>Income Forecast</Text>
        </View>

        <View style={styles.forecastRow}>
          <View style={styles.forecastItem}>
            <Text style={styles.forecastLabel}>Next Month</Text>
            <Text style={styles.forecastAmount}>
              {formatCurrencyAmount(analytics.nextMonthForecast, currency)}
            </Text>
          </View>
          <View style={styles.forecastDivider} />
          <View style={styles.forecastItem}>
            <Text style={styles.forecastLabel}>Next Quarter</Text>
            <Text style={styles.forecastAmount}>
              {formatCurrencyAmount(analytics.nextQuarterForecast, currency)}
            </Text>
          </View>
        </View>

        <View style={styles.confidenceBar}>
          <View style={styles.confidenceBarTrack}>
            <View
              style={[
                styles.confidenceBarFill,
                {
                  width: `${analytics.forecastConfidence}%`,
                  backgroundColor: getConfidenceColor(analytics.forecastConfidence),
                },
              ]}
            />
          </View>
          <Text style={styles.confidenceText}>{analytics.forecastConfidence}% confidence</Text>
        </View>
      </LiquidGlassCard>

      {/* Insights */}
      {analytics.insights.length > 0 && (
        <View style={styles.insightsContainer}>
          <Text style={styles.sectionTitle}>Insights</Text>
          {analytics.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>
      )}

      {/* Recommendations */}
      {analytics.recommendations.length > 0 && (
        <LiquidGlassCard variant="frosted" style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="bulb" size={24} color="#F59E0B" />
            <Text style={styles.cardTitle}>Recommendations</Text>
          </View>
          {analytics.recommendations.map((rec, index) => (
            <View key={index} style={styles.recommendationItem}>
              <View style={styles.recommendationBullet} />
              <Text style={styles.recommendationText}>{rec}</Text>
            </View>
          ))}
        </LiquidGlassCard>
      )}

      {/* Stream Distribution */}
      {analytics.streamDistribution.length > 0 && (
        <LiquidGlassCard variant="frosted" style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="pie-chart" size={24} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Income Distribution</Text>
          </View>

          {/* Concentration Risk Badge */}
          <View
            style={[
              styles.riskBadge,
              {
                backgroundColor: getRiskColor(analytics.concentrationRisk) + '20',
                borderColor: getRiskColor(analytics.concentrationRisk) + '40',
              },
            ]}
          >
            <Ionicons
              name={getRiskIcon(analytics.concentrationRisk)}
              size={16}
              color={getRiskColor(analytics.concentrationRisk)}
            />
            <Text
              style={[styles.riskText, { color: getRiskColor(analytics.concentrationRisk) }]}
            >
              {analytics.concentrationRisk.toUpperCase()} concentration risk
            </Text>
          </View>

          {analytics.streamDistribution.slice(0, 5).map((stream, index) => (
            <View key={stream.streamId} style={styles.distributionItem}>
              <View style={styles.distributionHeader}>
                <View style={[styles.distributionDot, { backgroundColor: stream.color }]} />
                <Text style={styles.distributionTitle} numberOfLines={1}>
                  {stream.streamTitle}
                </Text>
                <Text style={styles.distributionPercentage}>
                  {stream.percentage.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.distributionBarTrack}>
                <View
                  style={[
                    styles.distributionBarFill,
                    {
                      width: `${stream.percentage}%`,
                      backgroundColor: stream.color,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </LiquidGlassCard>
      )}
    </View>
  );
}

function InsightCard({ insight }: { insight: IncomeInsight }) {
  return (
    <LiquidGlassCard
      variant="subtle"
      style={[
        styles.insightCard,
        {
          borderLeftWidth: 4,
          borderLeftColor: insight.color,
        },
      ]}
    >
      <View style={styles.insightHeader}>
        <View
          style={[styles.insightIconContainer, { backgroundColor: insight.color + '20' }]}
        >
          <Ionicons name={insight.icon as any} size={20} color={insight.color} />
        </View>
        <View style={styles.insightTextContainer}>
          <Text style={styles.insightTitle}>{insight.title}</Text>
          <Text style={styles.insightMessage}>{insight.message}</Text>
        </View>
      </View>
    </LiquidGlassCard>
  );
}

function getGradeColors(grade: string): string[] {
  switch (grade) {
    case 'A':
      return ['#10B981', '#059669'];
    case 'B':
      return ['#3B82F6', '#2563EB'];
    case 'C':
      return ['#F59E0B', '#D97706'];
    case 'D':
      return ['#F97316', '#EA580C'];
    case 'F':
      return ['#EF4444', '#DC2626'];
    default:
      return ['#94A3B8', '#64748B'];
  }
}

function getReliabilityMessage(score: number): string {
  if (score >= 90) return 'Excellent reliability';
  if (score >= 75) return 'Good reliability';
  if (score >= 60) return 'Moderate reliability';
  if (score >= 45) return 'Needs improvement';
  return 'Poor reliability';
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return '#10B981';
  if (confidence >= 60) return '#3B82F6';
  if (confidence >= 40) return '#F59E0B';
  return '#EF4444';
}

function getRiskColor(risk: string): string {
  switch (risk) {
    case 'low':
      return '#10B981';
    case 'medium':
      return '#F59E0B';
    case 'high':
      return '#EF4444';
    default:
      return '#94A3B8';
  }
}

function getRiskIcon(risk: string): any {
  switch (risk) {
    case 'low':
      return 'shield-checkmark';
    case 'medium':
      return 'warning';
    case 'high':
      return 'alert-circle';
    default:
      return 'information-circle';
  }
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  healthCard: {
    padding: 24,
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  gradeCircle: {
    marginRight: 16,
  },
  gradeGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: {
    fontSize: 32,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
  },
  healthText: {
    flex: 1,
  },
  healthTitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
    marginBottom: 4,
  },
  healthScore: {
    fontSize: 32,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
    marginBottom: 2,
  },
  healthSubtitle: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(4,27,17,0.5)',
  },
  quickMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(4,27,17,0.08)',
  },
  quickMetric: {
    alignItems: 'center',
    gap: 6,
  },
  quickMetricValue: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
  },
  quickMetricLabel: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.5)',
  },
  card: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
  },
  forecastRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  forecastItem: {
    alignItems: 'center',
  },
  forecastLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
    marginBottom: 6,
  },
  forecastAmount: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: '#10B981',
  },
  forecastDivider: {
    width: 1,
    backgroundColor: 'rgba(4,27,17,0.1)',
  },
  confidenceBar: {
    gap: 8,
  },
  confidenceBarTrack: {
    height: 8,
    backgroundColor: 'rgba(4,27,17,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(4,27,17,0.6)',
    textAlign: 'center',
  },
  insightsContainer: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginBottom: 4,
  },
  insightCard: {
    padding: 16,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  insightIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightTextContainer: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginBottom: 4,
  },
  insightMessage: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.7)',
    lineHeight: 20,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  recommendationBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
    marginTop: 7,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.8)',
    lineHeight: 20,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  riskText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
  },
  distributionItem: {
    marginBottom: 16,
  },
  distributionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  distributionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  distributionTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#041B11',
  },
  distributionPercentage: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: 'rgba(4,27,17,0.7)',
  },
  distributionBarTrack: {
    height: 6,
    backgroundColor: 'rgba(4,27,17,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  distributionBarFill: {
    height: '100%',
    borderRadius: 3,
  },
});
