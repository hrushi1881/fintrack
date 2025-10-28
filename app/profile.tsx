import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Image, Switch, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/contexts/UserContext';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassmorphCard from '@/components/GlassmorphCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { theme, BACKGROUND_MODES } from '@/theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile } = useUser();
  const { backgroundMode } = useBackgroundMode();
  const { accounts, transactions, totalBalance } = useRealtimeData();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);

  // Get user data from auth and profile
  const userName = profile?.full_name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently';
  
  // Calculate financial data from real-time data
  const monthlyIncome = transactions
    .filter(t => t.type === 'income' && new Date(t.date).getMonth() === new Date().getMonth())
    .reduce((sum, t) => sum + t.amount, 0);
  
  const monthlyExpenses = transactions
    .filter(t => t.type === 'expense' && new Date(t.date).getMonth() === new Date().getMonth())
    .reduce((sum, t) => sum + t.amount, 0);

  const financialData = {
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    savingsRate: 50.6,
    creditScore: 785,
    accountsCount: 4,
    goalsCount: 3,
    budgetsCount: 5,
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, 'INR'); // TODO: Get from user settings
  };

  const renderProfileHeader = () => (
    <GlassmorphCard style={styles.profileHeader}>
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color="white" />
        </View>
        <TouchableOpacity style={styles.editAvatarButton}>
          <Ionicons name="camera" size={16} color="white" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{userName}</Text>
        <Text style={styles.userEmail}>{userEmail}</Text>
        <Text style={styles.memberSince}>Member since {memberSince}</Text>
      </View>
      
      <TouchableOpacity style={styles.editProfileButton}>
        <Ionicons name="create" size={20} color="#10B981" />
        <Text style={styles.editProfileText}>Edit Profile</Text>
      </TouchableOpacity>
    </GlassmorphCard>
  );

  const renderFinancialOverview = () => (
    <GlassmorphCard style={styles.overviewCard}>
      <Text style={styles.sectionTitle}>Financial Overview</Text>
      
      <View style={styles.overviewGrid}>
        <View style={styles.overviewItem}>
          <View style={styles.overviewIcon}>
            <Ionicons name="wallet" size={24} color="#10B981" />
          </View>
          <Text style={styles.overviewLabel}>Total Balance</Text>
          <Text style={styles.overviewValue}>{formatCurrency(financialData.totalBalance)}</Text>
        </View>
        
        <View style={styles.overviewItem}>
          <View style={styles.overviewIcon}>
            <Ionicons name="trending-up" size={24} color="#3B82F6" />
          </View>
          <Text style={styles.overviewLabel}>Monthly Income</Text>
          <Text style={styles.overviewValue}>{formatCurrency(financialData.monthlyIncome)}</Text>
        </View>
        
        <View style={styles.overviewItem}>
          <View style={styles.overviewIcon}>
            <Ionicons name="trending-down" size={24} color="#EF4444" />
          </View>
          <Text style={styles.overviewLabel}>Monthly Expenses</Text>
          <Text style={styles.overviewValue}>{formatCurrency(financialData.monthlyExpenses)}</Text>
        </View>
        
        <View style={styles.overviewItem}>
          <View style={styles.overviewIcon}>
            <Ionicons name="pie-chart" size={24} color="#F59E0B" />
          </View>
          <Text style={styles.overviewLabel}>Savings Rate</Text>
          <Text style={styles.overviewValue}>{financialData.savingsRate}%</Text>
        </View>
      </View>
    </GlassmorphCard>
  );

  const renderQuickStats = () => (
    <GlassmorphCard style={styles.statsCard}>
      <Text style={styles.sectionTitle}>Quick Stats</Text>
      
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Ionicons name="card" size={20} color="#10B981" />
          </View>
          <Text style={styles.statValue}>{financialData.accountsCount}</Text>
          <Text style={styles.statLabel}>Accounts</Text>
        </View>
        
        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Ionicons name="flag" size={20} color="#3B82F6" />
          </View>
          <Text style={styles.statValue}>{financialData.goalsCount}</Text>
          <Text style={styles.statLabel}>Goals</Text>
        </View>
        
        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Ionicons name="pie-chart" size={20} color="#F59E0B" />
          </View>
          <Text style={styles.statValue}>{financialData.budgetsCount}</Text>
          <Text style={styles.statLabel}>Budgets</Text>
        </View>
        
        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Ionicons name="shield-checkmark" size={20} color="#8B5CF6" />
          </View>
          <Text style={styles.statValue}>{financialData.creditScore}</Text>
          <Text style={styles.statLabel}>Credit Score</Text>
        </View>
      </View>
    </GlassmorphCard>
  );

  const renderQuickActions = () => (
    <GlassmorphCard style={styles.actionsCard}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButton}>
          <View style={styles.actionButtonIcon}>
            <Ionicons name="settings" size={20} color="white" />
          </View>
          <Text style={styles.actionButtonText}>Settings</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton}>
          <View style={styles.actionButtonIcon}>
            <Ionicons name="help-circle" size={20} color="white" />
          </View>
          <Text style={styles.actionButtonText}>Help & Support</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton}>
          <View style={styles.actionButtonIcon}>
            <Ionicons name="document-text" size={20} color="white" />
          </View>
          <Text style={styles.actionButtonText}>Reports</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton}>
          <View style={styles.actionButtonIcon}>
            <Ionicons name="share" size={20} color="white" />
          </View>
          <Text style={styles.actionButtonText}>Share App</Text>
        </TouchableOpacity>
      </View>
    </GlassmorphCard>
  );

  const renderPreferences = () => (
    <GlassmorphCard style={styles.preferencesCard}>
      <Text style={styles.sectionTitle}>Preferences</Text>
      
      <View style={styles.preferenceItem}>
        <View style={styles.preferenceInfo}>
          <Ionicons name="notifications" size={20} color="#10B981" />
          <Text style={styles.preferenceLabel}>Push Notifications</Text>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
          trackColor={{ false: '#6B7280', true: '#10B981' }}
          thumbColor={notificationsEnabled ? '#FFFFFF' : '#FFFFFF'}
        />
      </View>
      
      <View style={styles.preferenceItem}>
        <View style={styles.preferenceInfo}>
          <Ionicons name="finger-print" size={20} color="#3B82F6" />
          <Text style={styles.preferenceLabel}>Biometric Login</Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={setBiometricEnabled}
          trackColor={{ false: '#6B7280', true: '#3B82F6' }}
          thumbColor={biometricEnabled ? '#FFFFFF' : '#FFFFFF'}
        />
      </View>
      
      <View style={styles.preferenceItem}>
        <View style={styles.preferenceInfo}>
          <Ionicons name="moon" size={20} color="#8B5CF6" />
          <Text style={styles.preferenceLabel}>Dark Mode</Text>
        </View>
        <Switch
          value={darkModeEnabled}
          onValueChange={setDarkModeEnabled}
          trackColor={{ false: '#6B7280', true: '#8B5CF6' }}
          thumbColor={darkModeEnabled ? '#FFFFFF' : '#FFFFFF'}
        />
      </View>
    </GlassmorphCard>
  );

  const renderBackground = () => {
    if (backgroundMode === BACKGROUND_MODES.IOS_GRADIENT) {
      return (
        <IOSGradientBackground gradientType="default" animated={true} shimmer={true}>
          {renderContent()}
        </IOSGradientBackground>
      );
    } else {
      return (
        <LinearGradient
          colors={['#99D795', '#99D795', '#99D795']}
          style={styles.container}
        >
          {renderContent()}
        </LinearGradient>
      );
    }
  };

  const renderContent = () => (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#99D795" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profile</Text>
            <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/settings')}>
              <Ionicons name="settings" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Profile Header */}
          {renderProfileHeader()}

          {/* Financial Overview */}
          {renderFinancialOverview()}

          {/* Quick Stats */}
          {renderQuickStats()}

          {/* Quick Actions */}
          {renderQuickActions()}

          {/* Preferences */}
          {renderPreferences()}

          {/* Logout Button */}
          <TouchableOpacity 
            style={styles.logoutButton}
            onPress={() => {
              Alert.alert(
                'Sign Out',
                'Are you sure you want to sign out?',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                      await signOut();
                      router.replace('/auth/signin');
                    },
                  },
                ]
              );
            }}
          >
            <Ionicons name="log-out" size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 30,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeader: {
    marginBottom: 20,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  memberSince: {
    fontSize: 14,
    color: '#6B7280',
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  editProfileText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 6,
  },
  overviewCard: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...theme.typography.glassTitle,
    marginBottom: 16,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  overviewItem: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  overviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  overviewLabel: {
    ...theme.typography.glassCaption,
    marginBottom: 4,
    textAlign: 'center',
  },
  overviewValue: {
    ...theme.typography.currency,
    textAlign: 'center',
  },
  statsCard: {
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    ...theme.typography.currency,
    fontSize: 20,
    marginBottom: 4,
  },
  statLabel: {
    ...theme.typography.glassCaption,
    textAlign: 'center',
  },
  actionsCard: {
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '48%',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  actionButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  preferencesCard: {
    marginBottom: 20,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  preferenceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  preferenceLabel: {
    fontSize: 16,
    color: 'white',
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 8,
  },
});
