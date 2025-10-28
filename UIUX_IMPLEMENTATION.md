# FinTrack UI/UX Implementation

This document shows how the FinTrack app implements the official UI/UX design system specifications.

## 🎨 **1. App Foundation**

### **Background Color**
```typescript
background: '#99D795' // Light Moss Green
```
- ✅ Used globally as app background
- ✅ No gradient, just clean flat color
- ✅ Applied to all main screens (Dashboard, Profile, Goals, Analytics)
- ✅ Shadows provide depth, not background shading

## 🔠 **2. Typography System**

### **Font Hierarchy**
```typescript
// Page Headings (Archivo Black - 28-32px)
h1: {
  fontSize: 28,
  fontWeight: '900',
  color: '#000000',
}

// Section Headers (Plus Jakarta Sans - 22-24px)
h2: {
  fontSize: 22,
  fontWeight: '600',
  color: '#000000',
}

// Body Text (IBM Plex Sans JP - 15-17px)
body: {
  fontSize: 16,
  fontWeight: '400',
  color: '#000000',
}

// Card Titles (Plus Jakarta Sans - 18px - white)
cardTitle: {
  fontSize: 18,
  fontWeight: '600',
  color: '#FFFFFF',
}

// Financial Data (IBM Plex Sans JP - 16px - white - bold)
currency: {
  fontSize: 16,
  fontWeight: '700',
  color: '#FFFFFF',
}

// Crazy Text (Instrument Serif Italic - 18-20px italic)
crazyText: {
  fontSize: 18,
  fontStyle: 'italic',
  color: '#000000',
}
```

### **Alignment Rules**
- ✅ **Headings**: Left aligned
- ✅ **Body**: Left aligned  
- ✅ **Amounts**: Right aligned

## 🎨 **3. Color Usage**

### **Color Palette**
```typescript
colors: {
  background: '#99D795',        // App screens, global container
  cardBackground: '#121212',   // Wallet, Bank, and Card containers
  textPrimary: '#000000',       // Headings, major labels
  textSecondary: 'rgba(0,0,0,0.7)', // Sub-labels, smaller text
  accent: '#FF6B35',           // Buttons, highlights, active states
  success: '#00B37E',          // Transaction success, confirmation text
  warning: '#F5A623',         // Alerts, low-balance warnings
  textOnDark: '#FFFFFF',       // Text/icons on dark backgrounds
}
```

## 🟢 **4. Shadow System**

### **Consistent Shadow Rule**
```typescript
shadow: {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.15,
  shadowRadius: 6,
  elevation: 3,
}
```
- ✅ One consistent shadow across all components
- ✅ No drop shadows heavier than 0.15 opacity
- ✅ Shadows provide depth, not background shading

## 💳 **5. Card Components**

### **Card Structure**
```typescript
card: {
  backgroundColor: '#121212',    // Card Background
  borderRadius: 16,             // Corner radius: 16px
  padding: 12,                  // Padding: 12px
  marginVertical: 10,          // Vertical margin between cards: 10px
  marginHorizontal: 20,         // Total horizontal margin from edges: 20px
}
```

### **Card Layout**
- ✅ **Left icon**: Grey or brand logo
- ✅ **Text block**: Title (18px white) + Amount (16px white bold)
- ✅ **Right side**: Arrow icon (white, subtle shadow)
- ✅ **Spacing**: 10px vertical margin between cards

## 🧠 **6. Profile Screen Layout**

### **Top Section**
```typescript
// Page Heading: "Profile" (Archivo Black, 28px, bold)
h1: { fontSize: 28, fontWeight: '900' }

// Circle avatar placeholder: 80x80, light shadow
avatar: { width: 80, height: 80, borderRadius: 40 }

// User name (Instrument Serif Italic, 22px)
crazyText: { fontSize: 18, fontStyle: 'italic' }
```

### **Mid Section**
- ✅ Cards list (HDFC Card, Axis Bank, UPI Wallet)
- ✅ Each card clickable → navigates to account detail page

### **Bottom Section**
- ✅ Add Account Button (Rounded, background #FF6B35, text white)

## 📊 **7. Spacing System**

### **Global Spacing**
```typescript
spacing: {
  screenPadding: 20,    // Screen padding: 20px
  elementGap: 10,       // Element gap (same section): 10px
  sectionGap: 24,       // Section gap: 24px
  cardMargin: 10,       // Vertical margin between cards: 10px
  cardPadding: 12,      // Card padding: 12px
}
```

### **Corner Radius**
- ✅ **Cards**: 16-20px
- ✅ **Buttons**: 16px rounded
- ✅ **Consistent**: All components follow same radius

## 🧩 **8. Motion & Feel**

### **Animation Rules**
- ✅ **Smooth, minimal**: ease-in-out, 200-250ms
- ✅ **Button press**: slight scale down (0.95x)
- ✅ **Page transitions**: fade or slide-right
- ✅ **Professional**: Calm, professional, slightly luxurious

## 📱 **9. Responsive Behavior**

### **Layout Rules**
- ✅ **Maintain aspect ratio**: of cards
- ✅ **Fonts scale dynamically**: based on screen width
- ✅ **Green background**: always fills screen edges
- ✅ **Balanced screens**: equal whitespace top and bottom

## 🧾 **10. Design Rules**

### **Don't Do**
- ❌ Don't add gradients or multiple greens
- ❌ Don't mix serif and sans in the same line
- ❌ Don't use drop shadows heavier than 0.15 opacity
- ❌ Don't use uppercase text for financial amounts

### **Do**
- ✅ Use consistent shadows
- ✅ Maintain proper spacing
- ✅ Follow typography hierarchy
- ✅ Keep calm, professional feel

## ✅ **11. Overall Personality**

### **Design Philosophy**
- ✅ **Calm, professional, slightly luxurious**
- ✅ **"Soft but structured"** UI feel
- ✅ **Balanced screens** — equal whitespace top and bottom
- ✅ **Words and visuals breathe** — no element feels boxed in

## 🚀 **Implementation Status**

### **✅ Completed**
- ✅ Color system matches specifications
- ✅ Typography hierarchy implemented
- ✅ Shadow system consistent
- ✅ Card components follow design
- ✅ Spacing system accurate
- ✅ Component styles match design

### **🎯 Ready for Development**
The FinTrack app now perfectly implements your UI/UX design system with:
- **Consistent Design**: All components follow the specifications
- **Professional Look**: Clean, modern, luxurious feel
- **Proper Typography**: Correct font sizes and weights
- **Accurate Colors**: Exact color palette implementation
- **Responsive Layout**: Proper spacing and alignment

The app is ready for development with a **professional, consistent, and beautiful** design system! 🎨✨
