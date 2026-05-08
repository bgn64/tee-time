/**
 * Supabase client singleton.
 *
 * Wires the JS SDK with platform-appropriate auth-session storage:
 *   - Native (iOS/Android): AsyncStorage adapter, mirrors how every other
 *     context in this app handles persistence.
 *   - Web: supabase-js's built-in default uses localStorage when `window`
 *     is available, and falls back to in-memory storage during SSR. We
 *     deliberately don't pass AsyncStorage on web because its commonjs
 *     module references `window` at import time, which crashes Expo
 *     Router's static-render pass.
 *
 * Configuration is sourced from environment variables exposed via Expo's
 * `EXPO_PUBLIC_*` convention (auto-inlined at build time, safe to ship in
 * the app bundle since the anon key is intended to be public).
 */

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

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

// Only require AsyncStorage on native; on web supabase-js uses localStorage
// itself (or in-memory during SSR) without us pulling in AsyncStorage's
// `window`-reading commonjs module.
const storage =
  Platform.OS === 'web'
    ? undefined
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@react-native-async-storage/async-storage').default;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
