import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
}

export default function ExpandableTabs({
  tabs,
  activeTab,
  onTabChange,
  style,
  collapsedWidth = 60,
  expandedWidth = 200,
  animationDuration = 300,
  showSeparators = true,
  hapticFeedback = true,
}: ExpandableTabsProps) {
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const animatedValues = useRef<{ [key: string]: Animated.Value }>({}).current;

  // Initialize animated values for each tab
  tabs.forEach(tab => {
    if (!animatedValues[tab.id]) {
      animatedValues[tab.id] = new Animated.Value(0);
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
    setExpandedTab(tabId);
    setIsExpanded(true);

    // Animate the selected tab to expanded state
    Animated.timing(animatedValues[tabId], {
      toValue: 1,
      duration: animationDuration,
      useNativeDriver: false,
    }).start();
  };

  const collapseTab = () => {
    if (expandedTab) {
      Animated.timing(animatedValues[expandedTab], {
        toValue: 0,
        duration: animationDuration,
        useNativeDriver: false,
      }).start(() => {
        setExpandedTab(null);
        setIsExpanded(false);
      });
    }
  };

  const handleOutsidePress = () => {
    if (isExpanded) {
      collapseTab();
    }
  };

  const getTabWidth = (tabId: string) => {
    return animatedValues[tabId].interpolate({
      inputRange: [0, 1],
      outputRange: [collapsedWidth, expandedWidth],
    });
  };

  const getLabelOpacity = (tabId: string) => {
    return animatedValues[tabId].interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
  };

  const getLabelTranslateX = (tabId: string) => {
    return animatedValues[tabId].interpolate({
      inputRange: [0, 1],
      outputRange: [-20, 0],
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
                  {
                    width: getTabWidth(tab.id),
                    backgroundColor: isExpandedTab 
                      ? 'rgba(255, 255, 255, 0.15)' 
                      : isActive 
                        ? 'rgba(255, 255, 255, 0.1)' 
                        : 'transparent',
                  },
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
                  <View style={styles.iconContainer}>
                    <Ionicons
                      name={tab.icon}
                      size={24}
                      color={isActive || isExpandedTab ? '#FFFFFF' : '#9CA3AF'}
                    />
                  </View>
                  
                  <Animated.View
                    style={[
                      styles.labelContainer,
                      {
                        opacity: getLabelOpacity(tab.id),
                        transform: [{ translateX: getLabelTranslateX(tab.id) }],
                      },
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
