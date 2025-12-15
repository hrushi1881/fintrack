import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ViewStyle,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import SideNavigationMenu, { SideNavItem } from './SideNavigationMenu';

/**
 * ExpandableFloatingNavBar - iOS-style expandable navigation component
 * 
 * Nav bar shows only icons initially.
 * When an icon is tapped → its text label expands out of that pill, iOS-style.
 * Expansion feels like iOS (smooth, springy, width expanding, capsule morph).
 * Active tab gets purple capsule background.
 * Inactive tabs are subtle outlines.
 * Right side has a menu/close icon.
 * 
 * @example
 * ```tsx
 * <ExpandableFloatingNavBar
 *   tabs={[
 *     { id: 'home', label: 'HOME', icon: 'home' },
 *     { id: 'all', label: 'ALL', icon: 'grid' },
 *     { id: 'accounts', label: 'ACCOUNTS', icon: 'wallet' },
 *   ]}
 *   activeTabId="home"
 *   onTabPress={(tab) => router.push(tab.route)}
 * />
 * ```
 */

export interface NavTab {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  badge?: number;
}

export interface ExpandableFloatingNavBarProps {
  /** Array of tab configurations */
  tabs: NavTab[];
  /** ID of the currently active tab */
  activeTabId: string;
  /** Callback when a tab is pressed */
  onTabPress: (tab: NavTab) => void;
  /** Optional custom style for the container */
  style?: ViewStyle;
  /** Enable haptic feedback on tab press */
  hapticFeedback?: boolean;
  /** Additional navigation items for side menu */
  sideNavItems?: SideNavItem[];
  /** Current active route for side menu highlighting */
  activeRoute?: string;
}

/**
 * Smart color composition - dark teal with purple accent
 */
export const EXPANDABLE_NAV_BAR_COLORS = {
  background: '#0A2E2E',
  accent: '#C4B5FD',
  accentTransparent: 'rgba(196, 181, 253, 0.3)',
  textActive: '#000000', // Dark text on light purple background
  textInactive: '#C4B5FD', // Light purple text on dark background
} as const;

