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
  _system: unknown,
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
  _system: unknown,
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
  _system: unknown,
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
