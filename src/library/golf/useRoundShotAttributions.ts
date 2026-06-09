/**
 * Per-(team, hole) shot attribution — Supabase REST data layer (React Query).
 *
 * Read path: useRoundShotAttributions(roundId) fetches the round's
 * scorecard_shot_attributions rows from Supabase via React Query and
 * normalises each jsonb contributor_ids array into ordered participantKeys.
 * RLS scopes rows to rounds the user can see. Data refreshes on demand /
 * focus rather than live-syncing.
 *
 * Write path: setContributors() optimistically updates the cached tuple,
 * then runs an idempotent REST upsert on the natural key unique
 * (scorecard_id, team_id, hole_number). onError rolls back to the previous
 * cache snapshot and onSettled reconciles against server truth.
 * contributor_ids is jsonb over PostgREST, so it is read and written as a
 * native JS array (no JSON string boundary). owner_user_id is left null and
 * filled by the server-side trigger from the parent scorecards row.
 *
 * List length is allowed to drift from the team's stroke count; renderers
 * truncate / pad at read time so the picker UX stays honest even after
 * scores are edited.
 *
 * Tee shot convention (per Q6 decision): the FIRST element in the
 * `contributor_ids` array for a hole is the tee shot.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { newAchievementTagId } from '@/library/golf/ids';
import { supabase } from '@/library/supabase/client';
import { useAccount } from '@/library/social/AccountContext';

const SCORECARD_SHOT_ATTRIBUTIONS_TABLE = 'scorecard_shot_attributions';

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

type ShotAttributionCloudRow = {
  id: string;
  scorecard_id: string;
  owner_user_id: string | null;
  team_id: string | null;
  hole_number: number | null;
  contributor_ids: unknown;
  updated_at: string | null;
};

type ShotAttributionMutation = {
  id: string;
  teamId: string;
  holeNumber: number;
  contributorIds: readonly string[];
};

export function roundShotAttributionsKey(roundId: string | null, userId: string | null) {
  return ['scorecard_shot_attributions', roundId, userId] as const;
}

function parseContributorIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => (typeof v === 'string' ? v : ''));
  }
  return [];
}

function rowsWithUpsert(
  rows: readonly ShotAttributionCloudRow[] | undefined,
  mutation: ShotAttributionMutation,
  roundId: string
): ShotAttributionCloudRow[] {
  const now = new Date().toISOString();
  const base = rows ?? [];
  const nextRow: ShotAttributionCloudRow = {
    id: mutation.id,
    scorecard_id: roundId,
    owner_user_id: null,
    team_id: mutation.teamId,
    hole_number: mutation.holeNumber,
    contributor_ids: [...mutation.contributorIds],
    updated_at: now,
  };
  let replaced = false;
  const next = base.map((row) => {
    if (row.team_id === mutation.teamId && row.hole_number === mutation.holeNumber) {
      replaced = true;
      return { ...row, contributor_ids: [...mutation.contributorIds], updated_at: now };
    }
    return row;
  });
  if (!replaced) next.push(nextRow);
  return next;
}

function findExistingRow(
  rows: readonly ShotAttributionCloudRow[] | undefined,
  teamId: string,
  holeNumber: number
): ShotAttributionCloudRow | undefined {
  return rows?.find((row) => row.team_id === teamId && row.hole_number === holeNumber);
}

export function useRoundShotAttributions(
  roundId: string | null
): UseRoundShotAttributionsResult {
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;
  const queryClient = useQueryClient();
  const key = roundShotAttributionsKey(roundId, signedInUserId);

  const { data } = useQuery<ShotAttributionCloudRow[]>({
    queryKey: key,
    enabled: !!roundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(SCORECARD_SHOT_ATTRIBUTIONS_TABLE)
        .select('*')
        .eq('scorecard_id', roundId as string);
      if (error) throw error;
      return (data ?? []) as ShotAttributionCloudRow[];
    },
  });

  const rows = useMemo<ShotAttributionRow[]>(() => {
    const out: ShotAttributionRow[] = [];
    for (const row of data ?? []) {
      if (!row.team_id || row.hole_number == null) continue;
      out.push({
        teamId: row.team_id,
        holeNumber: row.hole_number,
        contributorIds: parseContributorIds(row.contributor_ids),
      });
    }
    return out;
  }, [data]);

  const { mutateAsync } = useMutation<
    void,
    Error,
    ShotAttributionMutation,
    { previous?: ShotAttributionCloudRow[] }
  >({
    mutationFn: async (mutation) => {
      if (!roundId || !signedInUserId) return;
      const { error } = await supabase.from(SCORECARD_SHOT_ATTRIBUTIONS_TABLE).upsert(
        {
          id: mutation.id,
          scorecard_id: roundId,
          owner_user_id: null,
          team_id: mutation.teamId,
          hole_number: mutation.holeNumber,
          contributor_ids: [...mutation.contributorIds],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'scorecard_id,team_id,hole_number' }
      );
      if (error) throw error;
    },
    onMutate: async (mutation) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ShotAttributionCloudRow[]>(key);
      if (roundId) {
        queryClient.setQueryData<ShotAttributionCloudRow[]>(key, (old) =>
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
      const latest = queryClient.getQueryData<ShotAttributionCloudRow[]>(key);
      const existing = findExistingRow(latest, teamId, holeNumber);
      await mutateAsync({
        id: existing?.id ?? newAchievementTagId(),
        teamId,
        holeNumber,
        contributorIds: [...contributorIds],
      });
    },
    [roundId, signedInUserId, queryClient, key, mutateAsync]
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
