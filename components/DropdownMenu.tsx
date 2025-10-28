import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width: screenWidth } = Dimensions.get('window');

interface MenuItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
}

interface DropdownMenuProps {
  style?: any;
}

export default function DropdownMenu({ style }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [animation] = useState(new Animated.Value(0));

  const menuItems: MenuItem[] = [
    {
      id: 'goals',
      label: 'Goals',
      icon: 'flag',
      route: '/(tabs)/goals',
      color: '#10B981',
    },
    {
      id: 'liabilities',
      label: 'Liabilities',
      icon: 'card',
      route: '/(tabs)/liabilities',
      color: '#EF4444',
    },
    {
      id: 'budgets',
      label: 'Budgets',
      icon: 'pie-chart',
      route: '/(tabs)/budgets',
      color: '#3B82F6',
    },
  ];

  const toggleMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const toValue = isOpen ? 0 : 1;
    setIsOpen(!isOpen);

    Animated.spring(animation, {
      toValue,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  };

  const handleMenuItemPress = (item: MenuItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Close menu
    toggleMenu();
    
    // Navigate to route
    router.push(item.route as any);
  };

  const rotateInterpolate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const scaleInterpolate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const opacityInterpolate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={[styles.container, style]}>
      {/* Menu Button */}
      <TouchableOpacity
        style={styles.menuButton}
        onPress={toggleMenu}
        activeOpacity={0.7}
        accessibilityLabel="More options"
        accessibilityRole="button"
      >
        <Ionicons name="menu" size={24} color="white" />
        <Text style={styles.menuText}>More</Text>
        <Animated.View
          style={[
            styles.arrowContainer,
            { transform: [{ rotate: rotateInterpolate }] },
          ]}
        >
          <Ionicons name="chevron-down" size={16} color="white" />
        </Animated.View>
      </TouchableOpacity>

      {/* Dropdown Menu */}
      <Animated.View
        style={[
          styles.dropdown,
          {
            opacity: opacityInterpolate,
            transform: [
              {
                scaleY: scaleInterpolate,
              },
            ],
          },
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.menuItem,
              { backgroundColor: item.color + '20' },
            ]}
            onPress={() => handleMenuItemPress(item)}
            activeOpacity={0.7}
            accessibilityLabel={item.label}
            accessibilityRole="button"
          >
            <View style={[styles.menuItemIcon, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon} size={20} color="white" />
            </View>
            <Text style={styles.menuItemText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 100,
  },
  menuText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    marginRight: 8,
  },
  arrowContainer: {
    marginLeft: 4,
  },
  dropdown: {
    position: 'absolute',
    top: 50,
    right: 0,
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  menuItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemText: {
    flex: 1,
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
