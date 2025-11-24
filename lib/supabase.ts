import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = 'https://zduzgjaglshgfxpbsxin.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdXpnamFnbHNoZ2Z4cGJzeGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDA3OTMsImV4cCI6MjA3NjcxNjc5M30._3K1_ngdfggkhjcKGV2wgkZ-UtLnD1ritt08632iVxI';

// Create a custom storage adapter for Supabase
// Only use AsyncStorage in React Native environments, use localStorage for web
let asyncStorageAdapter: any = null;

if (Platform.OS !== 'web') {
  // React Native: Use AsyncStorage
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  asyncStorageAdapter = {
    getItem: async (key: string) => {
      const item = await AsyncStorage.getItem(key);
      return item;
    },
    setItem: async (key: string, value: string) => {
      await AsyncStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      await AsyncStorage.removeItem(key);
    },
  };
} else {
  // Web: Use localStorage (only when window is available, not during SSR)
  asyncStorageAdapter = {
    getItem: async (key: string) => {
      if (typeof window !== 'undefined') {
        return window.localStorage.getItem(key);
      }
      return null;
    },
    setItem: async (key: string, value: string) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
      }
    },
    removeItem: async (key: string) => {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    },
  };
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: asyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // Only detect URL for web
  },
});