const ExpandableFloatingNavBar: React.FC<ExpandableFloatingNavBarProps> = ({
  tabs,
  activeTabId,
  onTabPress,
  style,
  hapticFeedback = true,
  sideNavItems = [],
  activeRoute,
}) => {
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  const [pressedTab, setPressedTab] = useState<string | null>(null);
  const [sideMenuVisible, setSideMenuVisible] = useState(false);

  // Create animated values for each tab using useMemo to prevent hooks count changes
  const tabAnimations = useMemo(
    () =>
      tabs.reduce((acc, tab) => {
        acc[tab.id] = {
          width: new Animated.Value(40), // Icon-only width
          textOpacity: new Animated.Value(0),
          textTranslateX: new Animated.Value(-10),
        };
        return acc;
      }, {} as Record<string, { width: Animated.Value; textOpacity: Animated.Value; textTranslateX: Animated.Value }>),
    [tabs]
  );

  useEffect(() => {
    // Animate all tabs based on expanded or pressed state
    tabs.forEach((tab) => {
      const isExpanded = expandedTab === tab.id;
      const isPressed = pressedTab === tab.id;
      const shouldShowText = isExpanded || isPressed;
      const anims = tabAnimations[tab.id];

      // Width animation: 40 (icon only) → 90 (with text)
      Animated.spring(anims.width, {
        toValue: shouldShowText ? 90 : 40,
        useNativeDriver: false,
        damping: 18,
        stiffness: 180,
      }).start();

      // Text slide-out animation (iOS style)
      if (shouldShowText) {
        // Expand: fade in and slide out
        Animated.parallel([
          Animated.timing(anims.textOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(anims.textTranslateX, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        // Collapse: fade out and slide in
        Animated.parallel([
          Animated.timing(anims.textOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(anims.textTranslateX, {
            toValue: -10,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });
  }, [expandedTab, pressedTab, tabs, tabAnimations]);

  const handleTabPress = (tab: NavTab) => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Toggle expansion: if same tab, collapse; otherwise expand new tab
    if (expandedTab === tab.id) {
      setExpandedTab(null);
    } else {
      setExpandedTab(tab.id);
    }

    onTabPress(tab);
  };

  const handlePressIn = (tab: NavTab) => {
    setPressedTab(tab.id);
  };

  const handlePressOut = () => {
    setPressedTab(null);
  };

  const handleMenuPress = () => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedTab(null);
    setSideMenuVisible(true);
  };

  return (
    <View style={[styles.wrapper, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
        bounces={false}
      >
        <View style={styles.bar}>
          {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isExpanded = expandedTab === tab.id;
          const isPressed = pressedTab === tab.id;
          const shouldShowText = isExpanded || isPressed;
          const anims = tabAnimations[tab.id];

          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => handleTabPress(tab)}
              onPressIn={() => handlePressIn(tab)}
              onPressOut={handlePressOut}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`${tab.label} tab${isActive ? ', active' : ''}`}
              accessibilityState={{ selected: isActive }}
            >
              <Animated.View
                style={[
                  styles.pill,
                  isActive && styles.pillActive,
                  {
                    width: anims.width,
                  },
                ]}
              >
                <Ionicons
                  name={
                    isActive
                      ? tab.icon
                      : (`${tab.icon}-outline` as keyof typeof Ionicons.glyphMap)
                  }
                  size={18}
                  color={isActive ? EXPANDABLE_NAV_BAR_COLORS.textActive : EXPANDABLE_NAV_BAR_COLORS.textInactive}
                />

                {/* Text slides out from inside the capsule */}
                {shouldShowText && (
                  <Animated.View
                    style={[
                      styles.textContainer,
                      {
                        opacity: anims.textOpacity,
                        transform: [{ translateX: anims.textTranslateX }],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.label,
                        isActive ? styles.labelActive : styles.labelInactive,
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label.toUpperCase()}
                    </Text>
                  </Animated.View>
                )}

                {/* Badge */}
                {tab.badge && tab.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </Text>
                  </View>
                )}
              </Animated.View>
            </TouchableOpacity>
          );
        })}

          {/* Menu Toggle Button */}
          <TouchableOpacity
            onPress={handleMenuPress}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <View style={styles.menuPill}>
              <Ionicons
                name="menu"
                size={18}
                color={EXPANDABLE_NAV_BAR_COLORS.textInactive}
              />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Side Navigation Menu */}
      <SideNavigationMenu
        visible={sideMenuVisible}
        onClose={() => setSideMenuVisible(false)}
        activeRoute={activeRoute}
        items={sideNavItems}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 24,
    width: '100%',
    alignItems: 'center',
    zIndex: 999,
  },
  scrollView: {
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: EXPANDABLE_NAV_BAR_COLORS.background,
    padding: 4,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    minWidth: '85%',
    maxWidth: 500,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: EXPANDABLE_NAV_BAR_COLORS.accentTransparent,
    height: 40,
    minWidth: 40,
    overflow: 'hidden',
    position: 'relative',
  },
  pillActive: {
    backgroundColor: EXPANDABLE_NAV_BAR_COLORS.accent,
    borderColor: 'transparent',
  },
  textContainer: {
    marginLeft: 6,
    overflow: 'hidden',
  },
  label: {
    fontSize: 11,
    // Don't use fontWeight with custom fonts on Android - the font file determines the weight
    letterSpacing: 0.5,
    fontFamily: 'Archivo Black', // This font is already 900 weight (Black)
  },
  labelActive: {
    color: EXPANDABLE_NAV_BAR_COLORS.textActive,
  },
  labelInactive: {
    color: EXPANDABLE_NAV_BAR_COLORS.textInactive,
    opacity: 0.9,
  },
  menuPill: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: EXPANDABLE_NAV_BAR_COLORS.accentTransparent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: EXPANDABLE_NAV_BAR_COLORS.background,
    zIndex: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
});

// Export both the new expandable component and keep legacy exports for compatibility
export default ExpandableFloatingNavBar;

// Legacy exports for backward compatibility with Expo Router Tabs
export const FLOATING_NAV_BAR_STYLES = {
  backgroundColor: EXPANDABLE_NAV_BAR_COLORS.background,
  borderTopWidth: 0,
  height: 72,
  paddingBottom: 12,
  paddingTop: 12,
  paddingHorizontal: 20,
  marginHorizontal: 16,
  marginBottom: 16,
  borderRadius: 24,
  shadowColor: '#000000',
  shadowOffset: {
    width: 0,
    height: 4,
  },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 8,
  position: 'absolute' as const,
} as const;

export const FLOATING_NAV_BAR_COLORS = {
  activeBackground: EXPANDABLE_NAV_BAR_COLORS.accent,
  inactiveBackground: 'transparent',
  activeText: EXPANDABLE_NAV_BAR_COLORS.textActive,
  inactiveText: EXPANDABLE_NAV_BAR_COLORS.textInactive,
} as const;

export const FLOATING_NAV_BAR_TYPOGRAPHY = {
  fontSize: 13,
  fontWeight: '600' as const,
  iconSize: 24,
} as const;
