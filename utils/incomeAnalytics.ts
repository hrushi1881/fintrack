/**
 * Income Analytics Utility
 * 
 * Advanced analytics for income streams:
 * - Reliability scoring
 * - Trend analysis
 * - Forecasting
 * - Income diversification metrics
 * - Pattern recognition
 */

import { IncomeStream, IncomeCycle, getIncomeCycleStatistics } from './incomeCycles';
import { fetchIncomeDashboardData } from './incomeDashboard';

export interface IncomeAnalytics {
  // Reliability metrics
  overallReliabilityScore: number; // 0-100
  reliabilityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  mostReliableStream?: StreamReliability;
  leastReliableStream?: StreamReliability;
  
  // Diversification metrics
  diversificationScore: number; // 0-100
  concentrationRisk: 'low' | 'medium' | 'high';
  primaryIncomePercentage: number;
  streamDistribution: StreamContribution[];
  
  // Trends
  trend: 'increasing' | 'stable' | 'decreasing';
  trendPercentage: number;
  volatilityScore: number; // 0-100, lower is better
  
  // Forecasting
  nextMonthForecast: number;
  nextQuarterForecast: number;
  forecastConfidence: number; // 0-100
  
  // Insights
  insights: IncomeInsight[];
  recommendations: string[];
}

export interface StreamReliability {
  streamId: string;
  streamTitle: string;
  reliabilityScore: number;
  onTimeRate: number;
  missedCount: number;
  averageAmount: number;
}

export interface StreamContribution {
  streamId: string;
  streamTitle: string;
  percentage: number;
  amount: number;
  color: string;
}

export interface IncomeInsight {
  id: string;
  type: 'positive' | 'warning' | 'negative' | 'neutral';
  title: string;
  message: string;
  metric?: number;
  icon: string;
  color: string;
}

/**
 * Calculate comprehensive income analytics
 */
export async function calculateIncomeAnalytics(
  userId: string,
  options?: {
    includeHistory?: boolean;
    monthsBack?: number;
  }
): Promise<IncomeAnalytics> {
  try {
    // Fetch dashboard data with history
    const dashboardData = await fetchIncomeDashboardData(userId, {
      includeHistory: true,
    });

    // Calculate reliability metrics
    const reliability = calculateReliabilityMetrics(dashboardData.streams);
    
    // Calculate diversification
    const diversification = calculateDiversification(dashboardData.streams);
    
    // Analyze trends
    const trendAnalysis = analyzeTrends(dashboardData.monthlyTrend);
    
    // Generate forecasts
    const forecast = generateForecast(
      dashboardData.monthlyTrend,
      dashboardData.overallReliability
    );
    
    // Generate insights
    const insights = generateInsights(dashboardData, reliability, diversification, trendAnalysis);
    
    // Generate recommendations
    const recommendations = generateRecommendations(
      dashboardData,
      reliability,
      diversification,
      trendAnalysis
    );

    return {
      overallReliabilityScore: reliability.overallScore,
      reliabilityGrade: reliability.grade,
      mostReliableStream: reliability.mostReliable,
      leastReliableStream: reliability.leastReliable,
      diversificationScore: diversification.score,
      concentrationRisk: diversification.risk,
      primaryIncomePercentage: diversification.primaryPercentage,
      streamDistribution: diversification.distribution,
      trend: trendAnalysis.trend,
      trendPercentage: trendAnalysis.percentage,
      volatilityScore: trendAnalysis.volatility,
      nextMonthForecast: forecast.nextMonth,
      nextQuarterForecast: forecast.nextQuarter,
      forecastConfidence: forecast.confidence,
      insights,
      recommendations,
    };
  } catch (error) {
    console.error('Error calculating income analytics:', error);
    throw error;
  }
}

function calculateReliabilityMetrics(streams: any[]): {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  mostReliable?: StreamReliability;
  leastReliable?: StreamReliability;
} {
  if (streams.length === 0) {
    return {
      overallScore: 0,
      grade: 'F',
    };
  }

  const streamReliabilities: StreamReliability[] = streams.map((s) => ({
    streamId: s.id,
    streamTitle: s.title,
    reliabilityScore: s.statistics?.reliability || 0,
    onTimeRate: s.statistics?.onTimeRate || 0,
    missedCount: s.statistics?.missedCount || 0,
    averageAmount: s.statistics?.averageAmount || 0,
  }));

  // Calculate overall score (weighted by amount)
  const totalAmount = streamReliabilities.reduce((sum, s) => sum + s.averageAmount, 0);
  const weightedScore =
    totalAmount > 0
      ? streamReliabilities.reduce(
          (sum, s) => sum + (s.reliabilityScore * s.averageAmount) / totalAmount,
          0
        )
      : streamReliabilities.reduce((sum, s) => sum + s.reliabilityScore, 0) / streams.length;

  const overallScore = Math.round(weightedScore);

  // Assign grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (overallScore >= 90) grade = 'A';
  else if (overallScore >= 80) grade = 'B';
  else if (overallScore >= 70) grade = 'C';
  else if (overallScore >= 60) grade = 'D';

  // Find most and least reliable
  const sorted = [...streamReliabilities].sort((a, b) => b.reliabilityScore - a.reliabilityScore);

  return {
    overallScore,
    grade,
    mostReliable: sorted[0],
    leastReliable: sorted[sorted.length - 1],
  };
}

