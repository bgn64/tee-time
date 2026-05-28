/**
 * useScorecardStats — derive simple participant counts from the
 * signed-in user's OWN scorecards.
 *
 * Two counts, both scoped strictly to scorecards the user owns
 * (`owner_user_id = me`). Scorecards are owned by exactly one
 * player — adding another player as a participant in a round means
 * their name appears on YOUR scorecard, not that they share
 * ownership. The stats reflect that mental model:
 *
 *   roundsPlayed:
 *     count of completed scorecards I OWN whose `player_ids` array
 *     contains my `user:{me}` participantKey. ("Scorecards I wrote
 *     in rounds I was playing.") Shown on the user's own profile.
 *
 *   roundsTogether(targetUserId):
 *     count of completed scorecards I OWN whose `player_ids` array
 *     contains BOTH `user:{me}` AND `user:{target}`. ("Rounds I
 *     scored where target was also a participant.") Shown on
 *     other people's profiles.
 *
 * KNOWN ACCURACY CEILING — both counts undercount whenever the
 * counterparty's device originated the scorecard. If Bob scored a
 * round with me in it, Bob's scorecard is now synced to my device
 * via the `friend_scorecards` stream — but we deliberately ignore
 * those rows here because they're Bob's, not mine. Trading a richer
 * "rounds together" count for the simpler "the stats reflect MY
 * scorecards" mental model; future versions could optionally
 * broaden the count to include shared rounds.
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

  // Scope strictly to scorecards I OWN. Without the owner filter,
  // friends' scorecards (now in local SQLite via the friend_scorecards
  // sync stream) would leak into the count whenever I appeared as a
  // participant on one of their rounds.
  const { data: rows, isLoading } = useQuery<ScorecardPlayerIdsRow>(
    `SELECT id, player_ids FROM ${SCORECARDS_TABLE}
     WHERE completed_at IS NOT NULL AND owner_user_id = ?`,
    [account.userId]
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
