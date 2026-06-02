/**
 * Round likes — local data layer.
 *
 * Read path: `useRoundLikes(roundId)` watches the local `round_likes`
 * table via PowerSync `useQuery`. Returns the total like count for
 * the round plus whether the signed-in user has a row.
 *
 * Write path: `toggle()` either inserts a new row (with a
 * client-generated uuid) or deletes the user's existing row. The
 * PowerSync connector uploads asynchronously; RLS server-side
 * validates the round is still visible to the user and that
 * `liker_user_id = auth.uid()`.
 *
 * Cross-friendship edge case: if the user de-friends the round
 * owner, the user's local `round_likes` row syncs out (PowerSync
 * prunes rows that no longer match any subscribed stream). The
 * count + `likedByMe` returned here naturally reflect the local
 * state, so the button shows as "not liked" without any explicit
 * error handling. The original row stays in Supabase (cleanup is
 * cosmetic; the unique constraint still prevents a duplicate insert
 * if friendship is re-established).
 *
 * Re-entrancy: the toggle is guarded against rapid double-tap via
 * an in-flight ref so a doubled tap doesn't try to insert twice
 * (which would hit the unique constraint server-side and surface
 * as a discarded-upload log line).
 */

import { useQuery } from '@powersync/react';
import { useCallback, useRef } from 'react';

import { newRoundLikeId } from '@/library/golf/ids';
import {
  ROUND_LIKES_TABLE,
  type RoundLikeRecord
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
import { useAccount } from '@/library/social/AccountContext';

export type UseRoundLikesResult = {
  /** True when the signed-in user has a row for this round in local SQLite. */
  likedByMe: boolean;
  /** Total number of like rows currently synced for this round. */
  count: number;
  /**
   * Toggle the signed-in user's like on this round. No-op when:
   *   - no roundId
   *   - no signed-in user
   *   - a previous toggle for this hook instance is still in flight
   */
  toggle: () => void;
};

export function useRoundLikes(roundId: string | null): UseRoundLikesResult {
  const system = useSystem();
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;

  const inFlight = useRef(false);

  // Total likes for the round. Always fires, even when there's no
  // signed-in user, so cold-load surfaces have a count to render.
  const { data: countRows } = useQuery<{ count: number }>(
    roundId
      ? `SELECT COUNT(*) AS count FROM ${ROUND_LIKES_TABLE} WHERE round_id = ?`
      : `SELECT 0 AS count`,
    roundId ? [roundId] : []
  );
  const count = Number(countRows[0]?.count ?? 0);

  // Whether the signed-in user has a row. Returns the row (if any)
  // so we can read its `id` for the DELETE path.
  const { data: mineRows } = useQuery<RoundLikeRecord & { id: string }>(
    roundId && signedInUserId
      ? `SELECT * FROM ${ROUND_LIKES_TABLE}
           WHERE round_id = ? AND liker_user_id = ?
           LIMIT 1`
      : `SELECT * FROM ${ROUND_LIKES_TABLE} WHERE 1 = 0`,
    roundId && signedInUserId ? [roundId, signedInUserId] : []
  );
  const myRow = mineRows[0] ?? null;
  const likedByMe = myRow !== null;

  const toggle = useCallback(() => {
    if (!roundId || !signedInUserId) return;
    if (inFlight.current) return;
    inFlight.current = true;

    void (async () => {
      try {
        if (myRow) {
          // Un-like: hard-delete the local row. The connector
          // replicates the DELETE; the server's RLS delete-own
          // policy enforces that the row belongs to the caller.
          await system.powersync.execute(
            `DELETE FROM ${ROUND_LIKES_TABLE} WHERE id = ?`,
            [myRow.id]
          );
        } else {
          // Like: insert a fresh row. `owner_user_id` is left null
          // — the server-side trigger fills it from the parent
          // scorecards row. Local SQLite stores null too; that's
          // fine because the sync streams filter through the
          // scorecards join, not by `owner_user_id` directly on the
          // local side.
          const id = newRoundLikeId();
          const now = new Date().toISOString();
          await system.powersync.execute(
            `INSERT INTO ${ROUND_LIKES_TABLE}
               (id, round_id, liker_user_id, owner_user_id, created_at)
             VALUES (?, ?, ?, NULL, ?)`,
            [id, roundId, signedInUserId, now]
          );
        }
      } finally {
        inFlight.current = false;
      }
    })();
  }, [roundId, signedInUserId, myRow, system]);

  return { likedByMe, count, toggle };
}
