# Development Build Setup

## Issue: Expo Go Compatibility

Your app uses **Expo SDK 54** which may not be available in Expo Go yet. Since you have `expo-dev-client` installed, you should use a **development build** instead.

## Solution: Use Development Build

### Option 1: Build Development Client Locally (Recommended for Testing)

```bash
# Build for iOS (requires macOS)
npx eas build --platform ios --profile development --local

# Build for Android
npx eas build --platform android --profile development --local
```

### Option 2: Use EAS Build (Cloud)

```bash
# Build for iOS
npx eas build --platform ios --profile development

# Build for Android  
npx eas build --platform android --profile development
```

### Option 3: Run on Simulator/Emulator (Fastest for Development)

```bash
# iOS Simulator (macOS only)
npx expo run:ios

# Android Emulator
npx expo run:android
```

## After Building Development Client

1. Install the development build on your device/simulator
2. Start the development server:
   ```bash
   npx expo start --dev-client
   ```
3. The app will connect to your development server automatically

## Why Not Expo Go?

- Expo Go only supports stable SDK versions
- SDK 54 is very new and may not be in Expo Go yet
- Development builds give you full control and support all native modules
- Better for production apps

## Quick Start Commands

```bash
# Start development server with dev client
npx expo start --dev-client

# Or run directly on simulator/emulator
npx expo run:ios      # iOS
npx expo run:android  # Android
```

## Troubleshooting

If you still see Expo Go errors:
1. Make sure you're using `--dev-client` flag
2. Ensure development build is installed on device
3. Check that `expo-dev-client` is in dependencies
