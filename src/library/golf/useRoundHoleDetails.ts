/**
 * Per-hole details — Supabase REST data layer (React Query).
 *
 * Read path: useRoundHoleDetails(roundId) fetches the round's
 * scorecard_hole_details rows from Supabase via React Query and
 * normalises each jsonb details object into a StatValueMap. RLS scopes
 * rows to rounds the user can see. Data refreshes on demand / focus
 * rather than live-syncing.
 *
 * Write path: setValue() and seedDefaults() optimistically update the
 * cached tuple, then run an idempotent REST upsert on the natural key
 * unique (scorecard_id, scorer_id, hole_number). onError rolls back to
 * the previous cache snapshot and onSettled reconciles against server
 * truth. details is jsonb over PostgREST, so it is read and written as a
 * native JS object (no JSON string boundary). owner_user_id is left null
 * and filled by the server-side trigger from the parent scorecards row.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';

import { newAchievementTagId } from '@/library/golf/ids';
import type {
  IntegerStatDefinition,
  StatKey,
  StatValue,
  StatValueMap,
} from '@/library/golf/builtInStats';
import { supabase } from '@/library/supabase/client';
import { useAccount } from '@/library/social/AccountContext';

const SCORECARD_HOLE_DETAILS_TABLE = 'scorecard_hole_details';

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
   * Defaults are merged against the latest cached tuple before the
   * optimistic upsert. Stats whose key is already present (even with
   * the same value) are left untouched. No-op when none of the
   * provided stats need seeding, or when there's no round / no
   * signed-in user.
   */
  seedDefaults: (
    scorerId: string,
    holeNumber: number,
    stats: readonly IntegerStatDefinition[]
  ) => Promise<void>;
};

type HoleDetailsCloudRow = {
  id: string;
  scorecard_id: string;
  owner_user_id: string | null;
  scorer_id: string | null;
  hole_number: number | null;
  details: unknown;
  updated_at: string | null;
};

type HoleDetailsMutation = {
  id: string;
  scorerId: string;
  holeNumber: number;
  values: StatValueMap;
};

function tupleKey(scorerId: string, holeNumber: number): string {
  return `${scorerId}::${holeNumber}`;
}

export function roundHoleDetailsKey(roundId: string | null, userId: string | null) {
  return ['scorecard_hole_details', roundId, userId] as const;
}

/**
 * Normalise the REST jsonb `details` value. PostgREST returns jsonb as
 * already-parsed JS values; only object shapes are accepted.
 */
function parseDetailsField(raw: unknown): StatValueMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: StatValueMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

function rowsWithUpsert(
  rows: readonly HoleDetailsCloudRow[] | undefined,
  mutation: HoleDetailsMutation,
  roundId: string
): HoleDetailsCloudRow[] {
  const now = new Date().toISOString();
  const base = rows ?? [];
  const nextRow: HoleDetailsCloudRow = {
    id: mutation.id,
    scorecard_id: roundId,
    owner_user_id: null,
    scorer_id: mutation.scorerId,
    hole_number: mutation.holeNumber,
    details: mutation.values,
    updated_at: now,
  };
  let replaced = false;
  const next = base.map((row) => {
    if (row.scorer_id === mutation.scorerId && row.hole_number === mutation.holeNumber) {
      replaced = true;
      return { ...row, details: mutation.values, updated_at: now };
    }
    return row;
  });
  if (!replaced) next.push(nextRow);
  return next;
}

function findExistingRow(
  rows: readonly HoleDetailsCloudRow[] | undefined,
  scorerId: string,
  holeNumber: number
): HoleDetailsCloudRow | undefined {
  return rows?.find((row) => row.scorer_id === scorerId && row.hole_number === holeNumber);
}

