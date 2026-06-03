/**
 * Achievement tags — local data layer for a single round.
 *
 * Read path: watches `scorecard_achievement_tags` via PowerSync
 * `useQuery`, parses each row's `tags` JSON column into a `TagValueMap`,
 * and returns a memoised tuple lookup `getValues(scorerId, holeNumber)`.
 *
 * Write path: `setTagValue(scorerId, holeNumber, tagKey, value)`
 * performs a read-modify-write on the row (creating it with the single
 * pair if absent). Passing `undefined` for `value` clears the key
 * from the map ("unset" state). When the resulting map is empty we
 * still leave the row in place (matches the storage convention of
 * "absent row = never engaged" vs "empty map = explicitly cleared").
 *
 * Storage compat: the on-disk `tags` JSON column historically held a
 * `TagKey[]` array. The reader auto-detects array vs object form so
 * existing rounds keep rendering — array entries are normalised to
 * `'yes'` which matches the original semantics (a tap meant "this
 * outcome happened"). The writer always produces the new object form
 * `{ [TagKey]: 'yes' | 'no' }`.
 */

import { useQuery } from '@powersync/react';
import { useCallback, useMemo, useRef } from 'react';

import {
  type TagKey,
  type TagRow,
  type TagValue,
  type TagValueMap,
  valuesForHole,
} from '@/library/golf/achievementTags';
import { newAchievementTagId } from '@/library/golf/ids';
import {
  SCORECARD_ACHIEVEMENT_TAGS_TABLE,
  type ScorecardAchievementTagRecord,
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
import { useAccount } from '@/library/social/AccountContext';

export type UseRoundAchievementTagsResult = {
  rows: readonly TagRow[];
  getValues: (scorerId: string, holeNumber: number) => TagValueMap;
  /**
   * Set one tag's value for a (scorer, hole) tuple. Passing
   * `undefined` clears the entry (returns the pill to its unset
   * state). No-op if there's no round id, no signed-in user, or a
   * previous write for the same (scorer, hole, tag) is still in
   * flight.
   */
  setTagValue: (
    scorerId: string,
    holeNumber: number,
    tagKey: TagKey,
    value: TagValue | undefined
  ) => Promise<void>;
};

/**
 * Parse the on-disk `tags` JSON column. Accepts both the legacy
 * `TagKey[]` array form and the new `{ [TagKey]: TagValue }` object
 * form. Array entries normalise to `'yes'` so legacy rounds keep
 * rendering correctly with the new pill UI.
 */
function parseValuesField(raw: unknown): TagValueMap {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) return {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (Array.isArray(parsed)) {
    // Legacy: ['fairway', 'gir'] → { fairway: 'yes', gir: 'yes' }.
    const out: TagValueMap = {};
    for (const k of parsed) {
      if (typeof k === 'string') {
        (out as Record<string, TagValue>)[k] = 'yes';
      }
    }
    return out;
  }
  if (parsed && typeof parsed === 'object') {
    const out: TagValueMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === 'yes' || v === 'no') {
        (out as Record<string, TagValue>)[k] = v;
      }
    }
    return out;
  }
  return {};
}

export function useRoundAchievementTags(
  roundId: string | null
): UseRoundAchievementTagsResult {
  const system = useSystem();
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;

  // Map keyed by `${scorerId}::${holeNumber}::${tagKey}` so concurrent
  // writes on different cells don't block each other.
  const inFlight = useRef<Set<string>>(new Set());

  const { data } = useQuery<ScorecardAchievementTagRecord & { id: string }>(
    roundId
      ? `SELECT * FROM ${SCORECARD_ACHIEVEMENT_TAGS_TABLE} WHERE scorecard_id = ?`
      : `SELECT * FROM ${SCORECARD_ACHIEVEMENT_TAGS_TABLE} WHERE 1 = 0`,
    roundId ? [roundId] : []
  );

  const rows = useMemo<TagRow[]>(() => {
    const out: TagRow[] = [];
    for (const row of data) {
      if (!row.scorer_id || row.hole_number == null) continue;
      out.push({
        scorer_id: row.scorer_id,
        hole_number: row.hole_number,
        values: parseValuesField(row.tags),
      });
    }
    return out;
  }, [data]);

  const idByTuple = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of data) {
      if (!row.scorer_id || row.hole_number == null) continue;
      m.set(`${row.scorer_id}::${row.hole_number}`, row.id);
    }
    return m;
  }, [data]);

  const getValues = useCallback(
    (scorerId: string, holeNumber: number) =>
      valuesForHole(rows, scorerId, holeNumber),
    [rows]
  );

  const setTagValue = useCallback<UseRoundAchievementTagsResult['setTagValue']>(
    async (scorerId, holeNumber, tagKey, value) => {
      if (!roundId || !signedInUserId) return;
      const guardKey = `${scorerId}::${holeNumber}::${tagKey}`;
      if (inFlight.current.has(guardKey)) return;
      inFlight.current.add(guardKey);
      try {
        const tupleKey = `${scorerId}::${holeNumber}`;
        const rowId = idByTuple.get(tupleKey);
        const current = getValues(scorerId, holeNumber);
        const next: TagValueMap = { ...current };
        if (value === undefined) {
          delete (next as Record<string, TagValue>)[tagKey];
        } else {
          (next as Record<string, TagValue>)[tagKey] = value;
        }
        const now = new Date().toISOString();
        const json = JSON.stringify(next);
        if (rowId) {
          await system.powersync.execute(
            `UPDATE ${SCORECARD_ACHIEVEMENT_TAGS_TABLE}
               SET tags = ?, updated_at = ?
               WHERE id = ?`,
            [json, now, rowId]
          );
        } else {
          // Use the dedicated achievement-tag id generator. The
          // server-side trigger fills in owner_user_id from the
          // parent scorecard row.
          const id = newAchievementTagId();
          await system.powersync.execute(
            `INSERT INTO ${SCORECARD_ACHIEVEMENT_TAGS_TABLE}
               (id, scorecard_id, owner_user_id, scorer_id, hole_number, tags, updated_at)
             VALUES (?, ?, NULL, ?, ?, ?, ?)`,
            [id, roundId, scorerId, holeNumber, json, now]
          );
        }
      } finally {
        inFlight.current.delete(guardKey);
      }
    },
    [roundId, signedInUserId, idByTuple, getValues, system]
  );

  return { rows, getValues, setTagValue };
}
