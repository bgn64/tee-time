/**
 * useRoundStatEngagement — derives whether ANY scorer in a round has
 * engaged with the per-hole tracked-stats feature (achievement tags,
 * explicit tracked-stats overrides, or scramble shot attributions).
 *
 * "Engagement" is the gate that decides whether stats are shown in
 * the round views. Without it, every round would surface the default
 * aggregate tiles (Fairways / GIR / OB / Sand) as `0/0` placeholders
 * — including legacy rounds that predate the feature and were never
 * tagged. We hide those tiles + the Holes tab entirely (in viewing
 * mode) when no scorer has anything recorded.
 *
 * Returns both a round-level boolean and a per-scorer predicate so
 * the Summary tab can choose to render tiles only for the scorers
 * who actually engaged (mixed-engagement rounds still show stats for
 * the scorers who entered them).
 *
 * The three underlying hooks (`useRoundAchievementTags`,
 * `useRoundTrackedStats`, `useRoundShotAttributions`) are also used
 * by SummaryTabContent / HolesTabContent, so PowerSync's query
 * dedupe means this hook is effectively free at the page level.
 */

import { useMemo } from 'react';

import { useRoundAchievementTags } from './useRoundAchievementTags';
import { useRoundShotAttributions } from './useRoundShotAttributions';
import { useRoundTrackedStats } from './useRoundTrackedStats';

export type RoundStatEngagement = {
  /** True when at least one scorer has any tracked-stat data. */
  hasAny: boolean;
  /** True for scorers who have any tag row, override, or shot attribution. */
  hasFor: (scorerId: string) => boolean;
};

export function useRoundStatEngagement(
  roundId: string | null
): RoundStatEngagement {
  const { rows: tagRows } = useRoundAchievementTags(roundId);
  const { overrides } = useRoundTrackedStats(roundId);
  const { rows: shotRows } = useRoundShotAttributions(roundId);

  return useMemo<RoundStatEngagement>(() => {
    const engagedScorers = new Set<string>();
    for (const r of tagRows) engagedScorers.add(r.scorer_id);
    for (const id of overrides.keys()) engagedScorers.add(id);
    // Shot attributions are per-team in scramble — `teamId` is the
    // scorer id for that scoring rule.
    for (const r of shotRows) engagedScorers.add(r.teamId);

    return {
      hasAny: engagedScorers.size > 0,
      hasFor: (scorerId: string) => engagedScorers.has(scorerId),
    };
  }, [tagRows, overrides, shotRows]);
}
