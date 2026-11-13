import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Supabase client, or null when not configured (the app then runs fully local).
 * Only the public "anon" key belongs in the app; Row Level Security protects the data.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vitalis-auth' },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null;

export const cloudConfigured = (): boolean => supabase !== null;

/** True when the app is in demo mode via ?demo=1 (always local, never synced). */
export const demoRequested = (): boolean => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');
