import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

export interface SideNavItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: number;
}

interface SideNavigationMenuProps {
  visible: boolean;
  onClose: () => void;
  activeRoute?: string;
  items: SideNavItem[];
}

/**
 * Side Navigation Menu - Slides in from the left
 * Styled with dark green background and light purple/white text
 */
const SideNavigationMenu: React.FC<SideNavigationMenuProps> = ({
  visible,
  onClose,
  activeRoute,
  items,
}) => {
  const slideAnim = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 90,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -Dimensions.get('window').width,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropOpacity]);

  const handleItemPress = (item: SideNavItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(item.route as any);
    onClose();
  };

  const handleBackdropPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleBackdropPress}
        style={styles.backdropContainer}
      >
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropOpacity,
            },
          ]}
        />
      </TouchableOpacity>

      {/* Side Menu */}
      <Animated.View
        style={[
          styles.menuContainer,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <View style={styles.menuContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Navigation</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#C4B5FD" />
            </TouchableOpacity>
          </View>

          {/* Menu Items */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item) => {
              const isActive = activeRoute === item.route || activeRoute?.includes(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.menuItem,
                    isActive && styles.menuItemActive,
                  ]}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuItemContent}>
                    <Ionicons
                      name={item.icon}
                      size={22}
                      color={isActive ? '#000000' : '#C4B5FD'}
                      style={styles.menuItemIcon}
                    />
                    <Text
                      style={[
                        styles.menuItemLabel,
                        isActive && styles.menuItemLabelActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.badge && item.badge > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {item.badge > 99 ? '99+' : item.badge}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
};

const SIDE_NAV_COLORS = {
  background: '#0A2E2E', // Dark green/teal
  activeBackground: '#C4B5FD', // Light purple
  textActive: '#000000', // Dark text on light purple
  textInactive: '#C4B5FD', // Light purple text on dark
  border: 'rgba(196, 181, 253, 0.3)', // Light purple border
} as const;

const styles = StyleSheet.create({
  backdropContainer: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: Dimensions.get('window').width * 0.75,
    maxWidth: 320,
    zIndex: 1000,
  },
  menuContent: {
    flex: 1,
    backgroundColor: SIDE_NAV_COLORS.background,
    paddingTop: 60, // Status bar + padding
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: SIDE_NAV_COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    color: '#C4B5FD',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SIDE_NAV_COLORS.activeBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  menuItem: {
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SIDE_NAV_COLORS.border,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  menuItemActive: {
    backgroundColor: SIDE_NAV_COLORS.activeBackground,
    borderColor: 'transparent',
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemIcon: {
    marginRight: 12,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: SIDE_NAV_COLORS.textInactive,
    letterSpacing: 0.3,
  },
  menuItemLabelActive: {
    color: SIDE_NAV_COLORS.textActive,
    fontFamily: 'Poppins-Bold',
  },
  badge: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Poppins-Bold',
  },
});

export default SideNavigationMenu;

