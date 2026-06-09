/**
 * FriendsContext — owns the friend graph (`friendships`,
 * `friend_requests`) and the search / send / accept / decline /
 * cancel / unfriend RPC wrappers.
 *
 * Reads use React Query against Supabase REST: friendships come from
 * `friendships`, and pending requests come from the security-invoker
 * `friend_requests_with_profiles` view. RLS scopes both result sets to
 * the signed-in user. Writes still flow through the existing SECURITY
 * DEFINER RPCs because the integrity contract spans multiple rows.
 *
 * Mutations optimistically update the React Query caches for a responsive
 * UI, then invalidate both friend graph queries on settle so the server
 * remains authoritative for these two-party relational writes.
 *
 * Pill priority order (when multiple states apply, e.g. ex-friend
 * with a stale pending FR — `FriendStatus`):
 *
 *     self > friend > incoming-pending > outgoing-pending > stranger
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import React from 'react';

import { supabase } from '@/library/supabase/client';
import { useRequiredAccount } from './AccountContext';
import {
  fetchProfile as fetchProfileFromCache,
  getCachedProfile,
  warmProfileCache
} from './profileCache';
import type {
  FriendRequest,
  FriendStatus,
  ProfileSummary
} from '@/types/social';

type CloudProfileRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_color: string;
};

type FriendshipRow = {
  id: string;
  user_id: string;
  friend_user_id: string;
  created_at: string;
};

type FriendRequestWithProfilesRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
  from_profile_user_id?: string | null;
  from_handle: string | null;
  from_display_name: string | null;
  from_avatar_color: string | null;
  to_profile_user_id?: string | null;
  to_handle: string | null;
  to_display_name: string | null;
  to_avatar_color: string | null;
};

type FriendsContextValue = {
  friends: string[];
  outgoingRequests: FriendRequest[];
  incomingRequests: FriendRequest[];
  /** True once the friendships and request REST queries have settled. */
  hydrated: boolean;
  friendStatus: (userId: string) => FriendStatus;
  outgoingRequestTo: (userId: string) => FriendRequest | undefined;
  incomingRequestFrom: (userId: string) => FriendRequest | undefined;
  searchProfiles: (q: string) => Promise<ProfileSummary[]>;
  sendFriendRequest: (target: ProfileSummary) => Promise<void>;
  acceptIncomingRequest: (requestId: string) => Promise<void>;
  declineIncomingRequest: (requestId: string) => Promise<void>;
  cancelOutgoingRequest: (requestId: string) => Promise<void>;
  unfriend: (targetUserId: string) => Promise<void>;
};

type FriendGraphSnapshot = {
  previousFriendships: FriendshipRow[] | undefined;
  previousRequests: FriendRequestWithProfilesRow[] | undefined;
};

const FriendsContext = React.createContext<FriendsContextValue | null>(null);

function friendshipsQueryKey(userId: string) {
  return ['friends', 'friendships', userId] as const;
}

function friendRequestsQueryKey(userId: string) {
  return ['friends', 'friend_requests_with_profiles', userId] as const;
}

function profileQueryKey(userId: string | null | undefined) {
  return ['friends', 'profile', userId ?? null] as const;
}

/**
 * Escape `%` and `_` so a user-typed search like `a_b` doesn't match
 * `acb`. Both are LIKE wildcards in Postgres ILIKE. Escape char is
 * `\` — the Postgres default when no ESCAPE clause is given, which
 * PostgREST's `ilike.<pattern>` filter preserves verbatim.
 */
function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/[%_]/g, (m) => `\\${m}`);
}

function profileFromRow(row: CloudProfileRow): ProfileSummary {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    avatarColor: row.avatar_color
  };
}

function profileFromAccount(account: ReturnType<typeof useRequiredAccount>): ProfileSummary {
  return {
    userId: account.userId,
    handle: account.handle,
    displayName: account.displayName,
    avatarColor: account.avatarColor
  };
}

async function fetchFriendships(userId: string): Promise<FriendshipRow[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, user_id, friend_user_id, created_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as FriendshipRow[];
}

async function fetchFriendRequestRows(): Promise<FriendRequestWithProfilesRow[]> {
  const { data, error } = await supabase
    .from('friend_requests_with_profiles')
    .select('*');
  if (error) throw error;
  return (data ?? []) as FriendRequestWithProfilesRow[];
}

