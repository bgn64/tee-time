/**
 * Round comments — local data layer.
 *
 * Read path: `useRoundComments(roundId)` and `useCommentSummary(roundId)`
 * both watch the local `comments` table via PowerSync `useQuery`.
 * Tombstoned rows (`deleted_at IS NOT NULL`) are filtered out
 * client-side so the UI never renders deleted comments, even though
 * the server keeps the row for sync coherence.
 *
 * Write path: free functions (`postComment` / `editComment` /
 * `softDeleteComment`) that write to local SQLite and let PowerSync
 * upload to Supabase asynchronously. RLS server-side enforces the
 * "visible-round" + "author-only" constraints; the upload connector
 * discards on a 42501 rejection so a stale write doesn't block the
 * queue forever.
 *
 * No friend-graph re-checking on the client — if a write lands when
 * the user has already lost visibility, the server says no and we
 * surface a discarded-upload log line. The realistic case (post
 * comment → land it before the next sync tick) works fine.
 */

import { useQuery } from '@powersync/react';
import { useMemo } from 'react';

import { newCommentId } from '@/library/golf/ids';
import {
  COMMENTS_TABLE,
  type CommentRecord
} from '@/library/powersync/AppSchema';
import { System } from '@/library/powersync/system';

/**
 * Whether an `(edited)` indicator should render — true when
 * `updated_at` is strictly later than `created_at`. The insert
 * path writes both columns from the same client timestamp so
 * fresh comments naturally compare equal, and `editComment` bumps
 * only `updated_at` so any edit produces a strictly-later value.
 */
function isEdited(createdAt: string, updatedAt: string): boolean {
  const created = Date.parse(createdAt);
  const updated = Date.parse(updatedAt);
  return (
    Number.isFinite(created) && Number.isFinite(updated) && updated > created
  );
}

export type Comment = {
  id: string;
  roundId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** True when `updatedAt > createdAt`. */
  edited: boolean;
};

function projectComment(row: CommentRecord & { id: string }): Comment | null {
  if (!row.round_id || !row.author_user_id || !row.body) return null;
  const createdAt = row.created_at ?? '';
  const updatedAt = row.updated_at ?? createdAt;
  return {
    id: row.id,
    roundId: row.round_id,
    authorUserId: row.author_user_id,
    body: row.body,
    createdAt,
    updatedAt,
    edited: isEdited(createdAt, updatedAt)
  };
}

/**
 * Live thread for a single round. Returns sorted-ascending so the
 * oldest comment is at the top — matches Twitter / IG reply order
 * and lets a newly-posted comment appear at the bottom of the list
 * (next to the composer).
 */
export function useRoundComments(roundId: string | null): {
  comments: Comment[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<CommentRecord & { id: string }>(
    roundId
      ? `SELECT * FROM ${COMMENTS_TABLE}
           WHERE round_id = ? AND deleted_at IS NULL
           ORDER BY created_at ASC`
      : `SELECT * FROM ${COMMENTS_TABLE} WHERE 1 = 0`,
    roundId ? [roundId] : []
  );
  const comments = useMemo(() => {
    const out: Comment[] = [];
    for (const r of data) {
      const c = projectComment(r);
      if (c) out.push(c);
    }
    return out;
  }, [data]);
  return { comments, isLoading };
}

/**
 * Lightweight aggregate for the feed footer — count of active
 * (non-tombstoned) comments + the most recent's `created_at`.
 * Recomputed on every PowerSync write tick.
 */
export function useCommentSummary(roundId: string | null): {
  count: number;
  lastAt: string | null;
} {
  const { data } = useQuery<{ count: number; last_at: string | null }>(
    roundId
      ? `SELECT COUNT(*) AS count, MAX(created_at) AS last_at
           FROM ${COMMENTS_TABLE}
           WHERE round_id = ? AND deleted_at IS NULL`
      : `SELECT 0 AS count, NULL AS last_at`,
    roundId ? [roundId] : []
  );
  const row = data[0];
  return {
    count: Number(row?.count ?? 0),
    lastAt: row?.last_at ?? null
  };
}

/**
 * Insert a new comment. Caller supplies the `roundId` (the parent
 * scorecard) and the authoring user id. The PowerSync upload
 * connector replicates to Supabase; RLS validates the round is
 * still visible to the user and that `author_user_id = auth.uid()`.
 *
 * Trimmed empty bodies are rejected here so a noop tap on Send
 * doesn't create an empty row.
 */
export async function postComment(
  system: System,
  args: { roundId: string; authorUserId: string; body: string }
): Promise<void> {
  const body = args.body.trim();
  if (body.length === 0) return;
  if (body.length > 1000) {
    throw new Error('Comment is too long (max 1000 characters).');
  }
  const id = newCommentId();
  const now = new Date().toISOString();
  await system.powersync.execute(
    `INSERT INTO ${COMMENTS_TABLE}
       (id, round_id, author_user_id, body, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [id, args.roundId, args.authorUserId, body, now, now]
  );
}

/**
 * Edit a comment in place. Caller is expected to gate this on
 * `comment.authorUserId === signedInUserId` — the local SQLite has
 * no RLS so a bug here would silently update someone else's row
 * locally before the upload bounces. Server RLS will still reject
 * the cross-author write, but the local optimistic update would
 * confuse the UI until the next sync.
 */
export async function editComment(
  system: System,
  args: { commentId: string; body: string }
): Promise<void> {
  const body = args.body.trim();
  if (body.length === 0) return;
  if (body.length > 1000) {
    throw new Error('Comment is too long (max 1000 characters).');
  }
  const now = new Date().toISOString();
  await system.powersync.execute(
    `UPDATE ${COMMENTS_TABLE} SET body = ?, updated_at = ? WHERE id = ?`,
    [body, now, args.commentId]
  );
}

/**
 * Soft-delete. Sets `deleted_at = now()` and bumps `updated_at` so
 * the row's modification timestamp also moves forward (the row is
 * still synced; viewers' local copies pick up the tombstone and
 * filter it from their thread).
 */
export async function softDeleteComment(
  system: System,
  commentId: string
): Promise<void> {
  const now = new Date().toISOString();
  await system.powersync.execute(
    `UPDATE ${COMMENTS_TABLE}
       SET deleted_at = ?, updated_at = ?
       WHERE id = ?`,
    [now, now, commentId]
  );
}
