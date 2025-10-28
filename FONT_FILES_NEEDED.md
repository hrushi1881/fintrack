# Font Files Setup Guide

## 🚨 Current Status: Using System Fonts

The app is currently using **system fonts** as fallbacks because the custom font files are not yet available. The app will work perfectly with system fonts, but you can add custom fonts later for the exact design system.

## 📁 Required Font Files

To use the custom fonts, you need to add these files to `assets/fonts/`:

```
assets/fonts/
├── ArchivoBlack-Regular.ttf
├── PlusJakartaSans-Bold.ttf
├── IBMPlexSansJP-Regular.ttf
└── InstrumentSerif-Italic.ttf
```

## 🔧 How to Add Custom Fonts

### Step 1: Download Font Files
Download the fonts from these sources:
- **Archivo Black**: [Google Fonts](https://fonts.google.com/specimen/Archivo+Black)
- **Plus Jakarta Sans**: [Google Fonts](https://fonts.google.com/specimen/Plus+Jakarta+Sans)
- **IBM Plex Sans JP**: [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Sans+JP)
- **Instrument Serif**: [Google Fonts](https://fonts.google.com/specimen/Instrument+Serif)

### Step 2: Place Font Files
1. Create the `assets/fonts/` directory if it doesn't exist
2. Copy the font files to `assets/fonts/`
3. Ensure the exact filenames match:
   - `ArchivoBlack-Regular.ttf`
   - `PlusJakartaSans-Bold.ttf`
   - `IBMPlexSansJP-Regular.ttf`
   - `InstrumentSerif-Italic.ttf`

### Step 3: Enable Custom Fonts
Once you have the font files, update `hooks/useFonts.ts`:

```typescript
import { useFonts } from 'expo-font';

export const useCustomFonts = () => {
  const [loaded] = useFonts({
    'ArchivoBlack-Regular': require('../assets/fonts/ArchivoBlack-Regular.ttf'),
    'PlusJakartaSans-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'IBMPlexSansJP-Regular': require('../assets/fonts/IBMPlexSansJP-Regular.ttf'),
    'InstrumentSerif-Italic': require('../assets/fonts/InstrumentSerif-Italic.ttf'),
  });

  return loaded;
};
```

### Step 4: Update Theme
Update `theme.ts` to use the custom fonts:

```typescript
// Page Titles (Archivo Black)
h1: {
  fontFamily: 'ArchivoBlack-Regular',
  fontSize: 32,
  fontWeight: '900',
  color: '#000000',
  lineHeight: 38,
},

// Section Headers (Plus Jakarta Sans)
h2: {
  fontFamily: 'PlusJakartaSans-Bold',
  fontSize: 24,
  fontWeight: '700',
  color: '#000000',
  lineHeight: 30,
},

// Body Text (IBM Plex Sans JP)
body: {
  fontFamily: 'IBMPlexSansJP-Regular',
  fontSize: 16,
  fontWeight: '400',
  color: '#000000',
  lineHeight: 24,
},

// Crazy Text (Instrument Serif)
crazyText: {
  fontFamily: 'InstrumentSerif-Italic',
  fontSize: 16,
  fontStyle: 'italic',
  color: '#000000',
  lineHeight: 22,
},
```

## 🎯 Current System Fonts

The app currently uses these system fonts:

### iOS
- **System Font**: San Francisco (SF Pro)
- **Fallback**: System default

### Android
- **Roboto**: Material Design font
- **Fallback**: System default

## ✅ Benefits of Current Setup

### **Immediate Functionality**
- ✅ App works without font files
- ✅ No build errors
- ✅ Consistent typography
- ✅ Cross-platform compatibility

### **Professional Appearance**
- ✅ Clean, modern fonts
- ✅ Proper font weights
- ✅ Good readability
- ✅ Material Design compliance

## 🚀 Ready to Use

The app is **fully functional** with system fonts and will look great! You can:

1. **Start Development**: The app works perfectly now
2. **Add Custom Fonts Later**: When you have the font files
3. **Maintain Design System**: All typography scales work correctly

## 📱 Testing

Test the app with system fonts:
```bash
expo start
```

The typography will look clean and professional with system fonts, and you can add custom fonts later for the exact design system.

## 🎨 Design System

Even with system fonts, the design system provides:
- **Consistent Typography**: All text follows the design system
- **Proper Scaling**: Font sizes and weights are correct
- **Color System**: Full color palette available
- **Component System**: Themed components work perfectly

The app is ready for development! 🚀✨
