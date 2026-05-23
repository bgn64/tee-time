/**
 * Player context — local roster + AsyncStorage backup + Supabase cloud sync.
 *
 * Three layers stack:
 *   1. In-memory state (`allPlayers`, `recentIds`, `defaultPlayerId`).
 *   2. AsyncStorage persistence (offline survival; mirrors layer 1).
 *   3. Supabase cloud sync (cross-device backup; mirrors layer 1 when signed in).
 *
 * Cloud sync model: "everything is your private backup, friendships layer
 * on top." Roster rows are scoped per-owner via RLS. We don't subscribe to
 * realtime for the roster — your own private data doesn't change behind
 * your back. Sync is:
 *
 *   · One-time pull-and-merge per account when `account` becomes non-null
 *     (or its userId changes). Cloud rows replace local for matching ids;
 *     local-only rows get pushed up.
 *   · Per-mutation push: `addPlayer` / `linkPlayer` / `unlinkPlayer` each
 *     fire-and-forget upsert the changed row to cloud.
 *
 * Known limitation: switching between two different accounts on the same
 * device can leak Account A's local-only rows into Account B's cloud on the
 * second sign-in. For our prototype use case (one account per device) this
 * is acceptable; we'll add an account-purge step later if it becomes a
 * real concern.
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { defaultPlayers } from '@/data/players';
import { useAccount } from '@/state/AccountContext';
import { useOneShotSyncOnSignIn, useRefreshGeneration } from '@/state/cloudSync';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { registerSignOutPurge } from '@/state/signOutRegistry';
import { supabase } from '@/state/supabaseClient';
import { writeQueue } from '@/state/writeQueue';
import { Player } from '@/types/golf';
import type { ProfileSummary } from '@/types/social';

const DEFAULT_RECENT_IDS = defaultPlayers.map((p) => p.id);
const DEFAULT_DEFAULT_ID: string | null = 'user';

export type PlayerLink = {
  userId: string;
  displayName: string;
  handle: string;
};

type PlayerContextValue = {
  allPlayers: Player[];
  recentPlayers: Player[];
  defaultPlayerId: string | null;
  addPlayer: (player: Player) => void;
  markRecent: (playerId: string) => void;
  setDefaultPlayerId: (id: string | null) => void;
  getPlayer: (id: string) => Player | undefined;
  linkPlayer: (playerId: string, link: PlayerLink) => void;
  unlinkPlayer: (playerId: string) => void;
  /**
   * Find-or-create a roster row for a linked friend. Idempotent across
   * concurrent call sites: uses a deterministic id `player-${userId}` so
   * a race between `acceptIncomingRequest` and the realtime `friendships`
   * INSERT handler cannot produce two duplicate rows for the same friend.
   *
   * The cloud-side uniqueness is enforced by the partial-unique index on
   * `(owner_user_id, linked_user_id) WHERE linked_user_id IS NOT NULL`
   * added in migration 018. The corresponding `cloudUpsertPlayer` path
   * uses `onConflict: 'owner_user_id,linked_user_id'` for linked rows so
   * a stale-id retry cooperates with the new constraint instead of
   * exploding on 23505.
   */
  ensureRosterForFriend: (profile: ProfileSummary) => Player;
  /**
   * Re-pull the signed-in user's `roster_players` rows from the cloud
   * and merge them into local state. Used by the You-tab pull-to-
   * refresh so roster edits made on another device can be surfaced
   * without restarting the app — without this, the initial-sync
   * sentinel makes the roster a one-shot fetch per signed-in session.
   *
   * Race-safe: a per-refresh generation counter ensures only the
   * latest response writes state. Merge is by-id (cloud wins for
   * matching ids, local rows without a cloud counterpart are
   * preserved as local-only entries — same semantics as the initial-
   * pull effect).
   *
   * Resolves to `{ ok: true }` on success (including the no-op signed-
   * out case and stale-generation discards) and `{ ok: false, error }`
   * when the select returns a transient error. On failure local state
   * is left untouched.
   */
  refreshRoster: () => Promise<{ ok: boolean; error?: string }>;
  hydrated: boolean;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

