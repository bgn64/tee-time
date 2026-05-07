/**
 * Player context managing the list of known players and recent selections.
 *
 * Persists `allPlayers`, `recentIds`, and `defaultPlayerId` to AsyncStorage
 * so roster state survives app restarts. Hydration happens in parallel for
 * each piece of state; `hydrated` flips to true once all three reads complete
 * (the root layout gates the splash screen on this).
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
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { Player } from '@/types/golf';

const DEFAULT_RECENT_IDS = defaultPlayers.map((p) => p.id);
const DEFAULT_DEFAULT_ID: string | null = 'user';

type PlayerContextValue = {
  allPlayers: Player[];
  recentPlayers: Player[];
  defaultPlayerId: string | null;
  addPlayer: (player: Player) => void;
  markRecent: (playerId: string) => void;
  setDefaultPlayerId: (id: string | null) => void;
  getPlayer: (id: string) => Player | undefined;
  hydrated: boolean;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: PropsWithChildren) {
  const [allPlayers, setAllPlayers] = useState<Player[]>(defaultPlayers);
  const [recentIds, setRecentIds] = useState<string[]>(DEFAULT_RECENT_IDS);
  const [defaultPlayerId, setDefaultPlayerId] = useState<string | null>(DEFAULT_DEFAULT_ID);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate all three keys in parallel on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadJSON<Player[]>(STORAGE_KEYS.PLAYERS, defaultPlayers),
      loadJSON<string[]>(STORAGE_KEYS.RECENT_PLAYER_IDS, DEFAULT_RECENT_IDS),
      loadJSON<string | null>(STORAGE_KEYS.DEFAULT_PLAYER_ID, DEFAULT_DEFAULT_ID),
    ]).then(([players, recents, defId]) => {
      if (cancelled) return;
      setAllPlayers(players);
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
      hydrated,
    }),
    [allPlayers, recentPlayers, defaultPlayerId, addPlayer, markRecent, getPlayer, hydrated]
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
