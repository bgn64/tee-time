/**
 * Account context — wraps Supabase auth.
 *
 * Auth providers: Magic-link OTP code (email → 6-digit code → verify) is the
 * shipped path here. Google OAuth lands in a follow-on commit once the
 * Google Cloud OAuth client is configured.
 *
 * Persisted via Supabase's built-in AsyncStorage adapter (configured in
 * `state/supabaseClient.ts`); we don't manage account storage manually
 * anymore. Local-only `postRoundPromptDismissCount` still lives here under
 * its own AsyncStorage key.
 *
 * Profile shape lives in the `profiles` table, joined to `auth.users` by
 * `user_id`. On first sign-in there's no profile yet — the sign-in screen
 * presents the handle picker, then calls `completeProfile(handle)` which
 * INSERTs and populates `account`.
 */

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Platform } from 'react-native';

import { pickAvatarColor } from '@/constants/avatarColors';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { supabase } from '@/state/supabaseClient';
import { Account } from '@/types/account';

/** Number of "Maybe later" taps after which the post-round banner is muted. */
export const POST_ROUND_PROMPT_SUPPRESS_THRESHOLD = 3;

/** Result envelope used by every async auth action. */
export type AuthResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type AccountContextValue = {
  account: Account | null;
  needsProfile: boolean;
  pendingEmail: string | null;
  sendMagicCode: (email: string) => Promise<AuthResult>;
  verifyMagicCode: (code: string) => Promise<AuthResult>;
  completeProfile: (handle: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /**
   * Trigger Supabase's Google OAuth flow (web only). Resolves to
   * { ok: false } on native — the UI can hide the button there.
   */
  signInWithGoogle: () => Promise<AuthResult>;
  /**
   * Update the signed-in user's `profiles.avatar_color`. Writes to
   * Supabase and refreshes the local Account state so participant
   * identity (feed band, scorer rows, etc.) re-renders live. No-op
   * when signed out.
   */
  updateAvatarColor: (color: string) => Promise<AuthResult>;
  postRoundPromptDismissCount: number;
  postRoundPromptSuppressed: boolean;
  markPostRoundPromptDismissed: () => void;
  hydrated: boolean;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export function AccountProvider({ children }: PropsWithChildren) {
  const [account, setAccount] = useState<Account | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [postRoundPromptDismissCount, setPostRoundPromptDismissCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const refreshFromSession = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setAccount(null);
      setNeedsProfile(false);
      return;
    }

    const userId = session.user.id;
    const email = session.user.email ?? '';

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('user_id, handle, display_name, avatar_color, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[account] failed to load profile:', error);
      setAccount(null);
      setNeedsProfile(false);
      return;
    }

    if (!profile) {
      setAccount(null);
      setNeedsProfile(true);
      setPendingEmail(email);
      return;
    }

    setAccount({
      userId: profile.user_id,
      provider: 'email',
      email,
      handle: profile.handle,
      displayName: profile.display_name,
      avatarColor: profile.avatar_color,
      createdAt: profile.created_at,
    });
    setNeedsProfile(false);
    setPendingEmail(null);
  }, []);

  useEffect(() => {
    // Diagnostic: log the URL the app loaded on. If we just came back
    // from Google OAuth the URL hash contains the access_token + refresh_token.
    if (typeof window !== 'undefined') {
      console.log('[auth/diag] initial location', {
        href: window.location.href,
        hash: window.location.hash?.slice(0, 80),
        search: window.location.search,
      });
    }
    let cancelled = false;
    const run = async () => {
      const count = await loadJSON<number>(STORAGE_KEYS.POST_ROUND_PROMPT_DISMISS_COUNT, 0);
      if (cancelled) return;
      setPostRoundPromptDismissCount(count);
      console.log('[auth/diag] refreshFromSession start');
      await refreshFromSession();
      console.log('[auth/diag] refreshFromSession done');
      if (cancelled) return;
      setHydrated(true);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [refreshFromSession]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth/diag] onAuthStateChange', {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
      });
      if (event === 'SIGNED_OUT') {
        setAccount(null);
        setNeedsProfile(false);
        setPendingEmail(null);
        return;
      }
      void refreshFromSession();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refreshFromSession]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.POST_ROUND_PROMPT_DISMISS_COUNT, postRoundPromptDismissCount);
  }, [postRoundPromptDismissCount, hydrated]);

  const sendMagicCode = useCallback(async (email: string): Promise<AuthResult> => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { ok: false, error: 'Enter an email address.' };
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    setPendingEmail(trimmed);
    return { ok: true, value: undefined };
  }, []);

  const verifyMagicCode = useCallback(
    async (code: string): Promise<AuthResult> => {
      if (!pendingEmail) {
        return { ok: false, error: 'No pending sign-in. Request a new code.' };
      }
      const trimmed = code.trim();
      if (!/^\d{6,10}$/.test(trimmed)) {
        return { ok: false, error: 'Enter the code from your email.' };
      }
      const { error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: trimmed,
        type: 'email',
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true, value: undefined };
    },
    [pendingEmail]
  );

  const completeProfile = useCallback(
    async (handle: string): Promise<AuthResult> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        return { ok: false, error: 'Not signed in.' };
      }
      const userId = session.user.id;
      const trimmed = handle.trim().toLowerCase();
      const { error } = await supabase.from('profiles').insert({
        user_id: userId,
        handle: trimmed,
        display_name: trimmed,
        avatar_color: pickAvatarColor(userId),
      });
      if (error) {
        if (error.code === '23505') {
          return { ok: false, error: 'That handle is taken. Try another.' };
        }
        return { ok: false, error: error.message };
      }
      await refreshFromSession();
      return { ok: true, value: undefined };
    },
    [refreshFromSession]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /**
   * Trigger Supabase's Google OAuth flow. Web-only for now — opens
   * Google's auth screen, bounces through Supabase's callback, and
   * lands back on the app with a session in the URL fragment that
   * detectSessionInUrl picks up automatically.
   *
   * For native (iOS/Android) builds this would need a different flow
   * via expo-auth-session. We return a clear error in that case so
   * the UI can hide the button.
   */
  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    console.log('[auth/diag] signInWithGoogle: enter', { platform: Platform.OS });
    if (Platform.OS !== 'web') {
      console.log('[auth/diag] signInWithGoogle: refused (non-web)');
      return {
        ok: false,
        error: 'Google sign-in is only available on the web build for now.',
      };
    }
    const redirectTo =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    console.log('[auth/diag] signInWithGoogle: calling supabase.auth.signInWithOAuth', {
      provider: 'google',
      redirectTo,
    });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
    });
    console.log('[auth/diag] signInWithGoogle: signInWithOAuth returned', {
      hasUrl: !!data?.url,
      url: data?.url?.slice(0, 120),
      errorMessage: error?.message,
    });
    if (error) return { ok: false, error: error.message };
    // signInWithOAuth navigates the browser away; this resolve is
    // mostly bookkeeping in case the navigation hasn't started yet.
    return { ok: true, value: undefined };
  }, []);

  const updateAvatarColor = useCallback(
    async (color: string): Promise<AuthResult> => {
      if (!account) return { ok: false, error: 'Not signed in' };
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_color: color })
        .eq('user_id', account.userId);
      if (error) return { ok: false, error: error.message };
      // Optimistic local update so the You tab + everywhere reading
      // `account.avatarColor` refreshes immediately. The next
      // refreshFromSession (e.g. on auth state change) will re-pull
      // the canonical value, but until then we trust our own write.
      setAccount((prev) => (prev ? { ...prev, avatarColor: color } : prev));
      return { ok: true, value: undefined };
    },
    [account]
  );

  const markPostRoundPromptDismissed = useCallback(() => {
    setPostRoundPromptDismissCount((prev) =>
      prev >= POST_ROUND_PROMPT_SUPPRESS_THRESHOLD ? prev : prev + 1
    );
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      account,
      needsProfile,
      pendingEmail,
      sendMagicCode,
      verifyMagicCode,
      completeProfile,
      signOut,
      signInWithGoogle,
      updateAvatarColor,
      postRoundPromptDismissCount,
      postRoundPromptSuppressed:
        postRoundPromptDismissCount >= POST_ROUND_PROMPT_SUPPRESS_THRESHOLD,
      markPostRoundPromptDismissed,
      hydrated,
    }),
    [
      account,
      needsProfile,
      pendingEmail,
      sendMagicCode,
      verifyMagicCode,
      completeProfile,
      signOut,
      signInWithGoogle,
      updateAvatarColor,
      postRoundPromptDismissCount,
      markPostRoundPromptDismissed,
      hydrated,
    ]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccount must be used inside AccountProvider.');
  }
  return context;
}

export const HANDLE_REGEX = /^[a-z][a-z0-9._]{2,19}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle);
}
