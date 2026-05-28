/**
 * useFeedRounds — friend-feed projection over local PowerSync rows.
 *
 * Returns the signed-in user's friends' rounds projected as `Round`
 * objects, bucketed into:
 *
 *   liveRounds      — completedAt null, scores.length >= 1, sorted
 *                     by scorecards.updated_at desc (most recently
 *                     active bubbles to the top).
 *   completedRounds — completedAt set, sorted by completedAt desc.
 *
 * Filters by JOINing the **local** `friendships` table — not just
 * `owner_user_id <> me` — so an unfriend hides cards from the feed
 * the instant the friendship row is gone, even if PowerSync hasn't
 * yet pruned the cached scorecard rows from local SQLite.
 *
 * Sort key contract: `RoundContext.setCustomHoleScore` bumps
 * `scorecards.updated_at` on every score tap. That makes the column
 * a faithful "last activity" timestamp; the feed sorts by it
 * directly with no client-side aggregate over score rows.
 *
 * Score hydration uses a `JOIN scorecards JOIN friendships` query so
 * we don't run into SQLite's 999-parameter limit when many friends
 * have many rounds (a dynamic `IN (?, ?, ?, ...)` list would break
 * at the limit).
 */

import React from 'react';
import { useQuery } from '@powersync/react';

import {
  FRIENDSHIPS_TABLE,
  SCORECARDS_TABLE,
  SCORECARD_SCORES_TABLE,
} from '@/library/powersync/AppSchema';
import {
  projectScorecardRow,
  type ScorecardRowShape,
} from './projectScorecard';
import type { Round, RoundScore } from '@/types/golf';

type ScoreRow = {
  scorecard_id: string | null;
  scorer_id: string | null;
  hole_number: number | null;
  strokes: number | null;
};

export type FeedRoundsResult = {
  liveRounds: Round[];
  completedRounds: Round[];
  isLoading: boolean;
};

const SELECT_FEED_SCORECARDS_SQL = `
  SELECT sc.*
  FROM ${SCORECARDS_TABLE} sc
  JOIN ${FRIENDSHIPS_TABLE} f
    ON f.friend_user_id = sc.owner_user_id
`;

const SELECT_FEED_SCORES_SQL = `
  SELECT ss.scorecard_id, ss.scorer_id, ss.hole_number, ss.strokes
  FROM ${SCORECARD_SCORES_TABLE} ss
  JOIN ${SCORECARDS_TABLE} sc ON sc.id = ss.scorecard_id
  JOIN ${FRIENDSHIPS_TABLE} f ON f.friend_user_id = sc.owner_user_id
`;

export function useFeedRounds(): FeedRoundsResult {
  const { data: scorecardRows, isLoading: scorecardLoading } =
    useQuery<ScorecardRowShape>(SELECT_FEED_SCORECARDS_SQL);

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

  const projected = React.useMemo<Round[]>(() => {
    const out: Round[] = [];
    for (const row of scorecardRows) {
      const scores = scoresByScorecard.get(row.id) ?? [];
      const round = projectScorecardRow(row, scores);
      if (round) out.push(round);
    }
    return out;
  }, [scorecardRows, scoresByScorecard]);

  // Build a side map keyed by scorecard id so the sort callbacks
  // can read scorecards.updated_at without re-projecting. The
  // canonical "last activity" timestamp lives on the row directly
  // because RoundContext bumps it on every score tap.
  const updatedAtById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const row of scorecardRows) {
      if (row.id && row.updated_at) m.set(row.id, row.updated_at);
    }
    return m;
  }, [scorecardRows]);

  const liveRounds = React.useMemo(() => {
    // No `scores.length > 0` gate — a friend who's just started a
    // round (no scores entered yet) appears in the feed immediately
    // as a band-only card. The card itself gates the embedded
    // scorecard body on `round.scores.length > 0`, so it degrades
    // gracefully until the first score arrives.
    return projected
      .filter((r) => !r.completedAt)
      .sort((a, b) => {
        const at = new Date(updatedAtById.get(a.id) ?? a.startedAt).getTime();
        const bt = new Date(updatedAtById.get(b.id) ?? b.startedAt).getTime();
        return bt - at;
      });
  }, [projected, updatedAtById]);

  const completedRounds = React.useMemo(() => {
    return projected
      .filter((r) => !!r.completedAt)
      .sort((a, b) => {
        const at = new Date(a.completedAt ?? a.startedAt).getTime();
        const bt = new Date(b.completedAt ?? b.startedAt).getTime();
        return bt - at;
      });
  }, [projected]);

  return {
    liveRounds,
    completedRounds,
    isLoading: scorecardLoading || scoresLoading,
  };
}
