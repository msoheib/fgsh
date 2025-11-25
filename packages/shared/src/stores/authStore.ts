import { create } from 'zustand';
import { User, AuthError, Session } from '@supabase/supabase-js';
import { getSupabase } from '../services/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: AuthError | null;

  // Actions
  signUp: (email: string, password: string, fullName: string) => Promise<{ user: User | null; error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ user: User | null; error: AuthError | null }>;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

  signUp: async (email: string, password: string, fullName: string) => {
    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();

      // Sign up user with display_name in metadata
      // The database trigger (create_host_profile_on_signup) will automatically create the host_profiles record
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: fullName, // This matches the host_profiles.display_name column
          },
        },
      });

      if (signUpError) {
        set({ error: signUpError, loading: false });
        return { user: null, error: signUpError };
      }

      // If signup successful, update state
      // Note: host_profiles record is created automatically by DB trigger
      if (data.user) {
        set({
          user: data.user,
          session: data.session,
          loading: false,
          error: null
        });
      }

      return { user: data.user, error: null };
    } catch (error: any) {
      const authError: AuthError = error;
      set({ error: authError, loading: false });
      return { user: null, error: authError };
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        set({ error: signInError, loading: false });
        return { user: null, error: signInError };
      }

      set({
        user: data.user,
        session: data.session,
        loading: false,
        error: null
      });

      return { user: data.user, error: null };
    } catch (error: any) {
      const authError: AuthError = error;
      set({ error: authError, loading: false });
      return { user: null, error: authError };
    }
  },

  signOut: async () => {
    set({ loading: true });

    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();

      set({
        user: null,
        session: null,
        loading: false,
        error: null
      });
    } catch (error: any) {
      console.error('Sign out error:', error);
      set({ loading: false });
    }
  },

  checkSession: async () => {
    set({ loading: true });

    try {
      const supabase = getSupabase();

      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Session check error:', error);
        set({ user: null, session: null, loading: false, error });
        return;
      }

      set({
        user: session?.user ?? null,
        session: session ?? null,
        loading: false,
        error: null
      });

      // Set up auth state listener
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          user: session?.user ?? null,
          session: session ?? null
        });
      });
    } catch (error: any) {
      console.error('Session check error:', error);
      set({ user: null, session: null, loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
