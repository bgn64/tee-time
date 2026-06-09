/**
 * AccountContext — owns the signed-in user's `profiles` row.
 *
 * Mounted inside `(tabs)/_layout.tsx` between `<AuthGate>`'s session
 * check and the `<FriendsProvider>` + `<Tabs>` tree. AccountContext is
 * the AUTHORITY for the AuthGate's stage-2 check ("is the profile
 * row present?"):
 *
 *   · stage 1 = session present (AuthGate's existing job)
 *   · stage 2 = profile present (this provider's job)
 *
 * Read path: the shared Supabase auth client provides the current
 * session user id, then React Query fetches that user's `profiles`
 * row over Supabase REST. The cache is keyed by `['account-profile',
 * userId]` and refreshed on demand by invalidating that query.
 *
 * Write path: `completeProfile` calls the `complete_profile` RPC and
 * installs the returned server row directly into the same React Query
 * cache, so `status` flips to 'ready' immediately after the RPC
 * succeeds while preserving the REST response as the source of truth.
 */

import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { queryClient } from '@/library/data/queryClient';
import { supabase } from '@/library/supabase/client';
import type { ProfileSummary } from '@/types/social';
import { pickAvatarColor } from './avatarColors';
import { normalizeHandle } from './handles';

type AccountStatus = 'booting' | 'needsProfile' | 'ready' | 'error';

export type Account = ProfileSummary;

type AccountContextValue = {
  account: Account | null;
  status: AccountStatus;
  /** Convenience accessor for AuthGate. True when status === 'needsProfile'. */
  needsProfile: boolean;
  /**
   * Refetch the signed-in user's profile row. Wired into the AuthGate
   * error screen's "Try again" button.
   */
  refresh: () => Promise<void>;
  /**
   * Creates the profile via the `complete_profile` RPC. Idempotent
   * server-side; returns the row whether newly inserted or
   * pre-existing. The returned row is also installed in the React
   * Query cache so the status flips to 'ready' immediately.
   */
  completeProfile: (handle: string, displayName: string) => Promise<Account>;
  /** Best-effort palette pick for the signed-in user (uses their id). */
  suggestedAvatarColor: string | null;
};

const AccountContext = React.createContext<AccountContextValue | null>(null);

const accountProfileKey = (userId: string | null) => ['account-profile', userId] as const;

// Server-side REST/RPC shape (snake_case columns).
type CloudProfileRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_color: string;
};

function cloudRowToAccount(row: CloudProfileRow): Account {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    avatarColor: row.avatar_color
  };
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = React.useState<string | null>(null);

  // Resolve the current Supabase user id and react to login/logout.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!cancelled) setUserId(session?.user.id ?? null);
    })();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextId = nextSession?.user.id ?? null;
      setUserId(nextId);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const profileQuery = useQuery<CloudProfileRow | null>({
    queryKey: accountProfileKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) {
        throw new Error('Not signed in');
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as CloudProfileRow | null;
    }
  });

  const account = React.useMemo<Account | null>(() => {
    const row = profileQuery.data;
    return row ? cloudRowToAccount(row) : null;
  }, [profileQuery.data]);

  const status: AccountStatus = (() => {
    if (!userId) return 'booting';
    if (account) return 'ready';
    if (profileQuery.isError) return 'error';
    if (profileQuery.isSuccess && profileQuery.data === null) return 'needsProfile';
    return 'booting';
  })();

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: accountProfileKey(userId) });
  }, [userId]);

  // Mirror of `userId` accessible inside async callbacks without
  // re-creating them on each session change. Lets `completeProfile`
  // verify the user hasn't changed before installing the returned row.
  const userIdRef = React.useRef<string | null>(userId);
  React.useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const completeProfile = React.useCallback(
    async (handle: string, displayName: string): Promise<Account> => {
      if (!userId) {
        throw new Error('Not signed in');
      }
      const submittingUserId = userId;
      const normalizedHandle = normalizeHandle(handle);
      const trimmedName = displayName.trim();
      const color = pickAvatarColor(userId);
      const { data, error } = await supabase.rpc('complete_profile', {
        p_handle: normalizedHandle,
        p_display_name: trimmedName,
        p_avatar_color: color
      });
      if (error) {
        throw error;
      }
      const cloudRow = (Array.isArray(data) ? data[0] : data) as CloudProfileRow | null;
      if (!cloudRow) {
        throw new Error('Empty response from complete_profile RPC');
      }
      const next = cloudRowToAccount(cloudRow);
      // Only install the returned row if the user hasn't changed during
      // the RPC. Without this guard a late RPC resolution from a
      // signed-out user could leak data into the next session.
      if (userIdRef.current === submittingUserId) {
        queryClient.setQueryData(accountProfileKey(submittingUserId), cloudRow);
      }
      return next;
    },
    [userId]
  );

  const suggestedAvatarColor = React.useMemo(
    () => (userId ? pickAvatarColor(userId) : null),
    [userId]
  );

  const value = React.useMemo<AccountContextValue>(
    () => ({
      account,
      status,
      needsProfile: status === 'needsProfile',
      refresh,
      completeProfile,
      suggestedAvatarColor
    }),
    [account, status, refresh, completeProfile, suggestedAvatarColor]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = React.useContext(AccountContext);
  if (!ctx) {
    throw new Error('useAccount must be used within an <AccountProvider>.');
  }
  return ctx;
}

/**
 * Hook that asserts a non-null `account`. Use inside components that
 * are guaranteed to render only when status === 'ready' (e.g., the
 * tabs tree).
 */
export function useRequiredAccount(): Account {
  const { account } = useAccount();
  if (!account) {
    throw new Error('useRequiredAccount called before account was loaded.');
  }
  return account;
}
