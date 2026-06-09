/**
 * useRoundDetail — fetch a single round (scorecard + its scores) by id via
 * Supabase REST and project it to a `Round`. RLS scopes visibility to the
 * caller's own + friends' rows, so any id reachable by navigation renders.
 *
 * Scores share the `['scorecard_scores', roundId]` query key (and select '*')
 * with RoundContext, so an optimistic score edit in the edit-completed-round
 * flow surfaces here immediately and reconciles when the outbox flushes.
 *
 * The scorecard jsonb columns come back from PostgREST as parsed objects;
 * `projectScorecardRow` still owns the JSON-string parse path (shared with
 * local-SQLite-era callers), so we re-serialize those values to strings
 * before projection — matching `useFeedRounds`.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/library/supabase/client';
import { projectScorecardRow, type ScorecardRowShape } from './projectScorecard';
import type { Round, RoundScore } from '@/types/golf';

type DetailScorecardRow = {
  id: string;
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

type DetailScoreRow = {
  scorecard_id: string | null;
  scorer_id: string | null;
  hole_number: number | null;
  strokes: number | null;
};

function jsonbForProjector(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toScorecardRowShape(row: DetailScorecardRow): ScorecardRowShape {
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

export function roundDetailKey(roundId: string | null) {
  return ['round_detail', roundId] as const;
}

export function useRoundDetail(roundId: string | null): {
  round: Round | null;
  isLoading: boolean;
} {
  const { data: scorecard, isLoading: scorecardLoading } =
    useQuery<DetailScorecardRow | null>({
      queryKey: roundDetailKey(roundId),
      enabled: !!roundId,
      queryFn: async () => {
        const { data, error } = await supabase
          .from('scorecards')
          .select('*')
          .eq('id', roundId as string)
          .limit(1);
        if (error) throw error;
        return ((data ?? [])[0] as DetailScorecardRow | undefined) ?? null;
      },
    });

  const { data: scoreRows, isLoading: scoresLoading } = useQuery<DetailScoreRow[]>({
    queryKey: ['scorecard_scores', roundId],
    enabled: !!roundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scorecard_scores')
        .select('*')
        .eq('scorecard_id', roundId as string);
      if (error) throw error;
      return (data ?? []) as DetailScoreRow[];
    },
  });

  const scores = React.useMemo<RoundScore[]>(() => {
    return (scoreRows ?? [])
      .filter((r) => !!r.scorecard_id)
      .map((r) => ({
        scorerId: r.scorer_id ?? '',
        holeNumber: Number(r.hole_number ?? 0),
        strokes: Number(r.strokes ?? 0),
      }));
  }, [scoreRows]);

  const round = React.useMemo(() => {
    if (!scorecard) return null;
    return projectScorecardRow(toScorecardRowShape(scorecard), scores);
  }, [scorecard, scores]);

  return { round, isLoading: scorecardLoading || scoresLoading };
}
