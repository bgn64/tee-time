/**
 * FriendsContext — owns the friend graph (`friendships`,
 * `friend_requests`) and the search / send / accept / decline /
 * cancel / unfriend RPC wrappers.
 *
 * Reads come from PowerSync's local SQLite via the streams declared
 * in `powersync/sync-config.yaml` (own_profile / friend_profiles /
 * requester_profiles / friendships / friend_requests). The home
 * banner is therefore realtime: when account A sends a request to B,
 * PowerSync propagates the new row to B's open Home tab without B
 * doing anything.
 *
 * Writes still flow through SECURITY DEFINER RPCs because the
 * integrity contract for accept / unfriend spans multiple rows.
 *
 * Pending-mutation overlay (observation-based, NOT
 * RPC-success-based):
 *
 *   RPCs return BEFORE the next PowerSync sync tick lands the
 *   server-side row mutation in local SQLite. A naïve
 *   "clear-overlay-on-RPC-success" pattern would flash old state for
 *   ~hundreds of ms — a declined request banner would briefly
 *   reappear, an accepted FR would temporarily revert to pending,
 *   etc. We instead:
 *
 *     · On RPC call:    insert into the overlay (tombstone or extra row).
 *     · On RPC failure: remove from overlay + rethrow so caller can
 *                       toast.
 *     · On RPC success: leave overlay in place.
 *     · Render-time `active*` derivations exclude entries whose
 *       terminal condition is currently met (no flicker during the
 *       sync gap).
 *     · Storage-prune effects observe the same terminal condition
 *       and permanently drop the entry from the overlay state.
 *       Critical for non-monotonic conditions like "friendship row
 *       present" — without storage pruning, an unfriend that flips
 *       the condition back would re-activate stale overlay entries.
 *
 *   Cleanup triggers:
 *
 *     · pendingDeclines[reqId] / pendingCancels[reqId]
 *         → FR row no longer in local SQLite (status flipped to
 *           declined, so the sync rule's pending-only filter drops it).
 *           Monotonic — pruning is hygiene-only.
 *     · pendingAccepts[reqId → fromUserId]
 *         → FR row is gone AND the friendship row for that user has
 *           landed locally. Friendship side is non-monotonic.
 *     · pendingUnfriends[userId]
 *         → friendship row for that user is gone locally.
 *           Non-monotonic (re-friending re-inserts the row).
 *     · pendingSends[userId → optimisticRow]
 *         → a real outgoing FR for that user appears OR the
 *           friendship row appears (auto-accept path). Both sides
 *           non-monotonic.
 *
 *   RPCs cannot push to the PowerSync upload queue (they bypass it),
 *   so there is no `triggerSync()` or "await next sync" primitive —
 *   the observation pattern above is the canonical way to know "the
 *   write has reflected back into local state."
 *
 * Pill priority order (when multiple states apply, e.g. ex-friend
 * with a stale pending FR — `FriendStatus`):
 *
 *     self > friend > incoming-pending > outgoing-pending > stranger
 */

import React from 'react';
import { useQuery } from '@powersync/react';

import {
  FRIENDSHIPS_TABLE,
  FRIEND_REQUESTS_TABLE,
  PROFILES_TABLE
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
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

type LocalFriendshipRow = {
  id: string;
  user_id: string;
  friend_user_id: string;
  created_at: string;
};

type LocalFriendRequestJoinedRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
  from_handle: string | null;
  from_display_name: string | null;
  from_avatar_color: string | null;
  to_handle: string | null;
  to_display_name: string | null;
  to_avatar_color: string | null;
};

