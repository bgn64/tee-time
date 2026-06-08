/**
 * Round comments — Supabase REST data layer (React Query).
 *
 * Read path: useRoundComments(roundId) fetches the round's active comment
 * rows from Supabase via React Query, projects them to the UI Comment shape,
 * and keeps tombstoned rows hidden with `deleted_at IS NULL`. useCommentSummary
 * fetches the active-row count plus the most recent created_at for lightweight
 * feed badges. RLS scopes rows to rounds the user can see (own or friend),
 * mirroring the old PowerSync sync rules. Data refreshes on demand / focus
 * (pull-to-refresh model) rather than live-syncing.
 *
 * Write path: free functions (postComment / editComment / softDeleteComment)
 * optimistically update the React Query cache, then run plain Supabase REST
 * writes. Inserts provide only the client id, visible parent round, author,
 * body, and created_at; updates touch only editable comment columns. RLS
 * enforces that the round is visible and that author_user_id = auth.uid().
 */

import { useQuery, type QueryKey } from '@tanstack/react-query';

import { queryClient } from '@/library/data/queryClient';
import { newCommentId } from '@/library/golf/ids';
import type { System } from '@/library/powersync/system';
import { supabase } from '@/library/supabase/client';
import { useAccount } from '@/library/social/AccountContext';

const COMMENTS_TABLE = 'comments';
const ROUND_COMMENTS_KEY = 'comments';
const COMMENT_SUMMARY_KEY = 'comment_summary';

type CommentRow = {
  id: string;
  round_id: string | null;
  author_user_id: string | null;
  body: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

type CommentSummary = {
  count: number;
  lastAt: string | null;
};

type QuerySnapshot<T> = [QueryKey, T | undefined][];

/**
 * Whether an `(edited)` indicator should render — true when
 * `updated_at` is strictly later than `created_at`. Fresh REST inserts
 * omit `updated_at`, so projection falls back to `created_at`; editComment
 * bumps `updated_at` so any edit produces a strictly-later value.
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

function projectComment(row: CommentRow): Comment | null {
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
    edited: isEdited(createdAt, updatedAt),
  };
}

function compareComments(a: Comment, b: Comment): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

function summarizeComments(comments: Comment[]): CommentSummary {
  const last = comments[comments.length - 1];
  return {
    count: comments.length,
    lastAt: last?.createdAt ?? null,
  };
}

export function roundCommentsKey(roundId: string | null, userId: string | null) {
  return [ROUND_COMMENTS_KEY, roundId, userId] as const;
}

export function commentSummaryKey(roundId: string | null, userId: string | null) {
  return [COMMENT_SUMMARY_KEY, roundId, userId] as const;
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
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;

  const { data, isLoading } = useQuery<Comment[]>({
    queryKey: roundCommentsKey(roundId, signedInUserId),
    enabled: !!roundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(COMMENTS_TABLE)
        .select(
          'id, round_id, author_user_id, body, created_at, updated_at, deleted_at'
        )
        .eq('round_id', roundId as string)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw error;
      const comments: Comment[] = [];
      for (const row of (data ?? []) as CommentRow[]) {
        const comment = projectComment(row);
        if (comment) comments.push(comment);
      }
      return comments;
    },
  });

  return { comments: data ?? [], isLoading };
}

/**
 * Lightweight aggregate for the feed footer — count of active
 * (non-tombstoned) comments + the most recent's `created_at`.
 */
export function useCommentSummary(roundId: string | null): {
  count: number;
  lastAt: string | null;
} {
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;

  const { data } = useQuery<CommentSummary>({
    queryKey: commentSummaryKey(roundId, signedInUserId),
    enabled: !!roundId,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from(COMMENTS_TABLE)
        .select('created_at', { count: 'exact' })
        .eq('round_id', roundId as string)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const rows = (data ?? []) as { created_at: string | null }[];
      return {
        count: count ?? 0,
        lastAt: rows[0]?.created_at ?? null,
      };
    },
  });

  return {
    count: data?.count ?? 0,
    lastAt: data?.lastAt ?? null,
  };
}

async function invalidateCommentQueries() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [ROUND_COMMENTS_KEY] }),
    queryClient.invalidateQueries({ queryKey: [COMMENT_SUMMARY_KEY] }),
  ]);
}

function rollbackComments(
  previousComments: QuerySnapshot<Comment[]>,
  previousSummaries: QuerySnapshot<CommentSummary>
) {
  for (const [key, data] of previousComments) {
    queryClient.setQueryData(key, data);
  }
  for (const [key, data] of previousSummaries) {
    queryClient.setQueryData(key, data);
  }
}

async function snapshotCommentQueries() {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: [ROUND_COMMENTS_KEY] }),
    queryClient.cancelQueries({ queryKey: [COMMENT_SUMMARY_KEY] }),
  ]);
  return {
    previousComments: queryClient.getQueriesData<Comment[]>({
      queryKey: [ROUND_COMMENTS_KEY],
    }),
    previousSummaries: queryClient.getQueriesData<CommentSummary>({
      queryKey: [COMMENT_SUMMARY_KEY],
    }),
  };
}

