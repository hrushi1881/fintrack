import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import FloatingTopBar from '@/components/FloatingTopBar';
import { Fonts } from '@/utils/fonts';

/**
 * Activity Screen - Manage all financial activities
 * Central hub for creating and managing all financial items
 */
export default function ActivityScreen() {

  const topBarOptions = [
    {
      id: 'profile',
      label: 'Profile',
      icon: 'person-outline' as const,
      onPress: () => router.push('/profile'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings-outline' as const,
      onPress: () => router.push('/settings'),
    },
  ];

  const activityCategories = [
    {
      id: 'transactions',
      title: 'Transactions',
      items: [
        {
          id: 'pay',
          label: 'Pay',
          icon: 'arrow-up-circle',
          color: '#FF6B35',
          route: '/modals/pay',
        },
        {
          id: 'receive',
          label: 'Receive',
          icon: 'arrow-down-circle',
          color: '#00B37E',
          route: '/modals/receive',
        },
        {
          id: 'transfer',
          label: 'Transfer',
          icon: 'swap-horizontal',
          color: '#6B8E23',
          route: '/modals/transfer',
        },
      ],
    },
    {
      id: 'accounts',
      title: 'Accounts',
      items: [
        {
          id: 'add-account',
          label: 'Add Account',
          icon: 'add-circle',
          color: '#000000',
          route: '/modals/add-account',
        },
      ],
    },
    {
      id: 'goals',
      title: 'Goals',
      items: [
        {
          id: 'add-goal',
          label: 'Create Goal',
          icon: 'flag',
          color: '#00B37E',
          route: '/modals/add-goal',
        },
      ],
    },
    {
      id: 'liabilities',
      title: 'Liabilities',
      items: [
        {
          id: 'add-liability',
          label: 'Add Liability',
          icon: 'card',
          color: '#FF6B35',
          route: '/modals/add-liability',
        },
      ],
    },
    {
      id: 'bills',
      title: 'Bills',
      items: [
        {
          id: 'add-bill',
          label: 'Add Bill',
          icon: 'receipt',
          color: '#6B8E23',
          route: '/modals/add-bill',
        },
      ],
    },
    {
      id: 'recurring',
      title: 'Recurring',
      items: [
        {
          id: 'add-recurring',
          label: 'Add Recurring',
          icon: 'repeat',
          color: '#6B8E23',
          route: '/modals/add-recurring-transaction',
        },
      ],
    },
    {
      id: 'budgets',
      title: 'Budgets',
      items: [
        {
          id: 'add-budget',
          label: 'Create Budget',
          icon: 'pie-chart',
          color: '#000000',
          route: '/modals/add-budget',
        },
      ],
    },
  ];

  const handleActivityPress = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Activity</Text>
            <Text style={styles.subtitle}>Manage all your financial activities</Text>
          </View>

          {/* Activity Categories */}
          {activityCategories.map((category) => (
            <View key={category.id} style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{category.title}</Text>
              <View style={styles.activitiesGrid}>
                {category.items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.activityCard}
                    onPress={() => handleActivityPress(item.route)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.activityIconContainer,
                        { backgroundColor: `${item.color}15` },
                      ]}
                    >
                      <Ionicons name={item.icon as any} size={28} color={item.color} />
                    </View>
                    <Text style={styles.activityLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>

      <FloatingTopBar options={topBarOptions} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    color: '#000000',
    fontFamily: Fonts.archivoBlack,
    letterSpacing: -1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(0, 0, 0, 0.6)',
    fontFamily: Fonts.instrumentSerifRegular,
  },
  categorySection: {
    marginBottom: 40,
  },
  categoryTitle: {
    fontSize: 20,
    color: '#000000',
    fontFamily: Fonts.poppinsSemiBold,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  activitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  activityCard: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  activityIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityLabel: {
    fontSize: 13,
    color: '#000000',
    fontFamily: Fonts.poppinsSemiBold,
    textAlign: 'center',
  },
});

