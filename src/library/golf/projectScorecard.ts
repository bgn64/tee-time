/**
 * projectScorecardRow — pure helper that turns a local SQLite
 * `scorecards` row + its hydrated score rows into the shared
 * `Round` shape consumed everywhere else in the app.
 *
 * Used by:
 *   - `useFeedRounds` (friends' scorecards)
 *   - `useCompletedRounds` (own completed scorecards)
 *   - The Rounds detail screen's targeted-by-id lookup
 *
 * Keeping the projection in one place stops these three call
 * sites from drifting on JSON-parse semantics, default values,
 * or shape edge cases.
 *
 * `currentHoleNumber` is left at a safe sentinel (1) — the
 * per-device cursor lives in AsyncStorage on the owner's device
 * and isn't synced. Any caller that needs a "current hole"
 * highlight derives one (see `firstNotFullyScoredHole` was —
 * now inlined where needed).
 */

import type {
  Course,
  HoleRange,
  Round,
  RoundParticipant,
  RoundScore,
  ScoringRule,
} from '@/types/golf';

export type ScorecardRowShape = {
  id: string;
  owner_user_id: string | null;
  course_id: string | null;
  course_snapshot: string | null;
  scoring_rule: string | null;
  player_ids: string | null;
  participants: string | null;
  hole_range: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

function safeParse<T>(raw: string | null | undefined, fallback: T, label: string): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[projectScorecardRow] Failed to parse ${label}; using fallback.`, e, raw);
    return fallback;
  }
}

/**
 * Returns a fully-shaped `Round` for the given local-SQLite
 * scorecard row + the per-scorecard slice of its score rows.
 * Returns `null` if the row is missing the absolute minimums
 * (no owner_user_id, or unparseable course_snapshot).
 */
export function projectScorecardRow(
  row: ScorecardRowShape,
  scoresForThisScorecard: RoundScore[]
): Round | null {
  if (!row.owner_user_id) return null;
  const course = safeParse<Course | null>(
    row.course_snapshot,
    null,
    'scorecards.course_snapshot'
  );
  if (!course) return null;
  const participants = safeParse<RoundParticipant[]>(
    row.participants,
    [],
    'scorecards.participants'
  );
  const playerIds = safeParse<string[]>(row.player_ids, [], 'scorecards.player_ids');
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    course,
    scoringRule: (row.scoring_rule as ScoringRule) ?? 'stroke',
    playerIds,
    participants,
    holeRange: (row.hole_range as HoleRange) ?? 'all',
    currentHoleNumber: 1,
    scores: scoresForThisScorecard,
    startedAt: row.started_at ?? new Date().toISOString(),
    completedAt: row.completed_at ?? undefined,
  };
}
