/**
 * Social context — real Supabase wiring for the friend graph.
 *
 * Replaces the Step 8 stub. Surface kept the same so consumers (People-tab
 * search / confirm-request / detail screens, incoming-request banner) need
 * minimal changes.
 *
 * Three Supabase resources back this:
 *   · `profiles`           — handle search reads from here.
 *   · `friend_requests`    — outgoing/incoming. Realtime subscription
 *                            keeps both lists in sync with the server.
 *   · `friendships`        — accepted relationships. Symmetric two-row
 *                            entries written transactionally by the
 *                            `accept_friend_request` RPC. Realtime sub.
 *
 * The `friends` array is derived from `friendships` (the userIds of every
 * row where `user_id = me`). When that table changes, friends change.
 *
 * Sign-out clear: the realtime channel is torn down and local state
 * resets when `account` flips to null. Sign-back-in re-pulls on mount.
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
import { useGolfRound } from '@/state/GolfRoundContext';
import { usePlayers } from '@/state/PlayerContext';
import { supabase } from '@/state/supabaseClient';
import { Round } from '@/types/golf';
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

type SocialContextValue = {
  friends: string[];
  outgoingRequests: FriendRequest[];
  incomingRequests: FriendRequest[];
  profileCache: Record<string, ProfileSummary>;

  searchHandle: (q: string) => Promise<ProfileSummary[]>;
  sendFriendRequest: (target: ProfileSummary, sourcePlayerId?: string) => Promise<void>;
  acceptIncomingRequest: (requestId: string) => Promise<{
    newFriendUserId: string;
    matchedPlayerId: string | null;
    sharedRounds: Round[];
  } | null>;
  declineIncomingRequest: (requestId: string) => Promise<void>;

  hydrated: boolean;
};

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

function rowToFriendRequest(row: CloudFriendRequestRow, profile?: ProfileSummary): FriendRequest {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    fromHandle: profile?.handle ?? '',
    fromDisplayName: profile?.displayName ?? '',
    fromAvatarColor: profile?.avatarColor ?? '#888888',
    toUserId: row.to_user_id,
    toHandle: '',
    sourcePlayerId: row.source_player_id ?? undefined,
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

export function SocialProvider({ children }: PropsWithChildren) {
  const [friends, setFriends] = useState<string[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [profileCache, setProfileCache] = useState<Record<string, ProfileSummary>>({});
  const [hydrated, setHydrated] = useState(false);

  const { account } = useAccount();
  const { allPlayers, addPlayer } = usePlayers();
  const { completedRounds } = useGolfRound();

  const profileCacheRef = useRef(profileCache);
  profileCacheRef.current = profileCache;

  const ensureProfilesCached = useCallback(
    async (userIds: string[]): Promise<Record<string, ProfileSummary>> => {
      const missing = userIds.filter((id) => !profileCacheRef.current[id]);
      if (missing.length === 0) return profileCacheRef.current;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .in('user_id', missing);
      if (error) {
        console.warn('[social] profile lookup failed:', error);
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

  // Initial pull when account becomes non-null. Sign-out clears.
  useEffect(() => {
    if (!account) {
      setFriends([]);
      setOutgoingRequests([]);
      setIncomingRequests([]);
      setProfileCache({});
      setHydrated(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const [friendshipsRes, requestsRes] = await Promise.all([
        supabase.from('friendships').select('user_id, friend_user_id, created_at'),
        supabase
          .from('friend_requests')
          .select('id, from_user_id, to_user_id, status, source_player_id, created_at'),
      ]);
      if (cancelled) return;
      if (friendshipsRes.error) console.warn('[social] friendships pull:', friendshipsRes.error);
      if (requestsRes.error) console.warn('[social] requests pull:', requestsRes.error);

      const friendships = (friendshipsRes.data ?? []) as CloudFriendshipRow[];
      const requests = (requestsRes.data ?? []) as CloudFriendRequestRow[];

      const friendUserIds = friendships.map((f) => f.friend_user_id);
      setFriends(friendUserIds);

      const profileIds = new Set<string>([
        ...friendUserIds,
        ...requests.map((r) => r.from_user_id),
        ...requests.map((r) => r.to_user_id),
      ]);
      const profiles = await ensureProfilesCached([...profileIds]);
      if (cancelled) return;

      const meId = account.userId;
      const incoming: FriendRequest[] = [];
      const outgoing: FriendRequest[] = [];
      for (const r of requests) {
        if (r.status !== 'pending') continue;
        if (r.from_user_id === meId) {
          const targetProfile = profiles[r.to_user_id];
          outgoing.push({
            ...rowToFriendRequest(r, targetProfile),
            toHandle: targetProfile?.handle ?? '',
            fromHandle: account.handle,
            fromDisplayName: account.displayName,
            fromAvatarColor: account.avatarColor,
          });
        } else if (r.to_user_id === meId) {
          incoming.push(rowToFriendRequest(r, profiles[r.from_user_id]));
        }
      }
      setOutgoingRequests(outgoing);
      setIncomingRequests(incoming);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [account, ensureProfilesCached]);

  // Realtime subscription: friend_requests + friendships.
  useEffect(() => {
    if (!account) return;
    const meId = account.userId;

    const channel = supabase
      .channel('friends-and-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        async (payload) => {
          const newRow = payload.new as CloudFriendRequestRow | undefined;
          const oldRow = payload.old as CloudFriendRequestRow | undefined;
          const row = newRow ?? oldRow;
          if (!row) return;

          await ensureProfilesCached([row.from_user_id, row.to_user_id]);
          const profiles = profileCacheRef.current;

          if (payload.eventType === 'DELETE') {
            setIncomingRequests((prev) => prev.filter((r) => r.id !== row.id));
            setOutgoingRequests((prev) => prev.filter((r) => r.id !== row.id));
            return;
          }

          const next = newRow!;
          const isOutgoing = next.from_user_id === meId;
          const targetList = isOutgoing ? setOutgoingRequests : setIncomingRequests;

          if (next.status !== 'pending') {
            targetList((prev) => prev.filter((r) => r.id !== next.id));
            return;
          }

          const fr: FriendRequest = isOutgoing
            ? {
                ...rowToFriendRequest(next, profiles[next.to_user_id]),
                toHandle: profiles[next.to_user_id]?.handle ?? '',
                fromHandle: account.handle,
                fromDisplayName: account.displayName,
                fromAvatarColor: account.avatarColor,
              }
            : rowToFriendRequest(next, profiles[next.from_user_id]);

          targetList((prev) => {
            const i = prev.findIndex((r) => r.id === fr.id);
            if (i === -1) return [...prev, fr];
            const copy = prev.slice();
            copy[i] = fr;
            return copy;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        async (payload) => {
          const newRow = payload.new as CloudFriendshipRow | undefined;
          const oldRow = payload.old as CloudFriendshipRow | undefined;

          if (payload.eventType === 'DELETE' && oldRow) {
            if (oldRow.user_id !== meId) return;
            setFriends((prev) => prev.filter((id) => id !== oldRow.friend_user_id));
            return;
          }
          if (newRow && newRow.user_id === meId) {
            await ensureProfilesCached([newRow.friend_user_id]);
            setFriends((prev) =>
              prev.includes(newRow.friend_user_id) ? prev : [...prev, newRow.friend_user_id]
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account, ensureProfilesCached]);

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
        console.warn('[social] handle search failed:', error);
        return [];
      }
      const profiles = ((data ?? []) as CloudProfileRow[]).map(profileFromRow);
      setProfileCache((prev) => {
        const next = { ...prev };
        for (const p of profiles) next[p.userId] = p;
        return next;
      });
      return profiles;
    },
    [account]
  );

  const sendFriendRequest = useCallback(
    async (target: ProfileSummary, sourcePlayerId?: string) => {
      if (!account) return;
      setProfileCache((prev) => ({ ...prev, [target.userId]: target }));
      const { error } = await supabase.from('friend_requests').insert({
        from_user_id: account.userId,
        to_user_id: target.userId,
        status: 'pending',
        source_player_id: sourcePlayerId ?? null,
      });
      if (error) console.warn('[social] sendFriendRequest:', error);
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
        console.warn('[social] accept_friend_request:', error);
        return null;
      }

      const newFriendProfile =
        profileCacheRef.current[req.fromUserId] ??
        (await ensureProfilesCached([req.fromUserId]))[req.fromUserId];

      let matchedPlayerId: string | null = null;
      if (newFriendProfile) {
        const existing = allPlayers.find((p) => p.userId === newFriendProfile.userId);
        if (existing) {
          matchedPlayerId = existing.id;
        } else {
          const newId = `player-${newFriendProfile.userId}-${Date.now()}`;
          addPlayer({
            id: newId,
            nickname: newFriendProfile.displayName,
            displayName: newFriendProfile.displayName,
            handle: newFriendProfile.handle,
            color: newFriendProfile.avatarColor,
            userId: newFriendProfile.userId,
          });
          matchedPlayerId = newId;
        }
      }

      const sharedRounds: Round[] = matchedPlayerId
        ? completedRounds.filter((r) => r.ownerId === matchedPlayerId)
        : [];

      return {
        newFriendUserId: req.fromUserId,
        matchedPlayerId,
        sharedRounds,
      };
    },
    [account, incomingRequests, allPlayers, addPlayer, completedRounds, ensureProfilesCached]
  );

  const declineIncomingRequest = useCallback(
    async (requestId: string) => {
      if (!account) return;
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'declined' })
        .eq('id', requestId);
      if (error) console.warn('[social] decline:', error);
    },
    [account]
  );

  const value = useMemo<SocialContextValue>(
    () => ({
      friends,
      outgoingRequests,
      incomingRequests,
      profileCache,
      searchHandle,
      sendFriendRequest,
      acceptIncomingRequest,
      declineIncomingRequest,
      hydrated,
    }),
    [
      friends,
      outgoingRequests,
      incomingRequests,
      profileCache,
      searchHandle,
      sendFriendRequest,
      acceptIncomingRequest,
      declineIncomingRequest,
      hydrated,
    ]
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) {
    throw new Error('useSocial must be used inside SocialProvider.');
  }
  return context;
}
