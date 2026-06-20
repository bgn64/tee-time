/**
 * Handicap index — an approximate World Handicap System (WHS) calculation
 * computed entirely client-side from the rounds we already have.
 *
 * Per round, the WHS Score Differential is:
 *
 *   Differential = (113 / Slope) × (Adjusted Gross Score − Course Rating)
 *
 * where Adjusted Gross Score caps each hole's score. The cap follows the real
 * WHS bootstrap, which sidesteps the circular "net double bogey needs a Course
 * Handicap, a Course Handicap needs an index, an index needs scores" problem:
 *
 *   - Before you have an established index (your first 54 holes / 3 rounds),
 *     each hole is capped at *par + 5* — no handicap strokes required.
 *   - Once an index exists, each hole is capped at *net double bogey*
 *     (par + 2 + strokes received), using the Course Handicap derived from the
 *     index built off your earlier scores.
 *
 * Scores are therefore processed in posting order (oldest first), and each
 * round's Score Differential is fixed once posted — never recomputed when a
 * later round changes the index (`computeWhsHandicap` below).
 *
 * The Handicap Index is the average of the lowest 8 of the player's most
 * recent 20 differentials, using the WHS reduced-rounds table when fewer
 * than 20 are available (minimum 3 rounds to establish an index).
 *
 * Deliberately approximate / out of scope for now (the UI says as much):
 *   - Soft cap / hard cap and the Low-Handicap-Index 12-month anchor.
 *   - Playing-Conditions Calculation (PCC).
 *   - 9-hole differential combination.
 *
 * A round only contributes when it has all the inputs the formula needs:
 * full-18 stroke play, every hole scored by the player, a selected tee
 * carrying both `rating` and `slope`, and a per-hole stroke index. Rounds
 * missing any of these are surfaced as "excluded" with a reason rather than
 * silently dropped — see `HandicapExclusionReason`.
 */

import type { Round } from '@/types/golf';

import { findHole, findTee } from './courseHelpers';
import { userParticipantKey } from './participantKey';
import { holesInRange, scorerIdForUser } from './scoring';
import { getHoleStats } from './teeGrouping';

/** Most recent N differentials considered for the index. */
const WHS_WINDOW = 20;
/** Minimum differentials needed before an index can be established. */
const MIN_ROUNDS_FOR_INDEX = 3;

export type HandicapExclusionReason =
  | 'not-18'
  | 'incomplete'
  | 'no-tee'
  | 'no-rating'
  | 'no-stroke-index';

export type EligibleHandicapRound = {
  round: Round;
  /** Round end time in ms, for recency ordering. */
  date: number;
  /** Raw strokes the player took across the 18 holes. */
  gross: number;
  /** Adjusted gross with each hole capped at net double bogey. */
  adjustedGross: number;
  rating: number;
  slope: number;
  /** Sum of par over the 18 holes (for the Course Handicap formula). */
  parTotal: number;
  /** Score differential, rounded to one decimal. */
  differential: number;
  /** True when this round is one of the lowest-N that feed the index. */
  counts: boolean;
};

export type ExcludedHandicapRound = {
  round: Round;
  date: number;
  reason: HandicapExclusionReason;
};

export type HandicapBreakdown = {
  /** Null until at least `MIN_ROUNDS_FOR_INDEX` eligible rounds exist. */
  index: number | null;
  /** Display string: "7.9", a plus handicap "+1.2", or "—". */
  indexLabel: string;
  /**
   * The differentials considered (most recent 20), sorted ascending by
   * differential so the counting ones lead. `counts` flags the lowest-N.
   */
  window: EligibleHandicapRound[];
  /** How many differentials were averaged for the index. */
  usedCount: number;
  /**
   * Average of the counting (lowest-`usedCount`) differentials BEFORE the
   * reduced-rounds adjustment, rounded to one decimal. Null until an index
   * exists. When `adjustment` is 0 this equals `index`.
   */
  lowAverage: number | null;
  /** WHS reduced-rounds adjustment applied to the average (≤ 0). */
  adjustment: number;
  /** All-time eligible rounds (may exceed the 20-round window). */
  totalEligible: number;
  /** Participant stroke rounds that did NOT qualify, most recent first. */
  excluded: ExcludedHandicapRound[];
};

type PerHole = { par: number; strokeIndex: number; strokes: number };

type EligibleSource = {
  round: Round;
  date: number;
  gross: number;
  rating: number;
  slope: number;
  parTotal: number;
  holes: PerHole[];
};

