# FinTrack UI/UX Design System

This document outlines the complete design specifications for the FinTrack app, following the official UI/UX rules. This system ensures consistency, accessibility, and a premium user experience across the entire application.

---

## 1. Color Palette

### 1.1. Primary Colors
- **Background Color**: `#99D795` (Light Moss Green)
  - Used as the primary background across all screens
  - Creates a fresh, modern, and calming user experience
  - Provides excellent contrast with dark cards and white text

### 1.2. Text Colors
- **Primary Text (on light background)**: `#000000` (Black)
  - Used for headings, titles, and main content
  - Ensures high readability on light green background
- **Secondary Text (on light background)**: `#6B7280` (Gray-500)
  - Used for subtitles, descriptions, and secondary information
- **Text on Dark Cards**: `#FFFFFF` (White)
  - Used for text on black card backgrounds
  - Ensures optimal contrast and readability

### 1.3. Card & Component Colors
- **Card Background**: `#000000` (Black)
  - Used for all card components (account cards, balance cards, etc.)
  - Creates strong contrast against light green background
  - Provides modern, sleek appearance
- **Card Border**: `rgba(255, 255, 255, 0.1)` (Semi-transparent white)
  - Subtle borders for card separation
  - Maintains clean, minimal aesthetic

### 1.4. Accent Colors
- **Success/Positive**: `#10B981` (Emerald-500)
  - Used for positive values, success states, and primary actions
- **Warning**: `#F59E0B` (Amber-500)
  - Used for warnings, pending states, and attention-grabbing elements
- **Error/Danger**: `#EF4444` (Red-500)
  - Used for errors, negative values, and destructive actions
- **Info**: `#3B82F6` (Blue-500)
  - Used for informational elements and secondary actions
- **Purple Accent**: `#8B5CF6` (Violet-500)
  - Used for special features and premium elements

### 1.5. Status Bar
- **Status Bar Background**: `#99D795` (matches app background)
- **Status Bar Style**: `light-content` (white text/icons)

---

## 2. Typography

### 2.1. Font Families
- **Primary Font**: `System Font` (iOS/Android default)
  - Clean, modern, and highly readable
  - Consistent across platforms
  - Excellent for financial data display

### 2.2. Text Styles

#### Headings
- **Page Title** (e.g., "Profile", "Accounts"):
  - Font Size: `28-32px`
  - Font Weight: `Bold (700)`
  - Color: `#000000`
  - Line Height: `1.2`

- **Section Headers**:
  - Font Size: `20-24px`
  - Font Weight: `Semi-bold (600)`
  - Color: `#000000`
  - Line Height: `1.3`

- **Card Titles**:
  - Font Size: `16-18px`
  - Font Weight: `Semi-bold (600)`
  - Color: `#FFFFFF` (on black cards)
  - Line Height: `1.4`

#### Body Text
- **Primary Text**:
  - Font Size: `16px`
  - Font Weight: `Regular (400)`
  - Color: `#000000`
  - Line Height: `1.5`

- **Secondary Text**:
  - Font Size: `14px`
  - Font Weight: `Regular (400)`
  - Color: `#6B7280`
  - Line Height: `1.4`

- **Small Text**:
  - Font Size: `12px`
  - Font Weight: `Regular (400)`
  - Color: `#9CA3AF`
  - Line Height: `1.3`

#### Financial Data
- **Currency Amounts**:
  - Font Size: `18-24px`
  - Font Weight: `Bold (700)`
  - Color: `#FFFFFF` (on black cards)
  - Line Height: `1.2`

- **Large Currency** (e.g., total balance):
  - Font Size: `32-36px`
  - Font Weight: `Bold (700)`
  - Color: `#10B981`
  - Line Height: `1.1`

---

## 3. Layout & Spacing

### 3.1. Screen Structure
- **Safe Area**: Full screen with proper safe area handling
- **Padding**: `20px` horizontal padding for main content
- **Vertical Spacing**: `16-24px` between major sections

### 3.2. Component Spacing
- **Card Padding**: `16-20px` internal padding
- **Button Padding**: `12-16px` vertical, `20-24px` horizontal
- **Input Padding**: `12-16px` all around
- **Icon Spacing**: `8-12px` from adjacent text

### 3.3. Grid System
- **Card Width**: Full width with consistent margins
- **Card Spacing**: `12-16px` vertical spacing between cards
- **Action Buttons**: Centered with `8-12px` spacing between elements

---

## 4. Component Design