/**
 * Insert a new comment. Caller supplies the `roundId` (the parent
 * scorecard) and the authoring user id from useAccount().
 *
 * Trimmed empty bodies are rejected here so a noop tap on Send
 * doesn't create an empty row.
 */
export async function postComment(
  _system: System,
  args: { roundId: string; authorUserId: string; body: string }
): Promise<void> {
  const body = args.body.trim();
  if (body.length === 0) return;
  if (body.length > 1000) {
    throw new Error('Comment is too long (max 1000 characters).');
  }

  const id = newCommentId();
  const now = new Date().toISOString();
  const optimisticComment: Comment = {
    id,
    roundId: args.roundId,
    authorUserId: args.authorUserId,
    body,
    createdAt: now,
    updatedAt: now,
    edited: false,
  };
  const key = roundCommentsKey(args.roundId, args.authorUserId);
  const summaryKey = commentSummaryKey(args.roundId, args.authorUserId);
  const previousComments = queryClient.getQueryData<Comment[]>(key);
  const previousSummary = queryClient.getQueryData<CommentSummary>(summaryKey);

  await Promise.all([
    queryClient.cancelQueries({ queryKey: key }),
    queryClient.cancelQueries({ queryKey: summaryKey }),
  ]);
  queryClient.setQueryData<Comment[]>(key, (old) =>
    [...(old ?? []), optimisticComment].sort(compareComments)
  );
  queryClient.setQueryData<CommentSummary>(
    summaryKey,
    (old) => ({
      count: (old?.count ?? previousComments?.length ?? 0) + 1,
      lastAt:
        old?.lastAt && Date.parse(old.lastAt) > Date.parse(now)
          ? old.lastAt
          : now,
    })
  );

  try {
    const { error } = await supabase.from(COMMENTS_TABLE).insert({
      id,
      round_id: args.roundId,
      author_user_id: args.authorUserId,
      body,
      created_at: now,
    });
    if (error) throw error;
  } catch (error) {
    if (previousComments) {
      queryClient.setQueryData(key, previousComments);
    } else {
      queryClient.removeQueries({ queryKey: key, exact: true });
    }
    if (previousSummary) {
      queryClient.setQueryData(summaryKey, previousSummary);
    } else {
      queryClient.removeQueries({ queryKey: summaryKey, exact: true });
    }
    throw error;
  } finally {
    await invalidateCommentQueries();
  }
}

/**
 * Edit a comment in place. Caller is expected to gate this on
 * `comment.authorUserId === signedInUserId`; server RLS enforces the
 * author-only update rule.
 */
export async function editComment(
  _system: System,
  args: { commentId: string; body: string }
): Promise<void> {
  const body = args.body.trim();
  if (body.length === 0) return;
  if (body.length > 1000) {
    throw new Error('Comment is too long (max 1000 characters).');
  }

  const now = new Date().toISOString();
  const { previousComments, previousSummaries } = await snapshotCommentQueries();
  queryClient.setQueriesData<Comment[]>(
    { queryKey: [ROUND_COMMENTS_KEY] },
    (old) =>
      old?.map((comment) =>
        comment.id === args.commentId
          ? {
              ...comment,
              body,
              updatedAt: now,
              edited: isEdited(comment.createdAt, now),
            }
          : comment
      )
  );

  try {
    const { error } = await supabase
      .from(COMMENTS_TABLE)
      .update({ body, updated_at: now })
      .eq('id', args.commentId);
    if (error) throw error;
  } catch (error) {
    rollbackComments(previousComments, previousSummaries);
    throw error;
  } finally {
    await invalidateCommentQueries();
  }
}

/**
 * Soft-delete. Sets `deleted_at = now()` so viewers' cached copies
 * hide the tombstone immediately while the server keeps the row.
 */
export async function softDeleteComment(
  _system: System,
  commentId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { previousComments, previousSummaries } = await snapshotCommentQueries();

  for (const [key, comments] of previousComments) {
    if (!comments?.some((comment) => comment.id === commentId)) continue;
    const nextComments = comments.filter((comment) => comment.id !== commentId);
    queryClient.setQueryData(key, nextComments);
    const [, roundId, userId] = key as ReturnType<typeof roundCommentsKey>;
    queryClient.setQueryData<CommentSummary>(
      commentSummaryKey(roundId, userId),
      (old) => (old ? summarizeComments(nextComments) : old)
    );
  }

  try {
    const { error } = await supabase
      .from(COMMENTS_TABLE)
      .update({ deleted_at: now })
      .eq('id', commentId);
    if (error) throw error;
  } catch (error) {
    rollbackComments(previousComments, previousSummaries);
    throw error;
  } finally {
    await invalidateCommentQueries();
  }
}
