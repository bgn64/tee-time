/**
 * Account / auth domain types.
 *
 * Phase 3 step 7 ships a stub backend: the sign-in flow produces a fake
 * `Account` record persisted to AsyncStorage. The shape is intentionally what
 * a real Supabase `auth.users` row plus our app-level profile metadata will
 * project onto, so swapping the stub for the real client doesn't change any
 * consumer.
 */

export type AuthProvider = 'apple' | 'google' | 'email';

export type Account = {
  /** Stable id. Stub: uuid-like. Future: Supabase auth.users.id. */
  userId: string;
  provider: AuthProvider;
  /** May be a relay address for Apple Sign In. */
  email: string;
  /** Unique app-level handle, sans leading "@". Lowercase, validated client-side. */
  handle: string;
  /** Pulled from the SSO provider at sign-in time. */
  displayName: string;
  /** Hex color for the avatar circle; generated, not provider-supplied. */
  avatarColor: string;
  /** ISO timestamp of when the account was created. */
  createdAt: string;
};
