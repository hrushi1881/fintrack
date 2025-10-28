import { Platform, ViewStyle, TextStyle, ImageStyle } from 'react-native';

// Background Mode Constants
export const BACKGROUND_MODES = {
  MOSS_GREEN: 'MOSS_GREEN',
  IOS_GRADIENT: 'IOS_GRADIENT',
} as const;

export type BackgroundMode = typeof BACKGROUND_MODES[keyof typeof BACKGROUND_MODES];

// Type definitions for better TypeScript support
export interface ThemeColors {
  background: string;
  cardBackground: string;
  glassBackground: string;
  glassBorder: string;
  glassOverlay: string;
  glassTint: string;
  iosGradient: {
    default: string[];
    purple: string[];
    blue: string[];
    green: string[];
    orange: string[];
  };
  textPrimary: string;
  textSecondary: string;
  textOnDark: string;
  textOnGlass: string;
  accent: string;
  success: string;
  warning: string;
  statusBar: string;
}

export interface ThemeTypography {
  h1: TextStyle;
  h2: TextStyle;
  h3: TextStyle;
  cardTitle: TextStyle;
  body: TextStyle;
  bodySecondary: TextStyle;
  currency: TextStyle;
  currencyLarge: TextStyle;
  caption: TextStyle;
  crazyText: TextStyle;
  glassTitle: TextStyle;
  glassBody: TextStyle;
  glassCaption: TextStyle;
}

export interface ThemeSpacing {
  screenPadding: number;
  elementGap: number;
  sectionGap: number;
  cardMargin: number;
  cardPadding: number;
}

export interface ThemeBorderRadius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

export interface ThemeShadows {
  default: ViewStyle;
}

export interface ThemeComponents {
  glassCard: ViewStyle;
  card: ViewStyle;
  button: {
    primary: ViewStyle;
    secondary: ViewStyle;
    glass: ViewStyle;
  };
  input: TextStyle;
  glassInput: TextStyle;
}

export interface ThemeBlurIntensity {
  light: number;
  medium: number;
  strong: number;
}

