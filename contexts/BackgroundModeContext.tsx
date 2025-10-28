import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKGROUND_MODES, BackgroundMode } from '@/theme';

interface BackgroundModeContextType {
  backgroundMode: BackgroundMode;
  toggleBackgroundMode: () => void;
  setBackgroundMode: (mode: BackgroundMode) => void;
  isLoading: boolean;
}

const BackgroundModeContext = createContext<BackgroundModeContextType | undefined>(undefined);

interface BackgroundModeProviderProps {
  children: ReactNode;
}

const BACKGROUND_MODE_KEY = '@fintrack_background_mode';

export function BackgroundModeProvider({ children }: BackgroundModeProviderProps) {
  const [backgroundMode, setBackgroundModeState] = useState<BackgroundMode>(BACKGROUND_MODES.MOSS_GREEN);
  const [isLoading, setIsLoading] = useState(true);

  // Load background mode preference on app start
  useEffect(() => {
    loadBackgroundMode();
  }, []);

  const loadBackgroundMode = async () => {
    try {
      const savedMode = await AsyncStorage.getItem(BACKGROUND_MODE_KEY);
      if (savedMode && Object.values(BACKGROUND_MODES).includes(savedMode as BackgroundMode)) {
        setBackgroundModeState(savedMode as BackgroundMode);
      }
    } catch (error) {
      console.error('Error loading background mode:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setBackgroundMode = async (mode: BackgroundMode) => {
    try {
      await AsyncStorage.setItem(BACKGROUND_MODE_KEY, mode);
      setBackgroundModeState(mode);
    } catch (error) {
      console.error('Error saving background mode:', error);
    }
  };

  const toggleBackgroundMode = () => {
    const newMode = backgroundMode === BACKGROUND_MODES.MOSS_GREEN 
      ? BACKGROUND_MODES.IOS_GRADIENT 
      : BACKGROUND_MODES.MOSS_GREEN;
    setBackgroundMode(newMode);
  };

  const value: BackgroundModeContextType = {
    backgroundMode,
    toggleBackgroundMode,
    setBackgroundMode,
    isLoading,
  };

  return (
    <BackgroundModeContext.Provider value={value}>
      {children}
    </BackgroundModeContext.Provider>
  );
}

export function useBackgroundMode(): BackgroundModeContextType {
  const context = useContext(BackgroundModeContext);
  if (context === undefined) {
    throw new Error('useBackgroundMode must be used within a BackgroundModeProvider');
  }
  return context;
}

