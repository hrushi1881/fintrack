# Custom Font Setup for FinTrack

This guide explains how to set up and use the custom fonts in your FinTrack app.

## 📁 Font Files Required

Place the following font files in `assets/fonts/` directory:

```
assets/
└── fonts/
    ├── ArchivoBlack-Regular.ttf
    ├── PlusJakartaSans-Bold.ttf
    ├── IBMPlexSansJP-Regular.ttf
    └── InstrumentSerif-Italic.ttf
```

## 🎨 Font Usage

### 1. Archivo Black (Page Titles)
```tsx
import { Heading1 } from '@/components/ThemedText';

<Heading1>Profile</Heading1>
```

### 2. Plus Jakarta Sans (Section Headers)
```tsx
import { Heading2, Heading3 } from '@/components/ThemedText';

<Heading2>Your Accounts</Heading2>
<Heading3>Recent Transactions</Heading3>
```

### 3. IBM Plex Sans JP (Body Text & Cards)
```tsx
import { BodyText, CardTitle, CurrencyText } from '@/components/ThemedText';

<BodyText>Welcome back, Hrushi</BodyText>
<CardTitle>HDFC Card</CardTitle>
<CurrencyText>$10,000</CurrencyText>
```

### 4. Instrument Serif (Special Text)
```tsx
import { CrazyText } from '@/components/ThemedText';

<CrazyText>Welcome, Completed, Successful</CrazyText>
```

## 🛠 Implementation

### 1. Theme System
The theme system is already set up in `theme.ts` with all font configurations:

```typescript
import { theme } from '@/theme';

// Use theme typography
const styles = StyleSheet.create({
  title: theme.typography.h1,
  subtitle: theme.typography.h2,
  body: theme.typography.body,
});
```

### 2. Themed Components
Use the pre-built themed components:

```tsx
import ThemedText from '@/components/ThemedText';
import ThemedCard from '@/components/ThemedCard';
import ThemedButton from '@/components/ThemedButton';

// Text with custom variant
<ThemedText variant="h1">Profile</ThemedText>

// Card with theme styling
<ThemedCard>
  <ThemedText variant="cardTitle">Account Name</ThemedText>
</ThemedCard>

// Button with theme styling
<ThemedButton title="Sign In" variant="primary" />
```

### 3. Custom Styling
For custom styling, use the theme values:

```tsx
import { theme } from '@/theme';

const customStyles = StyleSheet.create({
  customText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontSize: 18,
  },
  customCard: {
    ...theme.components.card,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
  },
});
```

## 🎯 Design System Integration

### Color Palette
```typescript
theme.colors = {
  background: '#99D795',      // Light moss green
  primary: '#10B981',         // Emerald green
  cardBackground: '#000000',  // Black cards
  textPrimary: '#000000',     // Black text
  textOnDark: '#FFFFFF',      // White text on dark
}
```

### Typography Scale
```typescript
theme.typography = {
  h1: { fontFamily: 'ArchivoBlack-Regular', fontSize: 32 },
  h2: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 24 },
  h3: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 20 },
  body: { fontFamily: 'IBMPlexSansJP-Regular', fontSize: 16 },
  cardTitle: { fontFamily: 'IBMPlexSansJP-Regular', fontSize: 18 },
  currency: { fontFamily: 'IBMPlexSansJP-Regular', fontSize: 20 },
  crazyText: { fontFamily: 'InstrumentSerif-Italic', fontSize: 16 },
}
```

### Spacing System
```typescript
theme.spacing = {
  xs: 4,    // 4px
  sm: 8,    // 8px
  md: 12,   // 12px
  lg: 16,   // 16px
  xl: 20,   // 20px
  xxl: 24,  // 24px
  xxxl: 32, // 32px
}
```

## 🚀 Getting Started

1. **Add Font Files**: Place the font files in `assets/fonts/`
2. **Import Theme**: Use `import { theme } from '@/theme'`
3. **Use Components**: Import and use themed components
4. **Custom Styling**: Apply theme values to custom styles

## 📱 Example Implementation

```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heading1, BodyText, CardTitle, CurrencyText } from '@/components/ThemedText';
import ThemedCard from '@/components/ThemedCard';
import { theme } from '@/theme';

export default function ProfileScreen() {
  return (
    <LinearGradient colors={[theme.colors.background]} style={styles.container}>
      <Heading1>Profile</Heading1>
      <BodyText>Welcome back, Hrushi</BodyText>
      
      <ThemedCard>
        <CardTitle>HDFC Card</CardTitle>
        <CurrencyText>$10,000</CurrencyText>
      </ThemedCard>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.xl,
  },
});
```

## ✅ Benefits

- **Consistent Typography**: All text follows the design system
- **Easy Maintenance**: Change fonts globally from theme.ts
- **Type Safety**: TypeScript support for all theme values
- **Performance**: Optimized font loading with expo-font
- **Accessibility**: Proper font sizes and contrast ratios

This setup ensures your FinTrack app has a professional, consistent, and beautiful typography system! 🎨✨