export const theme = {
  colors: {
    // App Foundation
    background: '#99D795', // Light Moss Green - global app background
    cardBackground: '#121212', // Wallet, Bank, and Card containers
    
    // iOS Glassmorphism Colors - Enhanced for better blur effects
    glassBackground: 'rgba(255, 255, 255, 0.08)',
    glassBorder: 'rgba(255, 255, 255, 0.25)',
    glassOverlay: 'rgba(255, 255, 255, 0.05)',
    glassTint: 'rgba(255, 255, 255, 0.02)',
    
    // iOS Gradient Colors
    iosGradient: {
      default: ['#667eea', '#764ba2'],
      purple: ['#8B5CF6', '#EC4899'],
      blue: ['#3B82F6', '#1E40AF'],
      green: ['#10B981', '#059669'],
      orange: ['#F59E0B', '#D97706'],
    },
    
    // Text Colors
    textPrimary: '#000000', // Headings, major labels
    textSecondary: 'rgba(0,0,0,0.7)', // Sub-labels, smaller text
    textOnDark: '#FFFFFF', // Text/icons on dark backgrounds
    textOnGlass: '#FFFFFF', // Text on glassmorphed surfaces
    
    // Accent Colors
    accent: '#FF6B35', // Buttons, highlights, and active states
    success: '#00B37E', // Transaction success, confirmation text
    warning: '#F5A623', // Alerts, low-balance warnings
    
    // Status Bar
    statusBar: '#99D795',
  } as ThemeColors,
  
  typography: {
    // Page Headings (System fonts - 28-32px)
    h1: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 32,
      fontWeight: '900',
      color: '#000000',
      lineHeight: 38,
      letterSpacing: -0.5,
    },
    
    // Section Headers (System fonts - 22-24px)
    h2: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 24,
      fontWeight: '600',
      color: '#000000',
      lineHeight: 30,
      letterSpacing: -0.3,
    },
    
    h3: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 20,
      fontWeight: '600',
      color: '#000000',
      lineHeight: 26,
      letterSpacing: -0.2,
    },
    
    // Card Titles (System fonts - 18px - white)
    cardTitle: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 18,
      fontWeight: '600',
      color: '#FFFFFF',
      lineHeight: 24,
      letterSpacing: -0.1,
    },
    
    // Body Text (System fonts - 15-17px)
    body: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 16,
      fontWeight: '400',
      color: '#000000',
      lineHeight: 24,
      letterSpacing: 0,
    },
    
    bodySecondary: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 14,
      fontWeight: '400',
      color: 'rgba(0,0,0,0.7)',
      lineHeight: 20,
      letterSpacing: 0.1,
    },
    
    // Financial Data (System fonts - 16px - white - bold)
    currency: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
      lineHeight: 22,
      letterSpacing: 0.2,
    },
    
    currencyLarge: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 24,
      fontWeight: '700',
      color: '#00B37E',
      lineHeight: 30,
      letterSpacing: 0.3,
    },
    
    // Small Text
    caption: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 12,
      fontWeight: '400',
      color: 'rgba(0,0,0,0.5)',
      lineHeight: 16,
      letterSpacing: 0.2,
    },
    
    // Crazy Text (System fonts - 18-20px italic)
    crazyText: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'serif',
      fontSize: 20,
      fontStyle: 'italic',
      color: '#000000',
      lineHeight: 26,
      letterSpacing: 0.1,
    },
    
    // Glassmorphism Text Styles
    glassTitle: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 18,
      fontWeight: '600',
      color: '#FFFFFF',
      lineHeight: 24,
      letterSpacing: -0.1,
    },
    
    glassBody: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 14,
      fontWeight: '400',
      color: 'rgba(255, 255, 255, 0.9)',
      lineHeight: 20,
      letterSpacing: 0.1,
    },
    
    glassCaption: {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontSize: 12,
      fontWeight: '400',
      color: 'rgba(255, 255, 255, 0.7)',
      lineHeight: 16,
      letterSpacing: 0.2,
    },
  } as ThemeTypography,
  
  spacing: {
    // Global Spacing System
    screenPadding: 20, // Screen padding: 20px
    elementGap: 10, // Element gap (same section): 10px
    sectionGap: 24, // Section gap: 24px
    cardMargin: 10, // Vertical margin between cards: 10px
    cardPadding: 12, // Card padding: 12px
  } as ThemeSpacing,
  
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 999,
  } as ThemeBorderRadius,
  
  shadows: {
    // Consistent Shadow Rule
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
  } as ThemeShadows,
  
  // Component Styles
  components: {
    // Glassmorphism Card Components - Enhanced for better blur
    glassCard: {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      borderRadius: 20,
      padding: 16,
      marginVertical: 10,
      marginHorizontal: 20,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.25)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 6,
    },
    
    // Legacy Card Components (Accounts)
    card: {
      backgroundColor: '#121212', // Card Background
      borderRadius: 16, // Corner radius: 16px
      padding: 12, // Padding: 12px
      marginVertical: 10, // Vertical margin between cards: 10px
      marginHorizontal: 20, // Total horizontal margin from edges: 20px
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
    
    button: {
      primary: {
        backgroundColor: '#FF6B35', // Accent color for buttons
        borderRadius: 16, // Rounded corners
        paddingVertical: 16,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
      },
      secondary: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      glass: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 20,
        paddingVertical: 16,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
      },
    },
    
    input: {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      color: '#FFFFFF',
      fontSize: 16,
    },
    
    glassInput: {
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      color: '#FFFFFF',
      fontSize: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
  } as ThemeComponents,
  
  // Glassmorphism Blur Intensities
  blurIntensity: {
    light: 10,
    medium: 20,
    strong: 30,
  } as ThemeBlurIntensity,
};
