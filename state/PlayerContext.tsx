/**
 * Player context managing the list of known players and recent selections.
 */

import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

import { defaultPlayers } from '@/data/players';
import { Player } from '@/types/golf';

type PlayerContextValue = {
  allPlayers: Player[];
  recentPlayers: Player[];
  defaultPlayerId: string | null;
  addPlayer: (player: Player) => void;
  markRecent: (playerId: string) => void;
  setDefaultPlayerId: (id: string | null) => void;
  getPlayer: (id: string) => Player | undefined;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: PropsWithChildren) {
  const [allPlayers, setAllPlayers] = useState<Player[]>(defaultPlayers);
  const [recentIds, setRecentIds] = useState<string[]>(defaultPlayers.map((p) => p.id));
  const [defaultPlayerId, setDefaultPlayerId] = useState<string | null>('user');

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
    }),
    [allPlayers, recentPlayers, defaultPlayerId, addPlayer, markRecent, getPlayer]
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
