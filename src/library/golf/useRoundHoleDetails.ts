/**
 * Per-hole details — local data layer for a single round.
 *
 * Read path: watches `scorecard_hole_details` via PowerSync
 * `useQuery`, parses each row's `details` JSON object into a
 * `StatValueMap`, and returns a memoised tuple lookup
 * `getValues(scorerId, holeNumber)`.
 *
 * Write path: `setValue(scorerId, holeNumber, statKey, value)`
 * performs the read-modify-write inside a PowerSync
 * `writeTransaction` so the row's current `details` map is read
 * from local SQLite (not from a stale React snapshot) and the
 * conditional INSERT/UPDATE happens atomically. Concurrent calls
 * on the same `(scorer, hole)` tuple are chained per tuple via an
 * in-memory promise queue so a burst of taps across different
 * stats all apply in order rather than racing and overwriting
 * each other. Passing `null` for `value` clears the stat key from
 * the map. When the resulting map is empty we still leave the
 * row in place (matches the convention of "absent row = never
 * engaged" vs "empty map = explicitly cleared").
 *
 * Value validation: the storage layer accepts any boolean or
 * finite number. Per-stat type enforcement (binary vs integer)
 * lives in `builtInStats.ts` and is the caller's responsibility
 * — `setValue` does not introspect the stat registry so custom
 * user-defined stats added later work without changes here.
 */

import { useQuery } from '@powersync/react';
import { useCallback, useMemo, useRef } from 'react';

