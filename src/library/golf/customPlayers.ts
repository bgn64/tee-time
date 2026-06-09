/**
 * CRUD helpers for `custom_players` — the user-scoped roster of
 * off-app people the user plays rounds with.
 *
 * Writes go through Supabase REST. No SECURITY DEFINER RPCs are
 * needed because the integrity contract is single-row and RLS already
 * scopes access to the owner.
 *
 * `softDeleteCustomPlayer` flips `deleted_at` and bumps `updated_at`.
 * The row stays in Supabase — the picker filters active rows, but the
 * scorecard resolver intentionally does not filter `deleted_at`, so
 * historic rounds keep rendering the deleted player.
 */

import { useQuery } from '@tanstack/react-query';

import { pickAvatarColor } from '@/library/social/avatarColors';
import { queryClient } from '@/library/data/queryClient';
import { supabase } from '@/library/supabase/client';
import { newCustomPlayerId } from './ids';

const CUSTOM_PLAYERS_TABLE = 'custom_players';

export type CreateCustomPlayerResult = {
  /** New row's id — caller uses this to build a `custom:{id}` participantKey. */
  id: string;
  nickname: string;
  avatarColor: string;
};

export async function createCustomPlayer(
  ownerUserId: string,
  rawNickname: string
): Promise<CreateCustomPlayerResult> {
  const nickname = rawNickname.trim();
  if (nickname.length === 0) {
    throw new Error('Nickname is required');
  }
  const id = newCustomPlayerId();
  const avatarColor = pickAvatarColor(id);
  const now = new Date().toISOString();
  const { error } = await supabase.from(CUSTOM_PLAYERS_TABLE).insert({
    id,
    owner_user_id: ownerUserId,
    nickname,
    avatar_color: avatarColor,
    created_at: now,
    updated_at: now,
    deleted_at: null
  });
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: ['custom_players'] });
  return { id, nickname, avatarColor };
}

/**
 * Soft-delete: stamp `deleted_at` so the row vanishes from the
 * picker but stays available to the participant resolver for
 * historic-scorecard rendering.
 */
export async function softDeleteCustomPlayer(
  customPlayerId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(CUSTOM_PLAYERS_TABLE)
    .update({ deleted_at: now, updated_at: now })
    .eq('id', customPlayerId);
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: ['custom_players'] });
}

/**
 * Future-use: rename a custom player. Wired in for completeness;
 * no UI hookup yet.
 */
export async function renameCustomPlayer(
  customPlayerId: string,
  rawNickname: string
): Promise<void> {
  const nickname = rawNickname.trim();
  if (nickname.length === 0) {
    throw new Error('Nickname is required');
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(CUSTOM_PLAYERS_TABLE)
    .update({ nickname, updated_at: now })
    .eq('id', customPlayerId);
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: ['custom_players'] });
}

export type CustomPlayerListRow = {
  id: string;
  nickname: string | null;
  avatar_color: string | null;
  deleted_at: string | null;
};

export function customPlayersListKey(userId: string | null) {
  return ['custom_players', 'list', userId] as const;
}

/**
 * Active (non-soft-deleted) custom players owned by the user, for the
 * round player picker. Keyed under the `custom_players` prefix so the
 * CRUD helpers' `invalidateQueries(['custom_players'])` refresh it.
 */
export function useCustomPlayers(userId: string | null): {
  customPlayers: CustomPlayerListRow[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<CustomPlayerListRow[]>({
    queryKey: customPlayersListKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(CUSTOM_PLAYERS_TABLE)
        .select('id, nickname, avatar_color, deleted_at')
        .eq('owner_user_id', userId as string)
        .is('deleted_at', null);
      if (error) throw error;
      return (data ?? []) as CustomPlayerListRow[];
    },
  });
  return { customPlayers: data ?? [], isLoading };
}
