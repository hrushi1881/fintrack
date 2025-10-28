import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Pressable,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
  useDerivedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width: screenWidth } = Dimensions.get('window');

interface TabItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  badge?: number;
  disabled?: boolean;
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
  theme?: 'dark' | 'light';
  size?: 'small' | 'medium' | 'large';
  enableAccessibility?: boolean;
}

export default function ExpandableTabsAdvanced({
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
  theme = 'dark',
  size = 'medium',
  enableAccessibility = true,
}: ExpandableTabsProps) {
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  
  // Create shared values for each tab
  const tabAnimations = useRef<{ [key: string]: Animated.SharedValue<number> }>({}).current;
  
  // Initialize shared values
  tabs.forEach(tab => {
    if (!tabAnimations[tab.id]) {
      tabAnimations[tab.id] = useSharedValue(0);
    }
  });

  // Check if screen reader is enabled
  useEffect(() => {
    if (enableAccessibility) {
      AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderEnabled);
    }
  }, [enableAccessibility]);

  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return {
          height: 40,
          iconSize: 18,
          fontSize: 12,
          padding: 8,
        };
      case 'large':
        return {
          height: 60,
          iconSize: 28,
          fontSize: 16,
          padding: 16,
        };
      default: // medium
        return {
          height: 50,
          iconSize: 24,
          fontSize: 14,
          padding: 12,
        };
    }
  };

  const getThemeConfig = () => {
    switch (theme) {
      case 'light':
        return {
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderColor: 'rgba(0, 0, 0, 0.1)',
          textColor: '#000000',
          inactiveTextColor: '#666666',
          separatorColor: 'rgba(0, 0, 0, 0.1)',
          shadowColor: '#000',
        };
      default: // dark
        return {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          textColor: '#FFFFFF',
          inactiveTextColor: '#9CA3AF',
          separatorColor: 'rgba(255, 255, 255, 0.2)',
          shadowColor: '#000',
        };
    }
  };

  const sizeConfig = getSizeConfig();
  const themeConfig = getThemeConfig();

  const handleTabPress = (tab: TabItem) => {
    if (tab.disabled) return;

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

  const getAnimatedBadgeStyle = (tabId: string) => {
    return useAnimatedStyle(() => {
      const progress = tabAnimations[tabId].value;
      
      return {
        opacity: interpolate(progress, [0, 1], [0, 1]),
        transform: [
          {
            scale: interpolate(progress, [0, 1], [0.5, 1]),
          },
        ],
      };
    });
  };

  return (
    <Pressable style={styles.container} onPress={handleOutsidePress}>
      <View style={[
        styles.tabBar,
        {
          backgroundColor: themeConfig.backgroundColor,
          borderColor: themeConfig.borderColor,
          shadowColor: themeConfig.shadowColor,
          minHeight: sizeConfig.height,
        },
        style,
      ]}>
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const isExpandedTab = expandedTab === tab.id;
          const isDisabled = tab.disabled;
          
          return (
            <React.Fragment key={tab.id}>
              <Animated.View
                style={[
                  styles.tabContainer,
                  getAnimatedTabStyle(tab.id),
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    {
                      paddingHorizontal: sizeConfig.padding,
                      paddingVertical: sizeConfig.padding / 2,
                      minHeight: sizeConfig.height,
                    },
                    isDisabled && styles.disabledTab,
                  ]}
                  onPress={() => handleTabPress(tab)}
                  activeOpacity={isDisabled ? 1 : 0.7}
                  disabled={isDisabled}
                  accessibilityLabel={tab.label}
                  accessibilityRole="button"
                  accessibilityState={{ 
                    selected: isActive,
                    disabled: isDisabled,
                  }}
                  accessibilityHint={isExpandedTab ? "Double tap to collapse" : "Double tap to expand"}
                >
                  <View style={styles.iconContainer}>
                    <Animated.View style={getAnimatedIconStyle(tab.id)}>
                      <Ionicons
                        name={tab.icon}
                        size={sizeConfig.iconSize}
                        color={
                          isDisabled 
                            ? themeConfig.inactiveTextColor + '50'
                            : isActive || isExpandedTab 
                              ? themeConfig.textColor 
                              : themeConfig.inactiveTextColor
                        }
                      />
                    </Animated.View>
                    
                    {/* Badge */}
                    {tab.badge && tab.badge > 0 && (
                      <Animated.View
                        style={[
                          styles.badge,
                          getAnimatedBadgeStyle(tab.id),
                        ]}
                      >
                        <Text style={[styles.badgeText, { fontSize: sizeConfig.fontSize - 2 }]}>
                          {tab.badge > 99 ? '99+' : tab.badge}
                        </Text>
                      </Animated.View>
                    )}
                  </View>
                  
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
                          fontSize: sizeConfig.fontSize,
                          color: isDisabled 
                            ? themeConfig.inactiveTextColor + '50'
                            : isActive || isExpandedTab 
                              ? themeConfig.textColor 
                              : themeConfig.inactiveTextColor,
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
              
              {showSeparators && index < tabs.length - 1 && (
                <View style={[
                  styles.separator,
                  {
                    backgroundColor: themeConfig.separatorColor,
                    height: sizeConfig.height * 0.4,
                  }
                ]} />
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
    borderRadius: 25,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
  },
  tabContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 2,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  disabledTab: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  labelContainer: {
    marginLeft: 8,
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
  },
  separator: {
    width: 1,
    marginHorizontal: 4,
  },
});
