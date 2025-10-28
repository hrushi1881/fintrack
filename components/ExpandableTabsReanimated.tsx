import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width: screenWidth } = Dimensions.get('window');

interface TabItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}

interface ExpandableTabsProps {
  tabs: TabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  style?: any;
  collapsedWidth?: number;
  expandedWidth?: number;
  animationDuration?: number;
  showSeparators?: boolean;
  hapticFeedback?: boolean;
  springConfig?: {
    damping?: number;
    stiffness?: number;
    mass?: number;
  };
}

export default function ExpandableTabsReanimated({
  tabs,
  activeTab,
  onTabChange,
  style,
  collapsedWidth = 60,
  expandedWidth = 200,
  animationDuration = 300,
  showSeparators = true,
  hapticFeedback = true,
  springConfig = {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },
}: ExpandableTabsProps) {
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Create shared values for each tab
  const tabAnimations = useRef<{ [key: string]: Animated.SharedValue<number> }>({}).current;
  
  // Initialize shared values
  tabs.forEach(tab => {
    if (!tabAnimations[tab.id]) {
      tabAnimations[tab.id] = useSharedValue(0);
    }
  });

  const handleTabPress = (tab: TabItem) => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (expandedTab === tab.id) {
      // Collapse if already expanded
      collapseTab();
    } else {
      // Expand new tab
      expandTab(tab.id);
    }

    if (onTabChange) {
      onTabChange(tab.id);
    }

    if (tab.onPress) {
      tab.onPress();
    }
  };

  const expandTab = (tabId: string) => {
    // First collapse any currently expanded tab
    if (expandedTab && expandedTab !== tabId) {
      tabAnimations[expandedTab].value = withTiming(0, { duration: animationDuration });
    }
    
    setExpandedTab(tabId);
    setIsExpanded(true);

    // Animate the selected tab to expanded state
    tabAnimations[tabId].value = withSpring(1, springConfig);
  };

  const collapseTab = () => {
    if (expandedTab) {
      tabAnimations[expandedTab].value = withTiming(0, { duration: animationDuration }, () => {
        runOnJS(() => {
          setExpandedTab(null);
          setIsExpanded(false);
        })();
      });
    }
  };

  const handleOutsidePress = () => {
    if (isExpanded) {
      collapseTab();
    }
  };

  const getAnimatedTabStyle = (tabId: string) => {
    return useAnimatedStyle(() => {
      const progress = tabAnimations[tabId].value;
      
      return {
        width: interpolate(progress, [0, 1], [collapsedWidth, expandedWidth]),
        backgroundColor: progress > 0 
          ? `rgba(255, 255, 255, ${0.1 + progress * 0.05})` 
          : 'transparent',
        transform: [
          {
            scale: interpolate(progress, [0, 1], [1, 1.02]),
          },
        ],
      };
    });
  };

  const getAnimatedLabelStyle = (tabId: string) => {
    return useAnimatedStyle(() => {
      const progress = tabAnimations[tabId].value;
      
      return {
        opacity: interpolate(progress, [0, 1], [0, 1]),
        transform: [
          {
            translateX: interpolate(progress, [0, 1], [-20, 0]),
          },
          {
            scale: interpolate(progress, [0, 1], [0.8, 1]),
          },
        ],
      };
    });
  };

  const getAnimatedIconStyle = (tabId: string) => {
    return useAnimatedStyle(() => {
      const progress = tabAnimations[tabId].value;
      
      return {
        transform: [
          {
            scale: interpolate(progress, [0, 1], [1, 1.1]),
          },
        ],
      };
    });
  };

  return (
    <Pressable style={styles.container} onPress={handleOutsidePress}>
      <View style={[styles.tabBar, style]}>
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const isExpandedTab = expandedTab === tab.id;
          
          return (
            <React.Fragment key={tab.id}>
              <Animated.View
                style={[
                  styles.tabContainer,
                  getAnimatedTabStyle(tab.id),
                ]}
              >
                <TouchableOpacity
                  style={styles.tabButton}
                  onPress={() => handleTabPress(tab)}
                  activeOpacity={0.7}
                  accessibilityLabel={tab.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Animated.View style={[styles.iconContainer, getAnimatedIconStyle(tab.id)]}>
                    <Ionicons
                      name={tab.icon}
                      size={24}
                      color={isActive || isExpandedTab ? '#FFFFFF' : '#9CA3AF'}
                    />
                  </Animated.View>
                  
                  <Animated.View
                    style={[
                      styles.labelContainer,
                      getAnimatedLabelStyle(tab.id),
                    ]}
                  >
                    <Text
                      style={[
                        styles.label,
                        {
                          color: isActive || isExpandedTab ? '#FFFFFF' : '#9CA3AF',
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
              
              {showSeparators && index < tabs.length - 1 && (
                <View style={styles.separator} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 25,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
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
  tabContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 2,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelContainer: {
    marginLeft: 8,
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 4,
  },
});
