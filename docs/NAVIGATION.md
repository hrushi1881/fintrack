# Contextual Back Navigation

This app implements contextual back navigation that maintains a navigation stack, allowing users to navigate back through their navigation history (A → B → C → B → A) instead of always going to home.

## How It Works

1. **NavigationContext** tracks all navigation events automatically
2. **Navigation Stack** maintains the history of screens visited
3. **Back Navigation** pops from the stack and returns to the previous screen
4. **Fallback** to home only when stack is empty

## Usage

### Option 1: Use the BackButton Component (Recommended)

```tsx
import BackButton from '@/components/BackButton';

// In your component
<BackButton />
<BackButton color="#FFFFFF" size={24} />
```

### Option 2: Use the useBackNavigation Hook

```tsx
import { useBackNavigation } from '@/hooks/useBackNavigation';

function MyScreen() {
  const handleBack = useBackNavigation();
  
  return (
    <TouchableOpacity onPress={handleBack}>
      <Ionicons name="arrow-back" />
    </TouchableOpacity>
  );
}
```

### Option 3: Use useAndroidBackButton for Android Hardware Back Button

```tsx
import { useAndroidBackButton } from '@/hooks/useAndroidBackButton';

function MyScreen() {
  useAndroidBackButton(); // Automatically handles Android back button
  
  return <View>...</View>;
}
```

## Migration Guide

### Before:
```tsx
<TouchableOpacity onPress={() => router.back()}>
  <Ionicons name="arrow-back" />
</TouchableOpacity>
```

### After:
```tsx
import BackButton from '@/components/BackButton';

<BackButton />
```

Or:
```tsx
import { useBackNavigation } from '@/hooks/useBackNavigation';

const handleBack = useBackNavigation();
<TouchableOpacity onPress={handleBack}>
  <Ionicons name="arrow-back" />
</TouchableOpacity>
```

## Features

- ✅ Maintains navigation history stack
- ✅ Contextual back navigation (C → B → A)
- ✅ Prevents duplicate entries in stack
- ✅ Handles forward navigation (removes items after current)
- ✅ Android hardware back button support
- ✅ Automatic fallback to home when stack is empty
- ✅ Works with expo-router

## Example Flow

1. User navigates: Home → Overview → Liabilities → Specific Liability
2. Stack: [Home, Overview, Liabilities, Specific Liability]
3. User presses back: Goes to Liabilities
4. Stack: [Home, Overview, Liabilities]
5. User presses back: Goes to Overview
6. Stack: [Home, Overview]
7. User presses back: Goes to Home
8. Stack: [Home]
9. User presses back: Stays on Home (stack empty)

## Notes

- The NavigationContext automatically tracks pathname changes
- No need to manually push to stack when using `router.push()`
- Modals are excluded from the stack (paths containing `/modals/`)
- The stack is maintained per session

