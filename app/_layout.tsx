import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/contexts/AuthContext';
import { UserProvider } from '@/contexts/UserContext';
import { BackgroundModeProvider } from '@/contexts/BackgroundModeContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { useCustomFonts } from '@/hooks/useFonts';

export const unstable_settings = {
  anchor: 'splash',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const fontsLoaded = useCustomFonts();

  if (!fontsLoaded) {
    return null; // Show splash screen while fonts load
  }

  return (
    <AuthProvider>
      <UserProvider>
        <SettingsProvider>
          <BackgroundModeProvider>
            <NotificationProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack>
                <Stack.Screen name="splash" options={{ headerShown: false }} />
                <Stack.Screen name="auth/signin" options={{ headerShown: false }} />
                <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
                <Stack.Screen name="account-setup" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="profile" options={{ headerShown: false }} />
                    <Stack.Screen name="settings" options={{ headerShown: false }} />
                    <Stack.Screen name="account/[id]" options={{ headerShown: false }} />
                    <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <StatusBar style="light" backgroundColor="#99D795" />
            </ThemeProvider>
            </NotificationProvider>
          </BackgroundModeProvider>
        </SettingsProvider>
      </UserProvider>
    </AuthProvider>
  );
}
