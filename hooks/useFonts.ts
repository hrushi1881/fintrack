import { useEffect, useState } from 'react';
import * as Font from 'expo-font';
import {
  useFonts as useGoogleFonts,
  Archivo_400Regular,
  Archivo_700Bold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import {
  InstrumentSerif_400Regular,
} from '@expo-google-fonts/instrument-serif';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

/**
 * Font loading status tracking
 */
interface FontLoadingStatus {
  fontName: string;
  loaded: boolean;
  error: Error | null;
}

/**
 * Font map - defined outside component to avoid recreation on each render
 */
const FONT_MAP = {
  // Archivo Black for page headings (using Archivo 900Black weight)
  'Archivo Black': Archivo_900Black,
  // Archivo Bold for app name and headings (using Archivo 700Bold weight)
  'Archivo Bold': Archivo_700Bold,
  // Alias for HelveticaNeue-Bold (not bundled on Android) → use Archivo Bold instead
  'HelveticaNeue-Bold': Archivo_700Bold,
  // Optional dashed variant if referenced
  'Archivo-Bold': Archivo_700Bold,
  
  // Instrument Serif for body text
  'InstrumentSerif-Regular': InstrumentSerif_400Regular,
  // Note: Instrument Serif only has Regular (400) weight available from @expo-google-fonts/instrument-serif
  // Using Regular for Bold mappings - components can use fontWeight if needed
  'InstrumentSerif-Bold': InstrumentSerif_400Regular,
  
  // Instrument Sans for all numbers
  'InstrumentSans-Regular': InstrumentSans_400Regular,
  'InstrumentSans-Medium': InstrumentSans_500Medium,
  'InstrumentSans-SemiBold': InstrumentSans_600SemiBold,
  'InstrumentSans-Bold': InstrumentSans_700Bold, // For regular numbers
  // Note: Instrument Sans only has up to Bold (700) weight available from @expo-google-fonts/instrument-sans
  // Using Bold (700) for ExtraBold mappings - this is the heaviest weight available
  'InstrumentSans-ExtraBold': InstrumentSans_700Bold, // For dashboard numbers (using Bold as fallback)
  
  // Poppins for UI elements
  'Poppins-Regular': Poppins_400Regular,
  'Poppins-SemiBold': Poppins_600SemiBold,
  'Poppins-Bold': Poppins_700Bold,
} as const;

/**
 * Custom font loader hook using @expo-google-fonts
 * 
 * This hook loads custom fonts from Google Fonts using Expo's font system.
 * Fonts will be automatically downloaded and cached by Expo.
 * 
 * Enhanced with individual font tracking to identify failing fonts.
 */
export const useCustomFonts = () => {

  // Track individual font loading status
  const [fontStatuses, setFontStatuses] = useState<Record<string, FontLoadingStatus>>({});
  
  // Use the standard useGoogleFonts hook
  const [fontsLoaded, fontError] = useGoogleFonts(FONT_MAP);

  // Individual font loading verification
  useEffect(() => {
    if (fontsLoaded) {
      // Verify each font individually
      const verifyFonts = async () => {
        const statuses: Record<string, FontLoadingStatus> = {};
        
        for (const [fontName, fontSource] of Object.entries(FONT_MAP)) {
          try {
            // Try to load the font individually to verify it works
            await Font.loadAsync({ [fontName]: fontSource });
            statuses[fontName] = {
              fontName,
              loaded: true,
              error: null,
            };
            if (__DEV__) {
              console.log(`✅ Font verified: ${fontName}`);
            }
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            statuses[fontName] = {
              fontName,
              loaded: false,
              error: err,
            };
            console.error(`❌ Font failed to load: ${fontName}`, err);
          }
        }
        
        setFontStatuses(statuses);
        
        // Log summary
        const failedFonts = Object.values(statuses).filter(s => !s.loaded);
        if (failedFonts.length > 0) {
          console.error('═══════════════════════════════════════════════════');
          console.error(`❌ ${failedFonts.length} font(s) failed to load:`);
          failedFonts.forEach(({ fontName, error }) => {
            console.error(`  - ${fontName}: ${error?.message || 'Unknown error'}`);
          });
          console.error('═══════════════════════════════════════════════════');
        } else {
          console.log('✅ All fonts verified successfully');
        }
      };
      
      verifyFonts();
    }
  }, [fontsLoaded]);

  // Enhanced error logging - log full error details
  if (fontError) {
    console.error('═══════════════════════════════════════════════════');
    console.error('❌ FONT LOADING ERROR DETECTED');
    console.error('═══════════════════════════════════════════════════');
    console.error('Error Type:', typeof fontError);
    console.error('Error Object:', fontError);
    console.error('Error String:', String(fontError));
    
    // Try to extract more details from the error
    if (fontError && typeof fontError === 'object') {
      console.error('Error Keys:', Object.keys(fontError));
      console.error('Error Message:', (fontError as any)?.message || 'No message');
      console.error('Error Stack:', (fontError as any)?.stack || 'No stack');
      console.error('Error Name:', (fontError as any)?.name || 'No name');
      
      // Check if error has font-specific information
      if ((fontError as any)?.fontName) {
        console.error('Failed Font Name:', (fontError as any).fontName);
      }
      if ((fontError as any)?.fontFamily) {
        console.error('Failed Font Family:', (fontError as any).fontFamily);
      }
    }
    
    console.error('═══════════════════════════════════════════════════');
    console.error('Failed to load fonts. App will use system fonts as fallback.');
    console.error('═══════════════════════════════════════════════════');
  }

  // Log font loading status for debugging
  if (__DEV__) {
    if (fontsLoaded) {
      const failedCount = Object.values(fontStatuses).filter(s => !s.loaded).length;
      if (failedCount === 0) {
        console.log('✅ All custom fonts loaded successfully');
      } else {
        console.log(`⚠️ ${failedCount} font(s) failed to load (see details above)`);
      }
    } else if (fontError) {
      console.log('❌ Fonts failed to load - check error details above');
    } else {
      console.log('⏳ Fonts are still loading...');
    }
  }

  // Return the actual loading state
  // This allows components to wait for fonts if needed
  // But we won't block the entire app - components can render with fallback fonts
  return fontsLoaded;
};
