/**
 * Account context — local-only stub for Phase 3 step 7.
 *
 * Persists:
 *   · `account`: the signed-in user's record, or `null` when signed out.
 *   · `postRoundPromptDismissCount`: how many times the user has tapped
 *     "Maybe later" on the post-round sign-in banner. Once this hits the
 *     suppress threshold (3), the banner stops appearing on future rounds.
 *
 * The signIn / signOut surface is async so swapping the stub for a real
 * Supabase client later doesn't ripple through callers.
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

import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { Account, AuthProvider } from '@/types/account';

/** Number of "Maybe later" taps after which the post-round banner is muted. */
export const POST_ROUND_PROMPT_SUPPRESS_THRESHOLD = 3;

type AccountContextValue = {
  account: Account | null;
  /**
   * Stub sign-in: produces a deterministic-looking fake `Account` record. The
   * caller picks a `provider` (Apple / Google) and a `handle` (validated by
   * the picker UI). All other fields are filled in here.
   */
  signIn: (provider: AuthProvider, handle: string) => Promise<Account>;
  signOut: () => Promise<void>;

  postRoundPromptDismissCount: number;
  /** Returns true if the post-round banner is suppressed (count >= threshold). */
  postRoundPromptSuppressed: boolean;
  /** Increment the dismiss counter. Idempotently bounded by the threshold. */
  markPostRoundPromptDismissed: () => void;

  hydrated: boolean;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

/**
 * Generate a fake user id. Real implementation will use Supabase auth.users.id.
 */
function fakeUserId(): string {
  return `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Pick a stable but varied avatar color from the palette used elsewhere in
 * the app. Same color seed per provider so reruns of the stub feel coherent.
 */
function avatarColorFor(provider: AuthProvider): string {
  return provider === 'apple' ? '#0a84ff' : '#ea4335';
}

/**
 * Stub display name. Real implementation pulls from SSO provider response.
 * Kept generic so the user can tell at a glance they're in the stub.
 */
function stubDisplayName(provider: AuthProvider): string {
  return provider === 'apple' ? 'Apple Tester' : 'Google Tester';
}

/**
 * Stub email. Apple uses its private-relay format; Google a plausible gmail.
 */
function stubEmail(provider: AuthProvider, handle: string): string {
  if (provider === 'apple') {
    return `${handle}@privaterelay.appleid.com`;
  }
  return `${handle}@gmail.com`;
}

export function AccountProvider({ children }: PropsWithChildren) {
  const [account, setAccount] = useState<Account | null>(null);
  const [postRoundPromptDismissCount, setPostRoundPromptDismissCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate both keys in parallel on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadJSON<Account | null>(STORAGE_KEYS.ACCOUNT, null),
      loadJSON<number>(STORAGE_KEYS.POST_ROUND_PROMPT_DISMISS_COUNT, 0),
    ]).then(([loadedAccount, loadedCount]) => {
      if (cancelled) return;
      setAccount(loadedAccount);
      setPostRoundPromptDismissCount(loadedCount);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-key write effects, gated on hydration so seeds don't stomp stored data.
  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.ACCOUNT, account);
  }, [account, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.POST_ROUND_PROMPT_DISMISS_COUNT, postRoundPromptDismissCount);
  }, [postRoundPromptDismissCount, hydrated]);

  const signIn = useCallback(async (provider: AuthProvider, handle: string): Promise<Account> => {
    // Brief artificial delay so the stub feels closer to real OAuth latency.
    // Real implementation will await Supabase's signInWithIdToken instead.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const next: Account = {
      userId: fakeUserId(),
      provider,
      email: stubEmail(provider, handle),
      handle,
      displayName: stubDisplayName(provider),
      avatarColor: avatarColorFor(provider),
      createdAt: new Date().toISOString(),
    };
    setAccount(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    setAccount(null);
  }, []);

  const markPostRoundPromptDismissed = useCallback(() => {
    setPostRoundPromptDismissCount((prev) =>
      prev >= POST_ROUND_PROMPT_SUPPRESS_THRESHOLD ? prev : prev + 1
    );
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      account,
      signIn,
      signOut,
      postRoundPromptDismissCount,
      postRoundPromptSuppressed:
        postRoundPromptDismissCount >= POST_ROUND_PROMPT_SUPPRESS_THRESHOLD,
      markPostRoundPromptDismissed,
      hydrated,
    }),
    [
      account,
      signIn,
      signOut,
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

/**
 * Validate a handle against the regex rules used by the handle picker.
 * Exported so tests / future Supabase server-side validation can stay aligned.
 *
 * Rules: 3–20 chars, must start with a lowercase letter, otherwise lowercase
 * letters / digits / dot / underscore.
 */
export const HANDLE_REGEX = /^[a-z][a-z0-9._]{2,19}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle);
}
