import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Modal, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrencyAmount } from '@/utils/currency';

interface NotificationPopupProps {
  visible: boolean;
  onClose: () => void;
  type: 'success' | 'error' | 'info';
  title: string;
  amount?: number;
  currency?: string;
  description?: string;
  account?: string;
  date?: string;
  duration?: number;
}

const { width } = Dimensions.get('window');

export default function NotificationPopup({
  visible,
  onClose,
  type,
  title,
  amount,
  currency,
  description,
  account,
  date,
  duration = 3000,
}: NotificationPopupProps) {
  const fadeAnim = new Animated.Value(0);
  const scaleAnim = new Animated.Value(0.8);

  useEffect(() => {
    if (visible) {
      // Show animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide after duration
      const timer = setTimeout(() => {
        hideNotification();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const hideNotification = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const getIconName = () => {
    switch (type) {
      case 'success':
        return 'checkmark';
      case 'error':
        return 'close';
      case 'info':
        return 'information';
      default:
        return 'checkmark';
    }
  };

  const getIconColor = () => {
    switch (type) {
      case 'success':
        return '#FFFFFF';
      case 'error':
        return '#FFFFFF';
      case 'info':
        return '#FFFFFF';
      default:
        return '#FFFFFF';
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return '#99D795';
      case 'error':
        return '#EF4444';
      case 'info':
        return '#3B82F6';
      default:
        return '#99D795';
    }
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={hideNotification}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.popup,
            {
              backgroundColor: getBackgroundColor(),
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Amount */}
          {amount && (
            <View style={styles.amountContainer}>
              <Text style={styles.amount}>
                {formatCurrencyAmount(amount, currency)}
              </Text>
              <View style={styles.amountUnderline} />
            </View>
          )}

          {/* Description and Date Row */}
          {(description || date) && (
            <View style={styles.descriptionRow}>
              {description && (
                <Text style={styles.description}>{description}</Text>
              )}
              {date && (
                <Text style={styles.date}>{date}</Text>
              )}
            </View>
          )}

          {/* Account */}
          {account && (
            <Text style={styles.account}>{account}</Text>
          )}

          {/* Success Icon */}
          <View style={styles.iconContainer}>
            <Ionicons
              name={getIconName() as any}
              size={24}
              color={getIconColor()}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  popup: {
    width: width * 0.85,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 16,
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  amount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
  },
  amountUnderline: {
    width: '100%',
    height: 2,
    backgroundColor: '#000000',
    marginTop: 4,
  },
  descriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  description: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    flex: 1,
  },
  date: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#000000',
  },
  account: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
