/**
 * Round likes — local data layer.
 *
 * Read path: `useRoundLikes(roundId)` watches the local `round_likes`
 * table via PowerSync `useQuery`. Returns the total like count for
 * the round plus whether the signed-in user has a row.
 *
 * Write path: `toggle()` either inserts a new row (with a
 * client-generated uuid) or deletes the user's existing row. The
 * read of "do I already have a row?" and the conditional
 * INSERT/DELETE happen inside a single PowerSync `writeTransaction`
 * so we never act on a stale React snapshot of `myRow`. Rapid taps
 * chain onto an in-memory promise queue rather than racing — that
 * avoids a double-INSERT pattern that would otherwise trip the
 * `unique (round_id, liker_user_id)` constraint server-side and
 * cause SupabaseConnector to discard the rest of the upload batch.
 * The PowerSync connector uploads asynchronously; RLS server-side
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
   * Toggle the signed-in user's like on this round. No-op when no
   * roundId or no signed-in user. Rapid taps chain onto an
   * in-memory queue so each tap eventually applies in order.
   */
  toggle: () => void;
};

export function useRoundLikes(roundId: string | null): UseRoundLikesResult {
  const system = useSystem();
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;

  // Tail of the per-hook promise chain. New taps chain onto this so
  // toggles serialise rather than racing. Catch-wrapped so a single
  // failed tap does not poison subsequent ones.
  const inFlight = useRef<Promise<void>>(Promise.resolve());

  // Total likes for the round. Always fires, even when there's no
  // signed-in user, so cold-load surfaces have a count to render.
  const { data: countRows } = useQuery<{ count: number }>(
    roundId
      ? `SELECT COUNT(*) AS count FROM ${ROUND_LIKES_TABLE} WHERE round_id = ?`
      : `SELECT 0 AS count`,
    roundId ? [roundId] : []
  );
  const count = Number(countRows[0]?.count ?? 0);

  // Whether the signed-in user has a row. Used for the UI; the
  // write path re-reads from local SQLite inside the transaction
  // rather than relying on this snapshot, so it's safe even when
  // stale by a tick.
  const { data: mineRows } = useQuery<RoundLikeRecord & { id: string }>(
    roundId && signedInUserId
      ? `SELECT * FROM ${ROUND_LIKES_TABLE}
           WHERE round_id = ? AND liker_user_id = ?
           LIMIT 1`
      : `SELECT * FROM ${ROUND_LIKES_TABLE} WHERE 1 = 0`,
    roundId && signedInUserId ? [roundId, signedInUserId] : []
  );
  const likedByMe = (mineRows[0] ?? null) !== null;

  const toggle = useCallback(() => {
    if (!roundId || !signedInUserId) return;
    const next = inFlight.current.then(() =>
      system.powersync.writeTransaction(async (tx) => {
        // Re-read inside the transaction so we never act on a stale
        // React snapshot. Two rapid taps must see each other's
        // committed effect (INSERT then immediate DELETE, etc.)
        // rather than both seeing the pre-tap state.
        const existing = await tx.getOptional<{ id: string }>(
          `SELECT id FROM ${ROUND_LIKES_TABLE}
             WHERE round_id = ? AND liker_user_id = ?
             LIMIT 1`,
          [roundId, signedInUserId]
        );
        if (existing) {
          // Un-like: hard-delete the local row. The connector
          // replicates the DELETE; the server's RLS delete-own
          // policy enforces that the row belongs to the caller.
          await tx.execute(
            `DELETE FROM ${ROUND_LIKES_TABLE} WHERE id = ?`,
            [existing.id]
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
          await tx.execute(
            `INSERT INTO ${ROUND_LIKES_TABLE}
               (id, round_id, liker_user_id, owner_user_id, created_at)
             VALUES (?, ?, ?, NULL, ?)`,
            [id, roundId, signedInUserId, now]
          );
        }
      })
    );
    inFlight.current = next.catch(() => {});
  }, [roundId, signedInUserId, system]);

  return { likedByMe, count, toggle };
}
