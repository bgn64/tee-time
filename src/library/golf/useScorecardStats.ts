/**
 * useScorecardStats — Supabase REST participant stats (React Query).
 *
 * Derives simple participant counts from completed scorecards owned by the
 * signed-in user. The REST query is scoped strictly to `owner_user_id = me` so
 * friends' visible scorecards never affect these own-profile stats.
 *
 *   roundsPlayed:
 *     count of completed scorecards I OWN whose `player_ids` array contains my
 *     `user:{me}` participantKey.
 *
 *   roundsTogether(targetUserId):
 *     count of completed scorecards I OWN whose `player_ids` array contains
 *     BOTH `user:{me}` AND `user:{target}`.
 *
 * Supabase returns `player_ids` jsonb as an already-parsed array. The helper
 * below also accepts the legacy JSON-string shape defensively while the app is
 * migrating off PowerSync.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/library/supabase/client';
import { useAccount } from '@/library/social/AccountContext';
import { userParticipantKey } from './participantKey';

type ScorecardPlayerIdsRow = {
  id: string;
  player_ids: unknown;
};

export type ScorecardStats = {
  roundsPlayed: number;
  roundsTogether: (targetUserId: string) => number;
  /** True until the underlying React Query request has resolved. */
  isLoading: boolean;
};

const SCORECARDS_TABLE = 'scorecards';

function safeStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function scorecardStatsKey(userId: string | null) {
  return ['scorecard_stats', userId] as const;
}

export function useScorecardStats(): ScorecardStats {
  const { account } = useAccount();
  const userId = account?.userId ?? null;
  const myKey = userId ? userParticipantKey(userId) : '';

  const { data: rows, isLoading } = useQuery<ScorecardPlayerIdsRow[]>({
    queryKey: scorecardStatsKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(SCORECARDS_TABLE)
        .select('id, player_ids')
        .eq('owner_user_id', userId as string)
        .not('completed_at', 'is', null);
      if (error) throw error;
      return (data ?? []) as ScorecardPlayerIdsRow[];
    },
  });

  const parsed = React.useMemo(() => {
    return (rows ?? []).map((r) => new Set(safeStringArray(r.player_ids)));
  }, [rows]);

  const roundsPlayed = React.useMemo(() => {
    if (!myKey) return 0;
    return parsed.reduce((acc, ids) => (ids.has(myKey) ? acc + 1 : acc), 0);
  }, [parsed, myKey]);

  const roundsTogether = React.useCallback(
    (targetUserId: string): number => {
      if (!targetUserId || !userId || !myKey) return 0;
      if (targetUserId === userId) return roundsPlayed;
      const targetKey = userParticipantKey(targetUserId);
      let count = 0;
      for (const ids of parsed) {
        if (ids.has(myKey) && ids.has(targetKey)) count++;
      }
      return count;
    },
    [parsed, myKey, userId, roundsPlayed]
  );

  return { roundsPlayed, roundsTogether, isLoading };
}
