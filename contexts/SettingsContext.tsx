import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';

interface SettingsContextType {
  // Notification Settings
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  
  // Security Settings
  biometricEnabled: boolean;
  setBiometricEnabled: (enabled: boolean) => void;
  
  // Appearance Settings
  darkModeEnabled: boolean;
  setDarkModeEnabled: (enabled: boolean) => void;
  
  // Currency Settings
  currency: string;
  setCurrency: (currency: string) => void;
  
  // Language Settings
  language: string;
  setLanguage: (language: string) => void;
  
  // Financial Settings
  defaultAccount: string | null;
  setDefaultAccount: (accountId: string | null) => void;
  
  // Privacy Settings
  dataSharingEnabled: boolean;
  setDataSharingEnabled: (enabled: boolean) => void;
  
  analyticsEnabled: boolean;
  setAnalyticsEnabled: (enabled: boolean) => void;
  
  // Loading state
  isLoading: boolean;
  
  // Reset all settings
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

// AsyncStorage keys
const SETTINGS_KEYS = {
  NOTIFICATIONS: '@fintrack_notifications',
  BIOMETRIC: '@fintrack_biometric',
  DARK_MODE: '@fintrack_dark_mode',
  CURRENCY: '@fintrack_currency',
  LANGUAGE: '@fintrack_language',
  DEFAULT_ACCOUNT: '@fintrack_default_account',
  DATA_SHARING: '@fintrack_data_sharing',
  ANALYTICS: '@fintrack_analytics',
};

// Default values
const DEFAULT_SETTINGS = {
  notificationsEnabled: true,
  biometricEnabled: false,
  darkModeEnabled: false,
  currency: 'INR',
  language: 'en',
  defaultAccount: null,
  dataSharingEnabled: false,
  analyticsEnabled: true,
};

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on app start and when user changes
  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    try {
      // First, try to load currency from user profile (onboarding sets this)
      let currencyFromProfile: string | null = null;
      if (user) {
        try {
          const { data: profile } = await supabase
            .from('users_profile')
            .select('base_currency, default_currency')
            .eq('user_id', user.id)
            .maybeSingle();
          
          currencyFromProfile = profile?.base_currency || profile?.default_currency || null;
        } catch (error) {
          console.error('Error loading currency from profile:', error);
        }
      }

      // Load other settings from AsyncStorage
      const [
        notifications,
        biometric,
        darkMode,
        currencyFromStorage,
        language,
        defaultAccount,
        dataSharing,
        analytics,
      ] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEYS.NOTIFICATIONS),
        AsyncStorage.getItem(SETTINGS_KEYS.BIOMETRIC),
        AsyncStorage.getItem(SETTINGS_KEYS.DARK_MODE),
        AsyncStorage.getItem(SETTINGS_KEYS.CURRENCY),
        AsyncStorage.getItem(SETTINGS_KEYS.LANGUAGE),
        AsyncStorage.getItem(SETTINGS_KEYS.DEFAULT_ACCOUNT),
        AsyncStorage.getItem(SETTINGS_KEYS.DATA_SHARING),
        AsyncStorage.getItem(SETTINGS_KEYS.ANALYTICS),
      ]);

      // Priority: Profile currency > AsyncStorage currency > Default
      const finalCurrency = currencyFromProfile || currencyFromStorage || DEFAULT_SETTINGS.currency;

      // If we got currency from profile but not from storage, sync it
      if (currencyFromProfile && currencyFromProfile !== currencyFromStorage) {
        await AsyncStorage.setItem(SETTINGS_KEYS.CURRENCY, currencyFromProfile);
      }

      setSettings({
        notificationsEnabled: notifications !== null ? JSON.parse(notifications) : DEFAULT_SETTINGS.notificationsEnabled,
        biometricEnabled: biometric !== null ? JSON.parse(biometric) : DEFAULT_SETTINGS.biometricEnabled,
        darkModeEnabled: darkMode !== null ? JSON.parse(darkMode) : DEFAULT_SETTINGS.darkModeEnabled,
        currency: finalCurrency,
        language: language || DEFAULT_SETTINGS.language,
        defaultAccount: defaultAccount || DEFAULT_SETTINGS.defaultAccount,
        dataSharingEnabled: dataSharing !== null ? JSON.parse(dataSharing) : DEFAULT_SETTINGS.dataSharingEnabled,
        analyticsEnabled: analytics !== null ? JSON.parse(analytics) : DEFAULT_SETTINGS.analyticsEnabled,
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSetting = async (key: string, value: any) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
    }
  };

  const setNotificationsEnabled = async (enabled: boolean) => {
    setSettings(prev => ({ ...prev, notificationsEnabled: enabled }));
    await saveSetting(SETTINGS_KEYS.NOTIFICATIONS, enabled);
  };

  const setBiometricEnabled = async (enabled: boolean) => {
    setSettings(prev => ({ ...prev, biometricEnabled: enabled }));
    await saveSetting(SETTINGS_KEYS.BIOMETRIC, enabled);
  };

  const setDarkModeEnabled = async (enabled: boolean) => {
    setSettings(prev => ({ ...prev, darkModeEnabled: enabled }));
    await saveSetting(SETTINGS_KEYS.DARK_MODE, enabled);
  };

  const setCurrency = async (currency: string) => {
    setSettings(prev => ({ ...prev, currency }));
    await saveSetting(SETTINGS_KEYS.CURRENCY, currency);
    
    // Also update user profile if user is logged in
    if (user) {
      try {
        await supabase
          .from('users_profile')
          .update({
            base_currency: currency,
            default_currency: currency,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } catch (error) {
        console.error('Error updating currency in profile:', error);
        // Don't fail if profile update fails, settings are still saved
      }
    }
  };

  const setLanguage = async (language: string) => {
    setSettings(prev => ({ ...prev, language }));
    await saveSetting(SETTINGS_KEYS.LANGUAGE, language);
  };

  const setDefaultAccount = async (accountId: string | null) => {
    setSettings(prev => ({ ...prev, defaultAccount: accountId }));
    await saveSetting(SETTINGS_KEYS.DEFAULT_ACCOUNT, accountId);
  };

  const setDataSharingEnabled = async (enabled: boolean) => {
    setSettings(prev => ({ ...prev, dataSharingEnabled: enabled }));
    await saveSetting(SETTINGS_KEYS.DATA_SHARING, enabled);
  };

  const setAnalyticsEnabled = async (enabled: boolean) => {
    setSettings(prev => ({ ...prev, analyticsEnabled: enabled }));
    await saveSetting(SETTINGS_KEYS.ANALYTICS, enabled);
  };

  const resetSettings = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(SETTINGS_KEYS.NOTIFICATIONS),
        AsyncStorage.removeItem(SETTINGS_KEYS.BIOMETRIC),
        AsyncStorage.removeItem(SETTINGS_KEYS.DARK_MODE),
        AsyncStorage.removeItem(SETTINGS_KEYS.CURRENCY),
        AsyncStorage.removeItem(SETTINGS_KEYS.LANGUAGE),
        AsyncStorage.removeItem(SETTINGS_KEYS.DEFAULT_ACCOUNT),
        AsyncStorage.removeItem(SETTINGS_KEYS.DATA_SHARING),
        AsyncStorage.removeItem(SETTINGS_KEYS.ANALYTICS),
      ]);
      setSettings(DEFAULT_SETTINGS);
    } catch (error) {
      console.error('Error resetting settings:', error);
    }
  };

  const value: SettingsContextType = {
    ...settings,
    setNotificationsEnabled,
    setBiometricEnabled,
    setDarkModeEnabled,
    setCurrency,
    setLanguage,
    setDefaultAccount,
    setDataSharingEnabled,
    setAnalyticsEnabled,
    isLoading,
    resetSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}



