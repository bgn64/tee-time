/**
 * Seed players for the prototype.
 *
 * The player picker on the Score tab uses these as a fixed roster
 * until we build out a real friend graph. `You` is always pinned to
 * the top of the picker; the others are toggleable additions (max 4
 * total scorers per round, including You).
 *
 * Ids are stable string literals so the cloud `scorecards.participants`
 * jsonb keeps consistent `participantKey`s across devices.
 */

import type { Player } from '@/types/golf';

export const SELF_PLAYER_ID = 'player-you';

export const SEED_PLAYERS: Player[] = [
  { id: SELF_PLAYER_ID, nickname: 'You', color: '#7cb342' },
  { id: 'player-alice', nickname: 'Alice', color: '#4a90e2' },
  { id: 'player-bob', nickname: 'Bob', color: '#d94835' },
  { id: 'player-carol', nickname: 'Carol', color: '#9c5dde' },
];

export function findSeedPlayer(id: string): Player | undefined {
  return SEED_PLAYERS.find((p) => p.id === id);
}
