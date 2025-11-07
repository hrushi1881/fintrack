import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, userData: UserData) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
}

interface UserData {
  firstName: string;
  lastName: string;
  phone?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return { 
        error: { 
          message: 'Invalid email format. Please enter a valid email address.',
          name: 'ValidationError',
          status: 400
        } as AuthError 
      };
    }

    // Validate password
    if (!password || password.length < 6) {
      return { 
        error: { 
          message: 'Password must be at least 6 characters long.',
          name: 'ValidationError',
          status: 400
        } as AuthError 
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    // Provide more user-friendly error messages
    if (error) {
      let friendlyMessage = error.message;
      if (error.message.includes('Invalid login credentials') || error.message.includes('email not confirmed')) {
        friendlyMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (error.message.includes('Email rate limit')) {
        friendlyMessage = 'Too many login attempts. Please wait a few minutes and try again.';
      }
      return { 
        error: { 
          ...error, 
          message: friendlyMessage 
        } 
      };
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string, userData: UserData) => {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return { 
        error: { 
          message: 'Invalid email format. Please enter a valid email address.',
          name: 'ValidationError',
          status: 400
        } as AuthError 
      };
    }

    // Validate password
    if (!password || password.length < 8) {
      return { 
        error: { 
          message: 'Password must be at least 8 characters long.',
          name: 'ValidationError',
          status: 400
        } as AuthError 
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: undefined, // Disable email verification
        data: {
          first_name: userData.firstName,
          last_name: userData.lastName,
        }
      }
    });

    // Provide more user-friendly error messages
    if (error) {
      let friendlyMessage = error.message;
      if (error.message.includes('User already registered')) {
        friendlyMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (error.message.includes('Password')) {
        friendlyMessage = 'Password does not meet requirements. Please use a stronger password.';
      } else if (error.message.includes('Email rate limit')) {
        friendlyMessage = 'Too many signup attempts. Please wait a few minutes and try again.';
      }
      return { 
        error: { 
          ...error, 
          message: friendlyMessage 
        } 
      };
    }

    if (!error && data.user) {
      // Create user profile immediately
      const { error: profileError } = await supabase
        .from('users_profile')
        .insert({
          user_id: data.user.id,
          full_name: `${userData.firstName} ${userData.lastName}`,
          base_currency: 'USD',
        });

      if (profileError) {
        console.error('Error creating user profile:', profileError);
        // Don't fail signup if profile creation fails, but log it
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error };
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
