/**
 * Player context managing the list of known players and recent selections.
 *
 * Persists `allPlayers`, `recentIds`, and `defaultPlayerId` to AsyncStorage
 * so roster state survives app restarts. Hydration happens in parallel for
 * each piece of state; `hydrated` flips to true once all three reads complete
 * (the root layout gates the splash screen on this).
 *
 * Phase 3 step 8 additions:
 *   · One-time hydrate-time migration of the legacy `name` field into the
 *     new required `nickname` field, plus default-fill for any other newly
 *     introduced optional Player fields.
 *   · `linkPlayer` / `unlinkPlayer` actions that mutate a Player's
 *     account-association fields (userId, displayName, handle) without
 *     touching its local nickname.
 *   · A sign-in side effect that links the default-player record to the
 *     active account, and unlinks on sign-out. Intentionally only mutates
 *     the default player — other roster entries are linked via the
 *     friend-request flow (Step 8 phase D/E).
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

import { defaultPlayers } from '@/data/players';
import { useAccount } from '@/state/AccountContext';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { Player } from '@/types/golf';

const DEFAULT_RECENT_IDS = defaultPlayers.map((p) => p.id);
const DEFAULT_DEFAULT_ID: string | null = 'user';

/**
 * Account-side fields that can be set on a Player to mark it as linked to
 * a real user. The local nickname is intentionally NOT part of this shape.
 */
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
  /** Set userId / displayName / handle on a Player. Nickname is preserved. */
  linkPlayer: (playerId: string, link: PlayerLink) => void;
  /** Clear userId / displayName / handle on a Player. Nickname is preserved. */
  unlinkPlayer: (playerId: string) => void;
  hydrated: boolean;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

/**
 * Coerce a raw stored player object into the current Player shape. Handles
 * pre-Step-8 records where `name` was the only label field. Defensive
 * fallback for `nickname` so a malformed record never lands undefined into
 * a required field.
 */
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

export function PlayerProvider({ children }: PropsWithChildren) {
  const [allPlayers, setAllPlayers] = useState<Player[]>(defaultPlayers);
  const [recentIds, setRecentIds] = useState<string[]>(DEFAULT_RECENT_IDS);
  const [defaultPlayerId, setDefaultPlayerId] = useState<string | null>(DEFAULT_DEFAULT_ID);
  const [hydrated, setHydrated] = useState(false);

  const { account, hydrated: accountHydrated } = useAccount();

  // Hydrate all three keys in parallel on mount. Players go through the
  // migration helper so legacy `name`-only records are coerced into the
  // current shape on first read.
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

  // Per-key write effects, each gated on hydration so we don't stomp stored
  // data with the seed on first render.
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

  const addPlayer = useCallback((player: Player) => {
    setAllPlayers((prev) => [...prev, player]);
    setRecentIds((prev) => [player.id, ...prev.filter((id) => id !== player.id)]);
  }, []);

  const markRecent = useCallback((playerId: string) => {
    setRecentIds((prev) => [playerId, ...prev.filter((id) => id !== playerId)]);
  }, []);

  const linkPlayer = useCallback((playerId: string, link: PlayerLink) => {
    setAllPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, userId: link.userId, displayName: link.displayName, handle: link.handle }
          : p
      )
    );
  }, []);

  const unlinkPlayer = useCallback((playerId: string) => {
    setAllPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, userId: undefined, displayName: undefined, handle: undefined }
          : p
      )
    );
  }, []);

  // Sign-in side effect: keep the default player's link in sync with the
  // active account. Runs once both the player roster and the account context
  // have hydrated; no-ops if either is still loading.
  useEffect(() => {
    if (!hydrated || !accountHydrated) return;
    if (!defaultPlayerId) return;

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

      // Bail early if nothing actually changed; avoids redundant writes.
      if (
        current.userId === desired.userId &&
        current.displayName === desired.displayName &&
        current.handle === desired.handle
      ) {
        return prev;
      }

      return prev.map((p) => (p.id === defaultPlayerId ? { ...p, ...desired } : p));
    });
  }, [account, accountHydrated, defaultPlayerId, hydrated]);

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
