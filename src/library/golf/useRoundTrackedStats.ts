/**
 * Per-(scorer, round) tracked-stats overrides — local data layer.
 *
 * Mirrors `useRoundAchievementTags` but for the `scorecard_tracked_stats`
 * table. Read returns a map keyed by `scorerId` so the UI can do
 * `overrides.get(scorerId)` for O(1) lookup. Write upserts the row
 * for a given scorer.
 *
 * Per Q5 decision, the storage convention is bifurcated:
 *   - No row for scorer  → use defaults (computed via
 *                          `effectiveEnabledTags(scoringRule, null)`).
 *   - Row with non-empty → use the list verbatim.
 *   - Row with empty list→ scorer turned every tag off.
 *
 * The hook itself doesn't apply defaults — callers pass the parsed
 * override (or null) to `effectiveEnabledTags(scoringRule, override)`.
 */

import { useQuery } from '@powersync/react';
import { useCallback, useMemo, useRef } from 'react';

import { type TagKey } from '@/library/golf/achievementTags';
import { newAchievementTagId } from '@/library/golf/ids';
import {
  SCORECARD_TRACKED_STATS_TABLE,
  type ScorecardTrackedStatsRecord,
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
import { useAccount } from '@/library/social/AccountContext';

export type TrackedStatsOverride = {
  scorerId: string;
  enabledTags: readonly TagKey[];
};

export type UseRoundTrackedStatsResult = {
  /** Map of scorerId → override row (parsed). Absent entries → no override. */
  overrides: ReadonlyMap<string, TrackedStatsOverride>;
  /** Convenience: parsed override for a scorer, or null. */
  getOverride: (scorerId: string) => TrackedStatsOverride | null;
  /**
   * Upsert the override row for a scorer. Pass `enabledTags = []` to
   * record "tracked nothing"; pass the full default list to effectively
   * "reset" (though there's no UI distinction — see plan §Q5).
   */
  setOverride: (scorerId: string, enabledTags: readonly TagKey[]) => Promise<void>;
};

function parseEnabledTags(raw: unknown): TagKey[] {
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((k): k is TagKey => typeof k === 'string');
      }
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    return raw.filter((k): k is TagKey => typeof k === 'string');
  }
  return [];
}

export function useRoundTrackedStats(
  roundId: string | null
): UseRoundTrackedStatsResult {
  const system = useSystem();
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;
  const inFlight = useRef<Set<string>>(new Set());

  const { data } = useQuery<ScorecardTrackedStatsRecord & { id: string }>(
    roundId
      ? `SELECT * FROM ${SCORECARD_TRACKED_STATS_TABLE} WHERE scorecard_id = ?`
      : `SELECT * FROM ${SCORECARD_TRACKED_STATS_TABLE} WHERE 1 = 0`,
    roundId ? [roundId] : []
  );

  const overrides = useMemo(() => {
    const m = new Map<string, TrackedStatsOverride>();
    for (const row of data) {
      if (!row.scorer_id) continue;
      m.set(row.scorer_id, {
        scorerId: row.scorer_id,
        enabledTags: parseEnabledTags(row.enabled_tags),
      });
    }
    return m;
  }, [data]);

  const idByScorer = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of data) {
      if (!row.scorer_id) continue;
      m.set(row.scorer_id, row.id);
    }
    return m;
  }, [data]);

  const getOverride = useCallback(
    (scorerId: string): TrackedStatsOverride | null =>
      overrides.get(scorerId) ?? null,
    [overrides]
  );

  const setOverride = useCallback<UseRoundTrackedStatsResult['setOverride']>(
    async (scorerId, enabledTags) => {
      if (!roundId || !signedInUserId) return;
      const guard = `${scorerId}`;
      if (inFlight.current.has(guard)) return;
      inFlight.current.add(guard);
      try {
        const existing = idByScorer.get(scorerId);
        const now = new Date().toISOString();
        const json = JSON.stringify(enabledTags);
        if (existing) {
          await system.powersync.execute(
            `UPDATE ${SCORECARD_TRACKED_STATS_TABLE}
               SET enabled_tags = ?, updated_at = ?
               WHERE id = ?`,
            [json, now, existing]
          );
        } else {
          const id = newAchievementTagId();
          await system.powersync.execute(
            `INSERT INTO ${SCORECARD_TRACKED_STATS_TABLE}
               (id, scorecard_id, owner_user_id, scorer_id, enabled_tags, updated_at)
             VALUES (?, ?, NULL, ?, ?, ?)`,
            [id, roundId, scorerId, json, now]
          );
        }
      } finally {
        inFlight.current.delete(guard);
      }
    },
    [roundId, signedInUserId, idByScorer, system]
  );

  return { overrides, getOverride, setOverride };
}
