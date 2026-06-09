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

const storage = Platform.OS === 'web' ? new WebKVStorage() : new ExpoKVStorage();

export const supabase = createClient(
  AppConfig.supabaseUrl ?? '',
  AppConfig.supabaseAnonKey ?? '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage,
    },
  }
);
