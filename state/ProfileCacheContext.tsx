/**
 * ProfileCacheContext — lazily-populated cache of `profiles` rows
 * keyed by `userId`.
 *
 * Split out of `SocialContext` to isolate two surfaces with very
 * different change cadences:
 *
 *   · `FriendsContext` (formerly `SocialContext`) mutates only on
 *     accept / decline / search / send — rare events. Consumers like
 *     the incoming-request banner and the friends list should re-
 *     render only when the friend graph itself changes.
 *
 *   · `profileCache` mutates on every `ensureProfilesCached` call —
 *     which happens whenever ANY rendered participant comes into view
 *     (feed cards, scorecard rows, live strip, friends list, etc.).
 *     Without the split, every prefetch re-rendered every consumer of
 *     the old combined context — including the unrelated friends list
 *     and incoming-request banner.
 *
 * Under refresh-only sync, this context is a purely lazy cache. There
 * is no `hydrated` / `syncing` flag: the cache is never a render gate.
 * Consumers that fall back to a placeholder when an id isn't yet
 * cached (e.g. the friends list "Loading…" row) handle the empty
 * state directly.
 */

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAccount } from '@/state/AccountContext';
import { useRefreshGeneration } from '@/state/cloudSync';
import { useGolfRound } from '@/state/GolfRoundContext';
import { registerSignOutPurge } from '@/state/signOutRegistry';
import { supabase } from '@/state/supabaseClient';
import { ProfileSummary } from '@/types/social';

type CloudProfileRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_color: string;
};

function profileFromRow(row: CloudProfileRow): ProfileSummary {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
  };
}

type ProfileCacheContextValue = {
  profileCache: Record<string, ProfileSummary>;
  /**
   * Best-effort prefetch of profile rows into `profileCache`. Idempotent
   * and silent on failure. Surfaces so screens that render participant
   * chips for arbitrary linked user_ids can warm the cache up front.
   *
   * By default, already-cached ids are skipped (no network round-trip).
   * Pass `{ force: true }` to bypass the cache and re-pull every id —
   * used by pull-to-refresh paths so friends' profile edits (avatar
   * color, display name) propagate without restarting the app.
   */
  ensureProfilesCached: (
    userIds: string[],
    opts?: { force?: boolean }
  ) => Promise<Record<string, ProfileSummary>>;
  /**
   * Re-pull the given profile ids and overwrite matching cache
   * entries. Returns the standard `{ ok, error }` envelope so screens
   * can toast on failure. Race-safe via the shared
   * `useRefreshGeneration` helper.
   */
  refreshProfiles: (
    userIds: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
};

const ProfileCacheContext = createContext<ProfileCacheContextValue | undefined>(undefined);

export function ProfileCacheProvider({ children }: PropsWithChildren) {
  const [profileCache, setProfileCache] = useState<Record<string, ProfileSummary>>({});

  const { account } = useAccount();
  const accountUserId = account?.userId ?? null;

  // Live cache snapshot for the short-circuit + return-merge reads
  // inside `ensureProfilesCached`. The useCallback has `[]` deps so
  // the function identity stays stable across renders.
  const profileCacheRef = useRef(profileCache);
  profileCacheRef.current = profileCache;

  // Sign-out purge: clear other-users' profiles so a different
  // account starting clean doesn't render leftover names/colors.
  // No AsyncStorage backing for this cache — purely in-memory.
  useEffect(() => {
    return registerSignOutPurge(() => {
      setProfileCache({});
    });
  }, []);

  const ensureProfilesCached = useCallback(
    async (
      userIds: string[],
      opts: { force?: boolean } = {}
    ): Promise<Record<string, ProfileSummary>> => {
      const targets = opts.force
        ? userIds.filter((id) => id.length > 0)
        : userIds.filter((id) => !profileCacheRef.current[id]);
      if (targets.length === 0) return profileCacheRef.current;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .in('user_id', targets);
      if (error) {
        console.warn('[profileCache] profile lookup failed:', error);
        return profileCacheRef.current;
      }
      const additions: Record<string, ProfileSummary> = {};
      for (const row of (data ?? []) as CloudProfileRow[]) {
        additions[row.user_id] = profileFromRow(row);
      }
      setProfileCache((prev) => ({ ...prev, ...additions }));
      return { ...profileCacheRef.current, ...additions };
    },
    []
  );

  const profileRefreshGen = useRefreshGeneration();

  const refreshProfiles = useCallback(
    async (
      userIds: string[]
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!accountUserId) return { ok: true };
      const targets = userIds.filter((id) => id.length > 0);
      if (targets.length === 0) return { ok: true };
      const myToken = profileRefreshGen.begin();

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .in('user_id', targets);
      if (profileRefreshGen.isStale(myToken)) return { ok: true };
      if (error) {
        console.warn('[profileCache] profile refresh failed:', error);
        return { ok: false, error: error.message };
      }
      const additions: Record<string, ProfileSummary> = {};
      for (const row of (data ?? []) as CloudProfileRow[]) {
        additions[row.user_id] = profileFromRow(row);
      }
      setProfileCache((prev) => ({ ...prev, ...additions }));
      return { ok: true };
    },
    [accountUserId, profileRefreshGen]
  );

  // Pre-warm cache for every linked participant mentioned on a visible
  // Round so the live-render resolver in scorecard / feed surfaces has
  // identity data without each one fetching on demand. Reads
  // completedRounds from GolfRoundContext, which means this provider
  // must mount BELOW GolfRoundProvider.
  const { completedRounds } = useGolfRound();
  useEffect(() => {
    if (!account) return;
    const ids = new Set<string>();
    for (const r of completedRounds) {
      for (const uid of r.mentionedUserIds ?? []) ids.add(uid);
      if (r.ownerUserId) ids.add(r.ownerUserId);
    }
    ids.delete(account.userId);
    if (ids.size === 0) return;
    void ensureProfilesCached([...ids]);
  }, [completedRounds, account, ensureProfilesCached]);

  const value = useMemo<ProfileCacheContextValue>(
    () => ({
      profileCache,
      ensureProfilesCached,
      refreshProfiles,
    }),
    [profileCache, ensureProfilesCached, refreshProfiles]
  );

  return (
    <ProfileCacheContext.Provider value={value}>
      {children}
    </ProfileCacheContext.Provider>
  );
}

export function useProfileCache() {
  const ctx = useContext(ProfileCacheContext);
  if (!ctx) {
    throw new Error('useProfileCache must be used inside ProfileCacheProvider.');
  }
  return ctx;
}