function buildFromViewRow(r: FriendRequestWithProfilesRow): FriendRequest {
  return {
    id: r.id,
    fromUserId: r.from_user_id,
    fromHandle: r.from_handle ?? '',
    fromDisplayName: r.from_display_name ?? '',
    fromAvatarColor: r.from_avatar_color ?? '#888888',
    toUserId: r.to_user_id,
    toHandle: r.to_handle ?? '',
    toDisplayName: r.to_display_name ?? undefined,
    toAvatarColor: r.to_avatar_color ?? undefined,
    status: (r.status as FriendRequest['status']) ?? 'pending',
    createdAt: r.created_at
  };
}

function profileFromRequestRow(
  row: FriendRequestWithProfilesRow,
  userId: string
): ProfileSummary | null {
  if (row.from_user_id === userId && row.from_handle) {
    return {
      userId: row.from_user_id,
      handle: row.from_handle,
      displayName: row.from_display_name ?? '',
      avatarColor: row.from_avatar_color ?? '#888888'
    };
  }
  if (row.to_user_id === userId && row.to_handle) {
    return {
      userId: row.to_user_id,
      handle: row.to_handle,
      displayName: row.to_display_name ?? '',
      avatarColor: row.to_avatar_color ?? '#888888'
    };
  }
  return null;
}

function profilesFromRequestRows(rows: FriendRequestWithProfilesRow[]): ProfileSummary[] {
  const out = new Map<string, ProfileSummary>();
  for (const row of rows) {
    const from = profileFromRequestRow(row, row.from_user_id);
    if (from) out.set(from.userId, from);
    const to = profileFromRequestRow(row, row.to_user_id);
    if (to) out.set(to.userId, to);
  }
  return [...out.values()];
}

function optimisticFriendship(me: string, friendUserId: string): FriendshipRow {
  return {
    id: `optimistic-friendship-${friendUserId}-${Date.now()}`,
    user_id: me,
    friend_user_id: friendUserId,
    created_at: new Date().toISOString()
  };
}

function optimisticRequest(
  me: string,
  account: ReturnType<typeof useRequiredAccount>,
  target: ProfileSummary
): FriendRequestWithProfilesRow {
  return {
    id: `optimistic-request-${target.userId}-${Date.now()}`,
    from_user_id: me,
    to_user_id: target.userId,
    status: 'pending',
    created_at: new Date().toISOString(),
    from_profile_user_id: me,
    from_handle: account.handle,
    from_display_name: account.displayName,
    from_avatar_color: account.avatarColor,
    to_profile_user_id: target.userId,
    to_handle: target.handle,
    to_display_name: target.displayName,
    to_avatar_color: target.avatarColor
  };
}

async function snapshotFriendGraph(
  queryClient: QueryClient,
  userId: string
): Promise<FriendGraphSnapshot> {
  const friendshipsKey = friendshipsQueryKey(userId);
  const requestsKey = friendRequestsQueryKey(userId);
  await Promise.all([
    queryClient.cancelQueries({ queryKey: friendshipsKey }),
    queryClient.cancelQueries({ queryKey: requestsKey })
  ]);
  return {
    previousFriendships: queryClient.getQueryData<FriendshipRow[]>(friendshipsKey),
    previousRequests:
      queryClient.getQueryData<FriendRequestWithProfilesRow[]>(requestsKey)
  };
}

function restoreFriendGraph(
  queryClient: QueryClient,
  userId: string,
  snapshot: FriendGraphSnapshot | undefined
): void {
  if (!snapshot) return;
  queryClient.setQueryData(friendshipsQueryKey(userId), snapshot.previousFriendships);
  queryClient.setQueryData(friendRequestsQueryKey(userId), snapshot.previousRequests);
}

