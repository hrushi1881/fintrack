import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { router, usePathname, useSegments } from 'expo-router';

interface NavigationStackItem {
  path: string;
  segments: string[];
  timestamp: number;
  scrollPosition?: number;
  state?: Record<string, any>;
}

interface NavigationContextType {
  navigationStack: NavigationStackItem[];
  pushToStack: (path: string, segments: string[], state?: Record<string, any>) => void;
  popFromStack: () => boolean;
  canGoBack: () => boolean;
  goBack: () => void;
  clearStack: () => void;
  getPreviousPath: () => string | null;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [navigationStack, setNavigationStack] = useState<NavigationStackItem[]>([]);
  const pathname = usePathname();
  const segments = useSegments();
  const isInitialMount = useRef(true);
  const lastPathname = useRef<string | null>(null);

  // Track navigation changes
  useEffect(() => {
    // Skip modals - they shouldn't be in the navigation stack
    if (pathname.includes('/modals/')) {
      return;
    }

    // Skip initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastPathname.current = pathname;
      // Initialize stack with current path
      if (pathname) {
        setNavigationStack([{
          path: pathname,
          segments: [...segments],
          timestamp: Date.now(),
        }]);
      }
      return;
    }

    // Only track if pathname actually changed
    if (pathname !== lastPathname.current) {
      const newItem: NavigationStackItem = {
        path: pathname,
        segments: [...segments],
        timestamp: Date.now(),
      };

      setNavigationStack((prevStack) => {
        // Don't add if it's the same as the last item (prevents duplicates)
        if (prevStack.length > 0 && prevStack[prevStack.length - 1].path === pathname) {
          return prevStack;
        }

        // Check if this path already exists in stack (user navigated back then forward)
        const existingIndex = prevStack.findIndex(item => item.path === pathname);
        
        if (existingIndex !== -1) {
          // Path exists, remove everything after it and add new item
          return [...prevStack.slice(0, existingIndex + 1), newItem];
        }

        // New path, add to stack
        return [...prevStack, newItem];
      });

      lastPathname.current = pathname;
    }
  }, [pathname, segments]);

  const pushToStack = useCallback((path: string, segments: string[], state?: Record<string, any>) => {
    const newItem: NavigationStackItem = {
      path,
      segments: [...segments],
      timestamp: Date.now(),
      state,
    };

    setNavigationStack((prevStack) => {
      // Check if path already exists
      const existingIndex = prevStack.findIndex(item => item.path === path);
      
      if (existingIndex !== -1) {
        // Path exists, remove everything after it
        return [...prevStack.slice(0, existingIndex + 1), newItem];
      }

      return [...prevStack, newItem];
    });
  }, []);

  const popFromStack = useCallback(() => {
    setNavigationStack((prevStack) => {
      if (prevStack.length <= 1) {
        return prevStack; // Keep at least one item (current screen)
      }
      return prevStack.slice(0, -1);
    });
    return true;
  }, []);

  const canGoBack = useCallback(() => {
    return navigationStack.length > 1;
  }, [navigationStack.length]);

  const getPreviousPath = useCallback(() => {
    if (navigationStack.length <= 1) {
      return null;
    }
    return navigationStack[navigationStack.length - 2].path;
  }, [navigationStack]);

  const goBack = useCallback(() => {
    if (!canGoBack()) {
      // If stack is empty or only has one item, go to home
      const homePath = '/(tabs)/';
      router.replace(homePath as any);
      return;
    }

    const previousPath = getPreviousPath();
    if (previousPath) {
      // Pop from stack first
      popFromStack();
      
      // Navigate to previous path
      // Use replace to avoid adding to browser history
      if (previousPath.startsWith('/')) {
        router.replace(previousPath as any);
      } else {
        router.replace(`/${previousPath}` as any);
      }
    } else {
      // Fallback to home
      router.replace('/(tabs)/' as any);
    }
  }, [canGoBack, getPreviousPath, popFromStack]);

  const clearStack = useCallback(() => {
    setNavigationStack([]);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        navigationStack,
        pushToStack,
        popFromStack,
        canGoBack,
        goBack,
        clearStack,
        getPreviousPath,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

