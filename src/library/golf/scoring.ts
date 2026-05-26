/**
 * Scoring helpers — pure functions shared between the live scoring
 * screen and the read-only scorecard grid.
 *
 * All helpers scoped by `holeRange` ignore scores for holes outside
 * the active range. Out-of-range scores are preserved in the data so
 * a mid-round toggle back to `all` doesn't lose work, but every
 * totals / "thru N" / finish-validation aggregate excludes them.
 */

import type { Hole, HoleRange, Round, RoundScore } from '@/types/golf';

/** "+3" / "−2" / "E" — uses unicode minus (U+2212). */
export function formatScore(rel: number): string {
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

/** Subset of `holes` that falls inside the given range. */
export function holesInRange(holes: Hole[], range: HoleRange): Hole[] {
  if (range === 'front9') return holes.filter((h) => h.number <= 9);
  if (range === 'back9') return holes.filter((h) => h.number >= 10);
  return holes;
}

function holeNumbersInRange(holes: Hole[], range: HoleRange): Set<number> {
  return new Set(holesInRange(holes, range).map((h) => h.number));
}

/**
 * Upsert one (scorerId, holeNumber) entry into a scores array. Returns
 * a new array; the input is not mutated.
 */
export function replaceScore(scores: RoundScore[], next: RoundScore): RoundScore[] {
  const i = scores.findIndex(
    (s) => s.scorerId === next.scorerId && s.holeNumber === next.holeNumber
  );
  if (i === -1) return [...scores, next];
  return scores.map((s, idx) => (idx === i ? next : s));
}

/** Running relative-to-par + holes-scored for one scorer, scoped to the round's range. */
export function playerProgress(
  round: Round,
  scorerId: string
): { rel: number; thru: number } {
  const allowed = holeNumbersInRange(round.course.holes, round.holeRange);
  let rel = 0;
  let thru = 0;
  const seen = new Set<number>();
  for (const s of round.scores) {
    if (s.scorerId !== scorerId) continue;
    if (!allowed.has(s.holeNumber)) continue;
    if (seen.has(s.holeNumber)) continue;
    seen.add(s.holeNumber);
    const h = round.course.holes.find((q) => q.number === s.holeNumber);
    if (!h) continue;
    rel += s.strokes - h.par;
    thru++;
  }
  return { rel, thru };
}

/**
 * Whether every (scorer, in-range hole) cell has a score. Used to
 * gate the "Finish" action and to surface "missing scores" warnings.
 */
export function isFullyScored(round: Round): boolean {
  const inRange = holesInRange(round.course.holes, round.holeRange);
  return inRange.every((h) =>
    round.playerIds.every((pid) =>
      round.scores.some((s) => s.scorerId === pid && s.holeNumber === h.number)
    )
  );
}

/**
 * The (scorerId, holeNumber) tuples that must all carry a score for
 * `isFullyScored` to return true. Used by the round-context to
 * compute deletes-vs-upserts when a hole leaves the in-play range.
 */
export function requiredScoreTuples(round: Round): { scorerId: string; holeNumber: number }[] {
  const inRange = holesInRange(round.course.holes, round.holeRange);
  const tuples: { scorerId: string; holeNumber: number }[] = [];
  for (const h of inRange) {
    for (const pid of round.playerIds) {
      tuples.push({ scorerId: pid, holeNumber: h.number });
    }
  }
  return tuples;
}
