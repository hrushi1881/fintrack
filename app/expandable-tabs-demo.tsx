import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ExpandableTabsAdvanced } from '@/components';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function ExpandableTabsDemo() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedDemo, setSelectedDemo] = useState('basic');

  const basicTabs = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'home' as const,
      onPress: () => console.log('Dashboard pressed'),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'notifications' as const,
      badge: 3,
      onPress: () => console.log('Notifications pressed'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings' as const,
      onPress: () => console.log('Settings pressed'),
    },
    {
      id: 'help',
      label: 'Help',
      icon: 'help-circle' as const,
      onPress: () => console.log('Help pressed'),
    },
    {
      id: 'security',
      label: 'Security',
      icon: 'shield' as const,
      onPress: () => console.log('Security pressed'),
    },
  ];

  const financeTabs = [
    {
      id: 'overview',
      label: 'Overview',
      icon: 'analytics' as const,
      onPress: () => console.log('Overview pressed'),
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: 'swap-horizontal' as const,
      badge: 12,
      onPress: () => console.log('Transactions pressed'),
    },
    {
      id: 'bills',
      label: 'Bills',
      icon: 'receipt' as const,
      badge: 2,
      onPress: () => console.log('Bills pressed'),
    },
    {
      id: 'budgets',
      label: 'Budgets',
      icon: 'pie-chart' as const,
      onPress: () => console.log('Budgets pressed'),
    },
    {
      id: 'goals',
      label: 'Goals',
      icon: 'flag' as const,
      onPress: () => console.log('Goals pressed'),
    },
  ];

  const socialTabs = [
    {
      id: 'feed',
      label: 'Feed',
      icon: 'newspaper' as const,
      badge: 5,
      onPress: () => console.log('Feed pressed'),
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: 'chatbubbles' as const,
      badge: 8,
      onPress: () => console.log('Messages pressed'),
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: 'person' as const,
      onPress: () => console.log('Profile pressed'),
    },
    {
      id: 'discover',
      label: 'Discover',
      icon: 'compass' as const,
      onPress: () => console.log('Discover pressed'),
    },
  ];

  const getCurrentTabs = () => {
    switch (selectedDemo) {
      case 'finance':
        return financeTabs;
      case 'social':
        return socialTabs;
      default:
        return basicTabs;
    }
  };

  const getDemoTitle = () => {
    switch (selectedDemo) {
      case 'finance':
        return 'Finance App Navigation';
      case 'social':
        return 'Social Media Navigation';
      default:
        return 'Basic Navigation';
    }
  };

  const getDemoDescription = () => {
    switch (selectedDemo) {
      case 'finance':
        return 'Perfect for financial apps with transaction tracking, bill management, and budget planning.';
      case 'social':
        return 'Ideal for social media apps with feed, messaging, and discovery features.';
      default:
        return 'A versatile navigation component that adapts to any iOS app design.';
    }
  };

  return (
    <LinearGradient
      colors={['#1a1a2e', '#16213e', '#0f3460']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Expandable Tabs</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Demo Selection */}
          <View style={styles.demoSection}>
            <Text style={styles.sectionTitle}>Choose Demo Type</Text>
            <View style={styles.demoButtons}>
              <TouchableOpacity
                style={[styles.demoButton, selectedDemo === 'basic' && styles.activeDemoButton]}
                onPress={() => setSelectedDemo('basic')}
              >
                <Text style={[styles.demoButtonText, selectedDemo === 'basic' && styles.activeDemoButtonText]}>
                  Basic
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.demoButton, selectedDemo === 'finance' && styles.activeDemoButton]}
                onPress={() => setSelectedDemo('finance')}
              >
                <Text style={[styles.demoButtonText, selectedDemo === 'finance' && styles.activeDemoButtonText]}>
                  Finance
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.demoButton, selectedDemo === 'social' && styles.activeDemoButton]}
                onPress={() => setSelectedDemo('social')}
              >
                <Text style={[styles.demoButtonText, selectedDemo === 'social' && styles.activeDemoButtonText]}>
                  Social
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Demo Description */}
          <View style={styles.descriptionCard}>
            <Text style={styles.demoTitle}>{getDemoTitle()}</Text>
            <Text style={styles.demoDescription}>{getDemoDescription()}</Text>
          </View>

          {/* Expandable Tabs Demo */}
          <View style={styles.tabsDemoContainer}>
            <Text style={styles.sectionTitle}>Interactive Demo</Text>
            <Text style={styles.demoInstructions}>
              Tap any tab to expand it. Tap outside to collapse. Try different tabs!
            </Text>
            
            <View style={styles.tabsContainer}>
              <ExpandableTabsAdvanced
                tabs={getCurrentTabs()}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                style={styles.expandableTabs}
                collapsedWidth={60}
                expandedWidth={180}
                animationDuration={300}
                showSeparators={true}
                hapticFeedback={true}
                springConfig={{
                  damping: 15,
                  stiffness: 150,
                  mass: 1,
                }}
                theme="dark"
                size="medium"
                enableAccessibility={true}
              />
            </View>
          </View>

          {/* Features List */}
          <View style={styles.featuresCard}>
            <Text style={styles.sectionTitle}>Features</Text>
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.featureText}>Smooth iOS-style animations</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.featureText}>Haptic feedback support</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.featureText}>Accessibility features</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.featureText}>Customizable styling</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.featureText}>Touch outside to collapse</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.featureText}>Separator support</Text>
              </View>
            </View>
          </View>

          {/* Usage Example */}
          <View style={styles.usageCard}>
            <Text style={styles.sectionTitle}>Usage Example</Text>
            <View style={styles.codeBlock}>
              <Text style={styles.codeText}>
{`<ExpandableTabsAdvanced
  tabs={[
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications', badge: 3 },
    { id: 'profile', label: 'Profile', icon: 'person' }
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  collapsedWidth={60}
  expandedWidth={180}
  hapticFeedback={true}
  theme="dark"
  size="medium"
  enableAccessibility={true}
/>`}
              </Text>
            </View>
          </View>

          {/* Bottom Spacing */}
          <View style={styles.bottomSpacing} />
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
  placeholder: {
    width: 48,
  },
  demoSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  demoButtons: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
  },
  demoButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeDemoButton: {
    backgroundColor: '#10B981',
  },
  demoButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  activeDemoButtonText: {
    color: 'white',
  },
  descriptionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  demoTitle: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  demoDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  tabsDemoContainer: {
    marginBottom: 30,
  },
  demoInstructions: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 20,
    textAlign: 'center',
  },
  tabsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  expandableTabs: {
    // Custom styling can be added here
  },
  featuresCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    color: 'white',
    flex: 1,
  },
  usageCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  codeBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  codeText: {
    fontSize: 12,
    color: '#10B981',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  bottomSpacing: {
    height: 40,
  },
});
