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

import { defaultPlayers } from '@/data/players';
import { useAccount } from '@/state/AccountContext';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { supabase } from '@/state/supabaseClient';
import { Player } from '@/types/golf';

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

  const allPlayersRef = useRef(allPlayers);
  allPlayersRef.current = allPlayers;

  const cloudSyncedAccountRef = useRef<string | null>(null);

  // Track the previous account so we can detect the sign-out transition
  // (non-null -> null). Initial mount with account=null doesn't trigger a
  // clear; only an actual sign-out does.
  const prevAccountUserIdRef = useRef<string | null>(null);

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

  // Sign-out reset: when account transitions non-null -> null, wipe the
  // local cloud-cached roster back to seed defaults. The persistence
  // effects above will then write the cleared state to AsyncStorage.
  // Theme and other purely local state stay intact (they live in their
  // own contexts).
  useEffect(() => {
    if (!hydrated || !accountHydrated) return;
    const prev = prevAccountUserIdRef.current;
    const curr = account?.userId ?? null;
    if (prev !== null && curr === null) {
      setAllPlayers(defaultPlayers);
      setRecentIds(DEFAULT_RECENT_IDS);
      setDefaultPlayerId(DEFAULT_DEFAULT_ID);
      cloudSyncedAccountRef.current = null;
    }
    prevAccountUserIdRef.current = curr;
  }, [account, accountHydrated, hydrated]);

  const cloudUpsertPlayer = useCallback(
    async (player: Player) => {
      if (!account) return;
      const { error } = await supabase
        .from('roster_players')
        .upsert(
          {
            owner_user_id: account.userId,
            id: player.id,
            nickname: player.nickname,
            color: player.color ?? null,
            linked_user_id: safeLinkedUserId(player.userId),
          },
          { onConflict: 'owner_user_id,id' }
        );
      if (error) console.warn('[roster] upsert failed:', error);
    },
    [account]
  );

  // One-time-per-account initial sync
  useEffect(() => {
    if (!hydrated || !accountHydrated) return;
    if (!account) {
      cloudSyncedAccountRef.current = null;
      return;
    }
    if (cloudSyncedAccountRef.current === account.userId) return;

    let cancelled = false;
    const ownerUserId = account.userId;

    const sync = async () => {
      const { data: cloudRowsRaw, error } = await supabase
        .from('roster_players')
        .select('id, nickname, color, linked_user_id')
        .eq('owner_user_id', ownerUserId);

      if (error) {
        console.warn('[roster] initial sync pull failed:', error);
        return;
      }
      if (cancelled) return;

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

      if (cancelled) return;
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

      cloudSyncedAccountRef.current = ownerUserId;
    };

    sync();
    return () => {
      cancelled = true;
    };
  }, [account, hydrated, accountHydrated]);

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
          }
        : { userId: undefined, displayName: undefined, handle: undefined };

      if (
        current.userId === desired.userId &&
        current.displayName === desired.displayName &&
        current.handle === desired.handle
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
