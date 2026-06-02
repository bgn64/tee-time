/**
 * Per-(team, hole) shot attribution — local data layer.
 *
 * Mirrors `useRoundAchievementTags` for the `scorecard_shot_attributions`
 * table. Read returns rows keyed by `${teamId}::${holeNumber}`; write
 * upserts the `contributor_ids` array for a given (team, hole) tuple.
 *
 * List length is allowed to drift from the team's stroke count;
 * renderers truncate / pad at read time so the picker UX stays
 * honest even after scores are edited.
 *
 * Tee shot convention (per Q6 decision): the FIRST element in the
 * `contributor_ids` array for a hole is the tee shot.
 */

import { useQuery } from '@powersync/react';
import { useCallback, useMemo, useRef } from 'react';

import { newAchievementTagId } from '@/library/golf/ids';
import {
  SCORECARD_SHOT_ATTRIBUTIONS_TABLE,
  type ScorecardShotAttributionRecord,
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
import { useAccount } from '@/library/social/AccountContext';

export type ShotAttributionRow = {
  teamId: string;
  holeNumber: number;
  /**
   * Ordered participantKeys. Entries can be empty string to mean
   * "no contributor picked yet for this stroke index" — the picker
   * UI uses that to render a dashed placeholder.
   */
  contributorIds: readonly string[];
};

export type UseRoundShotAttributionsResult = {
  rows: readonly ShotAttributionRow[];
  /**
   * Look up the attribution list for a (team, hole). Returns an
   * empty array when no row exists; never null.
   */
  getContributors: (teamId: string, holeNumber: number) => readonly string[];
  /**
   * Upsert the attribution list. Empty list = no contributors yet.
   * The hook accepts any length; renderers handle truncation/padding.
   */
  setContributors: (
    teamId: string,
    holeNumber: number,
    contributorIds: readonly string[]
  ) => Promise<void>;
};

function parseContributorIds(raw: unknown): string[] {
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => (typeof v === 'string' ? v : ''));
      }
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    return raw.map((v) => (typeof v === 'string' ? v : ''));
  }
  return [];
}

export function useRoundShotAttributions(
  roundId: string | null
): UseRoundShotAttributionsResult {
  const system = useSystem();
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;
  const inFlight = useRef<Set<string>>(new Set());

  const { data } = useQuery<ScorecardShotAttributionRecord & { id: string }>(
    roundId
      ? `SELECT * FROM ${SCORECARD_SHOT_ATTRIBUTIONS_TABLE} WHERE scorecard_id = ?`
      : `SELECT * FROM ${SCORECARD_SHOT_ATTRIBUTIONS_TABLE} WHERE 1 = 0`,
    roundId ? [roundId] : []
  );

  const rows = useMemo<ShotAttributionRow[]>(() => {
    const out: ShotAttributionRow[] = [];
    for (const row of data) {
      if (!row.team_id || row.hole_number == null) continue;
      out.push({
        teamId: row.team_id,
        holeNumber: row.hole_number,
        contributorIds: parseContributorIds(row.contributor_ids),
      });
    }
    return out;
  }, [data]);

  const idByTuple = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of data) {
      if (!row.team_id || row.hole_number == null) continue;
      m.set(`${row.team_id}::${row.hole_number}`, row.id);
    }
    return m;
  }, [data]);

  const getContributors = useCallback(
    (teamId: string, holeNumber: number): readonly string[] => {
      for (const r of rows) {
        if (r.teamId === teamId && r.holeNumber === holeNumber) {
          return r.contributorIds;
        }
      }
      return [];
    },
    [rows]
  );

  const setContributors = useCallback<UseRoundShotAttributionsResult['setContributors']>(
    async (teamId, holeNumber, contributorIds) => {
      if (!roundId || !signedInUserId) return;
      const guard = `${teamId}::${holeNumber}`;
      if (inFlight.current.has(guard)) return;
      inFlight.current.add(guard);
      try {
        const tupleKey = guard;
        const existing = idByTuple.get(tupleKey);
        const now = new Date().toISOString();
        const json = JSON.stringify(contributorIds);
        if (existing) {
          await system.powersync.execute(
            `UPDATE ${SCORECARD_SHOT_ATTRIBUTIONS_TABLE}
               SET contributor_ids = ?, updated_at = ?
               WHERE id = ?`,
            [json, now, existing]
          );
        } else {
          const id = newAchievementTagId();
          await system.powersync.execute(
            `INSERT INTO ${SCORECARD_SHOT_ATTRIBUTIONS_TABLE}
               (id, scorecard_id, owner_user_id, team_id, hole_number, contributor_ids, updated_at)
             VALUES (?, ?, NULL, ?, ?, ?, ?)`,
            [id, roundId, teamId, holeNumber, json, now]
          );
        }
      } finally {
        inFlight.current.delete(guard);
      }
    },
    [roundId, signedInUserId, idByTuple, system]
  );

  return { rows, getContributors, setContributors };
}

/**
 * Aggregate "most shots played" / "most tee shots played" per team
 * member. Returns the member participantKey + count for each metric.
 *
 * - Most shots played: count of attribution entries that name a
 *   member across all holes for the team.
 * - Most tee shots: count of holes where the member is the FIRST
 *   entry in the attribution list (per Q6 tee-shot definition).
 */
export type TeamContribution = {
  participantKey: string;
  shotsCount: number;
  teeShotsCount: number;
};

export function summarizeContributions(
  rows: readonly ShotAttributionRow[],
  teamId: string,
  memberKeys: readonly string[]
): TeamContribution[] {
  const counts = new Map<string, { shots: number; tee: number }>();
  for (const k of memberKeys) counts.set(k, { shots: 0, tee: 0 });
  for (const row of rows) {
    if (row.teamId !== teamId) continue;
    for (let i = 0; i < row.contributorIds.length; i++) {
      const key = row.contributorIds[i];
      if (!key) continue;
      const c = counts.get(key);
      if (!c) continue;
      c.shots += 1;
      if (i === 0) c.tee += 1;
    }
  }
  return memberKeys.map((k) => {
    const c = counts.get(k);
    return {
      participantKey: k,
      shotsCount: c?.shots ?? 0,
      teeShotsCount: c?.tee ?? 0,
    };
  });
}
