import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import GlassmorphCard from '@/components/GlassmorphCard';
import { theme, BACKGROUND_MODES } from '@/theme';
import { useLiabilities } from '@/contexts/LiabilitiesContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';

export default function LiabilitiesScreen() {
  const { backgroundMode } = useBackgroundMode();
  const { currency } = useSettings();
  const [view, setView] = useState<'upcoming' | 'all'>('upcoming');
  const { liabilities, loading } = useLiabilities();

  const renderBackground = () => {
    if (backgroundMode === BACKGROUND_MODES.IOS_GRADIENT) {
      return (
        <IOSGradientBackground gradientType="default" animated={true} shimmer={true}>
          {renderContent()}
        </IOSGradientBackground>
      );
    }
    return (
      <LinearGradient colors={["#99D795", "#99D795", "#99D795"]} style={styles.container}>
        {renderContent()}
      </LinearGradient>
    );
  };

  const renderEmptyState = (title: string, description: string) => (
    <GlassmorphCard style={styles.emptyContainer}>
      <Ionicons name="card-outline" size={48} color="rgba(255,255,255,0.5)" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      <View style={styles.emptyActions}>
        <TouchableOpacity
          style={styles.emptyActionButton}
          onPress={() => router.push('/modals/add-liability')}
        >
          <Text style={styles.emptyActionButtonText}>Add Liability</Text>
        </TouchableOpacity>
      </View>
    </GlassmorphCard>
  );

  const renderContent = () => (
    <>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Liabilities</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/modals/add-liability')}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Segmented Control */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segment, view === 'upcoming' && styles.activeSegment]}
              onPress={() => setView('upcoming')}
            >
              <Ionicons name="time" size={18} color={view === 'upcoming' ? '#10B981' : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.segmentText, view === 'upcoming' && styles.activeSegmentText]}>Upcoming</Text>
            </TouchableOpacity>
            <View style={styles.segmentDivider} />
            <TouchableOpacity
              style={[styles.segment, view === 'all' && styles.activeSegment]}
              onPress={() => setView('all')}
            >
              <Ionicons name="list" size={18} color={view === 'all' ? '#10B981' : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.segmentText, view === 'all' && styles.activeSegmentText]}>All</Text>
            </TouchableOpacity>
          </View>

          {/* Lists */}
          <View style={styles.listContainer}>
            {view === 'upcoming' && (
              loading ? (
                <GlassmorphCard style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF' }}>Loading upcoming payments...</Text>
                </GlassmorphCard>
              ) : (() => {
                const upcomingLiabilities = liabilities.filter((l) => {
                  if (l.status !== 'active') return false;
                  if (!l.next_due_date) return false;
                  const dueDate = new Date(l.next_due_date);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return dueDate >= today;
                }).sort((a, b) => {
                  if (!a.next_due_date || !b.next_due_date) return 0;
                  return new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime();
                });

                return upcomingLiabilities.length > 0 ? (
                  <View>
                    {upcomingLiabilities.map((l) => {
                      const daysUntilDue = l.next_due_date 
                        ? Math.ceil((new Date(l.next_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                        : null;
                      
                      return (
                        <TouchableOpacity
                          key={l.id}
                          onPress={() => router.push(`/liability/${l.id}` as any)}
                          activeOpacity={0.8}
                        >
                          <GlassmorphCard style={styles.liabilityCard}>
                            <View style={styles.liabilityRow}>
                              <View style={[
                                styles.liabilityIconContainer,
                                { backgroundColor: (l.color || '#EF4444') + '20' }
                              ]}>
                                <Ionicons 
                                  name={(l.icon || 'card') as any} 
                                  size={28} 
                                  color={l.color || '#EF4444'} 
                                />
                              </View>
                              <View style={styles.liabilityInfo}>
                                <Text style={styles.liabilityTitle}>{l.title}</Text>
                                <Text style={styles.liabilityType}>
                                  {l.liability_type?.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || 'Other'}
                                </Text>
                              </View>
                              <View style={styles.liabilityBalance}>
                                <Text style={styles.balanceAmount}>
                                  {formatCurrencyAmount(l.current_balance || 0, currency)}
                                </Text>
                                {l.periodical_payment && (
                                  <Text style={styles.periodicalPayment}>
                                    {formatCurrencyAmount(l.periodical_payment, currency)}/month
                                  </Text>
                                )}
                                {/* Pay button */}
                                <TouchableOpacity
                                  style={styles.payButton}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    router.push(`/liability/${l.id}` as any);
                                  }}
                                >
                                  <Ionicons name="card" size={18} color="#10B981" />
                                  <Text style={styles.payButtonText}>Pay</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                            
                            <View style={styles.upcomingInfo}>
                              <View style={styles.upcomingDateRow}>
                                <Ionicons name="calendar" size={16} color="#F59E0B" />
                                <Text style={styles.upcomingDateText}>
                                  Due: {l.next_due_date ? new Date(l.next_due_date).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    year: 'numeric'
                                  }) : 'N/A'}
                                </Text>
                              </View>
                              {daysUntilDue !== null && (
                                <View style={[
                                  styles.daysBadge,
                                  { backgroundColor: daysUntilDue <= 7 ? '#EF444420' : '#F59E0B20' }
                                ]}>
                                  <Text style={[
                                    styles.daysText,
                                    { color: daysUntilDue <= 7 ? '#EF4444' : '#F59E0B' }
                                  ]}>
                                    {daysUntilDue === 0 ? 'Due Today' : daysUntilDue === 1 ? 'Due Tomorrow' : `${daysUntilDue} days left`}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </GlassmorphCard>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  renderEmptyState('No Upcoming Payments', 'You don\'t have any upcoming liability payments yet.')
                );
              })()
            )}
            {view === 'all' && (
              loading ? (
                <GlassmorphCard style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF' }}>Loading liabilities...</Text>
                </GlassmorphCard>
              ) : liabilities.length > 0 ? (
                <View>
                  {liabilities.map((l) => {
                    const originalAmount = l.original_amount || l.current_balance;
                    const progress = originalAmount > 0 
                      ? ((originalAmount - (l.current_balance || 0)) / originalAmount) * 100 
                      : 0;
                    
                    return (
                      <TouchableOpacity
                        key={l.id}
                        onPress={() => router.push(`/liability/${l.id}` as any)}
                        activeOpacity={0.8}
                      >
                        <GlassmorphCard style={styles.liabilityCard}>
                          <View style={styles.liabilityRow}>
                            <View style={[
                              styles.liabilityIconContainer,
                              { backgroundColor: (l.color || '#EF4444') + '20' }
                            ]}>
                              <Ionicons 
                                name={(l.icon || 'card') as any} 
                                size={28} 
                                color={l.color || '#EF4444'} 
                              />
                            </View>
                            <View style={styles.liabilityInfo}>
                              <Text style={styles.liabilityTitle}>{l.title}</Text>
                              <Text style={styles.liabilityType}>
                                {l.liability_type?.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || 'Other'}
                              </Text>
                              {l.disbursed_amount && l.disbursed_amount > 0 && (
                                <Text style={styles.disbursedAmount}>
                                  Received: {formatCurrencyAmount(l.disbursed_amount, currency)}
                                </Text>
                              )}
                            </View>
                            <View style={styles.liabilityBalance}>
                              <Text style={styles.balanceAmount}>
                                {formatCurrencyAmount(l.current_balance || 0, currency)}
                              </Text>
                              {originalAmount > l.current_balance && (
                                <Text style={styles.originalAmount}>
                                  of {formatCurrencyAmount(originalAmount, currency)}
                                </Text>
                              )}
                              <View style={[
                                styles.statusBadge,
                                { backgroundColor: getStatusColor(l.status) + '20' }
                              ]}>
                                <Text style={[styles.statusText, { color: getStatusColor(l.status) }]}>
                                  {getStatusText(l.status)}
                                </Text>
                              </View>
                              {/* Pay button */}
                              <TouchableOpacity
                                style={styles.payButton}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  router.push(`/liability/${l.id}` as any);
                                }}
                              >
                                <Ionicons name="card" size={18} color="#10B981" />
                                <Text style={styles.payButtonText}>Pay</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          
                          {/* Progress Bar */}
                          {originalAmount > 0 && progress > 0 && (
                            <View style={styles.progressContainer}>
                              <View style={styles.progressBar}>
                                <View style={[
                                  styles.progressFill,
                                  { width: `${Math.min(progress, 100)}%`, backgroundColor: l.color || '#EF4444' }
                                ]} />
                              </View>
                              <Text style={styles.progressText}>
                                {progress.toFixed(0)}% Paid
                              </Text>
                            </View>
                          )}
                          
                          {/* Additional Info */}
                          <View style={styles.liabilityFooter}>
                            {l.next_due_date && (
                              <View style={styles.infoRow}>
                                <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.6)" />
                                <Text style={styles.nextDueDate}>
                                  Next Due: {new Date(l.next_due_date).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </Text>
                              </View>
                            )}
                            {l.interest_rate_apy && l.interest_rate_apy > 0 && (
                              <View style={styles.infoRow}>
                                <Ionicons name="trending-up" size={14} color="rgba(255,255,255,0.6)" />
                                <Text style={styles.infoText}>
                                  {l.interest_rate_apy}% APR
                                </Text>
                              </View>
                            )}
                            {!l.next_due_date && !l.interest_rate_apy && l.start_date && (
                              <View style={styles.infoRow}>
                                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.6)" />
                                <Text style={styles.infoText}>
                                  Started: {new Date(l.start_date).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    year: 'numeric'
                                  })}
                                </Text>
                              </View>
                            )}
                          </View>
                        </GlassmorphCard>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                renderEmptyState('No Liabilities Yet', 'Create your first liability to start tracking.')
              )
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10B981';
      case 'paid_off': return '#3B82F6';
      case 'overdue': return '#EF4444';
      case 'paused': return '#F59E0B';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'paid_off': return 'Paid Off';
      case 'overdue': return 'Overdue';
      case 'paused': return 'Paused';
      default: return 'Unknown';
    }
  };

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
    paddingBottom: 20,
    marginBottom: 10,
  },
  headerTitle: {
    ...theme.typography.h1,
    color: '#FFFFFF',
  },
  addButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    position: 'relative',
  },
  activeSegment: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  segmentText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  activeSegmentText: {
    color: '#10B981',
  },
  segmentDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 8,
  },
  listContainer: {
    marginBottom: 30,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#99D795',
    borderRadius: 12,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  emptyActions: {
    flexDirection: 'row',
  },
  emptyActionButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  liabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  liabilityIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liabilityInfo: {
    flex: 1,
  },
  liabilityTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  liabilityType: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  liabilityBalance: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  liabilityCard: {
    padding: 16,
    marginBottom: 12,
  },
  disbursedAmount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  originalAmount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    textAlign: 'right',
  },
  liabilityFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 4,
  },
  nextDueDate: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  infoText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  periodicalPayment: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  upcomingInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upcomingDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6,
  },
  upcomingDateText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  daysBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  daysText: {
    fontSize: 10,
    fontWeight: '600',
  },
  payButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 6,
  },
  payButtonText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
});


