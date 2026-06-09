/**
 * useFeedRounds — Supabase RPC feed data layer (React Query).
 *
 * Fetches one generous page from the server-side `get_feed` RPC. The RPC
 * applies the feed visibility contract under RLS:
 *
 *   liveRounds      — friends' in-progress rounds (completedAt null), sorted
 *                     by last activity desc. **Own live round is excluded** —
 *                     the scoring tab covers it.
 *   completedRounds — friends' completed rounds AND the signed-in user's own
 *                     completed rounds, sorted by completedAt desc.
 *
 * `get_feed` returns scorecard jsonb columns as already-parsed objects/arrays,
 * while `projectScorecardRow` intentionally still owns the local SQLite
 * JSON-string parse path. This hook serializes only those jsonb values back to
 * strings before projection so the shared `Round` mapping remains canonical.
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

type FeedRpcScore = {
  scorer_id?: string | null;
  hole_number?: number | null;
  strokes?: number | null;
};

type FeedRpcRow = {
  id: string | null;
  owner_user_id: string | null;
  course_id: string | null;
  course_snapshot: unknown;
  scoring_rule: string | null;
  hole_range: string | null;
  player_ids: unknown;
  participants: unknown;
  teams: unknown;
  enabled_stat_keys: unknown;
  tracked_scorer_ids: unknown;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
  feed_bucket: 'live' | 'completed' | string | null;
  scores: FeedRpcScore[] | null;
};

export type FeedRoundsResult = {
  liveRounds: Round[];
  completedRounds: Round[];
  isLoading: boolean;
};

const FEED_PAGE_LIMIT = 50;

function jsonbForProjector(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toScorecardRowShape(row: FeedRpcRow): ScorecardRowShape | null {
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

function toRoundScores(scores: FeedRpcScore[] | null | undefined): RoundScore[] {
  return (scores ?? []).map((r) => ({
    scorerId: r.scorer_id ?? '',
    holeNumber: Number(r.hole_number ?? 0),
    strokes: Number(r.strokes ?? 0),
  }));
}

function feedKey(userId: string | null) {
  return ['feed_rounds', userId] as const;
}

export function useFeedRounds(): FeedRoundsResult {
  const { account } = useAccount();
  const userId = account?.userId ?? null;

  const { data, isLoading } = useQuery<FeedRpcRow[]>({
    queryKey: feedKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_feed', {
        p_limit: FEED_PAGE_LIMIT,
        p_before: null,
      });
      if (error) throw error;
      return (data ?? []) as FeedRpcRow[];
    },
  });

  const projected = React.useMemo(() => {
    const out: { round: Round; bucket: string | null }[] = [];
    const seen = new Set<string>();
    for (const row of data ?? []) {
      if (!row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      const scorecardRow = toScorecardRowShape(row);
      if (!scorecardRow) continue;
      const round = projectScorecardRow(scorecardRow, toRoundScores(row.scores));
      if (round) out.push({ round, bucket: row.feed_bucket });
    }
    return out;
  }, [data]);

  const liveRounds = React.useMemo(() => {
    return projected
      .filter(({ round, bucket }) => bucket === 'live' || (!bucket && !round.completedAt))
      .map(({ round }) => round)
      .sort((a, b) => {
        const at = new Date(a.lastScoreAt ?? a.startedAt).getTime();
        const bt = new Date(b.lastScoreAt ?? b.startedAt).getTime();
        return bt - at;
      });
  }, [projected]);

  const completedRounds = React.useMemo(() => {
    return projected
      .filter(({ round, bucket }) => bucket === 'completed' || (!bucket && !!round.completedAt))
      .map(({ round }) => round)
      .sort((a, b) => {
        const at = new Date(a.completedAt ?? a.startedAt).getTime();
        const bt = new Date(b.completedAt ?? b.startedAt).getTime();
        return bt - at;
      });
  }, [projected]);

  return {
    liveRounds,
    completedRounds,
    isLoading,
  };
}
