/**
 * useCompletedRounds — the signed-in user's completed scorecards,
 * projected as `Round[]` for the Rounds tab.
 *
 * Strictly owner-scoped (`owner_user_id = ?` on both the scorecard
 * query and the JOIN-filtered score-hydration query) so the list
 * never accidentally surfaces friends' scorecards now that the
 * `friend_scorecards` sync stream puts those rows in local SQLite
 * too. Matches the "scorecards belong to one player" mental model.
 *
 * Score hydration joins `scorecards` so we hydrate ONLY scores for
 * completed owned scorecards — avoids pulling in scores for the
 * user's in-flight round (which lives in the same `scorecard_scores`
 * table) and discarding them at bucketing time.
 *
 * Returns rounds sorted newest-first by `started_at` (the SQL
 * ORDER BY); consumers re-sort by other keys (best/worst score)
 * client-side.
 */

import React from 'react';
import { useQuery } from '@powersync/react';

import {
  SCORECARDS_TABLE,
  SCORECARD_SCORES_TABLE,
} from '@/library/powersync/AppSchema';
import { useRequiredAccount } from '@/library/social/AccountContext';
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

export type CompletedRoundsResult = {
  rounds: Round[];
  isLoading: boolean;
};

const SELECT_COMPLETED_SCORECARDS_SQL = `
  SELECT *
  FROM ${SCORECARDS_TABLE}
  WHERE owner_user_id = ?
    AND completed_at IS NOT NULL
  ORDER BY started_at DESC
`;

const SELECT_COMPLETED_SCORES_SQL = `
  SELECT ss.scorecard_id, ss.scorer_id, ss.hole_number, ss.strokes
  FROM ${SCORECARD_SCORES_TABLE} ss
  JOIN ${SCORECARDS_TABLE} sc ON sc.id = ss.scorecard_id
  WHERE sc.owner_user_id = ?
    AND sc.completed_at IS NOT NULL
`;

export function useCompletedRounds(): CompletedRoundsResult {
  const account = useRequiredAccount();

  const { data: scorecardRows, isLoading: scorecardLoading } =
    useQuery<ScorecardRowShape>(SELECT_COMPLETED_SCORECARDS_SQL, [account.userId]);

  const { data: scoreRows, isLoading: scoresLoading } =
    useQuery<ScoreRow>(SELECT_COMPLETED_SCORES_SQL, [account.userId]);

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

  const rounds = React.useMemo<Round[]>(() => {
    const out: Round[] = [];
    for (const row of scorecardRows) {
      const scores = scoresByScorecard.get(row.id) ?? [];
      const round = projectScorecardRow(row, scores);
      if (round) out.push(round);
    }
    return out;
  }, [scorecardRows, scoresByScorecard]);

  return {
    rounds,
    isLoading: scorecardLoading || scoresLoading,
  };
}