function migratePlayer(raw: any): Player {
  return {
    id: String(raw.id),
    nickname: raw.nickname ?? raw.name ?? 'Unknown',
    displayName: raw.displayName,
    handle: raw.handle,
    userId: raw.userId,
    color: raw.color,
  };
}

type CloudRosterRow = {
  id: string;
  nickname: string;
  color: string | null;
  linked_user_id: string | null;
};

/**
 * Strict-ish UUID v4 (or any v) regex. Used to filter out legacy stub
 * `linked_user_id` values like `stub-mike` that survived from Step 8 stub
 * testing — Postgres' uuid type would reject them and fail the whole upsert.
 * Real Supabase user ids ARE valid UUIDs, so a fresh signup would never
 * trigger this filter.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeLinkedUserId(value: string | undefined | null): string | null {
  if (!value) return null;
  return UUID_REGEX.test(value) ? value : null;
}

function rowToPlayer(row: CloudRosterRow): Player {
  return {
    id: row.id,
    nickname: row.nickname,
    color: row.color ?? undefined,
    userId: row.linked_user_id ?? undefined,
  };
}

export function PlayerProvider({ children }: PropsWithChildren) {
  const [allPlayers, setAllPlayers] = useState<Player[]>(defaultPlayers);
  const [recentIds, setRecentIds] = useState<string[]>(DEFAULT_RECENT_IDS);
  const [defaultPlayerId, setDefaultPlayerId] = useState<string | null>(DEFAULT_DEFAULT_ID);
  const [hydrated, setHydrated] = useState(false);

  const { account, hydrated: accountHydrated } = useAccount();

  // Stable primitive — see GolfRoundContext for the same pattern.
  // Use in effect deps when only WHICH user is signed in matters, not
  // cosmetic profile updates (avatar color picker on the You tab).
  const accountUserId = account?.userId ?? null;

  const allPlayersRef = useRef(allPlayers);
  allPlayersRef.current = allPlayers;

  // Latest-response-wins token pair for `refreshRoster`. Independent
  // of the initial-sync sentinel managed by `useOneShotSyncOnSignIn`
  // below — which gates the one-shot mount-time pull, while this
  // covers overlapping explicit refreshes.
  const refreshGen = useRefreshGeneration();

  // Local hydration
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadJSON<any[]>(STORAGE_KEYS.PLAYERS, defaultPlayers),
      loadJSON<string[]>(STORAGE_KEYS.RECENT_PLAYER_IDS, DEFAULT_RECENT_IDS),
      loadJSON<string | null>(STORAGE_KEYS.DEFAULT_PLAYER_ID, DEFAULT_DEFAULT_ID),
    ]).then(([rawPlayers, recents, defId]) => {
      if (cancelled) return;
      setAllPlayers(rawPlayers.map(migratePlayer));
      setRecentIds(recents);
      setDefaultPlayerId(defId);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.PLAYERS, allPlayers);
  }, [allPlayers, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.RECENT_PLAYER_IDS, recentIds);
  }, [recentIds, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.DEFAULT_PLAYER_ID, defaultPlayerId);
  }, [defaultPlayerId, hydrated]);

  // Sign-out purge: register a handler that synchronously wipes the
  // in-memory roster AND removes the AsyncStorage keys. Triggered
  // directly by AccountContext's SIGNED_OUT auth event (not by a
  // delayed React effect observing accountUserId change), so the
  // crash window between sign-out and persistence-effect mirroring
  // is closed.
  useEffect(() => {
    return registerSignOutPurge(async () => {
      setAllPlayers(defaultPlayers);
      setRecentIds(DEFAULT_RECENT_IDS);
      setDefaultPlayerId(DEFAULT_DEFAULT_ID);
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.PLAYERS),
        AsyncStorage.removeItem(STORAGE_KEYS.RECENT_PLAYER_IDS),
        AsyncStorage.removeItem(STORAGE_KEYS.DEFAULT_PLAYER_ID),
      ]);
    });
  }, []);

  // Register the rollback handler exactly once. Restores the pre-mutation
  // snapshot when a queued upsert is dead-lettered (5 transient failures
  // or any permanent error). If `prevRow` is null, the entity was newly
  // created — rollback removes it.
  useEffect(() => {
    writeQueue.setRollbackHandler('roster_players', (entry) => {
      const snap = entry.rollbackSnapshot as
        | { entityId: string; prevRow: Player | null }
        | undefined;
      if (!snap) return;
      const { entityId, prevRow } = snap;
      setAllPlayers((prev) => {
        const exists = prev.some((p) => p.id === entityId);
        if (prevRow == null) {
          return exists ? prev.filter((p) => p.id !== entityId) : prev;
        }
        if (!exists) {
          return [...prev, prevRow];
        }
        return prev.map((p) => (p.id === entityId ? prevRow : p));
      });
    });
  }, []);

  // Signal write-queue replay readiness based on whether an account is
  // hydrated and signed in. Replay only fires when `hydrated` (queue
  // loaded) AND `accountReady` are both true — covers app-launch with
  // a pending queue from a previous session.
  useEffect(() => {
    writeQueue.setAccountReady(!!accountUserId);
  }, [accountUserId]);

  const cloudUpsertPlayer = useCallback(
    async (player: Player) => {
      if (!account) return;
      // The default seed `{ id: 'user' }` is a local-only UI placeholder
      // that the sign-in side effect (below) attaches the viewer's
      // identity (linked_user_id = account.userId) to so the scoring
      // screen renders their avatar color correctly. The cloud does
      // NOT need this row — the viewer's profile (in `profiles`) is
      // the source of truth for their identity, and scorecard
      // participant entries reference `linkedUserId` directly. Pushing
      // it would also conflict with the unique constraint on
      // (owner_user_id, linked_user_id) if the user later manually
      // adds another linked roster row for themselves. Skip the cloud
      // write but keep the local mutation (which has already happened
      // via setAllPlayers in the caller).
      if (player.id === 'user') return;
      const linkedUserId = safeLinkedUserId(player.userId);
      const payload = {
        owner_user_id: account.userId,
        id: player.id,
        nickname: player.nickname,
        color: player.color ?? null,
        linked_user_id: linkedUserId,
      };
      // For LINKED rows, conflict-target is `(owner_user_id, linked_user_id)`
      // — matches the partial-unique index added by migration 018. This is
      // what guarantees the same friend can never end up with two roster
      // rows under one owner, even if a stale-id retry races a fresh
      // `ensureRosterForFriend` call. For UNLINKED rows, we keep the
      // original primary-key conflict target (no DB-side unique-on-friend
      // constraint applies to a row whose `linked_user_id` is NULL).
      const conflictTarget = linkedUserId
        ? 'owner_user_id,linked_user_id'
        : 'owner_user_id,id';
      // Capture the pre-mutation snapshot for the rollback path. This
      // wrapper is called fire-and-forget from event handlers (addPlayer,
      // linkPlayer, ensureRosterForFriend, etc.) where the local
      // optimistic mutation has already been *scheduled* via setState
      // but the ref still mirrors the previous committed render.
      // `allPlayersRef.current` therefore reflects the row's state
      // BEFORE the mutation, which is exactly what we want.
      const prevRow =
        allPlayersRef.current.find((p) => p.id === player.id) ?? null;
      try {
        const { error } = await supabase
          .from('roster_players')
          .upsert(payload, { onConflict: conflictTarget });
        if (error) throw error;
        // Steady-state recovery: opportunistically drain anything that
        // failed during prior offline windows.
        void writeQueue.flush();
      } catch (err: any) {
        console.warn('[roster] cloudUpsertPlayer failed:', {
          playerId: player.id,
          linkedUserId,
          conflictTarget,
          error: {
            message: err?.message,
            code: err?.code,
            status: err?.status,
            details: err?.details,
            hint: err?.hint,
          },
          payload,
        });
        writeQueue.enqueue({
          table: 'roster_players',
          op: 'upsert',
          entityId: player.id,
          payload,
          upsertOpts: { onConflict: conflictTarget },
          lastError: { message: err?.message, code: err?.code ?? err?.status },
          rollbackSnapshot: {
            table: 'roster_players',
            entityId: player.id,
            prevRow,
          },
        });
      }
    },
    [account]
  );

  // One-time-per-account initial sync. Pulls cloud roster + merges
  // with local + pushes any local-only rows up. Keyed by accountUserId
  // (via useOneShotSyncOnSignIn) so cosmetic profile updates don't
  // re-fire the sync gate.
  useOneShotSyncOnSignIn({
    accountUserId,
    ready: hydrated && accountHydrated,
    sync: async (ownerUserId) => {
      const { data: cloudRowsRaw, error } = await supabase
        .from('roster_players')
        .select('id, nickname, color, linked_user_id')
        .eq('owner_user_id', ownerUserId);

      if (error) {
        console.warn('[roster] initial sync pull failed:', error);
        return;
      }

      const cloudRows = (cloudRowsRaw ?? []) as CloudRosterRow[];
      const cloudById = new Map(cloudRows.map((r) => [r.id, r]));
      const localSnapshot = allPlayersRef.current;

      const merged: Player[] = [];
      const seenIds = new Set<string>();
      for (const local of localSnapshot) {
        const cloud = cloudById.get(local.id);
        if (cloud) {
          merged.push({
            ...rowToPlayer(cloud),
            displayName: local.displayName,
            handle: local.handle,
          });
          seenIds.add(cloud.id);
        } else {
          merged.push(local);
        }
      }
      for (const cloud of cloudRows) {
        if (seenIds.has(cloud.id)) continue;
        merged.push(rowToPlayer(cloud));
      }

      setAllPlayers(merged);

      const localOnly = localSnapshot.filter((p) => !cloudById.has(p.id));
      if (localOnly.length > 0) {
        const { error: pushError } = await supabase.from('roster_players').upsert(
          localOnly.map((p) => ({
            owner_user_id: ownerUserId,
            id: p.id,
            nickname: p.nickname,
            color: p.color ?? null,
            linked_user_id: safeLinkedUserId(p.userId),
          })),
          { onConflict: 'owner_user_id,id' }
        );
        if (pushError) console.warn('[roster] initial sync push failed:', pushError);
      }
    },
  });

  /**
   * Re-pull the signed-in user's roster from the cloud and merge into
   * local state. Bypasses the sentinel that gates the auto-pull
   * effect (`useOneShotSyncOnSignIn`) — explicit refreshes always go
   * to the wire. Merge semantics mirror the initial-pull effect
   * (cloud rows win on id match; local-only rows are preserved).
   * Cross-device deletes are NOT propagated by design (same
   * limitation as GolfRoundContext.refreshScorecards for viewer-owned
   * rows).
   *
   * Race-safe via the shared `useRefreshGeneration`: overlapping
   * refreshes resolve as latest-response-wins. On failure local state
   * is left untouched so the You-tab roster doesn't blink to empty.
   */
  const refreshRoster = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!accountUserId) return { ok: true };
    const ownerUserId = accountUserId;
    const myToken = refreshGen.begin();

    const { data: cloudRowsRaw, error } = await supabase
      .from('roster_players')
      .select('id, nickname, color, linked_user_id')
      .eq('owner_user_id', ownerUserId);
    if (error) {
      console.warn('[roster] refresh pull failed:', error);
      return { ok: false, error: error.message };
    }
    if (refreshGen.isStale(myToken)) return { ok: true };

    const cloudRows = (cloudRowsRaw ?? []) as CloudRosterRow[];
    const cloudById = new Map(cloudRows.map((r) => [r.id, r]));

    setAllPlayers((prev) => {
      const merged: Player[] = [];
      const seenIds = new Set<string>();
      for (const local of prev) {
        const cloud = cloudById.get(local.id);
        if (cloud) {
          // Cloud wins on the canonical fields; preserve any local-only
          // decorations (displayName / handle resolved at link time)
          // that the roster_players row doesn't carry.
          merged.push({
            ...rowToPlayer(cloud),
            displayName: local.displayName,
            handle: local.handle,
          });
          seenIds.add(cloud.id);
        } else {
          // Local-only row (added since last sync; not yet pushed, or
          // pre-auth seed). Preserved — see method-level comment for
          // the cross-device-delete caveat.
          merged.push(local);
        }
      }
      for (const cloud of cloudRows) {
        if (seenIds.has(cloud.id)) continue;
        merged.push(rowToPlayer(cloud));
      }
      return merged;
    });

    return { ok: true };
  }, [accountUserId, refreshGen]);

  // R2: re-pull the roster whenever the app comes back to the foreground.
  // Catches roster mutations made on another device (the only auto-pull
  // is `useOneShotSyncOnSignIn`, which fires once per signed-in session).
  // Not realtime — we still rely on the "refresh to get latest" model,
  // but app-resume is a natural refresh moment for the user.
  // `refreshRoster` is a no-op when signed out; race-safe via
  // `useRefreshGeneration`.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refreshRoster();
      }
    });
    return () => sub.remove();
  }, [refreshRoster]);

  const addPlayer = useCallback(
    (player: Player) => {
      setAllPlayers((prev) => [...prev, player]);
      setRecentIds((prev) => [player.id, ...prev.filter((id) => id !== player.id)]);
      void cloudUpsertPlayer(player);
    },
    [cloudUpsertPlayer]
  );

  const markRecent = useCallback((playerId: string) => {
    setRecentIds((prev) => [playerId, ...prev.filter((id) => id !== playerId)]);
  }, []);

  const linkPlayer = useCallback(
    (playerId: string, link: PlayerLink) => {
      let updated: Player | undefined;
      setAllPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p;
          updated = {
            ...p,
            userId: link.userId,
            displayName: link.displayName,
            handle: link.handle,
          };
          return updated;
        })
      );
      if (updated) void cloudUpsertPlayer(updated);
    },
    [cloudUpsertPlayer]
  );

  const unlinkPlayer = useCallback(
    (playerId: string) => {
      let updated: Player | undefined;
      setAllPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p;
          updated = {
            ...p,
            userId: undefined,
            displayName: undefined,
            handle: undefined,
          };
          return updated;
        })
      );
      if (updated) void cloudUpsertPlayer(updated);
    },
    [cloudUpsertPlayer]
  );

  // Idempotent find-or-create for a linked friend. The deterministic id
  // `player-${userId}` is the linchpin: any two concurrent callers (the
  // `acceptIncomingRequest` RPC return path on the receiver, the realtime
  // `friendships` INSERT handler on the sender) propose the same id, so
  // the second call merges into the row created by the first instead of
  // appending a duplicate. The DB partial-unique index added by migration
  // 018 enforces the same invariant server-side. Cosmetic profile fields
  // (displayName / handle / avatarColor) are refreshed on every call so
  // the roster row reflects the friend's current profile; nickname stays
  // local-editable and is only seeded on the first create.
  //
  // We compute the result up front from the ref snapshot rather than
  // inside the setAllPlayers updater — React doesn't guarantee that the
  // functional updater runs synchronously during dispatch, so reading
  // `result` after `setAllPlayers` would be racy. The updater body is
  // still race-safe (re-applies the same patch idempotently) for the
  // back-to-back-call case.
  const ensureRosterForFriend = useCallback(
    (profile: ProfileSummary): Player => {
      const id = `player-${profile.userId}`;
      const prev = allPlayersRef.current;
      const existing = prev.find(
        (p) => p.userId === profile.userId || p.id === id
      );

      let result: Player;
      if (existing) {
        const merged: Player = {
          ...existing,
          id: existing.id,
          userId: profile.userId,
          nickname: existing.nickname || profile.displayName,
          displayName: profile.displayName,
          handle: profile.handle,
          color: existing.color ?? profile.avatarColor,
        };
        const changed =
          existing.userId !== merged.userId ||
          existing.displayName !== merged.displayName ||
          existing.handle !== merged.handle ||
          existing.color !== merged.color;
        if (changed) {
          setAllPlayers((latest) =>
            latest.map((p) => (p.id === existing.id ? merged : p))
          );
          result = merged;
        } else {
          result = existing;
        }
      } else {
        const created: Player = {
          id,
          nickname: profile.displayName,
          displayName: profile.displayName,
          handle: profile.handle,
          color: profile.avatarColor,
          userId: profile.userId,
        };
        // The updater re-checks for a duplicate on the latest state so a
        // back-to-back race that both see no existing row collapses to
        // one append. Mirrors the DB partial-unique guarantee.
        setAllPlayers((latest) =>
          latest.some(
            (p) => p.userId === profile.userId || p.id === id
          )
            ? latest
            : [...latest, created]
        );
        result = created;
      }

      setRecentIds((latest) =>
        latest.includes(result.id) ? latest : [result.id, ...latest]
      );
      void cloudUpsertPlayer(result);
      return result;
    },
    [cloudUpsertPlayer]
  );


  // Sign-in side effect (auto-link default player + push to cloud)
  useEffect(() => {
    if (!hydrated || !accountHydrated) return;
    if (!defaultPlayerId) return;

    let updated: Player | undefined;
    setAllPlayers((prev) => {
      const current = prev.find((p) => p.id === defaultPlayerId);
      if (!current) return prev;

      const desired: Partial<Player> = account
        ? {
            userId: account.userId,
            displayName: account.displayName,
            handle: account.handle,
            // Sync the local roster entry's color to the profile's
            // avatar_color so the scoring screen matches the snapshot
            // color the rest of the app derives from the participant row.
            color: account.avatarColor,
          }
        : { userId: undefined, displayName: undefined, handle: undefined };

      if (
        current.userId === desired.userId &&
        current.displayName === desired.displayName &&
        current.handle === desired.handle &&
        (desired.color === undefined || current.color === desired.color)
      ) {
        return prev;
      }

      updated = { ...current, ...desired };
      return prev.map((p) => (p.id === defaultPlayerId ? updated! : p));
    });

    if (updated) void cloudUpsertPlayer(updated);
  }, [account, accountHydrated, defaultPlayerId, hydrated, cloudUpsertPlayer]);

  const getPlayer = useCallback(
    (id: string) => allPlayers.find((p) => p.id === id),
    [allPlayers]
  );

  const recentPlayers = useMemo(
    () =>
      recentIds
        .map((id) => allPlayers.find((p) => p.id === id))
        .filter((p): p is Player => p !== undefined)
        .slice(0, 6),
    [allPlayers, recentIds]
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      allPlayers,
      recentPlayers,
      defaultPlayerId,
      addPlayer,
      markRecent,
      setDefaultPlayerId,
      getPlayer,
      linkPlayer,
      unlinkPlayer,
      ensureRosterForFriend,
      refreshRoster,
      hydrated,
    }),
    [
      allPlayers,
      recentPlayers,
      defaultPlayerId,
      addPlayer,
      markRecent,
      getPlayer,
      linkPlayer,
      unlinkPlayer,
      ensureRosterForFriend,
      refreshRoster,
      hydrated,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayers() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayers must be used inside PlayerProvider.');
  }
  return context;
}
