import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface TopBarOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

interface Props {
  options: TopBarOption[];
  activeOptionId?: string;
}

const FloatingTopBar = ({ options, activeOptionId }: Props) => {
  const [expandedOption, setExpandedOption] = useState<string | null>(null);
  const [pressedOption, setPressedOption] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  
  // Use useMemo to ensure consistent number of animated values
  // This prevents "Rendered more hooks" error when options change
  const optionWidthAnims = useMemo(
    () => options.map(() => new Animated.Value(0)),
    [options]
  );
  const textOpacityAnims = useMemo(
    () => options.map(() => new Animated.Value(0)),
    [options]
  );
  const textTranslateXAnims = useMemo(
    () => options.map(() => new Animated.Value(-8)),
    [options]
  );

  const inactiveWidth = 40; // Width for icon-only pill (smaller than nav bar)
  const expandedWidth = 100; // Width for expanded pill with text

  useEffect(() => {
    options.forEach((option, index) => {
      const isCurrentlyExpanded = expandedOption === option.id;
      const isCurrentlyPressed = pressedOption === option.id;
      const shouldShowText = isCurrentlyExpanded || isCurrentlyPressed;
      
      Animated.spring(optionWidthAnims[index], {
        toValue: shouldShowText ? 1 : 0,
        useNativeDriver: false,
        tension: 180,
        friction: 18,
      }).start();

      Animated.timing(textOpacityAnims[index], {
        toValue: shouldShowText ? 1 : 0,
        duration: shouldShowText ? 180 : 150,
        useNativeDriver: true,
      }).start();

      Animated.timing(textTranslateXAnims[index], {
        toValue: shouldShowText ? 0 : -8,
        duration: shouldShowText ? 180 : 150,
        useNativeDriver: true,
      }).start();
    });
  }, [expandedOption, pressedOption, options]);

  const handleOptionPress = (option: TopBarOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedOption(expandedOption === option.id ? null : option.id);
    option.onPress();
  };

  const handlePressIn = (option: TopBarOption) => {
    setPressedOption(option.id);
  };

  const handlePressOut = () => {
    setPressedOption(null);
  };

  return (
    <View style={[styles.wrapper, { top: insets.top + 8 }]}>
      <View style={styles.bar}>
        {options.map((option, index) => {
          const isActive = option.id === activeOptionId;
          const isExpanded = expandedOption === option.id;

          const pillWidth = optionWidthAnims[index].interpolate({
            inputRange: [0, 1],
            outputRange: [inactiveWidth, expandedWidth],
          });

          const isPressed = pressedOption === option.id;
          const shouldShowText = isExpanded || isPressed;

          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => handleOptionPress(option)}
              onPressIn={() => handlePressIn(option)}
              onPressOut={handlePressOut}
              activeOpacity={0.9}
            >
              <Animated.View
                style={[
                  styles.pill,
                  isActive && styles.pillActive,
                  { width: pillWidth },
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={isActive ? '#000000' : '#FFFFFF'} // Black when active, white when inactive
                />
                {shouldShowText && (
                  <Animated.View
                    style={{
                      opacity: textOpacityAnims[index],
                      transform: [{ translateX: textTranslateXAnims[index] }],
                    }}
                  >
                    <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
                      {option.label.toUpperCase()}
                    </Text>
                  </Animated.View>
                )}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default FloatingTopBar;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 20,
    alignItems: 'flex-end',
    zIndex: 999,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: '#000000', // Black background
    padding: 6,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)', // White border for black/white theme
    overflow: 'hidden',
    height: 40, // Smaller than nav bar (52px)
    paddingHorizontal: 10,
  },
  pillActive: {
    backgroundColor: '#FFFFFF', // White background when active
    borderColor: 'transparent',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 6,
    letterSpacing: 0.5,
    fontFamily: 'Archivo Black',
  },
  labelActive: {
    color: '#000000', // Black text on white background
  },
  labelInactive: {
    color: '#FFFFFF', // White text on black background
    opacity: 0.9,
  },
});