import { newAchievementTagId } from '@/library/golf/ids';
import type {
  IntegerStatDefinition,
  StatKey,
  StatValue,
  StatValueMap,
} from '@/library/golf/builtInStats';
import {
  SCORECARD_HOLE_DETAILS_TABLE,
  type ScorecardHoleDetailsRecord,
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
import { useAccount } from '@/library/social/AccountContext';

export type HoleDetailsRow = {
  scorer_id: string;
  hole_number: number;
  values: StatValueMap;
};

export type UseRoundHoleDetailsResult = {
  rows: readonly HoleDetailsRow[];
  getValues: (scorerId: string, holeNumber: number) => StatValueMap;
  /**
   * Set one stat's value for a (scorer, hole) tuple. Passing
   * `null` clears the entry. No-op if there's no round id or no
   * signed-in user. Calls for the same (scorer, hole) tuple are
   * serialised via an in-memory queue so each tap eventually
   * applies in the order it was made.
   */
  setValue: (
    scorerId: string,
    holeNumber: number,
    statKey: StatKey,
    value: StatValue | null
  ) => Promise<void>;
  /**
   * Eagerly write `defaultValue` for any of the provided integer
   * stats that don't already have a value on the (scorer, hole)
   * tuple. Fired by `ScoringHolesBody` the first time a stroke
   * count is entered for a hole, so the user sees the stepper
   * pre-populated and the recorded value matches what the UI
   * shows.
   *
   * The whole fill runs inside a single PowerSync
   * `writeTransaction` so concurrent reads-then-writes can't lose
   * a default. Stats whose key is already present (even with the
   * same value) are left untouched. No-op when none of the
   * provided stats need seeding, or when there's no round / no
   * signed-in user.
   */
  seedDefaults: (
    scorerId: string,
    holeNumber: number,
    stats: readonly IntegerStatDefinition[]
  ) => Promise<void>;
};

/**
 * Parse the on-disk `details` JSON column. The column is stored
 * as TEXT locally; the upload connector re-parses to jsonb at the
 * boundary. Accepts only an object shape; everything else
 * normalises to an empty map.
 */
function parseDetailsField(raw: unknown): StatValueMap {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) return {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const out: StatValueMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

export function useRoundHoleDetails(
  roundId: string | null
): UseRoundHoleDetailsResult {
  const system = useSystem();
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;

  // Map keyed by `${scorerId}::${holeNumber}` holding the tail of the
  // promise chain for each tuple. New writes chain onto the previous
  // promise so they serialise per tuple while different tuples stay
  // independent. Chains are catch-wrapped so a single failed write
  // does not poison subsequent ones.
  const inFlight = useRef<Map<string, Promise<void>>>(new Map());

  const { data } = useQuery<ScorecardHoleDetailsRecord & { id: string }>(
    roundId
      ? `SELECT * FROM ${SCORECARD_HOLE_DETAILS_TABLE} WHERE scorecard_id = ?`
      : `SELECT * FROM ${SCORECARD_HOLE_DETAILS_TABLE} WHERE 1 = 0`,
    roundId ? [roundId] : []
  );

  const rows = useMemo<HoleDetailsRow[]>(() => {
    const out: HoleDetailsRow[] = [];
    for (const row of data) {
      if (!row.scorer_id || row.hole_number == null) continue;
      out.push({
        scorer_id: row.scorer_id,
        hole_number: row.hole_number,
        values: parseDetailsField(row.details),
      });
    }
    return out;
  }, [data]);

  const getValues = useCallback(
    (scorerId: string, holeNumber: number): StatValueMap => {
      for (const r of rows) {
        if (r.scorer_id === scorerId && r.hole_number === holeNumber) {
          return r.values;
        }
      }
      return {};
    },
    [rows]
  );

  const setValue = useCallback<UseRoundHoleDetailsResult['setValue']>(
    async (scorerId, holeNumber, statKey, value) => {
      if (!roundId || !signedInUserId) return;
      const tupleKey = `${scorerId}::${holeNumber}`;
      const previous = inFlight.current.get(tupleKey) ?? Promise.resolve();

      const next = previous.then(() =>
        system.powersync.writeTransaction(async (tx) => {
          // Re-read the row from local SQLite inside the transaction
          // so we always start from the latest committed state
          // rather than a stale React snapshot.
          const existing = await tx.getOptional<{ id: string; details: string | null }>(
            `SELECT id, details FROM ${SCORECARD_HOLE_DETAILS_TABLE}
             WHERE scorecard_id = ? AND scorer_id = ? AND hole_number = ?`,
            [roundId, scorerId, holeNumber]
          );
          const current = parseDetailsField(existing?.details ?? null);
          const updated: StatValueMap = { ...current };
          if (value === null) {
            delete updated[statKey];
          } else {
            updated[statKey] = value;
          }
          const now = new Date().toISOString();
          const json = JSON.stringify(updated);
          if (existing) {
            await tx.execute(
              `UPDATE ${SCORECARD_HOLE_DETAILS_TABLE}
                 SET details = ?, updated_at = ?
                 WHERE id = ?`,
              [json, now, existing.id]
            );
          } else {
            // The id helper is shared across per-hole-details rows;
            // its prefix is opaque to the server (the table primary
            // key is text). Reusing `newAchievementTagId` avoids
            // adding a near-identical generator.
            const id = newAchievementTagId();
            await tx.execute(
              `INSERT INTO ${SCORECARD_HOLE_DETAILS_TABLE}
                 (id, scorecard_id, owner_user_id, scorer_id, hole_number, details, updated_at)
               VALUES (?, ?, NULL, ?, ?, ?, ?)`,
              [id, roundId, scorerId, holeNumber, json, now]
            );
          }
        })
      );

      // Catch so a failed write doesn't poison subsequent writes
      // in the chain, but await the original (uncaught) promise so
      // callers still see errors from their own write.
      const tracked = next.catch(() => {});
      inFlight.current.set(tupleKey, tracked);
      try {
        await next;
      } finally {
        // Only clear the slot if no newer write has chained onto it.
        if (inFlight.current.get(tupleKey) === tracked) {
          inFlight.current.delete(tupleKey);
        }
      }
    },
    [roundId, signedInUserId, system]
  );

  const seedDefaults = useCallback<UseRoundHoleDetailsResult['seedDefaults']>(
    async (scorerId, holeNumber, stats) => {
      if (!roundId || !signedInUserId) return;
      if (stats.length === 0) return;
      const tupleKey = `${scorerId}::${holeNumber}`;
      const previous = inFlight.current.get(tupleKey) ?? Promise.resolve();

      const next = previous.then(() =>
        system.powersync.writeTransaction(async (tx) => {
          const existing = await tx.getOptional<{
            id: string;
            details: string | null;
          }>(
            `SELECT id, details FROM ${SCORECARD_HOLE_DETAILS_TABLE}
             WHERE scorecard_id = ? AND scorer_id = ? AND hole_number = ?`,
            [roundId, scorerId, holeNumber]
          );
          const current = parseDetailsField(existing?.details ?? null);
          const updated: StatValueMap = { ...current };
          let changed = false;
          for (const stat of stats) {
            // Only fill keys that are completely absent. An
            // explicit 0 from a prior +/- interaction is preserved.
            if (updated[stat.key] === undefined) {
              updated[stat.key] = stat.defaultValue;
              changed = true;
            }
          }
          if (!changed) return;
          const now = new Date().toISOString();
          const json = JSON.stringify(updated);
          if (existing) {
            await tx.execute(
              `UPDATE ${SCORECARD_HOLE_DETAILS_TABLE}
                 SET details = ?, updated_at = ?
                 WHERE id = ?`,
              [json, now, existing.id]
            );
          } else {
            const id = newAchievementTagId();
            await tx.execute(
              `INSERT INTO ${SCORECARD_HOLE_DETAILS_TABLE}
                 (id, scorecard_id, owner_user_id, scorer_id, hole_number, details, updated_at)
               VALUES (?, ?, NULL, ?, ?, ?, ?)`,
              [id, roundId, scorerId, holeNumber, json, now]
            );
          }
        })
      );

      const tracked = next.catch(() => {});
      inFlight.current.set(tupleKey, tracked);
      try {
        await next;
      } finally {
        if (inFlight.current.get(tupleKey) === tracked) {
          inFlight.current.delete(tupleKey);
        }
      }
    },
    [roundId, signedInUserId, system]
  );

  return { rows, getValues, setValue, seedDefaults };
}
