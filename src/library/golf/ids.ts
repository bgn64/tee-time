/**
 * Id generators for entities created locally on the Score tab.
 *
 * Re-exports the project-wide `uuid()` helper under domain-specific
 * names so call sites read intentionally and we have one place to swap
 * in `expo-crypto.randomUUID()` later if we ever want cryptographic
 * randomness.
 */

import { uuid } from '@/library/utils/uuid';

/** Stable id for a new scorecard (server-side `scorecards.id`). */
export function newRoundId(): string {
  return uuid();
}

/** Stable id for a new per-cell score row (server-side `scorecard_scores.id`). */
export function newScoreId(): string {
  return uuid();
}

/** Stable id for a new custom player row (server-side `custom_players.id`). */
export function newCustomPlayerId(): string {
  return uuid();
}

/**
 * Stable id for a scramble team. Persisted as the `scorer_id` on
 * every `scorecard_scores` row for that team, so it has to be unique
 * within the round AND collision-free across rapid taps in the
 * team-config UI. UUID is overkill for the team count we'll ever
 * realistically see, but the cost is zero and it eliminates the
 * `Date.now()` collision class entirely.
 */
export function newTeamId(): string {
  return uuid();
}

/** Stable id for a new round comment row (server-side `comments.id`). */
export function newCommentId(): string {
  return uuid();
}

/** Stable id for a new round like row (server-side `round_likes.id`). */
export function newRoundLikeId(): string {
  return uuid();
}
