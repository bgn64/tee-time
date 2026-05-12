/**
 * Pure helper functions for round / score formatting and computation.
 *
 * Extracted from screen and context files so they can be unit-tested in
 * isolation (no React, no Supabase, no Expo deps). All functions here are
 * pure — given the same input they produce the same output.
 */

import { Hole, HoleRange, Round, RoundParticipant, RoundScore } from '@/types/golf';

const MS_PER_MIN = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_LONG = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

/**
 * Format a relative-to-par delta as "+3" / "−2" / "E".
 * Note: uses the unicode minus (U+2212), not ASCII hyphen.
 */
export function formatScore(rel: number): string {
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

/** "May 6" — short month + day-of-month. */
export function formatDay(date: Date): string {
  return `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`;
}

/** "MAY 2026" — used as a stable sort/group key in rounds list. */
export function monthKey(date: Date): string {
  return `${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Coarse relative-time formatter for the feed.
 *   <1h      -> "5m ago"
 *   <24h     -> "3h ago"
 *   <2d      -> "Yesterday"
 *   <7d      -> "3 days ago"
 *   else     -> "May 6"
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

/**
 * Sum of (strokes - par) across the round, filtered by `holeRange`. When
 * `scorerId` is provided, scoped to scores for that scorer only (used to
 * render "your" total in the rounds list, or the owner's total in the
 * feed). Scores for holes outside the active range are excluded.
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
 * "+3 thru 9" / "E thru 7" / "" — used by the in-flight scoring screen to
 * show a per-scorer running total. Empty string when no holes scored yet
 * within the active range. Out-of-range holes are excluded.
 */
export function getScorerTotalRelative(round: Round, scorerId: string): string {
  const allowed = holeNumbersInRange(round.course.holes, round.holeRange);
  let total = 0;
  let holesScored = 0;
  for (const score of round.scores) {
    if (score.scorerId !== scorerId) continue;
    if (!allowed.has(score.holeNumber)) continue;
    const hole = round.course.holes.find((h) => h.number === score.holeNumber);
    if (!hole) continue;
    total += score.strokes - hole.par;
    holesScored++;
  }
  if (holesScored === 0) return '';
  if (total === 0) return `E thru ${holesScored}`;
  const prefix = total > 0 ? '+' : '';
  return `${prefix}${total} thru ${holesScored}`;
}

/**
 * Subset of `holes` that falls inside the given range. Pure, used by
 * every helper that needs to ignore out-of-range scores.
 */
export function holesInRange(holes: Hole[], range: HoleRange): Hole[] {
  if (range === 'front9') return holes.filter((h) => h.number <= 9);
  if (range === 'back9') return holes.filter((h) => h.number >= 10);
  return holes;
}

function holeNumbersInRange(holes: Hole[], range: HoleRange): Set<number> {
  return new Set(holesInRange(holes, range).map((h) => h.number));
}

/**
 * Upsert a (scorerId, holeNumber) entry into a scores array. Returns a new
 * array; the input is not mutated.
 */
export function replaceScore(scores: RoundScore[], nextScore: RoundScore): RoundScore[] {
  const existingScoreIndex = scores.findIndex(
    (score) =>
      score.scorerId === nextScore.scorerId && score.holeNumber === nextScore.holeNumber
  );

  if (existingScoreIndex === -1) {
    return [...scores, nextScore];
  }

  return scores.map((score, index) => (index === existingScoreIndex ? nextScore : score));
}

/**
 * Round-detail subtitle phrase. Returns:
 *   - "Red vs Blue" for scramble.
 *   - "you played" / "X played" / "X and Y played" / "X, Y, and Z played" for stroke,
 *     replacing the viewer's name with "you" when `myUserId` matches.
 *   - "Round" if no linked participants exist.
 *
 * Only linked participants count toward the title — local participants
 * are excluded so the title acts as the round's "broadcast headline."
 *
 * `resolveName` is consulted to look up the live displayName for a linked
 * user_id (the viewer's profileCache + roster, typically). When unset or
 * returning undefined, the participant is rendered as "Friend".
 */
export function buildRoundTitle(
  round: Round,
  myUserId?: string,
  resolveName?: (linkedUserId: string) => string | undefined
): string {
  if (round.scoringRule === 'scramble') {
    if (!round.teams || round.teams.length === 0) return 'Round';
    return round.teams.map((t) => t.name).join(' vs ');
  }
  const names: string[] =
    round.participants
      ?.filter((p: RoundParticipant) => !!p.linkedUserId)
      .map((p: RoundParticipant) =>
        p.linkedUserId === myUserId
          ? 'you'
          : resolveName?.(p.linkedUserId!) ?? 'Friend'
      ) ?? [];
  if (names.length === 0) return 'Round';
  if (names.length === 1) return `${names[0]} played`;
  if (names.length === 2) return `${names[0]} and ${names[1]} played`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} played`;
}
