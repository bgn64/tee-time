/**
 * Personal-stats computation for the You-tab strip.
 *
 * Pure function over a Round[] + viewer-identity inputs. Extracted out
 * of the inline implementation in `app/(tabs)/(you)/index.tsx` so the
 * data-sovereignty fallback rules can be unit-tested in isolation.
 *
 * Scoping rules (highest authority first):
 *
 *   1. Signed-in viewer (`myUserId !== null`):
 *      Count every stroke-format round where the viewer's
 *      `participantKey` is in the round's `playerIds`, identified by
 *      `participants[].linkedUserId === myUserId`.
 *
 *   2. Signed-out viewer with a local `defaultPlayerId`:
 *      Count ONLY rounds with `ownerUserId === undefined` (genuine
 *      pre-auth anon rounds). This is defense-in-depth against the
 *      data-leak scenario where a previously-signed-in user's cloud
 *      rounds remain in local cache after sign-out (e.g., because
 *      the sign-out purge effect raced a crash) — those rounds carry
 *      `ownerUserId` set to the previous user, and including them in
 *      stats would attribute another account's history to a
 *      signed-out viewer on the same device.
 *
 *   3. Signed-out viewer with no `defaultPlayerId`:
 *      No stats (empty result).
 *
 * Scramble rounds are excluded across the board — they're
 * collaborative and don't carry individual credit.
 */

import type { Round } from '@/types/golf';

export type PersonalStats = {
  rounds: number;
  avg: number | null;
  best: number | null;
};

export type PersonalStatsInput = {
  completedRounds: Round[];
  /** Signed-in user id, or null if signed out. */
  myUserId: string | null;
  /** Local default player id used for the signed-out fallback. */
  defaultPlayerId: string | null;
};

export function computePersonalStats(input: PersonalStatsInput): PersonalStats {
  const { completedRounds, myUserId, defaultPlayerId } = input;
  const perRound: number[] = [];

  for (const round of completedRounds) {
    if (round.scoringRule !== 'stroke') continue;

    let scorerId: string | undefined;
    if (myUserId) {
      const p = round.participants?.find((q) => q.linkedUserId === myUserId);
      scorerId = p?.participantKey;
    } else if (defaultPlayerId) {
      // Strict anon-only fallback: only count rounds that have NO
      // owner attached (i.e. genuinely pre-auth). Without this guard,
      // a stale cloud round from a previously-signed-in user (whose
      // sign-out purge missed) would match `defaultPlayerId === 'user'`
      // via participantKey and leak into the current signed-out
      // viewer's stats. See: data sovereignty pattern, Commit 8.
      if (round.ownerUserId !== undefined) continue;
      scorerId = defaultPlayerId;
    }
    if (!scorerId) continue;
    if (!round.playerIds.includes(scorerId)) continue;

    let total = 0;
    let scored = 0;
    for (const score of round.scores) {
      if (score.scorerId !== scorerId) continue;
      const hole = round.course.holes.find((h) => h.number === score.holeNumber);
      if (hole) {
        total += score.strokes - hole.par;
        scored++;
      }
    }
    if (scored > 0) perRound.push(total);
  }

  if (perRound.length === 0) {
    return { rounds: 0, avg: null, best: null };
  }
  const sum = perRound.reduce((a, b) => a + b, 0);
  return {
    rounds: perRound.length,
    avg: sum / perRound.length,
    best: Math.min(...perRound),
  };
}
