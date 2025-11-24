import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const { user, loading } = useAuth();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [slideAnim] = useState(new Animated.Value(50));
  const [checkingSetup, setCheckingSetup] = useState(false);

  useEffect(() => {
    // Start animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!loading && !checkingSetup) {
      const checkAndNavigate = async () => {
        if (user) {
          setCheckingSetup(true);
          // Check onboarding status first, then account setup
          try {
            // Wait a bit for animations
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Check if onboarding is completed
            const { data: profile, error: profileError } = await supabase
              .from('users_profile')
              .select('onboarding_completed')
              .eq('user_id', user.id)
              .maybeSingle();

            if (profileError) {
              console.error('Error checking profile:', profileError);
            }

            // Check if user has accounts
            const { data: accounts, error: accountsError } = await supabase
              .from('accounts')
              .select('id')
              .eq('user_id', user.id)
              .limit(1);

            if (accountsError) {
              console.error('Error checking accounts:', accountsError);
            }

            // Determine navigation
            if (profile?.onboarding_completed || (accounts && accounts.length > 0)) {
              // Onboarding/Setup complete, go to main app
              router.replace('/(tabs)');
            } else {
              // Not completed, go to onboarding
              router.replace('/onboarding');
            }
          } catch (error) {
            console.error('Error during setup check:', error);
            // On error, redirect to onboarding to be safe
            router.replace('/onboarding');
          }
        } else {
          // No user, redirect to sign in
          const timer = setTimeout(() => {
            router.replace('/auth/signin');
          }, 2000);
          return () => clearTimeout(timer);
        }
      };

      checkAndNavigate();
    }
  }, [user, loading, checkingSetup]);

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* App Logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.logo}>
            <Ionicons name="wallet" size={60} color="white" />
          </View>
        </Animated.View>

        {/* App Name */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.appName}>FinTrack</Text>
          <Text style={styles.tagline}>Your Personal Finance Manager</Text>
        </Animated.View>

        {/* Loading Indicator */}
        <Animated.View
          style={[
            styles.loadingContainer,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <View style={styles.loadingDots}>
            <View style={[styles.dot, styles.dot1]} />
            <View style={[styles.dot, styles.dot2]} />
            <View style={[styles.dot, styles.dot3]} />
          </View>
        </Animated.View>
      </View>

      {/* Bottom Branding */}
      <Animated.View
        style={[
          styles.bottomContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Text style={styles.versionText}>Version 1.0.0</Text>
        <Text style={styles.copyrightText}>© 2024 FinTrack. All rights reserved.</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  appName: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginHorizontal: 4,
  },
  dot1: {
    animationDelay: '0s',
  },
  dot2: {
    animationDelay: '0.2s',
  },
  dot3: {
    animationDelay: '0.4s',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 4,
  },
  copyrightText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