type FriendsContextValue = {
  friends: string[];
  outgoingRequests: FriendRequest[];
  incomingRequests: FriendRequest[];
  /** True once both PowerSync watches have produced their first result. */
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

const FriendsContext = React.createContext<FriendsContextValue | null>(null);

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

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const system = useSystem();
  // FriendsProvider mounts only when AuthGate has cleared its stage-2
  // check (account.status === 'ready'), so the account is guaranteed
  // non-null. Logout unmounts the gate's children which destroys this
  // provider's state for free.
  const account = useRequiredAccount();
  const accountUserId = account.userId;
  const supabase = system.supabaseConnector.client;

  // -------------------------------------------------------------------
  // PowerSync watches
  // -------------------------------------------------------------------

  const { data: friendshipRows, isLoading: friendshipsLoading } =
    useQuery<LocalFriendshipRow>(
      `SELECT id, user_id, friend_user_id, created_at
       FROM ${FRIENDSHIPS_TABLE}
       WHERE user_id = ?`,
      [accountUserId]
    );

  // Join the request rows with from/to profiles (already synced via
  // own_profile + friend_profiles + requester_profiles). LEFT JOIN so
  // a brand-new FR whose counter-profile hasn't fully synced yet still
  // renders; it'll re-render once the profile lands.
  const { data: requestJoinedRows, isLoading: requestsLoading } =
    useQuery<LocalFriendRequestJoinedRow>(
      `SELECT
         fr.id,
         fr.from_user_id,
         fr.to_user_id,
         fr.status,
         fr.created_at,
         pf.handle           AS from_handle,
         pf.display_name     AS from_display_name,
         pf.avatar_color     AS from_avatar_color,
         pt.handle           AS to_handle,
         pt.display_name     AS to_display_name,
         pt.avatar_color     AS to_avatar_color
       FROM ${FRIEND_REQUESTS_TABLE} fr
       LEFT JOIN ${PROFILES_TABLE} pf ON pf.id = fr.from_user_id
       LEFT JOIN ${PROFILES_TABLE} pt ON pt.id = fr.to_user_id
       WHERE fr.status = 'pending'`
    );

  const hydrated = !friendshipsLoading && !requestsLoading;

  // -------------------------------------------------------------------
  // Pending-mutation overlay state
  // -------------------------------------------------------------------

  // requestId → fromUserId for accepted incoming FRs. We need the
  // fromUserId at cleanup time so we can verify the friendship row
  // has actually landed locally before dropping the overlay entry.
  const [pendingAccepts, setPendingAccepts] = React.useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [pendingDeclines, setPendingDeclines] = React.useState<
    ReadonlySet<string>
  >(new Set());
  const [pendingCancels, setPendingCancels] = React.useState<
    ReadonlySet<string>
  >(new Set());
  // userId tombstones for unfriends.
  const [pendingUnfriends, setPendingUnfriends] = React.useState<
    ReadonlySet<string>
  >(new Set());
  // userId → optimistic outgoing FR row, shown until the real FR
  // appears (or the friendship row, on the auto-accept path).
  const [pendingSends, setPendingSends] = React.useState<
    ReadonlyMap<string, FriendRequest>
  >(new Map());

  // -------------------------------------------------------------------
  // Quick lookups derived from the latest PowerSync results
  // -------------------------------------------------------------------

  const friendshipsByFriendUserId = React.useMemo(() => {
    const map = new Map<string, LocalFriendshipRow>();
    for (const r of friendshipRows) map.set(r.friend_user_id, r);
    return map;
  }, [friendshipRows]);

  const requestRowsById = React.useMemo(() => {
    const map = new Map<string, LocalFriendRequestJoinedRow>();
    for (const r of requestJoinedRows) map.set(r.id, r);
    return map;
  }, [requestJoinedRows]);

  const outgoingRequestsByToUserId = React.useMemo(() => {
    const map = new Map<string, LocalFriendRequestJoinedRow>();
    for (const r of requestJoinedRows) {
      if (r.from_user_id === accountUserId) map.set(r.to_user_id, r);
    }
    return map;
  }, [requestJoinedRows, accountUserId]);

  // -------------------------------------------------------------------
  // Overlay cleanup
  //
  // Two-layer strategy:
  //
  //   1. Render-time `active*` derivations exclude entries whose
  //      terminal condition is currently met. This avoids visible
  //      flicker during the brief window between a PowerSync sync
  //      tick and the storage-prune microtask that follows.
  //
  //   2. Storage-prune effects observe the same terminal condition
  //      and permanently drop the entry from the underlying overlay
  //      state. This is critical for overlays whose terminal
  //      conditions are NON-MONOTONIC — friendship rows can be
  //      deleted (unfriend) AND re-inserted (re-friend), so the
  //      render-time `active*` check on its own would re-include a
  //      stale entry after the condition flips back. Once pruned,
  //      a flap can't re-activate.
  //
  // Conditions per overlay:
  //
  //   pendingDeclines / pendingCancels[reqId]
  //     terminal = FR row no longer in local SQLite. Monotonic
  //     (`accepted` / `declined` FRs never re-enter the
  //     pending-only sync stream), so re-activation can't happen.
  //     Storage prune is still scheduled for memory hygiene.
  //
  //   pendingAccepts[reqId → fromUserId]
  //     terminal = FR row gone AND friendship row present. The
  //     friendship side is non-monotonic (unfriend deletes it), so
  //     storage pruning is mandatory — without it, a later unfriend
  //     would re-activate the entry and tombstone any new outgoing
  //     FR to the same user.
  //
  //   pendingUnfriends[userId]
  //     terminal = friendship row gone. Non-monotonic (re-friend
  //     re-inserts the row), so storage pruning is mandatory.
  //
  //   pendingSends[userId → optimisticRow]
  //     terminal = real outgoing FR appears OR friendship row
  //     appears. Both sides are non-monotonic (FRs can be cancelled,
  //     friendships can be deleted), so storage pruning is
  //     mandatory.
  //
  // setState is wrapped in a microtask via Promise.resolve().then(...)
  // to comply with React 19's `react-hooks/set-state-in-effect` rule.
  // -------------------------------------------------------------------

  const activeDeclines = React.useMemo(() => {
    const out = new Set<string>();
    for (const id of pendingDeclines) {
      if (requestRowsById.has(id)) out.add(id);
    }
    return out;
  }, [pendingDeclines, requestRowsById]);

  const activeCancels = React.useMemo(() => {
    const out = new Set<string>();
    for (const id of pendingCancels) {
      if (requestRowsById.has(id)) out.add(id);
    }
    return out;
  }, [pendingCancels, requestRowsById]);

  const activeAccepts = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const [id, fromUserId] of pendingAccepts) {
      const reqStillPending = requestRowsById.has(id);
      const friendshipPresent = friendshipsByFriendUserId.has(fromUserId);
      // Carry the entry as long as either terminal condition is
      // missing — drop only when both are satisfied.
      if (reqStillPending || !friendshipPresent) {
        out.set(id, fromUserId);
      }
    }
    return out;
  }, [pendingAccepts, requestRowsById, friendshipsByFriendUserId]);

  const activeUnfriends = React.useMemo(() => {
    const out = new Set<string>();
    for (const uid of pendingUnfriends) {
      if (friendshipsByFriendUserId.has(uid)) out.add(uid);
    }
    return out;
  }, [pendingUnfriends, friendshipsByFriendUserId]);

  const activeSends = React.useMemo(() => {
    const out = new Map<string, FriendRequest>();
    for (const [uid, row] of pendingSends) {
      const realOutgoing = outgoingRequestsByToUserId.has(uid);
      const isFriend = friendshipsByFriendUserId.has(uid);
      if (!realOutgoing && !isFriend) out.set(uid, row);
    }
    return out;
  }, [pendingSends, outgoingRequestsByToUserId, friendshipsByFriendUserId]);

  // pendingSends storage prune: drop entries whose terminal condition
  // has fired (real outgoing FR or friendship landed). Snapshots the
  // terminating UIDs at effect time so a PowerSync state change
  // between effect-schedule and microtask-run can't widen the prune.
  React.useEffect(() => {
    if (pendingSends.size === 0) return;
    const toPrune: string[] = [];
    for (const [uid] of pendingSends) {
      if (
        outgoingRequestsByToUserId.has(uid) ||
        friendshipsByFriendUserId.has(uid)
      ) {
        toPrune.push(uid);
      }
    }
    if (toPrune.length === 0) return;
    void Promise.resolve().then(() => {
      setPendingSends((prev) => {
        let next: Map<string, FriendRequest> | null = null;
        for (const uid of toPrune) {
          if (prev.has(uid)) {
            if (!next) next = new Map(prev);
            next.delete(uid);
          }
        }
        return next ?? prev;
      });
    });
  }, [pendingSends, outgoingRequestsByToUserId, friendshipsByFriendUserId]);

  // pendingAccepts storage prune: drop entries whose FR is gone AND
  // friendship row has landed. Same snapshot semantics as above.
  React.useEffect(() => {
    if (pendingAccepts.size === 0) return;
    const toPrune: string[] = [];
    for (const [id, fromUserId] of pendingAccepts) {
      const reqGone = !requestRowsById.has(id);
      const friendshipPresent = friendshipsByFriendUserId.has(fromUserId);
      if (reqGone && friendshipPresent) toPrune.push(id);
    }
    if (toPrune.length === 0) return;
    void Promise.resolve().then(() => {
      setPendingAccepts((prev) => {
        let next: Map<string, string> | null = null;
        for (const id of toPrune) {
          if (prev.has(id)) {
            if (!next) next = new Map(prev);
            next.delete(id);
          }
        }
        return next ?? prev;
      });
    });
  }, [pendingAccepts, requestRowsById, friendshipsByFriendUserId]);

  // pendingUnfriends storage prune: drop entries whose friendship
  // row is no longer present.
  React.useEffect(() => {
    if (pendingUnfriends.size === 0) return;
    const toPrune: string[] = [];
    for (const uid of pendingUnfriends) {
      if (!friendshipsByFriendUserId.has(uid)) toPrune.push(uid);
    }
    if (toPrune.length === 0) return;
    void Promise.resolve().then(() => {
      setPendingUnfriends((prev) => {
        let next: Set<string> | null = null;
        for (const uid of toPrune) {
          if (prev.has(uid)) {
            if (!next) next = new Set(prev);
            next.delete(uid);
          }
        }
        return next ?? prev;
      });
    });
  }, [pendingUnfriends, friendshipsByFriendUserId]);

  // pendingDeclines / pendingCancels storage prune: monotonic
  // terminal (FR row gone), so re-activation isn't a risk — pruned
  // here purely for memory hygiene.
  React.useEffect(() => {
    if (pendingDeclines.size === 0 && pendingCancels.size === 0) return;
    const declinesToPrune: string[] = [];
    for (const id of pendingDeclines) {
      if (!requestRowsById.has(id)) declinesToPrune.push(id);
    }
    const cancelsToPrune: string[] = [];
    for (const id of pendingCancels) {
      if (!requestRowsById.has(id)) cancelsToPrune.push(id);
    }
    if (declinesToPrune.length === 0 && cancelsToPrune.length === 0) return;
    void Promise.resolve().then(() => {
      if (declinesToPrune.length > 0) {
        setPendingDeclines((prev) => {
          let next: Set<string> | null = null;
          for (const id of declinesToPrune) {
            if (prev.has(id)) {
              if (!next) next = new Set(prev);
              next.delete(id);
            }
          }
          return next ?? prev;
        });
      }
      if (cancelsToPrune.length > 0) {
        setPendingCancels((prev) => {
          let next: Set<string> | null = null;
          for (const id of cancelsToPrune) {
            if (prev.has(id)) {
              if (!next) next = new Set(prev);
              next.delete(id);
            }
          }
          return next ?? prev;
        });
      }
    });
  }, [pendingDeclines, pendingCancels, requestRowsById]);

  // -------------------------------------------------------------------
  // Derived state — PowerSync rows with the overlay applied
  // -------------------------------------------------------------------

  const friends = React.useMemo(() => {
    return friendshipRows
      .map((r) => r.friend_user_id)
      .filter((id) => !activeUnfriends.has(id));
  }, [friendshipRows, activeUnfriends]);

  const buildFromJoined = React.useCallback(
    (r: LocalFriendRequestJoinedRow): FriendRequest => ({
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
    }),
    []
  );

  // Counterparty userIds of currently-active accepts. The
  // accept_friend_request RPC also auto-accepts any reciprocal
  // outgoing FR from me to that user in the same transaction, so the
  // outgoing-pending pill needs to clear at the same moment as the
  // incoming-pending banner. Derived as a Set for O(1) filter checks.
  const acceptedCounterpartyUserIds = React.useMemo(() => {
    return new Set(activeAccepts.values());
  }, [activeAccepts]);

  const incomingRequests = React.useMemo<FriendRequest[]>(() => {
    return requestJoinedRows
      .filter((r) => r.to_user_id === accountUserId)
      .filter((r) => !activeAccepts.has(r.id) && !activeDeclines.has(r.id))
      // Hide incoming FRs from a user we just unfriended (rare race —
      // a stale FR could still be sitting pending server-side at the
      // moment we unfriend).
      .filter((r) => !activeUnfriends.has(r.from_user_id))
      // Hide incoming FRs from a user we just sent an outgoing FR to:
      // server-side, send_friend_request auto-accepts a reciprocal
      // pending FR, so the banner row for that user must vanish at the
      // same moment as the optimistic outgoing-pending appears.
      .filter((r) => !activeSends.has(r.from_user_id))
      .map(buildFromJoined);
  }, [
    requestJoinedRows,
    accountUserId,
    activeAccepts,
    activeDeclines,
    activeUnfriends,
    activeSends,
    buildFromJoined
  ]);

  const outgoingRequests = React.useMemo<FriendRequest[]>(() => {
    const realOutgoing = requestJoinedRows
      .filter((r) => r.from_user_id === accountUserId)
      .filter((r) => !activeCancels.has(r.id))
      // Hide outgoing FRs to a user we just unfriended: the unfriend
      // RPC marks any pending FR between the pair as declined.
      .filter((r) => !activeUnfriends.has(r.to_user_id))
      // Hide outgoing FRs to a user whose incoming FR we just accepted:
      // accept_friend_request also flips our reciprocal outgoing FR to
      // accepted server-side, so the outgoing-pending pill must clear
      // alongside the incoming banner.
      .filter((r) => !acceptedCounterpartyUserIds.has(r.to_user_id))
      .map(buildFromJoined);
    // Merge in optimistic sends not yet reflected in PowerSync (the
    // activeSends derivation already excludes those whose terminal
    // condition has fired).
    const realToIds = new Set(realOutgoing.map((r) => r.toUserId));
    const overlayOnly: FriendRequest[] = [];
    for (const [uid, row] of activeSends) {
      if (realToIds.has(uid)) continue;
      overlayOnly.push(row);
    }
    return [...realOutgoing, ...overlayOnly];
  }, [
    requestJoinedRows,
    accountUserId,
    activeCancels,
    activeUnfriends,
    acceptedCounterpartyUserIds,
    activeSends,
    buildFromJoined
  ]);

  // -------------------------------------------------------------------
  // Lookups for FriendActionPill / banner
  // -------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // RPC wrappers — same server semantics; overlay state on call,
  // surface failure inline by rethrowing.
  // -------------------------------------------------------------------

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
    [accountUserId, supabase]
  );

  const sendFriendRequest = React.useCallback(
    async (target: ProfileSummary) => {
      warmProfileCache([target]);
      const tempId = `pending-send-${target.userId}-${Date.now()}`;
      const optimistic: FriendRequest = {
        id: tempId,
        fromUserId: accountUserId,
        fromHandle: account.handle,
        fromDisplayName: account.displayName,
        fromAvatarColor: account.avatarColor,
        toUserId: target.userId,
        toHandle: target.handle,
        toDisplayName: target.displayName,
        toAvatarColor: target.avatarColor,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      setPendingSends((prev) => {
        const next = new Map(prev);
        next.set(target.userId, optimistic);
        return next;
      });

      try {
        const { error } = await supabase.rpc('send_friend_request', {
          target_user_id: target.userId
        });
        if (error) throw error;
      } catch (err) {
        setPendingSends((prev) => {
          if (!prev.has(target.userId)) return prev;
          const next = new Map(prev);
          next.delete(target.userId);
          return next;
        });
        console.warn('[friends] send_friend_request:', err);
        throw err;
      }
      // Success → leave overlay in place; the observer clears it once
      // a real outgoing FR (or auto-accept friendship) lands.
    },
    [
      accountUserId,
      account.handle,
      account.displayName,
      account.avatarColor,
      supabase
    ]
  );

  const acceptIncomingRequest = React.useCallback(
    async (requestId: string) => {
      const row = requestRowsById.get(requestId);
      if (!row) {
        // The request row vanished between render and call (e.g. the
        // sender cancelled, or the row was already accepted via
        // another device). Nothing to do.
        return;
      }
      const fromUserId = row.from_user_id;
      setPendingAccepts((prev) => {
        if (prev.has(requestId)) return prev;
        const next = new Map(prev);
        next.set(requestId, fromUserId);
        return next;
      });
      try {
        const { error } = await supabase.rpc('accept_friend_request', {
          request_id: requestId
        });
        if (error) throw error;
      } catch (err) {
        setPendingAccepts((prev) => {
          if (!prev.has(requestId)) return prev;
          const next = new Map(prev);
          next.delete(requestId);
          return next;
        });
        console.warn('[friends] accept_friend_request:', err);
        throw err;
      }
    },
    [requestRowsById, supabase]
  );

  const declineIncomingRequest = React.useCallback(
    async (requestId: string) => {
      setPendingDeclines((prev) => {
        if (prev.has(requestId)) return prev;
        const next = new Set(prev);
        next.add(requestId);
        return next;
      });
      try {
        const { error } = await supabase.rpc('decline_friend_request', {
          request_id: requestId
        });
        if (error) throw error;
      } catch (err) {
        setPendingDeclines((prev) => {
          if (!prev.has(requestId)) return prev;
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
        console.warn('[friends] decline_friend_request:', err);
        throw err;
      }
    },
    [supabase]
  );

  const cancelOutgoingRequest = React.useCallback(
    async (requestId: string) => {
      setPendingCancels((prev) => {
        if (prev.has(requestId)) return prev;
        const next = new Set(prev);
        next.add(requestId);
        return next;
      });
      try {
        const { error } = await supabase.rpc('cancel_friend_request', {
          request_id: requestId
        });
        if (error) throw error;
      } catch (err) {
        setPendingCancels((prev) => {
          if (!prev.has(requestId)) return prev;
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
        console.warn('[friends] cancel_friend_request:', err);
        throw err;
      }
    },
    [supabase]
  );

  const unfriend = React.useCallback(
    async (targetUserId: string) => {
      setPendingUnfriends((prev) => {
        if (prev.has(targetUserId)) return prev;
        const next = new Set(prev);
        next.add(targetUserId);
        return next;
      });
      try {
        const { error } = await supabase.rpc('unfriend', {
          target_user_id: targetUserId
        });
        if (error) throw error;
      } catch (err) {
        setPendingUnfriends((prev) => {
          if (!prev.has(targetUserId)) return prev;
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
        console.warn('[friends] unfriend:', err);
        throw err;
      }
    },
    [supabase]
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
 * useProfile — three-tier lookup:
 *
 *   1. PowerSync local SQLite watch. Hits for own profile, friends,
 *      and pending-FR counterparties (the rows synced by
 *      own_profile / friend_profiles / requester_profiles streams).
 *   2. In-memory search cache. Hits for rows the user tapped from a
 *      search result that aren't in any sync stream yet.
 *   3. Direct Supabase fetch. Fallback for profiles we've never
 *      encountered before (e.g. a deep-linked URL).
 *
 * Tier 1 is reactive — if the profile row arrives via sync between
 * mounts, the hook re-renders without any explicit refetch.
 */
export function useProfile(userId: string | null | undefined): {
  profile: ProfileSummary | null;
  loading: boolean;
} {
  const system = useSystem();

  // Tier 1: PowerSync watch. Use a tautologically-false fallback
  // query while userId is null so the hook still calls useQuery (and
  // therefore obeys the rules of hooks) without thrashing the engine.
  const { data: localRows } = useQuery<{
    id: string;
    handle: string;
    display_name: string;
    avatar_color: string;
  }>(
    userId
      ? `SELECT id, handle, display_name, avatar_color FROM ${PROFILES_TABLE} WHERE id = ?`
      : `SELECT id, handle, display_name, avatar_color FROM ${PROFILES_TABLE} WHERE 1 = 0`,
    userId ? [userId] : []
  );
  const localRow = localRows[0];
  const localProfile = React.useMemo<ProfileSummary | null>(() => {
    if (!localRow) return null;
    return {
      userId: localRow.id,
      handle: localRow.handle,
      displayName: localRow.display_name,
      avatarColor: localRow.avatar_color
    };
  }, [localRow]);

  // Tier 3 state — only consulted when tier 1 + 2 miss.
  const [fetched, setFetched] = React.useState<{
    userId: string;
    profile: ProfileSummary | null;
  } | null>(null);

  React.useEffect(() => {
    if (!userId) return;
    if (localProfile) return;
    if (getCachedProfile(userId)) return;
    let cancelled = false;
    fetchProfileFromCache(system.supabaseConnector.client, userId).then((p) => {
      if (cancelled) return;
      setFetched({ userId, profile: p });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, system, localProfile]);

  const cached = userId ? getCachedProfile(userId) : null;
  const settled = fetched?.userId === userId;
  const profile =
    localProfile ?? cached ?? (settled ? (fetched?.profile ?? null) : null);
  const loading = !!userId && !localProfile && !cached && !settled;
  return { profile, loading };
}
