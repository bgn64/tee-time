/**
 * useFeedRounds — friend-feed projection over local PowerSync rows.
 *
 * Reads every scorecard owned by a current friend (filtered via the
 * local `friendships` table — NOT just `owner_user_id <> me`, so that
 * unfriending hides cards from the feed immediately even before
 * PowerSync prunes the cached scorecard rows from local SQLite),
 * decorates each with the activity stats derived from the per-cell
 * score rows, and buckets them into:
 *
 *   liveRounds      — completedAt null, scoreCount ≥ 1, sorted by
 *                     lastScoreAt desc.
 *   completedRounds — completedAt set, sorted by completedAt desc.
 *
 * The `lastScoreAt` field is derived client-side as
 * `MAX(scorecard_scores.updated_at)` for each scorecard — there is
 * intentionally no denormalized column on the scorecards row (every
 * score tap would otherwise need to bump the multi-KB course_snapshot,
 * which the upload connector then has to re-replicate). Because
 * per-cell scores already sync row-by-row through PowerSync, the
 * derived value ticks in real time as soon as a friend's score
 * lands.
 *
 * Score hydration uses a `JOIN scorecards JOIN friendships` query
 * instead of a `WHERE scorecard_id IN (...)` list so we don't run
 * into SQLite's 999-parameter limit when many friends have many
 * rounds.
 */

import React from 'react';
import { useQuery } from '@powersync/react';

import {
  FRIENDSHIPS_TABLE,
  SCORECARDS_TABLE,
  SCORECARD_SCORES_TABLE,
} from '@/library/powersync/AppSchema';
import type {
  Course,
  HoleRange,
  Round,
  RoundParticipant,
  RoundScore,
  ScoringRule,
} from '@/types/golf';

type ScorecardWithAggRow = {
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
  last_score_at: string | null;
  score_count: number | null;
  max_hole: number | null;
};

type ScoreRow = {
  scorecard_id: string | null;
  scorer_id: string | null;
  hole_number: number | null;
  strokes: number | null;
};

export type FeedRound = {
  round: Round;
  ownerUserId: string;
  lastScoreAt?: string;
  scoreCount: number;
  maxScoredHole?: number;
};

export type FeedRoundsResult = {
  liveRounds: FeedRound[];
  completedRounds: FeedRound[];
  isLoading: boolean;
};

const SELECT_FEED_SCORECARDS_SQL = `
  SELECT
    sc.id,
    sc.owner_user_id,
    sc.course_id,
    sc.course_snapshot,
    sc.scoring_rule,
    sc.player_ids,
    sc.participants,
    sc.hole_range,
    sc.started_at,
    sc.completed_at,
    sc.updated_at,
    agg.last_score_at AS last_score_at,
    agg.score_count   AS score_count,
    agg.max_hole      AS max_hole
  FROM ${SCORECARDS_TABLE} sc
  JOIN ${FRIENDSHIPS_TABLE} f
    ON f.friend_user_id = sc.owner_user_id
  LEFT JOIN (
    SELECT scorecard_id,
           MAX(updated_at) AS last_score_at,
           COUNT(*)        AS score_count,
           MAX(hole_number) AS max_hole
    FROM ${SCORECARD_SCORES_TABLE}
    GROUP BY scorecard_id
  ) agg ON agg.scorecard_id = sc.id
`;

const SELECT_FEED_SCORES_SQL = `
  SELECT
    ss.scorecard_id,
    ss.scorer_id,
    ss.hole_number,
    ss.strokes
  FROM ${SCORECARD_SCORES_TABLE} ss
  JOIN ${SCORECARDS_TABLE} sc ON sc.id = ss.scorecard_id
  JOIN ${FRIENDSHIPS_TABLE} f ON f.friend_user_id = sc.owner_user_id
`;

function safeParse<T>(raw: string | null | undefined, fallback: T, label: string): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[useFeedRounds] Failed to parse ${label}; using fallback.`, e, raw);
    return fallback;
  }
}

export function useFeedRounds(): FeedRoundsResult {
  const { data: scorecardRows, isLoading: scorecardLoading } =
    useQuery<ScorecardWithAggRow>(SELECT_FEED_SCORECARDS_SQL);

  const { data: scoreRows, isLoading: scoresLoading } =
    useQuery<ScoreRow>(SELECT_FEED_SCORES_SQL);

  // Bucket per-cell scores by scorecard_id in one pass so the
  // projection step stays O(N) instead of O(N²).
  const scoresByScorecard = React.useMemo(() => {
    const m = new Map<string, RoundScore[]>();
    for (const r of scoreRows) {
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

  const projected = React.useMemo<FeedRound[]>(() => {
    const out: FeedRound[] = [];
    for (const row of scorecardRows) {
      if (!row.owner_user_id) continue;
      const course = safeParse<Course | null>(
        row.course_snapshot,
        null,
        'scorecards.course_snapshot'
      );
      if (!course) continue;
      const participants = safeParse<RoundParticipant[]>(
        row.participants,
        [],
        'scorecards.participants'
      );
      const playerIds = safeParse<string[]>(row.player_ids, [], 'scorecards.player_ids');
      const scores = scoresByScorecard.get(row.id) ?? [];
      const round: Round = {
        id: row.id,
        ownerUserId: row.owner_user_id,
        course,
        scoringRule: (row.scoring_rule as ScoringRule) ?? 'stroke',
        playerIds,
        participants,
        holeRange: (row.hole_range as HoleRange) ?? 'all',
        // We don't sync the owner's per-device current-hole cursor;
        // the feed card derives a highlight from `firstNotFullyScoredHole`
        // at render time so this field stays a safe 1.
        currentHoleNumber: 1,
        scores,
        startedAt: row.started_at ?? new Date().toISOString(),
        completedAt: row.completed_at ?? undefined,
      };
      out.push({
        round,
        ownerUserId: row.owner_user_id,
        lastScoreAt: row.last_score_at ?? undefined,
        scoreCount: Number(row.score_count ?? 0),
        maxScoredHole:
          row.max_hole != null && Number.isFinite(Number(row.max_hole))
            ? Number(row.max_hole)
            : undefined,
      });
    }
    return out;
  }, [scorecardRows, scoresByScorecard]);

  const liveRounds = React.useMemo(() => {
    return projected
      .filter((fr) => !fr.round.completedAt && fr.scoreCount >= 1)
      .sort((a, b) => {
        const at = new Date(a.lastScoreAt ?? a.round.startedAt).getTime();
        const bt = new Date(b.lastScoreAt ?? b.round.startedAt).getTime();
        return bt - at;
      });
  }, [projected]);

  const completedRounds = React.useMemo(() => {
    return projected
      .filter((fr) => !!fr.round.completedAt)
      .sort((a, b) => {
        const at = new Date(a.round.completedAt ?? a.round.startedAt).getTime();
        const bt = new Date(b.round.completedAt ?? b.round.startedAt).getTime();
        return bt - at;
      });
  }, [projected]);

  return {
    liveRounds,
    completedRounds,
    isLoading: scorecardLoading || scoresLoading,
  };
}
