/**
 * Legacy seed players (Score-tab roster v1 only).
 *
 * Kept around solely as a fallback for pre-Phase-7 scorecards whose
 * `participantKey` values were unprefixed seed ids (`'player-you'`,
 * `'player-alice'`, …). `useParticipantResolver` calls `findSeedPlayer`
 * when it parses a key as `kind: 'legacy'` so those in-flight rounds
 * still render "You" / "Alice" / etc.
 *
 * Going forward every new scorecard mints prefixed participantKeys
 * (`user:{uuid}` / `custom:{uuid}`) sourced from the live friend
 * graph + `custom_players`. Do NOT add new seed players here — add
 * a custom player from the picker instead.
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
