import { Platform } from 'react-native';

/**
 * Font utility functions for safe font usage across platforms
 * Provides fallbacks if custom fonts aren't loaded
 */

export const getFontFamily = (fontName: string, fallback?: string): string => {
  // On mobile, use Platform.select to ensure proper font handling
  return Platform.select({
    ios: fontName,
    android: fontName,
    default: fontName,
  }) || fallback || 'System';
};

/**
 * Predefined font families with fallbacks
 */
export const Fonts = {
  // Archivo fonts
  archivoBlack: getFontFamily('Archivo Black', Platform.OS === 'ios' ? 'System' : 'sans-serif-black'),
  archivoBold: getFontFamily('Archivo Bold', Platform.OS === 'ios' ? 'System' : 'sans-serif-medium'),
  
  // Instrument Serif
  instrumentSerifRegular: getFontFamily('InstrumentSerif-Regular', Platform.OS === 'ios' ? 'System' : 'serif'),
  instrumentSerifBold: getFontFamily('InstrumentSerif-Bold', Platform.OS === 'ios' ? 'System' : 'serif'),
  
  // Instrument Sans (for numbers)
  instrumentSansRegular: getFontFamily('InstrumentSans-Regular', Platform.OS === 'ios' ? 'System' : 'sans-serif'),
  instrumentSansMedium: getFontFamily('InstrumentSans-Medium', Platform.OS === 'ios' ? 'System' : 'sans-serif'),
  instrumentSansSemiBold: getFontFamily('InstrumentSans-SemiBold', Platform.OS === 'ios' ? 'System' : 'sans-serif-medium'),
  instrumentSansBold: getFontFamily('InstrumentSans-Bold', Platform.OS === 'ios' ? 'System' : 'sans-serif-medium'),
  instrumentSansExtraBold: getFontFamily('InstrumentSans-ExtraBold', Platform.OS === 'ios' ? 'System' : 'sans-serif-black'),
  
  // Poppins
  poppinsRegular: getFontFamily('Poppins-Regular', Platform.OS === 'ios' ? 'System' : 'sans-serif'),
  poppinsSemiBold: getFontFamily('Poppins-SemiBold', Platform.OS === 'ios' ? 'System' : 'sans-serif-medium'),
  poppinsBold: getFontFamily('Poppins-Bold', Platform.OS === 'ios' ? 'System' : 'sans-serif-medium'),
} as const;

