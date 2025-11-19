import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase client
let supabaseClient: SupabaseClient | null = null;

export function initializeSupabase(url: string, anonKey: string) {
  if (!supabaseClient) {
    supabaseClient = createClient(url, anonKey, {
      auth: {
        persistSession: false, // We're not using auth for MVP
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
        headers: {
          'Prefer': 'return=representation',
        },
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
