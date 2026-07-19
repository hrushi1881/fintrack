# Liquid Effect Component Usage Guide

## Overview

The Liquid Effect component provides a beautiful animated liquid background effect for React Native, inspired by Three.js liquid animations but built with native React Native animations for optimal performance.

## Components

### 1. `LiquidEffect` (Base Component)
The core liquid effect component with all animation controls.

### 2. `LiquidEffectBackground` (Wrapper Component)
A convenient wrapper for full-screen backgrounds.

## Installation

The component uses existing Expo dependencies:
- `expo-linear-gradient` ✅ (already installed)
- `expo-blur` ✅ (already installed)
- `react-native` Animated API ✅ (built-in)

No additional installation required!

## Basic Usage

### As a Background

```tsx
import LiquidEffectBackground from '@/components/LiquidEffectBackground';

export default function MyScreen() {
  return (
    <LiquidEffectBackground>
      <View>
        <Text>Your content here</Text>
      </View>
    </LiquidEffectBackground>
  );
}
```

### Custom Configuration

```tsx
import LiquidEffectBackground from '@/components/LiquidEffectBackground';

export default function MyScreen() {
  return (
    <LiquidEffectBackground
      colors={['#667eea', '#764ba2', '#f093fb']}
      metalness={0.8}
      roughness={0.2}
      displacementScale={7}
      rain={false}
    >
      <View>
        <Text>Custom liquid effect</Text>
      </View>
    </LiquidEffectBackground>
  );
}
```

### Direct Component Usage

```tsx
import { LiquidEffect } from '@/components/LiquidEffect';

export default function MyComponent() {
  return (
    <View style={{ flex: 1 }}>
      <LiquidEffect
        colors={['#667eea', '#764ba2']}
        metalness={0.75}
        roughness={0.25}
        displacementScale={5}
        opacity={0.9}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ zIndex: 10 }}>
        <Text>Content on top</Text>
      </View>
    </View>
  );
}
```

## Props

### LiquidEffect Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `imageUrl` | `string?` | `undefined` | Background image URL (not yet implemented) |
| `metalness` | `number` | `0.75` | Metalness effect intensity (0-1) |
| `roughness` | `number` | `0.25` | Roughness effect intensity (0-1) |
| `displacementScale` | `number` | `5` | Wave displacement scale (1-10) |
| `rain` | `boolean` | `false` | Enable rain effect |
| `colors` | `string[]?` | Default gradient | Custom colors for liquid effect |
| `opacity` | `number` | `1` | Overall opacity (0-1) |
| `style` | `ViewStyle?` | `undefined` | Style override |
| `children` | `React.ReactNode?` | `undefined` | Children to render on top |

### LiquidEffectBackground Props

Same as `LiquidEffect` except it's a wrapper component that handles full-screen layout.

## Color Presets

### Ocean
```tsx
colors={['#667eea', '#764ba2', '#4facfe', '#00f2fe']}
```

### Sunset
```tsx
colors={['#f093fb', '#f5576c', '#ff9a9e', '#fecfef']}
```

### Forest
```tsx
colors={['#11998e', '#38ef7d', '#56ab2f', '#a8e063']}
```

### Purple Dream
```tsx
colors={['#667eea', '#764ba2', '#f093fb', '#4facfe']}
```

## Use Cases

### 1. Hero Sections
Perfect for hero sections with large text or CTAs:

```tsx
<LiquidEffectBackground colors={['#667eea', '#764ba2']}>
  <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
    <Text style={{ fontSize: 48, color: '#FFFFFF', fontWeight: 'bold' }}>
      Welcome
    </Text>
  </View>
</LiquidEffectBackground>
```

### 2. Modal Backgrounds
Use as a backdrop for modals:

```tsx
<Modal visible={visible}>
  <LiquidEffectBackground opacity={0.9}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <LiquidGlassCard>
        <Text>Modal Content</Text>
      </LiquidGlassCard>
    </View>
  </LiquidEffectBackground>
</Modal>
```

### 3. Splash Screens
Great for app splash screens:

```tsx
<LiquidEffectBackground
  colors={['#667eea', '#764ba2']}
  metalness={0.8}
  displacementScale={8}
>
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ fontSize: 32, color: '#FFFFFF' }}>FinTrack</Text>
  </View>
</LiquidEffectBackground>
```

### 4. Background for Cards
Use as a subtle background behind cards:

```tsx
<View style={{ flex: 1 }}>
  <LiquidEffect opacity={0.3} style={StyleSheet.absoluteFill} />
  <ScrollView>
    <LiquidGlassCard>Card 1</LiquidGlassCard>
    <LiquidGlassCard>Card 2</LiquidGlassCard>
  </ScrollView>
</View>
```

## Performance Tips

1. **Use opacity for subtle effects**: Lower opacity (0.3-0.5) for backgrounds behind content
2. **Disable rain for better performance**: Rain effect adds extra animations
3. **Limit displacement scale**: Higher values (8-10) are more intensive
4. **Use on key screens**: Best for hero sections, splash screens, or special moments

## Demo Screen

A full demo screen is available at:
- Route: `/demo-liquid-effect`
- File: `app/demo-liquid-effect.tsx`

The demo includes:
- Interactive controls for all parameters
- Color preset selection
- Real-time preview
- Usage examples

## Technical Details

### Animation Layers
The component uses 4 independent wave layers:
- **Wave 1**: Slow, large waves (8s cycle)
- **Wave 2**: Medium speed waves (6s cycle)
- **Wave 3**: Fast waves (4s cycle)
- **Wave 4**: Very slow, deep waves (12s cycle)

### Effects
- **Blur Overlay**: Uses `expo-blur` for glass effect
- **Metallic Shine**: Gradient overlay for metalness
- **Scale Pulse**: Breathing effect for depth
- **Rotation**: Slow rotation for 3D feel

### Performance
- All animations use `useNativeDriver: true` where possible
- Optimized for 60fps on modern devices
- Minimal memory footprint

## Examples in Codebase

See these files for reference:
- `components/LiquidEffect.tsx` - Core component
- `components/LiquidEffectBackground.tsx` - Wrapper component
- `app/demo-liquid-effect.tsx` - Full demo with controls

## Notes

- The component is fully React Native compatible (no web dependencies)
- Works on iOS, Android, and Web (via Expo)
- Smooth animations using native drivers
- Customizable via props for different use cases
