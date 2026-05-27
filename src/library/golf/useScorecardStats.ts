/**
 * useScorecardStats — derive simple participant counts from local
 * PowerSync scorecards.
 *
 * Two counts, both computed entirely from the rows already synced
 * to the signed-in user's local SQLite (no extra Supabase fetches,
 * no new sync streams):
 *
 *   roundsPlayed:
 *     count of completed scorecards whose `player_ids` array
 *     contains the signed-in user's `user:{me}` participantKey.
 *     Shown on the user's own profile.
 *
 *   roundsTogether(targetUserId):
 *     count of completed scorecards whose `player_ids` array
 *     contains BOTH `user:{me}` AND `user:{target}`. Shown on
 *     other people's profiles.
 *
 * KNOWN ACCURACY CEILING — both counts undercount whenever the
 * counterparty's device originated the scorecard. PowerSync's
 * `scorecards` sync rule scopes by `owner_user_id`, so a round
 * Bob created with me in it never reaches my local DB. The fix
 * (broaden the sync rule to include participants) is well-scoped
 * and easy to add later when we want truthful totals; for v1 the
 * label "Rounds played" / "Rounds together" plus the local-only
 * data is acceptable.
 */

import React from 'react';
import { useQuery } from '@powersync/react';

import { SCORECARDS_TABLE } from '@/library/powersync/AppSchema';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { userParticipantKey } from './participantKey';

type ScorecardPlayerIdsRow = {
  id: string;
  player_ids: string | null;
};

export type ScorecardStats = {
  roundsPlayed: number;
  roundsTogether: (targetUserId: string) => number;
  /** True until the underlying PowerSync query has emitted at least once. */
  isLoading: boolean;
};

function safeParseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function useScorecardStats(): ScorecardStats {
  const account = useRequiredAccount();
  const myKey = userParticipantKey(account.userId);

  // Only completed scorecards count toward stats — in-flight rounds
  // shouldn't bump the number until they're finished.
  const { data: rows, isLoading } = useQuery<ScorecardPlayerIdsRow>(
    `SELECT id, player_ids FROM ${SCORECARDS_TABLE} WHERE completed_at IS NOT NULL`
  );

  // Pre-parse every scorecard's player_ids into a Set for O(1)
  // membership checks. Memoized on the rows array so the parse work
  // doesn't repeat on every render.
  const parsed = React.useMemo(() => {
    return rows.map((r) => new Set(safeParseStringArray(r.player_ids)));
  }, [rows]);

  const roundsPlayed = React.useMemo(() => {
    return parsed.reduce((acc, ids) => (ids.has(myKey) ? acc + 1 : acc), 0);
  }, [parsed, myKey]);

  const roundsTogether = React.useCallback(
    (targetUserId: string): number => {
      if (!targetUserId) return 0;
      if (targetUserId === account.userId) return roundsPlayed;
      const targetKey = userParticipantKey(targetUserId);
      let count = 0;
      for (const ids of parsed) {
        if (ids.has(myKey) && ids.has(targetKey)) count++;
      }
      return count;
    },
    [parsed, myKey, account.userId, roundsPlayed]
  );

  return { roundsPlayed, roundsTogether, isLoading };
}
