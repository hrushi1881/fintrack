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

// Create Supabase client with proper configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: asyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // Only detect URL for web
    flowType: 'pkce', // Use PKCE flow for better security, especially on web
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Add error logging in development to help debug network issues
if (process.env.NODE_ENV !== 'production' && Platform.OS === 'web') {
  // Test connectivity on web platform
  const testConnection = async () => {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': supabaseAnonKey,
        },
      });
      if (!response.ok && response.status !== 404) {
        console.warn('⚠️ Supabase connection test failed:', response.status, response.statusText);
        console.warn('💡 Make sure CORS is enabled in your Supabase project settings');
        console.warn('💡 Check that your Supabase URL is correct:', supabaseUrl);
      }
    } catch (error: any) {
      console.error('❌ Network request failed. Possible causes:');
      console.error('   1. CORS not configured in Supabase dashboard');
      console.error('   2. Network connectivity issues');
      console.error('   3. Supabase project might be paused or unavailable');
      console.error('   Error:', error.message);
      console.error('   URL:', supabaseUrl);
    }
  };
  
  // Test connection after a short delay to avoid blocking app startup
  setTimeout(testConnection, 1000);
}
