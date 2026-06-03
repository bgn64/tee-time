/**
 * Achievement tags — local data layer for a single round.
 *
 * Read path: watches `scorecard_achievement_tags` via PowerSync
 * `useQuery`, parses each row's `tags` JSON column into a `TagValueMap`,
 * and returns a memoised tuple lookup `getValues(scorerId, holeNumber)`.
 *
 * Write path: `setTagValue(scorerId, holeNumber, tagKey, value)`
 * performs the read-modify-write inside a PowerSync `writeTransaction`
 * so the row's current `tags` map is read from local SQLite (not from
 * a stale React closure) and the conditional INSERT/UPDATE happens
 * atomically. Concurrent calls on the same `(scorer, hole)` tuple are
 * chained per tuple via an in-memory promise queue so a burst of taps
 * across different pills all apply in order rather than racing and
 * overwriting each other. Passing `undefined` for `value` clears the
 * key from the map ("unset" state). When the resulting map is empty
 * we still leave the row in place (matches the storage convention of
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
   * state). No-op if there's no round id or no signed-in user.
   * Calls for the same (scorer, hole) tuple are serialised via an
   * in-memory queue so each tap eventually applies in the order it
   * was made.
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

  // Map keyed by `${scorerId}::${holeNumber}` holding the tail of the
  // promise chain for each tuple. New taps chain onto the previous
  // promise so writes serialise per tuple while different tuples stay
  // independent. Chains are catch-wrapped so a single failed tap does
  // not poison subsequent ones.
  const inFlight = useRef<Map<string, Promise<void>>>(new Map());

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

  const getValues = useCallback(
    (scorerId: string, holeNumber: number) =>
      valuesForHole(rows, scorerId, holeNumber),
    [rows]
  );

  const setTagValue = useCallback<UseRoundAchievementTagsResult['setTagValue']>(
    async (scorerId, holeNumber, tagKey, value) => {
      if (!roundId || !signedInUserId) return;
      const tupleKey = `${scorerId}::${holeNumber}`;
      const previous = inFlight.current.get(tupleKey) ?? Promise.resolve();

      const next = previous.then(() =>
        system.powersync.writeTransaction(async (tx) => {
          // Re-read the row from local SQLite inside the transaction
          // so we always start from the latest committed state rather
          // than a stale React snapshot.
          const existing = await tx.getOptional<{ id: string; tags: string | null }>(
            `SELECT id, tags FROM ${SCORECARD_ACHIEVEMENT_TAGS_TABLE}
             WHERE scorecard_id = ? AND scorer_id = ? AND hole_number = ?`,
            [roundId, scorerId, holeNumber]
          );
          const current = parseValuesField(existing?.tags ?? null);
          const updated: TagValueMap = { ...current };
          if (value === undefined) {
            delete (updated as Record<string, TagValue>)[tagKey];
          } else {
            (updated as Record<string, TagValue>)[tagKey] = value;
          }
          const now = new Date().toISOString();
          const json = JSON.stringify(updated);
          if (existing) {
            await tx.execute(
              `UPDATE ${SCORECARD_ACHIEVEMENT_TAGS_TABLE}
                 SET tags = ?, updated_at = ?
                 WHERE id = ?`,
              [json, now, existing.id]
            );
          } else {
            // Use the dedicated achievement-tag id generator. The
            // server-side trigger fills in owner_user_id from the
            // parent scorecard row.
            const id = newAchievementTagId();
            await tx.execute(
              `INSERT INTO ${SCORECARD_ACHIEVEMENT_TAGS_TABLE}
                 (id, scorecard_id, owner_user_id, scorer_id, hole_number, tags, updated_at)
               VALUES (?, ?, NULL, ?, ?, ?, ?)`,
              [id, roundId, scorerId, holeNumber, json, now]
            );
          }
        })
      );

      // Catch so a failed tap doesn't poison subsequent taps in the
      // chain, but await the original (uncaught) promise so callers
      // still see errors from their own tap.
      const tracked = next.catch(() => {});
      inFlight.current.set(tupleKey, tracked);
      try {
        await next;
      } finally {
        // Only clear the slot if no newer tap has chained onto it.
        if (inFlight.current.get(tupleKey) === tracked) {
          inFlight.current.delete(tupleKey);
        }
      }
    },
    [roundId, signedInUserId, system]
  );

  return { rows, getValues, setTagValue };
}
