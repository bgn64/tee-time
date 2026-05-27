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
 * State machine:
 *
 *      ┌─ no session ──────────► gated by AuthGate stage 1 (we don't run)
 *      │
 *      └─ session present
 *           │
 *           ├─ booting       ◄── PowerSync hasn't completed its first
 *           │                    sync yet AND no local profile row.
 *           ├─ needsProfile  ◄── First sync done, no profile row server-side.
 *           ├─ ready         ◄── Local PowerSync row present (own_profile
 *           │                    stream). Also covers offline launches:
 *           │                    once the row has ever synced, it lives
 *           │                    in local SQLite until disconnectAndClear.
 *           └─ error         ◄── First sync still hasn't completed after
 *                                BOOT_ERROR_TIMEOUT_MS — surface a retry
 *                                screen instead of spinning forever.
 *
 * Local SQLite is the persistent cache. The `own_profile` sync stream
 * replicates the profile row down once and keeps it fresh; the
 * previous KV-storage cache layer has been removed since PowerSync
 * is now the source of truth.
 *
 * `completeProfile` calls the RPC and stashes the returned row in a
 * local override state so `status` flips to 'ready' the instant the
 * RPC returns (the override is cleared automatically when PowerSync's
 * next sync tick lands the canonical row). Without this overlay the
 * user would briefly see the handle picker re-render after submitting,
 * because the local SQLite hadn't yet replicated the new row.
 */

import React from 'react';
import { useQuery, useStatus } from '@powersync/react';

import { useSystem } from '@/library/powersync/system';
import { PROFILES_TABLE, type ProfileRecord } from '@/library/powersync/AppSchema';
import { pickAvatarColor } from './avatarColors';
import { normalizeHandle } from './handles';
import type { ProfileSummary } from '@/types/social';

type AccountStatus = 'booting' | 'needsProfile' | 'ready' | 'error';

export type Account = ProfileSummary;

type AccountContextValue = {
  account: Account | null;
  status: AccountStatus;
  /** Convenience accessor for AuthGate. True when status === 'needsProfile'. */
  needsProfile: boolean;
  /**
   * Reset any "timed-out boot" latch and ask PowerSync to retry the
   * connection. Wired into the AuthGate error screen's "Try again"
   * button.
   */
  refresh: () => Promise<void>;
  /**
   * Creates the profile via the `complete_profile` RPC. Idempotent
   * server-side; returns the row whether newly inserted or
   * pre-existing. The returned row is also installed as a local
   * override so the status flips to 'ready' immediately (the override
   * clears automatically when PowerSync's own_profile stream lands
   * the canonical row).
   */
  completeProfile: (handle: string, displayName: string) => Promise<Account>;
  /** Best-effort palette pick for the signed-in user (uses their id). */
  suggestedAvatarColor: string | null;
};

const AccountContext = React.createContext<AccountContextValue | null>(null);

// How long we wait for PowerSync's first sync to complete before
// flipping the status to 'error'. PowerSync keeps retrying in the
// background, so the user can tap "Try again" to bounce back into
// 'booting' state. 10s is well above a healthy first sync (~1–2s on
// LTE) without making truly-offline users stare at a spinner forever.
const BOOT_ERROR_TIMEOUT_MS = 10_000;

// Server-side RPC shape (snake_case columns).
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

function recordToAccount(
  row: ProfileRecord & { id: string },
  userId: string
): Account {
  return {
    userId,
    handle: row.handle ?? '',
    displayName: row.display_name ?? '',
    avatarColor: row.avatar_color ?? '#888888'
  };
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const system = useSystem();
  const syncStatus = useStatus();
  const [userId, setUserId] = React.useState<string | null>(null);
  // Latched true once we've been booting longer than BOOT_ERROR_TIMEOUT_MS
  // without either a local row or hasSynced flipping true.
  const [bootTimedOut, setBootTimedOut] = React.useState(false);
  // Holds the RPC-return row between `completeProfile` returning and
  // PowerSync's own_profile stream landing the canonical row. Keyed by
  // userId so a stale override from a previous sign-in can't leak.
  const [postCompleteOverride, setPostCompleteOverride] =
    React.useState<Account | null>(null);

  // Resolve the current Supabase user id and react to login/logout.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = (await system.supabaseConnector.userId().catch(() => undefined)) ?? null;
      if (!cancelled) setUserId(id);
    })();

    const {
      data: { subscription }
    } = system.supabaseConnector.client.auth.onAuthStateChange((_event, nextSession) => {
      const nextId = nextSession?.user.id ?? null;
      setUserId(nextId);
      // Drop the boot-timeout latch + any stale override when the user
      // changes. The PowerSync query below auto-rebinds to the new id.
      setBootTimedOut(false);
      setPostCompleteOverride(null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [system]);

  // PowerSync watch for the user's own profile row. The own_profile
  // sync stream aliases `user_id AS id`, so the local PK is the user
  // id. We use a tautologically-false fallback while userId is null
  // so the query has stable shape and doesn't trip an empty-param
  // path that some PowerSync versions handle differently.
  const { data: profileRows } = useQuery<ProfileRecord & { id: string }>(
    userId
      ? `SELECT * FROM ${PROFILES_TABLE} WHERE id = ?`
      : `SELECT * FROM ${PROFILES_TABLE} WHERE 1 = 0`,
    userId ? [userId] : []
  );
  const row = profileRows[0];

  // Boot timeout: only run when we genuinely don't have any data
  // (no local row AND first sync hasn't completed). The setState
  // lives inside the setTimeout callback (not the effect body), so
  // this is allowed under the React 19 set-state-in-effect rule.
  React.useEffect(() => {
    if (!userId) return;
    if (row) return;
    if (syncStatus.hasSynced) return;
    if (bootTimedOut) return;
    const t = setTimeout(() => setBootTimedOut(true), BOOT_ERROR_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [userId, row, syncStatus.hasSynced, bootTimedOut]);

  const account = React.useMemo<Account | null>(() => {
    if (!userId) return null;
    if (row) return recordToAccount(row, userId);
    // The override is read only while PowerSync hasn't yet replicated
    // the canonical row. Once `row` is present the override is
    // effectively dead state — it sits in memory until the next auth
    // change clears it (negligible memory cost; intentionally no
    // setState-in-effect to clear it, per the React 19 rule).
    if (postCompleteOverride && postCompleteOverride.userId === userId) {
      return postCompleteOverride;
    }
    return null;
  }, [userId, row, postCompleteOverride]);

  const status: AccountStatus = (() => {
    if (!userId) return 'booting';
    if (account) return 'ready';
    if (syncStatus.hasSynced) return 'needsProfile';
    if (bootTimedOut) return 'error';
    return 'booting';
  })();

  const refresh = React.useCallback(async () => {
    // Bounce the error latch and kick PowerSync to retry the
    // connection. PowerSync.connect is idempotent — re-calling it on
    // an already-connected client is a no-op.
    setBootTimedOut(false);
    try {
      await system.powersync.connect(system.supabaseConnector);
    } catch (err) {
      console.warn('[account] refresh connect failed:', err);
    }
  }, [system]);

  // Mirror of `userId` accessible inside async callbacks without
  // re-creating them on each session change. Lets `completeProfile`
  // verify the user hasn't changed before installing the override.
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
      const { data, error } = await system.supabaseConnector.client.rpc('complete_profile', {
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
      // Only install the override if the user hasn't changed during
      // the RPC. Without this guard a late RPC resolution from a
      // signed-out user could leak an override into the next session.
      if (userIdRef.current === submittingUserId) {
        setPostCompleteOverride(next);
      }
      return next;
    },
    [userId, system]
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
