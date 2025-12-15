import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';

import AuthGuard from '@/components/AuthGuard';
import { startAnalyticsSession, trackEvent } from '@/utils/analytics';
import { useAuth } from '@/contexts/AuthContext';
import ExpandableFloatingNavBar, { NavTab } from '@/components/FloatingNavBar';
import { SideNavItem } from '@/components/SideNavigationMenu';

export default function TabLayout() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Start a session when tabs mount and user is available
    if (user?.id) {
      startAnalyticsSession(user.id).then(() => {
        trackEvent({
          eventType: 'app_open',
          context: { route: pathname },
        });
      });
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && pathname) {
      trackEvent({
        eventType: 'screen_view',
        context: { route: pathname, tab: pathname.split('/').pop() },
        privacyLevel: 'minimal',
      });
    }
  }, [pathname, user?.id]);

  // Determine active tab from pathname
  const activeTabId = useMemo(() => {
    const currentPath = pathname.split('/').pop() || '';
    // Handle home route (index or empty)
    if (currentPath === 'index' || currentPath === '' || pathname.endsWith('/(tabs)/') || pathname.endsWith('/(tabs)')) {
      return 'home';
    }
    // Map route names to tab IDs
    const routeMap: Record<string, string> = {
      'accounts': 'accounts',
      'bills': 'bills',
      'transactions': 'transactions',
      'overview': 'overview',
      'activity': 'activity',
      // Legacy routes still accessible but not in main nav
      'all': 'home',
      'goals': 'overview',
      'liabilities': 'overview',
      'budgets': 'overview',
      'recurring': 'overview',
    };
    return routeMap[currentPath] || 'home';
  }, [pathname]);

  // Define tabs for the FloatingNavBar
  const navTabs: NavTab[] = [
    { id: 'home', label: 'HOME', icon: 'home', route: '/(tabs)/' },
    { id: 'accounts', label: 'ACCOUNTS', icon: 'wallet', route: '/(tabs)/accounts' },
    { id: 'bills', label: 'BILLS', icon: 'receipt', route: '/(tabs)/bills' },
    { id: 'transactions', label: 'TRANSACTIONS', icon: 'list', route: '/(tabs)/transactions' },
    { id: 'overview', label: 'OVERVIEW', icon: 'stats-chart', route: '/(tabs)/overview' },
    { id: 'activity', label: 'ACTIVITY', icon: 'add-circle', route: '/(tabs)/activity' },
  ];

  // Define side navigation menu items
  const sideNavItems: SideNavItem[] = [
    { id: 'home', label: 'HOME', icon: 'home', route: '/(tabs)/' },
    { id: 'accounts', label: 'ACCOUNTS', icon: 'wallet', route: '/(tabs)/accounts' },
    { id: 'bills', label: 'BILLS', icon: 'receipt', route: '/(tabs)/bills' },
    { id: 'transactions', label: 'TRANSACTIONS', icon: 'list', route: '/(tabs)/transactions' },
    { id: 'overview', label: 'OVERVIEW', icon: 'stats-chart', route: '/(tabs)/overview' },
    { id: 'activity', label: 'ACTIVITY', icon: 'add-circle', route: '/(tabs)/activity' },
    { id: 'analytics', label: 'ANALYTICS', icon: 'bar-chart', route: '/(tabs)/analytics' },
    { id: 'budgets', label: 'BUDGETS', icon: 'pie-chart', route: '/(tabs)/budgets' },
    { id: 'recurring', label: 'RECURRING', icon: 'repeat', route: '/(tabs)/recurring' },
    { id: 'goals', label: 'GOALS', icon: 'flag', route: '/(tabs)/goals' },
    { id: 'liabilities', label: 'LIABILITIES', icon: 'card', route: '/(tabs)/liabilities' },
    { id: 'categories', label: 'CATEGORIES', icon: 'grid', route: '/(tabs)/categories' },
    { id: 'organizations', label: 'ORGANIZATIONS', icon: 'business', route: '/(tabs)/organizations' },
  ];

  const handleTabPress = (tab: NavTab) => {
    if (tab.route) {
      router.push(tab.route as any);
    }
  };

  return (
    <AuthGuard>
      <View style={{ flex: 1 }}>
      <Tabs
      screenOptions={{
        tabBarStyle: {
              display: 'none', // Hide default Expo Router tab bar
        },
        headerShown: false,
          }}
        >
          {/* Primary tabs: Home + All */}
      <Tabs.Screen
        name="index"
        options={{
              href: null, // Hide from default tab bar
            }}
          />
          <Tabs.Screen
            name="all"
            options={{
              href: null, // Hide from default tab bar
            }}
          />
          <Tabs.Screen
            name="overview"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="activity"
            options={{
              href: null,
        }}
      />

          {/* Keep existing routes but hide them from the bottom tab bar */}
      <Tabs.Screen
        name="accounts"
        options={{
              href: null,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
              href: null,
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
              href: null,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
              href: null,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
              href: null,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
              href: null,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
              href: null,
        }}
      />
      <Tabs.Screen
        name="liabilities"
        options={{
              href: null,
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="organizations"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="recurring"
            options={{
              href: null,
        }}
      />
    </Tabs>

        {/* Custom FloatingNavBar */}
        <ExpandableFloatingNavBar
          tabs={navTabs}
          activeTabId={activeTabId}
          onTabPress={handleTabPress}
          sideNavItems={sideNavItems}
          activeRoute={pathname}
        />
      </View>
    </AuthGuard>
  );
}
