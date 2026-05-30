/**
 * useFeedRounds — feed projection over local PowerSync rows.
 *
 * Returns rounds bucketed into:
 *
 *   liveRounds      — friends' in-progress rounds (completedAt null,
 *                     scores.length >= 0), sorted by
 *                     scorecards.updated_at desc. **Own live round is
 *                     excluded** — the scoring tab covers it.
 *   completedRounds — friends' completed rounds AND the signed-in
 *                     user's own completed rounds, sorted by
 *                     completedAt desc.
 *
 * Friend rounds come via a JOIN on the local `friendships` table so
 * an unfriend hides cards from the feed the instant the friendship
 * row is gone, even before PowerSync has pruned the cached
 * scorecard rows from local SQLite.
 *
 * Own completed rounds are pulled by a second pair of queries
 * filtered on `owner_user_id = ?` and `completed_at IS NOT NULL`.
 * They land in `completedRounds` so the user can tap into their
 * own past round from the feed to read / post comments. The two
 * source queries are partitioned by owner (friend self-friending
 * is forbidden), so the merged result has no duplicates by
 * construction — we still dedupe scorecards by id defensively.
 *
 * Sort key contract: `RoundContext.setCustomHoleScore` bumps
 * `scorecards.updated_at` on every score tap, so the live-feed
 * order tracks activity faithfully without a client-side
 * MAX(scorecard_scores.updated_at) aggregate.
 */

import React from 'react';
import { useQuery } from '@powersync/react';

import {
  FRIENDSHIPS_TABLE,
  SCORECARDS_TABLE,
  SCORECARD_SCORES_TABLE,
} from '@/library/powersync/AppSchema';
import { useAccount } from '@/library/social/AccountContext';
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

const SELECT_OWN_COMPLETED_SCORECARDS_SQL = `
  SELECT * FROM ${SCORECARDS_TABLE}
  WHERE owner_user_id = ? AND completed_at IS NOT NULL
`;

const SELECT_OWN_COMPLETED_SCORES_SQL = `
  SELECT ss.scorecard_id, ss.scorer_id, ss.hole_number, ss.strokes
  FROM ${SCORECARD_SCORES_TABLE} ss
  JOIN ${SCORECARDS_TABLE} sc ON sc.id = ss.scorecard_id
  WHERE sc.owner_user_id = ? AND sc.completed_at IS NOT NULL
`;

const NO_ROWS_SCORECARDS_SQL = `SELECT * FROM ${SCORECARDS_TABLE} WHERE 1 = 0`;
const NO_ROWS_SCORES_SQL = `SELECT * FROM ${SCORECARD_SCORES_TABLE} WHERE 1 = 0`;

export function useFeedRounds(): FeedRoundsResult {
  const { account } = useAccount();
  const userId = account?.userId ?? null;

  const { data: friendScorecardRows, isLoading: friendScorecardLoading } =
    useQuery<ScorecardRowShape>(SELECT_FEED_SCORECARDS_SQL);

  const { data: friendScoreRows, isLoading: friendScoresLoading } =
    useQuery<ScoreRow>(SELECT_FEED_SCORES_SQL);

  const { data: ownCompletedScorecardRows, isLoading: ownScorecardLoading } =
    useQuery<ScorecardRowShape>(
      userId ? SELECT_OWN_COMPLETED_SCORECARDS_SQL : NO_ROWS_SCORECARDS_SQL,
      userId ? [userId] : []
    );

  const { data: ownCompletedScoreRows, isLoading: ownScoresLoading } =
    useQuery<ScoreRow>(
      userId ? SELECT_OWN_COMPLETED_SCORES_SQL : NO_ROWS_SCORES_SQL,
      userId ? [userId] : []
    );

  // Concatenate the two sources; dedupe scorecards by id defensively
  // (the two queries are partitioned by owner so duplicates shouldn't
  // happen, but it's cheap protection against a future change that
  // breaks the partition).
  const scorecardRows = React.useMemo(() => {
    const seen = new Set<string>();
    const out: ScorecardRowShape[] = [];
    for (const r of [...friendScorecardRows, ...ownCompletedScorecardRows]) {
      if (!r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  }, [friendScorecardRows, ownCompletedScorecardRows]);

  const scoreRows = React.useMemo(
    () => [...friendScoreRows, ...ownCompletedScoreRows],
    [friendScoreRows, ownCompletedScoreRows]
  );

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

  const liveRounds = React.useMemo(() => {
    // No `scores.length > 0` gate — a friend who's just started a
    // round (no scores entered yet) appears in the feed immediately
    // as a band-only card. The card itself gates the embedded
    // scorecard body on `round.scores.length > 0`, so it degrades
    // gracefully until the first score arrives.
    //
    // Own live rounds are NOT in this list: the own-rounds query is
    // gated on `completed_at IS NOT NULL`, so own live rounds never
    // enter `projected`. The scoring tab covers that surface.
    return projected
      .filter((r) => !r.completedAt)
      .sort((a, b) => {
        const at = new Date(a.lastScoreAt ?? a.startedAt).getTime();
        const bt = new Date(b.lastScoreAt ?? b.startedAt).getTime();
        return bt - at;
      });
  }, [projected]);

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
    isLoading:
      friendScorecardLoading ||
      friendScoresLoading ||
      ownScorecardLoading ||
      ownScoresLoading,
  };
}