### 4.1. Cards
```css
Background: #000000
Border Radius: 12px
Shadow: 
  - shadowColor: #000
  - shadowOffset: { width: 0, height: 4 }
  - shadowOpacity: 0.3
  - shadowRadius: 6
  - elevation: 8
Padding: 16-20px
Margin: 12-16px vertical
```

### 4.2. Buttons
#### Primary Button
```css
Background: #10B981
Text Color: #FFFFFF
Border Radius: 12px
Padding: 16px vertical, 24px horizontal
Font Weight: Semi-bold (600)
```

#### Secondary Button
```css
Background: rgba(255, 255, 255, 0.1)
Text Color: #FFFFFF
Border: 1px solid rgba(255, 255, 255, 0.2)
Border Radius: 12px
Padding: 12px vertical, 20px horizontal
```

### 4.3. Input Fields
```css
Background: rgba(255, 255, 255, 0.1)
Border: 1px solid rgba(255, 255, 255, 0.1)
Border Radius: 12px
Padding: 16px
Text Color: #FFFFFF
Placeholder Color: rgba(255, 255, 255, 0.5)
```

### 4.4. Icons
- **Size**: `20-24px` for standard icons
- **Color**: `#FFFFFF` on black cards, `#000000` on light background
- **Spacing**: `8-12px` from adjacent text
- **Style**: Outlined icons for consistency

---

## 5. Navigation & Interaction

### 5.1. Tab Bar
```css
Background: #000000
Border Top: 1px solid rgba(255, 255, 255, 0.1)
Height: 70px
Padding: 12px bottom, 20px horizontal
Active Color: #10B981
Inactive Color: #9CA3AF
```

### 5.2. Headers
- **Height**: `60-80px` including safe area
- **Background**: Transparent (shows gradient background)
- **Title**: Left-aligned, bold, black text
- **Actions**: Right-aligned icons/buttons

### 5.3. Scroll Views
- **Background**: Transparent (shows gradient)
- **Content Padding**: `20px` horizontal, `16-24px` vertical
- **Scroll Indicators**: Hidden for clean appearance

---

## 6. Visual Hierarchy

### 6.1. Information Priority
1. **Primary**: Total balance, main account info
2. **Secondary**: Individual account balances
3. **Tertiary**: Transaction details, settings

### 6.2. Visual Weight
- **Heavy**: Large currency amounts, primary actions
- **Medium**: Account names, section headers
- **Light**: Descriptions, secondary information

### 6.3. Color Usage
- **Green**: Positive values, success states, primary actions
- **Red**: Negative values, errors, warnings
- **Blue**: Information, secondary actions
- **Gray**: Secondary text, disabled states

---

## 7. Responsive Design

### 7.1. Screen Sizes
- **Small Screens**: Maintain 20px horizontal padding
- **Large Screens**: Maximum content width with centered layout
- **Tablets**: Consider two-column layout for cards

### 7.2. Touch Targets
- **Minimum Size**: 44px x 44px for all interactive elements
- **Button Height**: Minimum 48px for primary actions
- **Icon Size**: Minimum 24px for touch targets

---

## 8. Accessibility

### 8.1. Color Contrast
- **Text on Light Background**: Minimum 4.5:1 contrast ratio
- **Text on Dark Background**: Minimum 4.5:1 contrast ratio
- **Interactive Elements**: Clear visual feedback

### 8.2. Text Readability
- **Minimum Font Size**: 14px for body text
- **Line Height**: 1.4-1.5 for optimal readability
- **Font Weight**: Semi-bold (600) for important information

---

## 9. Animation & Transitions

### 9.1. Screen Transitions
- **Duration**: 300ms for screen transitions
- **Easing**: Ease-in-out for natural feel
- **Direction**: Slide from right for forward navigation

### 9.2. Component Animations
- **Button Press**: Scale down 0.95 for feedback
- **Card Interactions**: Subtle shadow changes
- **Loading States**: Smooth opacity transitions

---

## 10. Implementation Notes

### 10.1. React Native Specifics
- Use `StyleSheet.create()` for all styles
- Implement proper safe area handling
- Use `LinearGradient` for background gradients
- Apply consistent shadow properties

### 10.2. Performance Considerations
- Optimize gradient rendering
- Use appropriate image sizes
- Implement proper list virtualization for large datasets
- Cache frequently used styles

---

## 11. Design Tokens

### 11.1. Spacing Scale
```javascript
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32
};
```

### 11.2. Border Radius Scale
```javascript
const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999
};
```

### 11.3. Shadow Presets
```javascript
const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8
  }
};
```

---

This design system ensures consistency, accessibility, and a premium user experience across the entire FinTrack application.
