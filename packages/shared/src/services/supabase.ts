import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase client
let supabaseClient: SupabaseClient | null = null;

export interface SupabaseOptions {
  storage?: any;
  detectSessionInUrl?: boolean;
}

export function initializeSupabase(url: string, anonKey: string, options?: SupabaseOptions) {
  if (!supabaseClient) {
    const browserStorage = (() => {
      const g = globalThis as { localStorage?: any };
      return g.localStorage;
    })();
    const storage = options?.storage || browserStorage;
    const detectSessionInUrl = options?.detectSessionInUrl ?? true;

    supabaseClient = createClient(url, anonKey, {
      auth: {
        persistSession: true, // Enable session persistence for host auth
        autoRefreshToken: true,
        detectSessionInUrl,
        storage,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {},
      },
    });
  }
  return supabaseClient;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initializeSupabase first.');
  }
  return supabaseClient;
}
