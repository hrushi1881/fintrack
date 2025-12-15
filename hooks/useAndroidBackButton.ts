import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useBackNavigation } from './useBackNavigation';

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