function calculateDiversification(streams: any[]): {
  score: number;
  risk: 'low' | 'medium' | 'high';
  primaryPercentage: number;
  distribution: StreamContribution[];
} {
  if (streams.length === 0) {
    return {
      score: 0,
      risk: 'high',
      primaryPercentage: 0,
      distribution: [],
    };
  }

  // Calculate total expected income
  const totalIncome = streams.reduce(
    (sum, s) => sum + (s.statistics?.totalReceived || s.amount || 0),
    0
  );

  // Calculate distribution
  const distribution: StreamContribution[] = streams
    .map((s) => {
      const amount = s.statistics?.totalReceived || s.amount || 0;
      return {
        streamId: s.id,
        streamTitle: s.title,
        percentage: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
        amount: Math.round(amount * 100) / 100,
        color: s.color,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);

  const primaryPercentage = distribution[0]?.percentage || 0;

  // Calculate Herfindahl-Hirschman Index (HHI) for diversification
  // HHI ranges from 0 (perfect diversification) to 10,000 (single source)
  const hhi = distribution.reduce((sum, d) => sum + d.percentage * d.percentage, 0);

  // Convert HHI to 0-100 score (higher is better diversification)
  const score = Math.round(Math.max(0, 100 - hhi / 100));

  // Determine risk
  let risk: 'low' | 'medium' | 'high' = 'low';
  if (primaryPercentage > 70 || streams.length < 2) risk = 'high';
  else if (primaryPercentage > 50 || streams.length < 3) risk = 'medium';

  return {
    score,
    risk,
    primaryPercentage: Math.round(primaryPercentage * 100) / 100,
    distribution,
  };
}

function analyzeTrends(monthlyTrend: any[]): {
  trend: 'increasing' | 'stable' | 'decreasing';
  percentage: number;
  volatility: number;
} {
  if (monthlyTrend.length < 2) {
    return {
      trend: 'stable',
      percentage: 0,
      volatility: 0,
    };
  }

  const amounts = monthlyTrend.map((m) => m.actual);
  const first = amounts[0] || 0;
  const last = amounts[amounts.length - 1] || 0;

  // Calculate trend
  const change = last - first;
  const percentage = first > 0 ? (change / first) * 100 : 0;

  let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (percentage > 5) trend = 'increasing';
  else if (percentage < -5) trend = 'decreasing';

  // Calculate volatility (coefficient of variation)
  const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
  const variance =
    amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  const volatility = mean > 0 ? Math.round((stdDev / mean) * 100) : 0;

  return {
    trend,
    percentage: Math.round(percentage * 100) / 100,
    volatility,
  };
}

function generateForecast(monthlyTrend: any[], reliability: number): {
  nextMonth: number;
  nextQuarter: number;
  confidence: number;
} {
  if (monthlyTrend.length < 3) {
    return {
      nextMonth: 0,
      nextQuarter: 0,
      confidence: 0,
    };
  }

  // Simple moving average for forecast
  const recentActuals = monthlyTrend.slice(-3).map((m) => m.actual);
  const average = recentActuals.reduce((sum, a) => sum + a, 0) / recentActuals.length;

  // Apply trend adjustment
  const first = recentActuals[0];
  const last = recentActuals[recentActuals.length - 1];
  const trendFactor = first > 0 ? (last - first) / first : 0;

  const nextMonth = Math.round(average * (1 + trendFactor / 2) * 100) / 100;
  const nextQuarter = Math.round(nextMonth * 3 * 100) / 100;

  // Confidence based on reliability and data points
  const dataPointsFactor = Math.min(monthlyTrend.length / 6, 1) * 100;
  const reliabilityFactor = reliability;
  const confidence = Math.round((dataPointsFactor * 0.3 + reliabilityFactor * 0.7));

  return {
    nextMonth,
    nextQuarter,
    confidence,
  };
}

function generateInsights(
  dashboardData: any,
  reliability: any,
  diversification: any,
  trendAnalysis: any
): IncomeInsight[] {
  const insights: IncomeInsight[] = [];

  // Reliability insights
  if (reliability.overallScore >= 90) {
    insights.push({
      id: 'reliability_excellent',
      type: 'positive',
      title: 'Excellent Income Reliability',
      message: `Your income streams have a ${reliability.grade} grade with ${reliability.overallScore}% reliability. Great job!`,
      metric: reliability.overallScore,
      icon: 'shield-checkmark',
      color: '#22C55E',
    });
  } else if (reliability.overallScore < 70) {
    insights.push({
      id: 'reliability_concern',
      type: 'warning',
      title: 'Income Reliability Needs Attention',
      message: `Your income reliability is ${reliability.overallScore}%. Consider focusing on more stable income sources.`,
      metric: reliability.overallScore,
      icon: 'warning',
      color: '#F59E0B',
    });
  }

  // Diversification insights
  if (diversification.risk === 'high') {
    insights.push({
      id: 'diversification_risk',
      type: 'warning',
      title: 'High Concentration Risk',
      message: `${Math.round(diversification.primaryPercentage)}% of your income comes from a single source. Consider diversifying.`,
      metric: diversification.primaryPercentage,
      icon: 'alert-circle',
      color: '#EF4444',
    });
  } else if (diversification.score >= 70) {
    insights.push({
      id: 'diversification_good',
      type: 'positive',
      title: 'Well-Diversified Income',
      message: `Your income is well-diversified across ${dashboardData.streams.length} streams, reducing risk.`,
      metric: diversification.score,
      icon: 'pie-chart',
      color: '#22C55E',
    });
  }

  // Trend insights
  if (trendAnalysis.trend === 'increasing' && trendAnalysis.percentage > 10) {
    insights.push({
      id: 'income_growing',
      type: 'positive',
      title: 'Income Growth',
      message: `Your income has increased by ${Math.round(trendAnalysis.percentage)}% over recent months.`,
      metric: trendAnalysis.percentage,
      icon: 'trending-up',
      color: '#22C55E',
    });
  } else if (trendAnalysis.trend === 'decreasing' && trendAnalysis.percentage < -10) {
    insights.push({
      id: 'income_declining',
      type: 'negative',
      title: 'Declining Income',
      message: `Your income has decreased by ${Math.abs(Math.round(trendAnalysis.percentage))}%. Review your income streams.`,
      metric: trendAnalysis.percentage,
      icon: 'trending-down',
      color: '#EF4444',
    });
  }

  // Volatility insight
  if (trendAnalysis.volatility > 30) {
    insights.push({
      id: 'high_volatility',
      type: 'warning',
      title: 'High Income Volatility',
      message: `Your income varies significantly month-to-month. Consider adding more stable income sources.`,
      metric: trendAnalysis.volatility,
      icon: 'stats-chart',
      color: '#F59E0B',
    });
  }

  return insights;
}

function generateRecommendations(
  dashboardData: any,
  reliability: any,
  diversification: any,
  trendAnalysis: any
): string[] {
  const recommendations: string[] = [];

  // Reliability recommendations
  if (reliability.leastReliable && reliability.leastReliable.reliabilityScore < 70) {
    recommendations.push(
      `Review "${reliability.leastReliable.streamTitle}" - it has ${reliability.leastReliable.missedCount} missed payments.`
    );
  }

  // Diversification recommendations
  if (diversification.risk === 'high') {
    recommendations.push(
      'Reduce concentration risk by adding new income streams or increasing secondary sources.'
    );
  }

  // Late payments
  const lateStreams = dashboardData.streams.filter(
    (s: any) => s.status === 'late' || s.lastCycleStatus === 'paid_late'
  );
  if (lateStreams.length > 0) {
    recommendations.push(
      `Follow up on ${lateStreams.length} late income payment(s) to ensure you receive what you're owed.`
    );
  }

  // Trend-based recommendations
  if (trendAnalysis.trend === 'decreasing') {
    recommendations.push(
      'Your income is trending down. Consider renegotiating rates or adding new income sources.'
    );
  }

  // Volatility recommendations
  if (trendAnalysis.volatility > 30) {
    recommendations.push(
      'High income volatility detected. Build an emergency fund to smooth cash flow fluctuations.'
    );
  }

  // Inactive streams
  const pausedStreams = dashboardData.streams.filter((s: any) => s.status === 'paused');
  if (pausedStreams.length > 0) {
    recommendations.push(
      `You have ${pausedStreams.length} paused income stream(s). Reactivate or remove them if no longer relevant.`
    );
  }

  return recommendations;
}

/**
 * Calculate income health score (0-100)
 */
export function calculateIncomeHealthScore(analytics: IncomeAnalytics): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    reliability: number;
    diversification: number;
    trend: number;
    volatility: number;
  };
} {
  // Weighted components
  const reliabilityWeight = 0.4;
  const diversificationWeight = 0.3;
  const trendWeight = 0.2;
  const volatilityWeight = 0.1;

  // Normalize trend percentage to 0-100 score
  const trendScore = analytics.trend === 'increasing'
    ? Math.min(100, 50 + analytics.trendPercentage)
    : analytics.trend === 'decreasing'
    ? Math.max(0, 50 + analytics.trendPercentage)
    : 50;

  // Volatility score (lower is better, so invert)
  const volatilityScore = Math.max(0, 100 - analytics.volatilityScore);

  const breakdown = {
    reliability: analytics.overallReliabilityScore,
    diversification: analytics.diversificationScore,
    trend: Math.round(trendScore),
    volatility: Math.round(volatilityScore),
  };

  const score = Math.round(
    breakdown.reliability * reliabilityWeight +
      breakdown.diversification * diversificationWeight +
      breakdown.trend * trendWeight +
      breakdown.volatility * volatilityWeight
  );

  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';

  return {
    score,
    grade,
    breakdown,
  };
}
