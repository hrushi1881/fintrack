import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Switch, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount, getCurrencyConfig } from '@/utils/currency';
import GlassmorphCard from '@/components/GlassmorphCard';
import IOSGradientBackground from '@/components/iOSGradientBackground';
import { theme, BACKGROUND_MODES } from '@/theme';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { backgroundMode, toggleBackgroundMode } = useBackgroundMode();
  const { 
    currency, 
    setCurrency, 
    notificationsEnabled, 
    setNotificationsEnabled, 
    biometricEnabled, 
    setBiometricEnabled, 
    darkModeEnabled, 
    setDarkModeEnabled 
  } = useSettings();
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);

  const renderBackground = () => {
    if (backgroundMode === BACKGROUND_MODES.IOS_GRADIENT) {
      return (
        <IOSGradientBackground gradientType="default" animated={true} shimmer={true}>
          {renderContent()}
        </IOSGradientBackground>
      );
    } else {
      return (
        <LinearGradient
          colors={['#99D795', '#99D795', '#99D795']}
          style={styles.container}
        >
          {renderContent()}
        </LinearGradient>
      );
    }
  };

  const renderContent = () => (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Profile Section */}
        <GlassmorphCard style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color="white" />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.email?.split('@')[0] || 'User'}</Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="create" size={20} color="#10B981" />
            </TouchableOpacity>
          </View>
        </GlassmorphCard>

        {/* Appearance Settings */}
        <GlassmorphCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="color-palette" size={20} color="#10B981" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Background Mode</Text>
                <Text style={styles.settingDescription}>
                  {backgroundMode === BACKGROUND_MODES.MOSS_GREEN ? 'Moss Green' : 'iOS Gradient'}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.toggleButton}
              onPress={toggleBackgroundMode}
            >
              <Ionicons 
                name={backgroundMode === BACKGROUND_MODES.MOSS_GREEN ? 'leaf' : 'color-palette'} 
                size={20} 
                color="white" 
              />
            </TouchableOpacity>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="moon" size={20} color="#8B5CF6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Dark Mode</Text>
                <Text style={styles.settingDescription}>Use dark theme</Text>
              </View>
            </View>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
              trackColor={{ false: '#6B7280', true: '#8B5CF6' }}
              thumbColor={darkModeEnabled ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>
        </GlassmorphCard>

        {/* Currency Settings */}
        <GlassmorphCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Currency</Text>
          
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => setShowCurrencyModal(true)}
          >
            <View style={styles.settingInfo}>
              <Ionicons name="cash" size={20} color="#10B981" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Default Currency</Text>
                <Text style={styles.settingDescription}>
                  {getCurrencyConfig(currency).code} - {formatCurrencyAmount(1000, currency)}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </GlassmorphCard>

        {/* Notification Settings */}
        <GlassmorphCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications" size={20} color="#10B981" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingDescription}>Receive app notifications</Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#6B7280', true: '#10B981' }}
              thumbColor={notificationsEnabled ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="finger-print" size={20} color="#3B82F6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Biometric Login</Text>
                <Text style={styles.settingDescription}>Use fingerprint or face ID</Text>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometricEnabled}
              trackColor={{ false: '#6B7280', true: '#3B82F6' }}
              thumbColor={biometricEnabled ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>
        </GlassmorphCard>

        {/* Account Settings */}
        <GlassmorphCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="person" size={20} color="#3B82F6" />
              <Text style={styles.settingLabel}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="shield" size={20} color="#F59E0B" />
              <Text style={styles.settingLabel}>Privacy & Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="help-circle" size={20} color="#8B5CF6" />
              <Text style={styles.settingLabel}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </GlassmorphCard>

        {/* Sign Out */}
        <TouchableOpacity 
          style={styles.signOutButton}
          onPress={() => {
            Alert.alert(
              'Sign Out',
              'Are you sure you want to sign out?',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
                {
                  text: 'Sign Out',
                  style: 'destructive',
                  onPress: async () => {
                    await signOut();
                    router.replace('/auth/signin');
                  },
                },
              ]
            );
          }}
        >
          <Ionicons name="log-out" size={20} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Currency Selection Modal */}
      {showCurrencyModal && (
        <View style={styles.modalOverlay}>
          <GlassmorphCard style={styles.currencyModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Currency</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowCurrencyModal(false)}
              >
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.currencyList}>
              {[
                { code: 'USD', name: 'US Dollar', symbol: '$' },
                { code: 'EUR', name: 'Euro', symbol: '€' },
                { code: 'GBP', name: 'British Pound', symbol: '£' },
                { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
                { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
                { code: 'CAD', name: 'Canadian Dollar', symbol: '$' },
                { code: 'AUD', name: 'Australian Dollar', symbol: '$' },
                { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
                { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
                { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
                { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
                { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
                { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
                { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
                { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
                { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
                { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
                { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
                { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
                { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
              ].map((curr) => (
                <TouchableOpacity
                  key={curr.code}
                  style={[
                    styles.currencyItem,
                    currency === curr.code && styles.selectedCurrencyItem
                  ]}
                  onPress={() => {
                    setCurrency(curr.code);
                    setShowCurrencyModal(false);
                  }}
                >
                  <View style={styles.currencyInfo}>
                    <Text style={styles.currencySymbol}>{curr.symbol}</Text>
                    <View style={styles.currencyDetails}>
                      <Text style={styles.currencyCode}>{curr.code}</Text>
                      <Text style={styles.currencyName}>{curr.name}</Text>
                    </View>
                  </View>
                  {currency === curr.code && (
                    <Ionicons name="checkmark" size={20} color="#10B981" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </GlassmorphCard>
        </View>
      )}
    </SafeAreaView>
  );

  return renderBackground();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 30,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...theme.typography.h2,
    color: 'white',
  },
  placeholder: {
    width: 40,
  },
  profileCard: {
    marginBottom: 20,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...theme.typography.glassTitle,
    marginBottom: 4,
  },
  profileEmail: {
    ...theme.typography.glassBody,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  settingsCard: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...theme.typography.glassTitle,
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingLabel: {
    ...theme.typography.glassTitle,
    fontSize: 16,
    marginBottom: 2,
  },
  settingDescription: {
    ...theme.typography.glassCaption,
  },
  toggleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  signOutText: {
    ...theme.typography.glassTitle,
    color: '#EF4444',
    marginLeft: 8,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  currencyModal: {
    width: '90%',
    maxHeight: '70%',
    borderRadius: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    ...theme.typography.glassTitle,
    fontSize: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencyList: {
    maxHeight: 400,
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  selectedCurrencyItem: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  currencyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  currencySymbol: {
    ...theme.typography.glassTitle,
    fontSize: 20,
    marginRight: 12,
    minWidth: 30,
  },
  currencyDetails: {
    flex: 1,
  },
  currencyCode: {
    ...theme.typography.glassTitle,
    fontSize: 16,
    marginBottom: 2,
  },
  currencyName: {
    ...theme.typography.glassCaption,
  },
});