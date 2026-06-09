/**
 * Shared Supabase client — the single source of truth for data + auth.
 *
 * Owns the GoTrue session storage (expo-secure-store on native, AsyncStorage
 * on web) so there is exactly one client/session for the whole app. The
 * storage adapter matches the one the (removed) PowerSync connector used, so
 * existing sessions persist across the migration.
 */
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { ExpoKVStorage, WebKVStorage } from '@/library/storage/KVStorage';
import { AppConfig } from './AppConfig';

const supabaseUrl = AppConfig.supabaseUrl;
const supabaseAnonKey = AppConfig.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase env vars are missing. Copy `.env.local.template` to `.env.local` and set ' +
      'EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart `expo start` ' +
      '(use `--clear` so Metro picks up the new env).'
  );
}

const storage = Platform.OS === 'web' ? new WebKVStorage() : new ExpoKVStorage();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage,
  },
});
