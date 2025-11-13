import {
  useFonts as useGoogleFonts,
  Archivo_400Regular,
  Archivo_700Bold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_700Bold,
} from '@expo-google-fonts/instrument-serif';
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

/**
 * Custom font loader hook using @expo-google-fonts
 * 
 * This hook loads custom fonts from Google Fonts using Expo's font system.
 * Fonts will be automatically downloaded and cached by Expo.
 */
export const useCustomFonts = () => {
  const [fontsLoaded, fontError] = useGoogleFonts({
    // Archivo Black for page headings (using Archivo 900Black weight)
    'Archivo Black': Archivo_900Black,
    
    // Instrument Serif for body text
    'InstrumentSerif-Regular': InstrumentSerif_400Regular,
    'InstrumentSerif-Bold': InstrumentSerif_700Bold,
    
    // Poppins for UI elements
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
  });

  if (fontError) {
    console.warn('Font loading error:', fontError);
    // Return true to allow app to continue with system fonts
  return true;
  }

  // Return true when fonts are loaded, or true as fallback
  return fontsLoaded || true;
};
