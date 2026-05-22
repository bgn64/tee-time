/**
 * FriendsContext — owns the friend graph: `friendships`,
 * `friend_requests`, and the search / send / accept / decline RPCs.
 *
 * Renamed from `SocialContext` when the responsibility was split:
 * the lazy profile cache (`profileCache` + `ensureProfilesCached` +
 * `refreshProfiles`) moved to `ProfileCacheContext` so its
 * frequently-mutating state stops re-rendering banner / list
 * consumers that only care about friendship changes.
 *
 * Three Supabase resources back this:
 *   · `profiles`           — handle search reads from here (writes to
 *                            the profile cache via `useProfileCache`).
 *   · `friend_requests`    — outgoing/incoming, refreshed on demand.
 *   · `friendships`        — accepted relationships. Symmetric two-
 *                            row entries written transactionally by
 *                            the `accept_friend_request` RPC.
 *
 * The `friends` array is derived from `friendships` (the userIds of
 * every row where `user_id = me`). When that table changes, friends
 * change.
 *
 * Sign-out clear: local state resets when `accountUserId` flips to
 * null. Sign-back-in re-pulls. Effects key off `accountUserId`
 * (not the whole account object) so cosmetic profile edits /
 * TOKEN_REFRESHED don't re-pull. `hydrated` is a one-way latch;
 * `syncing` is the transient in-flight flag.
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
import { usePlayers } from '@/state/PlayerContext';
import { useProfileCache } from '@/state/ProfileCacheContext';
import { supabase } from '@/state/supabaseClient';
import { FriendRequest, ProfileSummary } from '@/types/social';

type CloudFriendRequestRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  source_player_id: string | null;
  created_at: string;
};

type CloudFriendshipRow = {
  user_id: string;
  friend_user_id: string;
  created_at: string;
};

type CloudProfileRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_color: string;
};

type FriendsContextValue = {
  friends: string[];
  outgoingRequests: FriendRequest[];
  incomingRequests: FriendRequest[];

  searchHandle: (q: string) => Promise<ProfileSummary[]>;
  sendFriendRequest: (target: ProfileSummary) => Promise<void>;
  acceptIncomingRequest: (requestId: string) => Promise<{
    newFriendUserId: string;
  } | null>;
  declineIncomingRequest: (requestId: string) => Promise<void>;

  /**
   * Re-run the friendships + friend_requests cloud pull on demand.
   * Used by pull-to-refresh on every cloud-backed screen that
   * surfaces friends or requests.
   *
   * Resolves to `{ ok: true }` on success (including the no-op
   * signed-out case and stale-generation discards) and
   * `{ ok: false, error }` when either underlying select returns a
   * transient error. On failure local state is left untouched so the
   * user-visible roster doesn't blink to empty.
   */
  refreshFriendsAndRequests: () => Promise<{ ok: boolean; error?: string }>;

  /**
   * One-way latch: flips `true` after the first sync attempt (success
   * or empty-because-signed-out) and never flips back. Consumers
   * that gate navigation rendering on "are we ready?" should read
   * this flag.
   */
  hydrated: boolean;
  /**
   * Transient flag: `true` while an account-scoped initial pull is
   * in flight, `false` otherwise. Use this for spinners /
   * pull-to-refresh indicators — never for unmounting the navigator.
   */
  syncing: boolean;
};

const FriendsContext = createContext<FriendsContextValue | undefined>(undefined);

function rowToFriendRequest(row: CloudFriendRequestRow, profile?: ProfileSummary): FriendRequest {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    fromHandle: profile?.handle ?? '',
    fromDisplayName: profile?.displayName ?? '',
    fromAvatarColor: profile?.avatarColor ?? '#888888',
    toUserId: row.to_user_id,
    toHandle: '',
    status: row.status,
    createdAt: row.created_at,
  };
}

function profileFromRow(row: CloudProfileRow): ProfileSummary {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
  };
}

