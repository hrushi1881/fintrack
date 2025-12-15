import { useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { BackHandler } from 'react-native';
import { useNavigation } from '@/contexts/NavigationContext';

/**
 * Custom hook for contextual back navigation
 * 
 * Usage:
 * ```tsx
 * const handleBack = useBackNavigation();
 * 
 * <TouchableOpacity onPress={handleBack}>
 *   <Ionicons name="arrow-back" />
 * </TouchableOpacity>
 * ```
 */
export function useBackNavigation() {
  const { goBack, canGoBack } = useNavigation();

  const handleBack = useCallback(() => {
    if (canGoBack()) {
      goBack();
    } else {
      // Fallback to home if no history
      router.replace('/(tabs)/' as any);
    }
  }, [goBack, canGoBack]);

  return handleBack;
}

/**
 * Hook to check if back navigation is available
 */
export function useCanGoBack() {
  const { canGoBack } = useNavigation();
  return canGoBack();
}

/**
 * Hook to handle Android hardware back button
 * Automatically integrates with contextual back navigation
 * 
 * Usage:
 * ```tsx
 * useAndroidBackButton();
 * ```
 */
export function useAndroidBackButton() {
  const handleBack = useBackNavigation();

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [handleBack]);
}

