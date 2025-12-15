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
import { NavigationProvider } from '@/contexts/NavigationContext';
import { useCustomFonts } from '@/hooks/useFonts';
import { LiabilitiesProvider } from '@/contexts/LiabilitiesContext';
import { OrganizationsProvider } from '@/contexts/OrganizationsContext';

export const unstable_settings = {
  anchor: 'splash',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const fontsLoaded = useCustomFonts();

  // Enhanced font loading status logging (development only)
  if (__DEV__) {
    if (!fontsLoaded) {
      // Fonts loading...
    }
  }

  // Don't block rendering - fonts will load asynchronously
  // Components will use fallback fonts if custom fonts aren't ready
  // This prevents the "message channel closed" error
  // However, fonts should load quickly on mobile devices
  // 
  // Note: If you see font loading errors in the console, check the detailed
  // error logs from useCustomFonts hook which will identify the failing font(s)

  return (
    <AuthProvider>
      <UserProvider>
        <SettingsProvider>
          <BackgroundModeProvider>
            <NotificationProvider>
              <LiabilitiesProvider>
                <OrganizationsProvider>
                  <NavigationProvider>
                    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                    <Stack>
                      <Stack.Screen name="splash" options={{ headerShown: false }} />
                      <Stack.Screen name="auth/signin" options={{ headerShown: false }} />
                      <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
                      <Stack.Screen name="account-setup" options={{ headerShown: false }} />
                      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      <Stack.Screen name="components-lab" options={{ headerShown: false }} />
                      <Stack.Screen name="profile" options={{ headerShown: false }} />
                      <Stack.Screen name="settings" options={{ headerShown: false }} />
                      <Stack.Screen name="account/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="goal/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="liability/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="recurring/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="organization/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="budget/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="transaction/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="category/[id]" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/add-liability" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/add-goal" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/add-bill" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/add-recurring-transaction" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/add-account" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/add-budget" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/add-category" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/add-contribution" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/mark-bill-paid" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/pay" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/receive" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/transfer" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/edit-transaction" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/edit-account" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/edit-category" options={{ headerShown: false }} />
                      <Stack.Screen name="modals/draw-liability-funds" options={{ headerShown: false }} />
                      <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
                    </Stack>
                    <StatusBar style="dark" backgroundColor="#FFFFFF" />
                  </ThemeProvider>
                  </NavigationProvider>
                </OrganizationsProvider>
              </LiabilitiesProvider>
            </NotificationProvider>
          </BackgroundModeProvider>
        </SettingsProvider>
      </UserProvider>
    </AuthProvider>
  );
}
