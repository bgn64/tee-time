/**
 * Auth helpers — magic-code (OTP) sign-in + sign-out, on the shared client.
 *
 * Replaces the auth methods that previously lived on the PowerSync
 * `SupabaseConnector`. Sign-out also clears the per-device current-hole
 * cache, the in-memory profile cache, and the React Query cache so the next
 * signed-in user starts clean.
 */
import { queryClient } from '@/library/data/queryClient';
import { clearCurrentHoleForUser } from '@/library/golf/currentHoleStore';
import { clearProfileCache } from '@/library/social/profileCache';
import { supabase } from './client';

/** Send a 6-digit sign-in code. Invite-only: never provisions new users. */
export async function sendMagicCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

/** Verify the emailed 6-digit code, establishing a session. */
export async function verifyMagicCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
}

/** Current signed-in user id, or undefined when signed out. */
export async function getUserId(): Promise<string | undefined> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id;
}

/** Sign out and clear all per-user local caches. Idempotent. */
export async function signOut(): Promise<void> {
  const userId = await getUserId().catch(() => undefined);
  if (userId) {
    await clearCurrentHoleForUser(userId);
  }
  await supabase.auth.signOut();
  clearProfileCache();
  queryClient.clear();
}
