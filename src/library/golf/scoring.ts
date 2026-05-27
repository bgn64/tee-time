/**
 * Scoring helpers — pure functions shared between the live scoring
 * screen, the read-only scorecard grid, and the friend feed cards.
 *
 * All helpers scoped by `holeRange` ignore scores for holes outside
 * the active range. Out-of-range scores are preserved in the data so
 * a mid-round toggle back to `all` doesn't lose work, but every
 * totals / "thru N" / finish-validation aggregate excludes them.
 */

import type { Hole, HoleRange, Round, RoundScore } from '@/types/golf';

const MS_PER_MIN = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/** "+3" / "−2" / "E" — uses unicode minus (U+2212). */
export function formatScore(rel: number): string {
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

/**
 * Coarse relative-time formatter for the feed.
 *   <1h      → "5m ago"
 *   <24h     → "3h ago"
 *   <2d      → "Yesterday"
 *   <7d      → "3 days ago"
 *   else     → "May 6"
 *
 * `nowMs` is injectable for testability; defaults to Date.now().
 */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const delta = Math.max(0, nowMs - then);
  if (delta < MS_PER_HOUR) {
    const mins = Math.max(1, Math.floor(delta / MS_PER_MIN));
    return `${mins}m ago`;
  }
  if (delta < MS_PER_DAY) {
    return `${Math.floor(delta / MS_PER_HOUR)}h ago`;
  }
  if (delta < 2 * MS_PER_DAY) return 'Yesterday';
  if (delta < 7 * MS_PER_DAY) {
    return `${Math.floor(delta / MS_PER_DAY)} days ago`;
  }
  const d = new Date(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Subset of `holes` that falls inside the given range. */
export function holesInRange(holes: Hole[], range: HoleRange): Hole[] {
  if (range === 'front9') return holes.filter((h) => h.number <= 9);
  if (range === 'back9') return holes.filter((h) => h.number >= 10);
  return holes;
}

/**
 * Short label for the in-play hole range, used by feed/round-detail
 * "X holes" pills.
 *
 *   range='all' on a 9-hole course   → "9 HOLES"
 *   range='all' on an 18-hole course → "18 HOLES"
 *   range='front9'                   → "FRONT 9"
 *   range='back9'                    → "BACK 9"
 */
export function holeRangeLabel(holes: Hole[], range: HoleRange): string {
  if (range === 'front9') return 'FRONT 9';
  if (range === 'back9') return 'BACK 9';
  return `${holes.length} HOLES`;
}

function holeNumbersInRange(holes: Hole[], range: HoleRange): Set<number> {
  return new Set(holesInRange(holes, range).map((h) => h.number));
}

/**
 * Sum of (strokes − par) across the round, filtered by `holeRange`.
 * When `scorerId` is provided, scoped to scores for that scorer only
 * (used to render the owner's total on the feed card band).
 */
export function getRoundTotalRelative(round: Round, scorerId?: string): number {
  const allowed = holeNumbersInRange(round.course.holes, round.holeRange);
  let total = 0;
  for (const score of round.scores) {
    if (scorerId && score.scorerId !== scorerId) continue;
    if (!allowed.has(score.holeNumber)) continue;
    const hole = round.course.holes.find((h) => h.number === score.holeNumber);
    if (hole) total += score.strokes - hole.par;
  }
  return total;
}

/**
 * Score progress for a single scorer scoped to the round's hole range.
 * Returns the running relative-to-par and the count of holes scored.
 * Out-of-range holes are excluded; duplicate (scorerId, hole) entries
 * are deduped so multiple writes to the same hole only count once.
 *
 * Used by the feed's in-progress card to show "±score / THRU N".
 */
export function getScorerProgress(
  round: Round,
  scorerId: string | undefined
): { relativeScore: number; thruCount: number } {
  if (!scorerId) return { relativeScore: 0, thruCount: 0 };
  const allowed = holeNumbersInRange(round.course.holes, round.holeRange);
  let total = 0;
  let scored = 0;
  const seen = new Set<number>();
  for (const s of round.scores) {
    if (s.scorerId !== scorerId) continue;
    if (!allowed.has(s.holeNumber)) continue;
    if (seen.has(s.holeNumber)) continue;
    seen.add(s.holeNumber);
    const hole = round.course.holes.find((q) => q.number === s.holeNumber);
    if (!hole) continue;
    total += s.strokes - hole.par;
    scored++;
  }
  return { relativeScore: total, thruCount: scored };
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
  const { relativeScore, thruCount } = getScorerProgress(round, scorerId);
  return { rel: relativeScore, thru: thruCount };
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

/**
 * The first in-range hole that doesn't yet have a score for every
 * participant. Used by feed live cards to highlight the column the
 * owner is "working on" — derived rather than synced because the
 * per-device current-hole cursor lives in AsyncStorage on the owner's
 * device only.
 *
 * Returns `undefined` if every in-range cell is already filled (the
 * round is fully scored — caller should hide the highlight).
 */
export function firstNotFullyScoredHole(round: Round): number | undefined {
  const inRange = holesInRange(round.course.holes, round.holeRange);
  for (const h of inRange) {
    const allScored = round.playerIds.every((pid) =>
      round.scores.some((s) => s.scorerId === pid && s.holeNumber === h.number)
    );
    if (!allScored) return h.number;
  }
  return undefined;
}
