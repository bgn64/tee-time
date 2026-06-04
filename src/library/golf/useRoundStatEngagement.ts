/**
 * useRoundStatEngagement — derives whether ANY tracked scorer has
 * entered per-hole detail values for the round. Drives the
 * Summary tile strip + Holes-tab pill section visibility — round
 * views hide both when no scorer has anything recorded (covers
 * legacy rounds that predate the feature and rounds where the
 * creator never enabled tracking).
 *
 * Returns both a round-level boolean and a per-scorer predicate so
 * the Summary tab can render tiles only for the scorers who
 * actually engaged.
 *
 * Single source of truth: reads `scorecard_hole_details` directly
 * via `useRoundHoleDetails`. The hook deduplicates query
 * subscriptions at the PowerSync layer so this is effectively
 * free when other components on the same page also use the
 * details hook.
 */

import { useMemo } from 'react';

import { useRoundHoleDetails } from './useRoundHoleDetails';

export type RoundStatEngagement = {
  /** True when at least one tracked scorer has any details data. */
  hasAny: boolean;
  /** True for scorers who have any details row. */
  hasFor: (scorerId: string) => boolean;
};

export function useRoundStatEngagement(
  roundId: string | null
): RoundStatEngagement {
  const { rows } = useRoundHoleDetails(roundId);

  return useMemo<RoundStatEngagement>(() => {
    const engagedScorers = new Set<string>();
    for (const r of rows) {
      // A row counts as engagement only if it has at least one
      // value entered. An empty `{}` map can exist transiently
      // after every key is cleared, but it shouldn't gate the UI.
      if (Object.keys(r.values).length > 0) {
        engagedScorers.add(r.scorer_id);
      }
    }
    return {
      hasAny: engagedScorers.size > 0,
      hasFor: (scorerId: string) => engagedScorers.has(scorerId),
    };
  }, [rows]);
}
