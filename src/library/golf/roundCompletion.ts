/**
 * Round-completion checks — pure functions used by the
 * finish-round flow to compute what data is missing across
 * scores AND per-hole stats.
 *
 * Used by `scoring.tsx`'s Finish handler to produce a structured
 * warning sheet ("GIR missing on holes 7, 11; Putts missing on 3
 * holes — finish anyway?") instead of a generic "missing data"
 * alert. The same helper drives the friendlier per-stat
 * breakdown the user explicitly requested.
 */

import {
  applicableStatsForHole,
  BUILT_IN_STATS,
  getStat,
  isStatEntered,
  type StatDefinition,
  type StatKey,
} from './builtInStats';
import { holesInRange } from './scoring';
import type { HoleDetailsRow } from './useRoundHoleDetails';
import type { Hole, Round } from '@/types/golf';

export type MissingScoreScope = {
  scorerId: string;
  scorerName: string;
  /** In-range hole numbers without a score. */
  holes: number[];
};

export type MissingStatScope = {
  scorerId: string;
  scorerName: string;
  statKey: StatKey;
  statLabel: string;
  /** Applicable hole numbers (post par-filter) without a value. */
  holes: number[];
};

export type RoundCompletionGaps = {
  /** One entry per scorer that has at least one missing score. */
  scores: MissingScoreScope[];
  /** One entry per (scorer, stat) pair with at least one missing value. */
  stats: MissingStatScope[];
  /** True when nothing is missing — Finish proceeds without a warning. */
  isComplete: boolean;
};

/**
 * Resolve display names for the round's scorers (stroke = player
 * IDs; scramble = team IDs). Falls back to a short generic label
 * if the round shape doesn't carry a name (e.g., legacy data).
 */
function nameForScorerId(
  round: Round,
  scorerId: string,
  nameForParticipant: (participantKey: string) => string | undefined
): string {
  if (round.scoringRule === 'scramble' && round.teams) {
    const team = round.teams.find((t) => t.id === scorerId);
    if (team) return team.name;
  }
  return nameForParticipant(scorerId) ?? 'Scorer';
}

/**
 * Walks the round's in-range holes + tracked scorers, and returns
 * a structured breakdown of every (scorer, hole) score and every
 * (scorer, stat, hole) value that's missing. "Applicable" honors
 * stat par-filters (FIR is never missing on a par-3) and the
 * round's `trackedScorerIds` (untracked scorers don't contribute
 * stat gaps).
 */
export function computeRoundCompletionGaps(
  round: Round,
  detailsRows: readonly HoleDetailsRow[],
  nameForParticipant: (participantKey: string) => string | undefined
): RoundCompletionGaps {
  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const requiredScoreIds = isScramble
    ? round.teams!.map((t) => t.id)
    : round.playerIds;

  const inRange: Hole[] = holesInRange(round.course.holes, round.holeRange);

  // ---- Score gaps ----
  const scoreGaps: MissingScoreScope[] = [];
  for (const scorerId of requiredScoreIds) {
    const missingHoles: number[] = [];
    for (const h of inRange) {
      const has = round.scores.some(
        (s) => s.scorerId === scorerId && s.holeNumber === h.number
      );
      if (!has) missingHoles.push(h.number);
    }
    if (missingHoles.length > 0) {
      scoreGaps.push({
        scorerId,
        scorerName: nameForScorerId(round, scorerId, nameForParticipant),
        holes: missingHoles,
      });
    }
  }

  // ---- Stat gaps ----
  const statGaps: MissingStatScope[] = [];
  const trackedSet = new Set(round.trackedScorerIds);
  const enabledSet = new Set(round.enabledStatKeys);
  const enabledStats: StatDefinition[] = BUILT_IN_STATS.filter((s) =>
    enabledSet.has(s.key)
  );
  if (enabledStats.length > 0 && trackedSet.size > 0) {
    // Pre-bucket the rows for O(scorerCount * holeCount * statCount)
    // membership lookups instead of nested .find calls.
    const valuesByTuple = new Map<string, HoleDetailsRow['values']>();
    for (const r of detailsRows) {
      valuesByTuple.set(`${r.scorer_id}::${r.hole_number}`, r.values);
    }
    for (const scorerId of trackedSet) {
      const scorerName = nameForScorerId(round, scorerId, nameForParticipant);
      for (const stat of enabledStats) {
        const def = getStat(stat.key);
        if (!def) continue;
        const missingHoles: number[] = [];
        for (const h of inRange) {
          const applicable = applicableStatsForHole([stat.key], h).length > 0;
          if (!applicable) continue;
          const values =
            valuesByTuple.get(`${scorerId}::${h.number}`) ?? {};
          if (!isStatEntered(def, values)) {
            missingHoles.push(h.number);
          }
        }
        if (missingHoles.length > 0) {
          statGaps.push({
            scorerId,
            scorerName,
            statKey: stat.key,
            statLabel: stat.label,
            holes: missingHoles,
          });
        }
      }
    }
  }

  return {
    scores: scoreGaps,
    stats: statGaps,
    isComplete: scoreGaps.length === 0 && statGaps.length === 0,
  };
}

/**
 * Build the per-scope summary line for a missing scope. Shows the
 * explicit hole list when 4 or fewer are missing; otherwise shows
 * just the count. Format chosen to read naturally in a single-line
 * Alert.alert body.
 */
function formatHoleList(holes: readonly number[]): string {
  if (holes.length === 0) return '';
  if (holes.length <= 4) {
    return `holes ${holes.join(', ')}`;
  }
  return `${holes.length} holes`;
}

/**
 * Render a finish-warning message body from completion gaps.
 * Returns null when there's nothing missing (caller should skip
 * the warning and finish directly).
 */
export function formatCompletionWarning(
  gaps: RoundCompletionGaps
): string | null {
  if (gaps.isComplete) return null;
  const lines: string[] = ['You haven’t entered:'];
  if (gaps.scores.length > 0) {
    for (const g of gaps.scores) {
      lines.push(`  • Score (${g.scorerName}) — ${formatHoleList(g.holes)}`);
    }
  }
  for (const g of gaps.stats) {
    const scorerSuffix = gaps.scores.length > 0 ? ` (${g.scorerName})` : '';
    lines.push(`  • ${g.statLabel}${scorerSuffix} — ${formatHoleList(g.holes)}`);
  }
  return lines.join('\n');
}