function invalidateFriendGraph(queryClient: QueryClient, userId: string): void {
  void queryClient.invalidateQueries({ queryKey: friendshipsQueryKey(userId) });
  void queryClient.invalidateQueries({ queryKey: friendRequestsQueryKey(userId) });
}

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  // FriendsProvider mounts only when AuthGate has cleared its stage-2
  // check (account.status === 'ready'), so the account is guaranteed
  // non-null. Logout unmounts the gate's children which destroys this
  // provider's state for free.
  const account = useRequiredAccount();
  const accountUserId = account.userId;
  const queryClient = useQueryClient();

  const {
    data: friendshipRows = [],
    status: friendshipsStatus
  } = useQuery<FriendshipRow[]>({
    queryKey: friendshipsQueryKey(accountUserId),
    queryFn: () => fetchFriendships(accountUserId)
  });

  const {
    data: requestJoinedRows = [],
    status: requestsStatus
  } = useQuery<FriendRequestWithProfilesRow[]>({
    queryKey: friendRequestsQueryKey(accountUserId),
    queryFn: fetchFriendRequestRows
  });

  const hydrated = friendshipsStatus !== 'pending' && requestsStatus !== 'pending';

  React.useEffect(() => {
    const profiles = profilesFromRequestRows(requestJoinedRows);
    if (profiles.length > 0) warmProfileCache(profiles);
  }, [requestJoinedRows]);

  const friends = React.useMemo(() => {
    return friendshipRows.map((r) => r.friend_user_id);
  }, [friendshipRows]);

  const incomingRequests = React.useMemo<FriendRequest[]>(() => {
    return requestJoinedRows
      .filter((r) => r.to_user_id === accountUserId)
      .map(buildFromViewRow);
  }, [requestJoinedRows, accountUserId]);

  const outgoingRequests = React.useMemo<FriendRequest[]>(() => {
    return requestJoinedRows
      .filter((r) => r.from_user_id === accountUserId)
      .map(buildFromViewRow);
  }, [requestJoinedRows, accountUserId]);

  const friendsSet = React.useMemo(() => new Set(friends), [friends]);
  const incomingByFromId = React.useMemo(() => {
    const map = new Map<string, FriendRequest>();
    for (const r of incomingRequests) map.set(r.fromUserId, r);
    return map;
  }, [incomingRequests]);
  const outgoingByToId = React.useMemo(() => {
    const map = new Map<string, FriendRequest>();
    for (const r of outgoingRequests) map.set(r.toUserId, r);
    return map;
  }, [outgoingRequests]);

  const friendStatus = React.useCallback(
    (userId: string): FriendStatus => {
      if (!accountUserId) return 'stranger';
      if (userId === accountUserId) return 'self';
      if (friendsSet.has(userId)) return 'friend';
      if (incomingByFromId.has(userId)) return 'incoming-pending';
      if (outgoingByToId.has(userId)) return 'outgoing-pending';
      return 'stranger';
    },
    [accountUserId, friendsSet, incomingByFromId, outgoingByToId]
  );

  const incomingRequestFrom = React.useCallback(
    (userId: string) => incomingByFromId.get(userId),
    [incomingByFromId]
  );
  const outgoingRequestTo = React.useCallback(
    (userId: string) => outgoingByToId.get(userId),
    [outgoingByToId]
  );

  const sendFriendRequestMutation = useMutation<
    void,
    Error,
    ProfileSummary,
    FriendGraphSnapshot
  >({
    mutationFn: async (target) => {
      const { error } = await supabase.rpc('send_friend_request', {
        target_user_id: target.userId
      });
      if (error) throw error;
    },
    onMutate: async (target) => {
      warmProfileCache([target]);
      const snapshot = await snapshotFriendGraph(queryClient, accountUserId);
      const requestsKey = friendRequestsQueryKey(accountUserId);
      const friendshipsKey = friendshipsQueryKey(accountUserId);
      const reciprocalIncoming = snapshot.previousRequests?.some(
        (r) => r.from_user_id === target.userId && r.to_user_id === accountUserId
      );

      queryClient.setQueryData<FriendRequestWithProfilesRow[]>(requestsKey, (old) => {
        const rows = old ?? [];
        if (reciprocalIncoming) {
          return rows.filter(
            (r) =>
              !(
                (r.from_user_id === target.userId && r.to_user_id === accountUserId) ||
                (r.from_user_id === accountUserId && r.to_user_id === target.userId)
              )
          );
        }
        if (
          rows.some(
            (r) => r.from_user_id === accountUserId && r.to_user_id === target.userId
          )
        ) {
          return rows;
        }
        return [...rows, optimisticRequest(accountUserId, account, target)];
      });

      if (reciprocalIncoming) {
        queryClient.setQueryData<FriendshipRow[]>(friendshipsKey, (old) => {
          const rows = old ?? [];
          if (rows.some((r) => r.friend_user_id === target.userId)) return rows;
          return [...rows, optimisticFriendship(accountUserId, target.userId)];
        });
      }

      return snapshot;
    },
    onError: (err, _target, snapshot) => {
      restoreFriendGraph(queryClient, accountUserId, snapshot);
      console.warn('[friends] send_friend_request:', err);
    },
    onSettled: () => {
      invalidateFriendGraph(queryClient, accountUserId);
    }
  });

  const acceptIncomingRequestMutation = useMutation<
    void,
    Error,
    string,
    FriendGraphSnapshot
  >({
    mutationFn: async (requestId) => {
      const { error } = await supabase.rpc('accept_friend_request', {
        request_id: requestId
      });
      if (error) throw error;
    },
    onMutate: async (requestId) => {
      const snapshot = await snapshotFriendGraph(queryClient, accountUserId);
      const row = snapshot.previousRequests?.find((r) => r.id === requestId);
      if (!row) return snapshot;
      const fromUserId = row.from_user_id;
      const requestsKey = friendRequestsQueryKey(accountUserId);
      const friendshipsKey = friendshipsQueryKey(accountUserId);
      const fromProfile = profileFromRequestRow(row, fromUserId);
      if (fromProfile) warmProfileCache([fromProfile]);

      queryClient.setQueryData<FriendRequestWithProfilesRow[]>(requestsKey, (old) =>
        (old ?? []).filter(
          (r) =>
            r.id !== requestId &&
            !(r.from_user_id === accountUserId && r.to_user_id === fromUserId)
        )
      );
      queryClient.setQueryData<FriendshipRow[]>(friendshipsKey, (old) => {
        const rows = old ?? [];
        if (rows.some((r) => r.friend_user_id === fromUserId)) return rows;
        return [...rows, optimisticFriendship(accountUserId, fromUserId)];
      });

      return snapshot;
    },
    onError: (err, _requestId, snapshot) => {
      restoreFriendGraph(queryClient, accountUserId, snapshot);
      console.warn('[friends] accept_friend_request:', err);
    },
    onSettled: () => {
      invalidateFriendGraph(queryClient, accountUserId);
    }
  });

  const declineIncomingRequestMutation = useMutation<
    void,
    Error,
    string,
    FriendGraphSnapshot
  >({
    mutationFn: async (requestId) => {
      const { error } = await supabase.rpc('decline_friend_request', {
        request_id: requestId
      });
      if (error) throw error;
    },
    onMutate: async (requestId) => {
      const snapshot = await snapshotFriendGraph(queryClient, accountUserId);
      queryClient.setQueryData<FriendRequestWithProfilesRow[]>(
        friendRequestsQueryKey(accountUserId),
        (old) => (old ?? []).filter((r) => r.id !== requestId)
      );
      return snapshot;
    },
    onError: (err, _requestId, snapshot) => {
      restoreFriendGraph(queryClient, accountUserId, snapshot);
      console.warn('[friends] decline_friend_request:', err);
    },
    onSettled: () => {
      invalidateFriendGraph(queryClient, accountUserId);
    }
  });

  const cancelOutgoingRequestMutation = useMutation<
    void,
    Error,
    string,
    FriendGraphSnapshot
  >({
    mutationFn: async (requestId) => {
      const { error } = await supabase.rpc('cancel_friend_request', {
        request_id: requestId
      });
      if (error) throw error;
    },
    onMutate: async (requestId) => {
      const snapshot = await snapshotFriendGraph(queryClient, accountUserId);
      queryClient.setQueryData<FriendRequestWithProfilesRow[]>(
        friendRequestsQueryKey(accountUserId),
        (old) => (old ?? []).filter((r) => r.id !== requestId)
      );
      return snapshot;
    },
    onError: (err, _requestId, snapshot) => {
      restoreFriendGraph(queryClient, accountUserId, snapshot);
      console.warn('[friends] cancel_friend_request:', err);
    },
    onSettled: () => {
      invalidateFriendGraph(queryClient, accountUserId);
    }
  });

  const unfriendMutation = useMutation<
    void,
    Error,
    string,
    FriendGraphSnapshot
  >({
    mutationFn: async (targetUserId) => {
      const { error } = await supabase.rpc('unfriend', {
        target_user_id: targetUserId
      });
      if (error) throw error;
    },
    onMutate: async (targetUserId) => {
      const snapshot = await snapshotFriendGraph(queryClient, accountUserId);
      queryClient.setQueryData<FriendshipRow[]>(
        friendshipsQueryKey(accountUserId),
        (old) => (old ?? []).filter((r) => r.friend_user_id !== targetUserId)
      );
      queryClient.setQueryData<FriendRequestWithProfilesRow[]>(
        friendRequestsQueryKey(accountUserId),
        (old) =>
          (old ?? []).filter(
            (r) =>
              !(
                (r.from_user_id === accountUserId && r.to_user_id === targetUserId) ||
                (r.from_user_id === targetUserId && r.to_user_id === accountUserId)
              )
          )
      );
      return snapshot;
    },
    onError: (err, _targetUserId, snapshot) => {
      restoreFriendGraph(queryClient, accountUserId, snapshot);
      console.warn('[friends] unfriend:', err);
    },
    onSettled: () => {
      invalidateFriendGraph(queryClient, accountUserId);
    }
  });

  const searchProfiles = React.useCallback(
    async (q: string): Promise<ProfileSummary[]> => {
      const trimmed = q.trim().toLowerCase().replace(/^@+/, '');
      if (trimmed.length < 2) return [];
      const pattern = `${escapeLikePattern(trimmed)}%`;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_color')
        .ilike('handle', pattern)
        .neq('user_id', accountUserId)
        .limit(20);
      if (error) {
        console.warn('[friends] search failed:', error);
        return [];
      }
      const profiles = ((data ?? []) as CloudProfileRow[]).map(profileFromRow);
      warmProfileCache(profiles);
      return profiles;
    },
    [accountUserId]
  );

  const sendFriendRequest = React.useCallback(
    async (target: ProfileSummary) => {
      await sendFriendRequestMutation.mutateAsync(target);
    },
    [sendFriendRequestMutation]
  );

  const acceptIncomingRequest = React.useCallback(
    async (requestId: string) => {
      await acceptIncomingRequestMutation.mutateAsync(requestId);
    },
    [acceptIncomingRequestMutation]
  );

  const declineIncomingRequest = React.useCallback(
    async (requestId: string) => {
      await declineIncomingRequestMutation.mutateAsync(requestId);
    },
    [declineIncomingRequestMutation]
  );

  const cancelOutgoingRequest = React.useCallback(
    async (requestId: string) => {
      await cancelOutgoingRequestMutation.mutateAsync(requestId);
    },
    [cancelOutgoingRequestMutation]
  );

  const unfriend = React.useCallback(
    async (targetUserId: string) => {
      await unfriendMutation.mutateAsync(targetUserId);
    },
    [unfriendMutation]
  );

  const value = React.useMemo<FriendsContextValue>(
    () => ({
      friends,
      outgoingRequests,
      incomingRequests,
      hydrated,
      friendStatus,
      outgoingRequestTo,
      incomingRequestFrom,
      searchProfiles,
      sendFriendRequest,
      acceptIncomingRequest,
      declineIncomingRequest,
      cancelOutgoingRequest,
      unfriend
    }),
    [
      friends,
      outgoingRequests,
      incomingRequests,
      hydrated,
      friendStatus,
      outgoingRequestTo,
      incomingRequestFrom,
      searchProfiles,
      sendFriendRequest,
      acceptIncomingRequest,
      declineIncomingRequest,
      cancelOutgoingRequest,
      unfriend
    ]
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): FriendsContextValue {
  const ctx = React.useContext(FriendsContext);
  if (!ctx) {
    throw new Error('useFriends must be used within a <FriendsProvider>.');
  }
  return ctx;
}

