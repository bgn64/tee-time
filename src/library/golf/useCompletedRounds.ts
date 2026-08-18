/**
 * useCompletedRounds — Supabase REST data layer (React Query).
 *
 * Reads the signed-in user's completed scorecards directly from Supabase REST
 * (`owner_user_id = me`, `completed_at IS NOT NULL`) and hydrates their
 * `scorecard_scores` rows with a second REST query scoped to those ids. The
 * public result stays `Round[]` sorted newest-first by `started_at`; consumers
 * still re-sort by other keys client-side.
 *
 * Supabase returns scorecard jsonb columns as already-parsed objects/arrays,
 * while `projectScorecardRow` expects the legacy local-SQLite JSON strings.
 * This hook serializes those jsonb values before calling the shared projector
 * so the canonical `Round` mapping remains in one place.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/library/supabase/client';
import { useAccount } from '@/library/social/AccountContext';
import {
  projectScorecardRow,
  type ScorecardRowShape,
} from './projectScorecard';
import type { Round, RoundScore } from '@/types/golf';

type ScorecardRestRow = {
  id: string | null;
  owner_user_id: string | null;
  course_id: string | null;
  course_snapshot: unknown;
  scoring_rule: string | null;
  player_ids: unknown;
  participants: unknown;
  teams: unknown;
  hole_range: string | null;
  enabled_stat_keys: unknown;
  tracked_scorer_ids: unknown;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

type ScoreRow = {
  scorecard_id: string | null;
  scorer_id: string | null;
  hole_number: number | null;
  strokes: number | null;
};

export type CompletedRoundsResult = {
  rounds: Round[];
  isLoading: boolean;
};

const SCORECARDS_TABLE = 'scorecards';
const SCORECARD_SCORES_TABLE = 'scorecard_scores';

const SCORECARD_COLUMNS = `
  id,
  owner_user_id,
  course_id,
  course_snapshot,
  scoring_rule,
  player_ids,
  participants,
  teams,
  hole_range,
  enabled_stat_keys,
  tracked_scorer_ids,
  started_at,
  completed_at,
  updated_at
`;

function jsonbForProjector(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toScorecardRowShape(row: ScorecardRestRow): ScorecardRowShape | null {
  if (!row.id) return null;
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    course_id: row.course_id,
    course_snapshot: jsonbForProjector(row.course_snapshot),
    scoring_rule: row.scoring_rule,
    player_ids: jsonbForProjector(row.player_ids),
    participants: jsonbForProjector(row.participants),
    teams: jsonbForProjector(row.teams),
    hole_range: row.hole_range,
    enabled_stat_keys: jsonbForProjector(row.enabled_stat_keys),
    tracked_scorer_ids: jsonbForProjector(row.tracked_scorer_ids),
    started_at: row.started_at,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
  };
}

function completedScorecardsKey(userId: string | null, limit: number | null) {
  return ['completed_scorecards', userId, limit] as const;
}

function completedScoresKey(userId: string | null, scorecardIds: string[]) {
  return ['completed_scores', userId, scorecardIds] as const;
}

export function usePlayerCompletedRounds(
  userId: string | null,
  limit: number | null = null
): CompletedRoundsResult {
  const { data: scorecardRows, isLoading: scorecardLoading } = useQuery<ScorecardRestRow[]>({
    queryKey: completedScorecardsKey(userId, limit),
    enabled: !!userId,
    queryFn: async () => {
      let query = supabase
        .from(SCORECARDS_TABLE)
        .select(SCORECARD_COLUMNS)
        .eq('owner_user_id', userId as string)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false });
      if (limit != null) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ScorecardRestRow[];
    },
  });

  const scorecardIds = React.useMemo(
    () => (scorecardRows ?? []).map((r) => r.id).filter((id): id is string => !!id),
    [scorecardRows]
  );

  const { data: scoreRows, isLoading: scoresLoading } = useQuery<ScoreRow[]>({
    queryKey: completedScoresKey(userId, scorecardIds),
    enabled: !!userId && !!scorecardRows,
    queryFn: async () => {
      if (scorecardIds.length === 0) return [];
      const { data, error } = await supabase
        .from(SCORECARD_SCORES_TABLE)
        .select('scorecard_id, scorer_id, hole_number, strokes')
        .in('scorecard_id', scorecardIds);
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
  });

  const scoresByScorecard = React.useMemo(() => {
    const m = new Map<string, RoundScore[]>();
    for (const r of scoreRows ?? []) {
      const id = r.scorecard_id;
      if (!id) continue;
      const arr = m.get(id) ?? [];
      arr.push({
        scorerId: r.scorer_id ?? '',
        holeNumber: Number(r.hole_number ?? 0),
        strokes: Number(r.strokes ?? 0),
      });
      m.set(id, arr);
    }
    return m;
  }, [scoreRows]);

  const rounds = React.useMemo<Round[]>(() => {
    const out: Round[] = [];
    for (const row of scorecardRows ?? []) {
      const scorecardRow = toScorecardRowShape(row);
      if (!scorecardRow) continue;
      const scores = scoresByScorecard.get(scorecardRow.id) ?? [];
      const round = projectScorecardRow(scorecardRow, scores);
      if (round) out.push(round);
    }
    return out;
  }, [scorecardRows, scoresByScorecard]);

  return {
    rounds,
    isLoading: scorecardLoading || scoresLoading,
  };
}

export function useCompletedRounds(): CompletedRoundsResult {
  const { account } = useAccount();
  return usePlayerCompletedRounds(account?.userId ?? null, null);
}