/** WHS reduced-rounds table → how many lowest differentials to use + adjustment. */
function reducedRounds(n: number): { used: number; adjustment: number } {
  if (n <= 5) return { used: 1, adjustment: n === 3 ? -2 : n === 4 ? -1 : 0 };
  if (n === 6) return { used: 2, adjustment: -1 };
  if (n <= 8) return { used: 2, adjustment: 0 };
  if (n <= 11) return { used: 3, adjustment: 0 };
  if (n <= 14) return { used: 4, adjustment: 0 };
  if (n <= 16) return { used: 5, adjustment: 0 };
  if (n <= 18) return { used: 6, adjustment: 0 };
  if (n === 19) return { used: 7, adjustment: 0 };
  return { used: 8, adjustment: 0 };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundEndMs(round: Round): number {
  return new Date(round.completedAt ?? round.startedAt).getTime();
}

/**
 * Strokes the player receives on a hole of stroke index `si` (1 = hardest)
 * given an integer Course Handicap. Negative handicaps (better than scratch)
 * give strokes back starting from the easiest holes.
 */
function strokesReceived(si: number, courseHandicap: number): number {
  if (courseHandicap >= 0) {
    const base = Math.floor(courseHandicap / 18);
    const remainder = courseHandicap - base * 18;
    return base + (si <= remainder ? 1 : 0);
  }
  const give = -courseHandicap;
  const base = Math.floor(give / 18);
  const remainder = give - base * 18;
  return -(base + (si > 18 - remainder ? 1 : 0));
}

function courseHandicap(index: number, slope: number, rating: number, parTotal: number): number {
  return Math.round(index * (slope / 113) + (rating - parTotal));
}

/** Maximum strokes over par a hole counts for before the player has an index (WHS: par + 5). */
const PRE_INDEX_HOLE_CAP_OVER_PAR = 5;

/**
 * Adjusted Gross with each hole capped at net double bogey
 * (par + 2 + strokes received). Used once the player has an established index,
 * which is what supplies the Course Handicap the cap depends on.
 */
function adjustedGrossNetDoubleBogey(source: EligibleSource, index: number): number {
  const ch = courseHandicap(index, source.slope, source.rating, source.parTotal);
  let ags = 0;
  for (const hole of source.holes) {
    const netDoubleBogey = hole.par + 2 + strokesReceived(hole.strokeIndex, ch);
    ags += Math.min(hole.strokes, netDoubleBogey);
  }
  return ags;
}

/**
 * Adjusted Gross for a player with no established index yet: each hole is
 * capped at par + 5 — the WHS maximum before a Course Handicap exists. This is
 * how a brand-new player's first scores are processed, breaking the otherwise
 * circular "net double bogey needs a handicap, a handicap needs scores" loop.
 */
function adjustedGrossParPlus5(source: EligibleSource): number {
  let ags = 0;
  for (const hole of source.holes) {
    ags += Math.min(hole.strokes, hole.par + PRE_INDEX_HOLE_CAP_OVER_PAR);
  }
  return ags;
}

function differentialFor(source: EligibleSource, ags: number): number {
  return round1((113 / source.slope) * (ags - source.rating));
}

/** Average of the lowest `used` differentials (already 1-dp) plus adjustment. */
function indexFrom(differentials: number[]): {
  index: number | null;
  lowAverage: number | null;
  used: number;
  adjustment: number;
} {
  const n = differentials.length;
  if (n < MIN_ROUNDS_FOR_INDEX) return { index: null, lowAverage: null, used: 0, adjustment: 0 };
  const { used, adjustment } = reducedRounds(n);
  const lowest = [...differentials].sort((a, b) => a - b).slice(0, used);
  const average = lowest.reduce((sum, d) => sum + d, 0) / used;
  return { index: round1(average + adjustment), lowAverage: round1(average), used, adjustment };
}

/** Format an index for display: plus handicaps as "+N.N", else "N.N", null as "—". */
export function formatHandicapIndex(index: number | null): string {
  if (index == null) return '—';
  if (index < 0) return `+${Math.abs(index).toFixed(1)}`;
  return index.toFixed(1);
}

/** Build the per-hole (par, stroke index, strokes) rows for the player, or null if any input is missing. */
function buildEligibleSource(round: Round, userId: string): EligibleSource | 'no-tee' | 'no-rating' | 'no-stroke-index' {
  const participant = round.participants.find(
    (p) => p.participantKey === userParticipantKey(userId)
  );
  const teeId = participant?.teeId;
  if (!teeId) return 'no-tee';
  const tee = findTee(round.course, teeId);
  if (!tee || tee.rating == null || tee.slope == null) return 'no-rating';

  const scorerId = scorerIdForUser(round, userId);
  const rangeHoles = holesInRange(round.course.holes, round.holeRange);

  const strokesByHole = new Map<number, number>();
  for (const score of round.scores) {
    if (score.scorerId !== scorerId) continue;
    if (strokesByHole.has(score.holeNumber)) continue;
    if (score.strokes > 0) strokesByHole.set(score.holeNumber, score.strokes);
  }

  const holes: PerHole[] = [];
  let gross = 0;
  let parTotal = 0;
  for (const hole of rangeHoles) {
    const courseHole = findHole(round.course, hole.number);
    const stats = courseHole ? getHoleStats(tee, hole.number, courseHole) : null;
    if (!stats || stats.handicapIndex == null) return 'no-stroke-index';
    const strokes = strokesByHole.get(hole.number);
    if (strokes == null) return 'no-stroke-index';
    holes.push({ par: stats.par, strokeIndex: stats.handicapIndex, strokes });
    gross += strokes;
    parTotal += stats.par;
  }

  return {
    round,
    date: roundEndMs(round),
    gross,
    rating: tee.rating,
    slope: tee.slope,
    parTotal,
    holes,
  };
}

/**
 * Compute the player's approximate WHS handicap breakdown from their
 * completed rounds. `rounds` is expected to be the owner's completed rounds
 * (e.g. from `useCompletedRounds`); only rounds where the user is a stroke-play
 * participant are considered.
 */
export function computeWhsHandicap(rounds: Round[], userId: string): HandicapBreakdown {
  const eligible: EligibleSource[] = [];
  const excluded: ExcludedHandicapRound[] = [];

  for (const round of rounds) {
    const scorerId = scorerIdForUser(round, userId);
    if (!scorerId) continue; // not a participant — not the user's handicap round
    if (round.scoringRule !== 'stroke') continue; // only stroke play counts

    const date = roundEndMs(round);
    const rangeHoles = holesInRange(round.course.holes, round.holeRange);
    if (rangeHoles.length !== 18) {
      excluded.push({ round, date, reason: 'not-18' });
      continue;
    }

    const source = buildEligibleSource(round, userId);
    if (source === 'no-tee' || source === 'no-rating') {
      excluded.push({ round, date, reason: source });
      continue;
    }
    if (source === 'no-stroke-index') {
      // Distinguish "missing data" from "player didn't finish every hole".
      const reason = hasEveryHoleScored(round, userId, rangeHoles.length)
        ? 'no-stroke-index'
        : 'incomplete';
      excluded.push({ round, date, reason });
      continue;
    }
    eligible.push(source);
  }

  // Process acceptable scores in posting order (oldest first). Each round's
  // Adjusted Gross uses the cap rule in effect AT THAT TIME: par + 5 until an
  // index is established (≥ 3 rounds / 54 holes), then net double bogey derived
  // from the index built off the earlier scores. A round's Score Differential is
  // fixed once posted and never recomputed — exactly how a handicap bootstraps
  // in real life, and it avoids the net-double-bogey / index circularity.
  eligible.sort((a, b) => a.date - b.date);

  const posted: { source: EligibleSource; adjustedGross: number; differential: number }[] = [];
  for (const source of eligible) {
    const priorIndex = indexFrom(
      posted.slice(-WHS_WINDOW).map((p) => p.differential)
    ).index;
    const adjustedGross =
      priorIndex == null
        ? adjustedGrossParPlus5(source)
        : adjustedGrossNetDoubleBogey(source, priorIndex);
    posted.push({
      source,
      adjustedGross,
      differential: differentialFor(source, adjustedGross),
    });
  }

  // The index uses the most recent 20 posted differentials.
  const windowPosts = posted.slice(-WHS_WINDOW);
  const { index: finalIndex, lowAverage, used, adjustment } = indexFrom(
    windowPosts.map((p) => p.differential)
  );

  // The lowest `used` of those count toward the index.
  const countingSet = new Set(
    [...windowPosts]
      .sort((a, b) => a.differential - b.differential)
      .slice(0, used)
      .map((p) => p.source.round.id)
  );

  const windowRounds: EligibleHandicapRound[] = windowPosts
    .map((p) => ({
      round: p.source.round,
      date: p.source.date,
      gross: p.source.gross,
      adjustedGross: p.adjustedGross,
      rating: p.source.rating,
      slope: p.source.slope,
      parTotal: p.source.parTotal,
      differential: p.differential,
      counts: countingSet.has(p.source.round.id),
    }))
    .sort((a, b) => a.differential - b.differential);

  excluded.sort((a, b) => b.date - a.date);

  return {
    index: finalIndex,
    indexLabel: formatHandicapIndex(finalIndex),
    window: windowRounds,
    usedCount: used,
    lowAverage,
    adjustment,
    totalEligible: eligible.length,
    excluded,
  };
}

/** Whether the player has a positive stroke entry on every in-range hole. */
function hasEveryHoleScored(round: Round, userId: string, holeCount: number): boolean {
  const scorerId = scorerIdForUser(round, userId);
  const scored = new Set<number>();
  for (const score of round.scores) {
    if (score.scorerId !== scorerId) continue;
    if (score.strokes > 0) scored.add(score.holeNumber);
  }
  return scored.size >= holeCount;
}

/** Short human label for why a round did not contribute to the index. */
export function exclusionLabel(reason: HandicapExclusionReason): string {
  switch (reason) {
    case 'not-18':
      return 'Not a full 18 holes';
    case 'incomplete':
      return 'Some holes not scored';
    case 'no-tee':
      return 'No tee selected';
    case 'no-rating':
      return 'Course rating unavailable';
    case 'no-stroke-index':
      return 'Missing hole stroke index';
  }
}