export function useRoundHoleDetails(
  roundId: string | null
): UseRoundHoleDetailsResult {
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;
  const queryClient = useQueryClient();
  const inFlight = useRef<Map<string, Promise<void>>>(new Map());

  const key = roundHoleDetailsKey(roundId, signedInUserId);

  const { data } = useQuery<HoleDetailsCloudRow[]>({
    queryKey: key,
    enabled: !!roundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(SCORECARD_HOLE_DETAILS_TABLE)
        .select('*')
        .eq('scorecard_id', roundId as string);
      if (error) throw error;
      return (data ?? []) as HoleDetailsCloudRow[];
    },
  });

  const rows = useMemo<HoleDetailsRow[]>(() => {
    const out: HoleDetailsRow[] = [];
    for (const row of data ?? []) {
      if (!row.scorer_id || row.hole_number == null) continue;
      out.push({
        scorer_id: row.scorer_id,
        hole_number: row.hole_number,
        values: parseDetailsField(row.details),
      });
    }
    return out;
  }, [data]);

  const { mutateAsync } = useMutation<
    void,
    Error,
    HoleDetailsMutation,
    { previous?: HoleDetailsCloudRow[] }
  >({
    mutationFn: async (mutation) => {
      if (!roundId || !signedInUserId) return;
      const { error } = await supabase.from(SCORECARD_HOLE_DETAILS_TABLE).upsert(
        {
          id: mutation.id,
          scorecard_id: roundId,
          owner_user_id: null,
          scorer_id: mutation.scorerId,
          hole_number: mutation.holeNumber,
          details: mutation.values,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'scorecard_id,scorer_id,hole_number' }
      );
      if (error) throw error;
    },
    onMutate: async (mutation) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<HoleDetailsCloudRow[]>(key);
      if (roundId) {
        queryClient.setQueryData<HoleDetailsCloudRow[]>(key, (old) =>
          rowsWithUpsert(old, mutation, roundId)
        );
      }
      return { previous };
    },
    onError: (_err, _mutation, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(key, ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

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
      const guard = tupleKey(scorerId, holeNumber);
      const previous = inFlight.current.get(guard) ?? Promise.resolve();

      const next = previous.then(async () => {
        const latest = queryClient.getQueryData<HoleDetailsCloudRow[]>(key);
        const existing = findExistingRow(latest, scorerId, holeNumber);
        const updated: StatValueMap = { ...parseDetailsField(existing?.details) };
        if (value === null) {
          delete updated[statKey];
        } else {
          updated[statKey] = value;
        }
        await mutateAsync({
          id: existing?.id ?? newAchievementTagId(),
          scorerId,
          holeNumber,
          values: updated,
        });
      });

      const tracked = next.catch(() => {});
      inFlight.current.set(guard, tracked);
      try {
        await next;
      } finally {
        if (inFlight.current.get(guard) === tracked) {
          inFlight.current.delete(guard);
        }
      }
    },
    [roundId, signedInUserId, queryClient, key, mutateAsync]
  );

  const seedDefaults = useCallback<UseRoundHoleDetailsResult['seedDefaults']>(
    async (scorerId, holeNumber, stats) => {
      if (!roundId || !signedInUserId) return;
      if (stats.length === 0) return;
      const guard = tupleKey(scorerId, holeNumber);
      const previous = inFlight.current.get(guard) ?? Promise.resolve();

      const next = previous.then(async () => {
        const latest = queryClient.getQueryData<HoleDetailsCloudRow[]>(key);
        const existing = findExistingRow(latest, scorerId, holeNumber);
        const updated: StatValueMap = { ...parseDetailsField(existing?.details) };
        let changed = false;
        for (const stat of stats) {
          if (updated[stat.key] === undefined) {
            updated[stat.key] = stat.defaultValue;
            changed = true;
          }
        }
        if (!changed) return;
        await mutateAsync({
          id: existing?.id ?? newAchievementTagId(),
          scorerId,
          holeNumber,
          values: updated,
        });
      });

      const tracked = next.catch(() => {});
      inFlight.current.set(guard, tracked);
      try {
        await next;
      } finally {
        if (inFlight.current.get(guard) === tracked) {
          inFlight.current.delete(guard);
        }
      }
    },
    [roundId, signedInUserId, queryClient, key, mutateAsync]
  );

  return { rows, getValues, setValue, seedDefaults };
}