/**
 * useProfile — REST/React Query lookup:
 *
 *   1. The signed-in user's account state.
 *   2. Profiles already joined into the friend request view cache.
 *   3. In-memory search cache warmed by `searchProfiles`.
 *   4. Direct Supabase REST fetch through `profileCache`.
 */
export function useProfile(userId: string | null | undefined): {
  profile: ProfileSummary | null;
  loading: boolean;
} {
  const account = useRequiredAccount();
  const accountProfile = React.useMemo(
    () => (userId === account.userId ? profileFromAccount(account) : null),
    [userId, account]
  );

  const { data: requestJoinedRows = [] } = useQuery<FriendRequestWithProfilesRow[]>({
    queryKey: friendRequestsQueryKey(account.userId),
    queryFn: fetchFriendRequestRows
  });

  const requestProfile = React.useMemo(() => {
    if (!userId) return null;
    for (const row of requestJoinedRows) {
      const profile = profileFromRequestRow(row, userId);
      if (profile) return profile;
    }
    return null;
  }, [userId, requestJoinedRows]);

  React.useEffect(() => {
    if (requestProfile) warmProfileCache([requestProfile]);
  }, [requestProfile]);

  const cached = userId ? (getCachedProfile(userId) ?? null) : null;
  const fallbackEnabled = !!userId && !accountProfile && !requestProfile && !cached;
  const { data: fetched = null, isPending: fetchPending } =
    useQuery<ProfileSummary | null>({
      queryKey: profileQueryKey(userId),
      enabled: fallbackEnabled,
      queryFn: () => fetchProfileFromCache(userId as string)
    });

  const profile = accountProfile ?? requestProfile ?? cached ?? fetched;
  const loading = !!userId && !profile && fallbackEnabled && fetchPending;
  return { profile, loading };
}
