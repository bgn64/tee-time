/**
 * Handle validation — mirrors the server CHECK constraint
 * (`handle ~ '^[a-z][a-z0-9._]{2,19}$'`) so the SignInScreen can
 * surface errors before a round-trip.
 *
 *   · Lowercase letters / digits / dots / underscores only.
 *   · Must start with a letter.
 *   · 3 to 20 characters total.
 *
 * Keep this in sync with `supabase/migrations/003_friends.sql`.
 */

const HANDLE_REGEX = /^[a-z][a-z0-9._]{2,19}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle);
}

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@+/, '');
}
