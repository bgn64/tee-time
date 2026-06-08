/**
 * Round likes — Supabase REST data layer (React Query).
 *
 * Read path: useRoundLikes(roundId) fetches the round's like rows from
 * Supabase via React Query and derives the total count plus whether the
 * signed-in user has a row. RLS scopes rows to rounds the user can see
 * (own or friend), mirroring the old PowerSync sync rules. Data refreshes
 * on demand / focus (pull-to-refresh model) rather than live-syncing.
 *
 * Write path: toggle() optimistically flips the cached state, then runs
 * an idempotent REST write — an upsert that ignores the
 * unique (round_id, liker_user_id) conflict when liking, or a delete
 * scoped to the caller's row when un-liking. Idempotency makes rapid taps
 * safe without an explicit serialization queue; onSettled reconciles
 * against server truth. owner_user_id is left null and filled by the
 * server-side trigger from the parent scorecards row. RLS enforces that
 * the round is visible and that liker_user_id = auth.uid().
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { newRoundLikeId } from '@/library/golf/ids';
import { supabase } from '@/library/supabase/client';
import { useAccount } from '@/library/social/AccountContext';

const ROUND_LIKES_TABLE = 'round_likes';

export type UseRoundLikesResult = {
  /** True when the signed-in user has a like row for this round. */
  likedByMe: boolean;
  /** Total number of like rows visible for this round. */
  count: number;
  /** Toggle the signed-in user's like. No-op without a round or session. */
  toggle: () => void;
};

type LikesData = { count: number; likedByMe: boolean };

export function roundLikesKey(roundId: string | null, userId: string | null) {
  return ['round_likes', roundId, userId] as const;
}

export function useRoundLikes(roundId: string | null): UseRoundLikesResult {
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;
  const queryClient = useQueryClient();

  const { data } = useQuery<LikesData>({
    queryKey: roundLikesKey(roundId, signedInUserId),
    enabled: !!roundId,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from(ROUND_LIKES_TABLE)
        .select('liker_user_id', { count: 'exact' })
        .eq('round_id', roundId as string);
      if (error) throw error;
      const rows = (data ?? []) as { liker_user_id: string | null }[];
      return {
        count: count ?? rows.length,
        likedByMe: signedInUserId
          ? rows.some((r) => r.liker_user_id === signedInUserId)
          : false,
      };
    },
  });

  const { mutate } = useMutation<void, Error, boolean, { previous?: LikesData }>({
    mutationFn: async (desired: boolean) => {
      if (!roundId || !signedInUserId) return;
      if (desired) {
        const { error } = await supabase.from(ROUND_LIKES_TABLE).upsert(
          {
            id: newRoundLikeId(),
            round_id: roundId,
            liker_user_id: signedInUserId,
            owner_user_id: null,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'round_id,liker_user_id', ignoreDuplicates: true }
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(ROUND_LIKES_TABLE)
          .delete()
          .eq('round_id', roundId)
          .eq('liker_user_id', signedInUserId);
        if (error) throw error;
      }
    },
    onMutate: async (desired: boolean) => {
      const key = roundLikesKey(roundId, signedInUserId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LikesData>(key);
      queryClient.setQueryData<LikesData>(key, (old) => {
        const base = old ?? { count: 0, likedByMe: false };
        if (base.likedByMe === desired) return base;
        return {
          likedByMe: desired,
          count: Math.max(0, base.count + (desired ? 1 : -1)),
        };
      });
      return { previous };
    },
    onError: (_err, _desired, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(roundLikesKey(roundId, signedInUserId), ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: roundLikesKey(roundId, signedInUserId),
      });
    },
  });

  const toggle = useCallback(() => {
    if (!roundId || !signedInUserId) return;
    const current = queryClient.getQueryData<LikesData>(
      roundLikesKey(roundId, signedInUserId)
    );
    mutate(!(current?.likedByMe ?? false));
  }, [roundId, signedInUserId, queryClient, mutate]);

  return {
    likedByMe: data?.likedByMe ?? false,
    count: data?.count ?? 0,
    toggle,
  };
}