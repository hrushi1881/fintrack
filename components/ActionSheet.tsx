import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  PanResponder,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.6;
const DRAG_THRESHOLD = 50;

export interface ActionSheetItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separator?: boolean; // Add separator line above this item
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  items: ActionSheetItem[];
  title?: string;
}

export default function ActionSheet({
  visible,
  onClose,
  items,
  title,
}: ActionSheetProps) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Show sheet
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Hide sheet
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: SHEET_HEIGHT,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DRAG_THRESHOLD) {
          handleClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
        }
      },
    })
  ).current;

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleItemPress = (item: ActionSheetItem) => {
    if (item.disabled) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    item.onPress();
    handleClose();
  };

  // Keep all items, but filter out non-separator disabled items for rendering
  const filteredItems = items.filter(item => !item.disabled || item.separator);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity,
            },
          ]}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.sheetContent}>
            {/* Draggable Indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Title */}
            {title && (
              <View style={styles.titleContainer}>
                <Text style={styles.title}>{title}</Text>
              </View>
            )}

            {/* Action Items */}
            <View style={styles.itemsContainer}>
              {filteredItems.map((item, index) => {
                // Skip separator items as they're handled separately
                if (item.separator && !item.label) {
                  return <View key={item.id} style={styles.separator} />;
                }

                return (
                  <React.Fragment key={item.id}>
                    {item.separator && index > 0 && (
                      <View style={styles.separator} />
                    )}
                    <TouchableOpacity
                      style={[
                        styles.item,
                        item.disabled && styles.itemDisabled,
                      ]}
                      onPress={() => handleItemPress(item)}
                      activeOpacity={0.7}
                      disabled={item.disabled}
                    >
                      <View style={styles.itemContent}>
                        <Ionicons
                          name={item.icon}
                          size={22}
                          color={
                            item.destructive
                              ? '#EF4444'
                              : item.disabled
                              ? 'rgba(0, 0, 0, 0.25)'
                              : '#000000'
                          }
                          style={styles.itemIcon}
                        />
                        <Text
                          style={[
                            styles.itemLabel,
                            item.destructive && styles.itemLabelDestructive,
                            item.disabled && styles.itemLabelDisabled,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={
                          item.destructive
                            ? '#EF4444'
                            : item.disabled
                            ? 'rgba(0, 0, 0, 0.25)'
                            : 'rgba(0, 0, 0, 0.3)'
                        }
                      />
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: -4,
        },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sheetContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  dragIndicatorContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  titleContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  itemsContainer: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  itemDisabled: {
    opacity: 0.5,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemIcon: {
    marginRight: 16,
  },
  itemLabel: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'InstrumentSerif-Regular',
  },
  itemLabelDestructive: {
    color: '#EF4444',
    fontWeight: '500',
  },
  itemLabelDisabled: {
    color: 'rgba(0, 0, 0, 0.25)',
  },
  separator: {
    height: 0.5,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginLeft: 20,
    marginRight: 20,
    marginVertical: 4,
  },
});