export function FriendsProvider({ children }: PropsWithChildren) {
  const [friends, setFriends] = useState<string[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { account } = useAccount();
  const { ensureRosterForFriend } = usePlayers();
  const { refreshScorecards } = useGolfRound();
  const { profileCache, ensureProfilesCached } = useProfileCache();

  // Stable primitive — see GolfRoundContext for the same pattern.
  // Use in effect deps when only WHICH user is signed in matters,
  // not cosmetic profile updates (avatar color, display name,
  // TOKEN_REFRESHED).
  const accountUserId = account?.userId ?? null;

  // `accountRef` lets `refreshFriendsAndRequests` read live self-
  // profile fields (handle / displayName / avatarColor) when
  // constructing outgoing-request rows, without listing `account` in
  // the useCallback dep array. Keying off `accountUserId` only keeps
  // the callback identity stable across cosmetic profile edits /
  // hourly TOKEN_REFRESHED — the cascade-prevention rationale
  // documented in the May 2026 refactor plan.
  const accountRef = useRef(account);
  accountRef.current = account;

  // `profileCacheRef` lets `acceptIncomingRequest` read the latest
  // cache without listing `profileCache` in its dep array (which
  // would re-create the callback every time the cache mutates).
  const profileCacheRef = useRef(profileCache);
  profileCacheRef.current = profileCache;

  // `ensureProfilesCached` is stable across renders (its useCallback
  // in ProfileCacheContext has `[]` deps), so this ref is technically
  // redundant — kept as a forward-compatible escape hatch.
  const ensureProfilesCachedRef = useRef(ensureProfilesCached);
  ensureProfilesCachedRef.current = ensureProfilesCached;

  // One-way `hydrated` latch. Once `true`, stays `true` for the
  // lifetime of the provider — even across sign-out / sign-in
  // transitions. The splash gate in `app/_layout.tsx` depends on
  // this so a token refresh or cosmetic profile edit doesn't blank
  // the navigator. Use `syncing` for the transient "currently
  // pulling" signal.
  const hydratedLatchedRef = useRef(false);
  const latchHydrated = useCallback(() => {
    if (hydratedLatchedRef.current) return;
    hydratedLatchedRef.current = true;
    setHydrated(true);
  }, []);

  // Latest-response-wins token pair for `refreshFriendsAndRequests`.
  const refreshGen = useRefreshGeneration();

  /**
   * Pull friendships + pending friend_requests from the cloud and
   * write them to local state. Used by both the initial-pull effect
   * (which also flips the `hydrated` latch) and pull-to-refresh.
   *
   * Merge strategy: the response is treated as authoritative — the
   * fresh server snapshot wins and overwrites `friends` / `outgoing`
   * / `incoming`. We prefer this simple write over a per-list merge
   * because `friends` carries no client-only fields that would be
   * lost by overwrite, and a row-level DELETE that landed between
   * the snapshot and the response must be honored.
   */
  const refreshFriendsAndRequests = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!accountUserId) return { ok: true };
    const meId = accountUserId;
    const myToken = refreshGen.begin();

    setSyncing(true);
    try {
      const [friendshipsRes, requestsRes] = await Promise.all([
        supabase.from('friendships').select('user_id, friend_user_id, created_at'),
        supabase
          .from('friend_requests')
          .select('id, from_user_id, to_user_id, status, source_player_id, created_at'),
      ]);
      if (refreshGen.isStale(myToken)) return { ok: true };
      if (friendshipsRes.error) {
        console.warn('[friends] friendships pull:', friendshipsRes.error);
        return { ok: false, error: friendshipsRes.error.message };
      }
      if (requestsRes.error) {
        console.warn('[friends] requests pull:', requestsRes.error);
        return { ok: false, error: requestsRes.error.message };
      }

      const friendships = (friendshipsRes.data ?? []) as CloudFriendshipRow[];
      const requests = (requestsRes.data ?? []) as CloudFriendRequestRow[];

      const friendUserIds = friendships
        .filter((f) => f.user_id === meId)
        .map((f) => f.friend_user_id);

      const profileIds = new Set<string>([
        ...friendUserIds,
        ...requests.map((r) => r.from_user_id),
        ...requests.map((r) => r.to_user_id),
      ]);
      const profiles = await ensureProfilesCachedRef.current([...profileIds]);
      if (refreshGen.isStale(myToken)) return { ok: true };

      const meAccount = accountRef.current;
      const incoming: FriendRequest[] = [];
      const outgoing: FriendRequest[] = [];
      for (const r of requests) {
        if (r.status !== 'pending') continue;
        if (r.from_user_id === meId) {
          const targetProfile = profiles[r.to_user_id];
          outgoing.push({
            ...rowToFriendRequest(r, targetProfile),
            toHandle: targetProfile?.handle ?? '',
            fromHandle: meAccount?.handle ?? '',
            fromDisplayName: meAccount?.displayName ?? '',
            fromAvatarColor: meAccount?.avatarColor ?? '#888888',
          });
        } else if (r.to_user_id === meId) {
          incoming.push(rowToFriendRequest(r, profiles[r.from_user_id]));
        }
      }

      setFriends(friendUserIds);
      setOutgoingRequests(outgoing);
      setIncomingRequests(incoming);
      return { ok: true };
    } finally {
      if (!refreshGen.isStale(myToken)) {
        setSyncing(false);
      }
    }
  }, [accountUserId, refreshGen]);

  // Initial pull when `accountUserId` becomes non-null. Sign-out
  // clears local state but does NOT lower `hydrated`. Keying off the
  // stable userId (not the whole account object) prevents re-pulls
  // on cosmetic profile edits / TOKEN_REFRESHED. Self-profile fields
  // used when constructing outgoing-request rows are read off
  // `accountRef.current` so cosmetic edits made between mount and
  // this effect still land.
  useEffect(() => {
    if (!accountUserId) {
      setFriends([]);
      setOutgoingRequests([]);
      setIncomingRequests([]);
      setSyncing(false);
      // Signed-out users have nothing to load — latch hydrated so the
      // splash gate doesn't get stuck. Idempotent if already latched.
      latchHydrated();
      return;
    }

    void refreshFriendsAndRequests().then(() => {
      latchHydrated();
    });
  }, [accountUserId, refreshFriendsAndRequests, latchHydrated]);

  const searchHandle = useCallback(
    async (q: string): Promise<ProfileSummary[]> => {
      if (!account) return [];
      const trimmed = q.trim().toLowerCase().replace(/^@/, '');
      if (!trimmed) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .ilike('handle', `${trimmed}%`)
        .neq('user_id', account.userId)
        .limit(20);
      if (error) {
        console.warn('[friends] handle search failed:', error);
        return [];
      }
      const profiles = ((data ?? []) as CloudProfileRow[]).map(profileFromRow);
      // Warm the profile cache via the canonical helper so other
      // surfaces benefit from the search results.
      if (profiles.length > 0) {
        void ensureProfilesCachedRef.current(
          profiles.map((p) => p.userId),
          { force: true }
        );
      }
      return profiles;
    },
    [account]
  );

  const sendFriendRequest = useCallback(
    async (target: ProfileSummary) => {
      if (!account) return;
      // Warm the profile cache with the target so downstream surfaces
      // (banner / search row) render the latest name/color immediately.
      void ensureProfilesCachedRef.current([target.userId], { force: true });
      const { error } = await supabase.from('friend_requests').insert({
        from_user_id: account.userId,
        to_user_id: target.userId,
        status: 'pending',
        source_player_id: null,
      });
      if (error) console.warn('[friends] sendFriendRequest:', error);
    },
    [account]
  );

  const acceptIncomingRequest = useCallback(
    async (requestId: string) => {
      if (!account) return null;
      const req = incomingRequests.find((r) => r.id === requestId);
      if (!req) return null;

      const { error } = await supabase.rpc('accept_friend_request', { request_id: requestId });
      if (error) {
        console.warn('[friends] accept_friend_request:', error);
        return null;
      }

      // Auto-create a roster entry for the new friend so they show up
      // in the Friends list immediately. `ensureRosterForFriend` uses
      // a deterministic `player-${userId}` id and the DB partial-
      // unique index on `(owner_user_id, linked_user_id)` (migration
      // 018) so concurrent inserts from different sources can never
      // mint duplicate rows. Under Path 3a we don't merge any
      // pre-existing local roster entries — local players are an
      // implementation detail with no merge-to-friend flow.
      const newFriendProfile =
        profileCacheRef.current[req.fromUserId] ??
        (await ensureProfilesCachedRef.current([req.fromUserId]))[req.fromUserId];

      if (newFriendProfile) {
        ensureRosterForFriend(newFriendProfile);
      }

      // Backfill any rounds the new friend completed BEFORE this
      // accept. Under refresh-only sync the *sender* device won't see
      // the new friendship until they pull-to-refresh on their end;
      // here we cover the receiver side by re-pulling immediately so
      // backfilled friend rounds land in the feed without requiring
      // a second action.
      void refreshScorecards();

      return { newFriendUserId: req.fromUserId };
    },
    [account, incomingRequests, ensureRosterForFriend, refreshScorecards]
  );

  const declineIncomingRequest = useCallback(
    async (requestId: string) => {
      if (!account) return;
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'declined' })
        .eq('id', requestId);
      if (error) console.warn('[friends] decline:', error);
    },
    [account]
  );

  const value = useMemo<FriendsContextValue>(
    () => ({
      friends,
      outgoingRequests,
      incomingRequests,
      searchHandle,
      sendFriendRequest,
      acceptIncomingRequest,
      declineIncomingRequest,
      refreshFriendsAndRequests,
      hydrated,
      syncing,
    }),
    [
      friends,
      outgoingRequests,
      incomingRequests,
      searchHandle,
      sendFriendRequest,
      acceptIncomingRequest,
      declineIncomingRequest,
      refreshFriendsAndRequests,
      hydrated,
      syncing,
    ]
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (!context) {
    throw new Error('useFriends must be used inside FriendsProvider.');
  }
  return context;
}
