import { TextStyle, ViewStyle } from 'react-native';
import { theme } from '@/theme';

// Utility function to convert theme styles to StyleSheet-compatible styles
export const createTextStyle = (style: any): TextStyle => {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    color: style.color,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    fontStyle: style.fontStyle,
  };
};

export const createViewStyle = (style: any): ViewStyle => {
  return {
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    padding: style.padding,
    marginVertical: style.marginVertical,
    marginHorizontal: style.marginHorizontal,
    borderWidth: style.borderWidth,
    borderColor: style.borderColor,
    shadowColor: style.shadowColor,
    shadowOffset: style.shadowOffset,
    shadowOpacity: style.shadowOpacity,
    shadowRadius: style.shadowRadius,
    elevation: style.elevation,
  };
};

// Pre-computed StyleSheet-compatible styles
export const textStyles = {
  h1: createTextStyle(theme.typography.h1),
  h2: createTextStyle(theme.typography.h2),
  h3: createTextStyle(theme.typography.h3),
  cardTitle: createTextStyle(theme.typography.cardTitle),
  body: createTextStyle(theme.typography.body),
  bodySecondary: createTextStyle(theme.typography.bodySecondary),
  currency: createTextStyle(theme.typography.currency),
  currencyLarge: createTextStyle(theme.typography.currencyLarge),
  caption: createTextStyle(theme.typography.caption),
  crazyText: createTextStyle(theme.typography.crazyText),
  glassTitle: createTextStyle(theme.typography.glassTitle),
  glassBody: createTextStyle(theme.typography.glassBody),
  glassCaption: createTextStyle(theme.typography.glassCaption),
};

export const viewStyles = {
  glassCard: createViewStyle(theme.components.glassCard),
  card: createViewStyle(theme.components.card),
  buttonPrimary: createViewStyle(theme.components.button.primary),
  buttonSecondary: createViewStyle(theme.components.button.secondary),
  buttonGlass: createViewStyle(theme.components.button.glass),
};

