/**
 * Supabase client singleton.
 *
 * Wires the JS SDK with AsyncStorage as the auth-session storage so the
 * signed-in user persists across app restarts (mirrors how every other
 * context in this app handles persistence).
 *
 * Configuration is sourced from environment variables exposed via Expo's
 * `EXPO_PUBLIC_*` convention (auto-inlined at build time, safe to ship in
 * the app bundle since the anon key is intended to be public).
 *
 * If either env var is missing we throw at module-load time rather than
 * letting an opaque `fetch failed` show up later — much easier to diagnose
 * a bad `.env` that way.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL is not set. Add it to your .env file at the repo root.'
  );
}
if (!SUPABASE_ANON_KEY) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. Add it to your .env file at the repo root.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // We're a mobile app, not a website — no URL-based auth callbacks to
    // detect. Magic-link emails open Expo Go via a deep link, which we'll
    // wire up explicitly when we ship that flow.
    detectSessionInUrl: false,
  },
});
