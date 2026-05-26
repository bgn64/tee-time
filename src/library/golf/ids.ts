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
