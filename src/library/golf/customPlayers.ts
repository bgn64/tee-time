/**
 * CRUD helpers for `custom_players` — the user-scoped roster of
 * off-app people the user plays rounds with.
 *
 * Writes go through PowerSync's CRUD upload queue
 * (`powersync.writeTransaction` → `SupabaseConnector.uploadData` →
 * Supabase). No SECURITY DEFINER RPCs are needed because the
 * integrity contract is single-row and RLS already scopes access
 * to the owner.
 *
 * `softDeleteCustomPlayer` flips `deleted_at` (and bumps
 * `updated_at` so the sync replicator dirties the row on other
 * devices). The row STAYS synced — the picker filters
 * `WHERE deleted_at IS NULL` locally, but the scorecard resolver
 * intentionally does not, so historic rounds keep rendering the
 * deleted player.
 */

import { pickAvatarColor } from '@/library/social/avatarColors';
import { CUSTOM_PLAYERS_TABLE } from '@/library/powersync/AppSchema';
import type { System } from '@/library/powersync/system';
import { newCustomPlayerId } from './ids';

export type CreateCustomPlayerResult = {
  /** New row's id — caller uses this to build a `custom:{id}` participantKey. */
  id: string;
  nickname: string;
  avatarColor: string;
};

export async function createCustomPlayer(
  system: System,
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
  await system.powersync.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO ${CUSTOM_PLAYERS_TABLE}
         (id, owner_user_id, nickname, avatar_color,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [id, ownerUserId, nickname, avatarColor, now, now]
    );
  });
  return { id, nickname, avatarColor };
}

/**
 * Soft-delete: stamp `deleted_at` so the row vanishes from the
 * picker but stays available to the participant resolver for
 * historic-scorecard rendering.
 */
export async function softDeleteCustomPlayer(
  system: System,
  customPlayerId: string
): Promise<void> {
  const now = new Date().toISOString();
  await system.powersync.execute(
    `UPDATE ${CUSTOM_PLAYERS_TABLE}
       SET deleted_at = ?, updated_at = ?
       WHERE id = ?`,
    [now, now, customPlayerId]
  );
}

/**
 * Future-use: rename a custom player. Wired in for completeness;
 * no UI hookup yet.
 */
export async function renameCustomPlayer(
  system: System,
  customPlayerId: string,
  rawNickname: string
): Promise<void> {
  const nickname = rawNickname.trim();
  if (nickname.length === 0) {
    throw new Error('Nickname is required');
  }
  const now = new Date().toISOString();
  await system.powersync.execute(
    `UPDATE ${CUSTOM_PLAYERS_TABLE}
       SET nickname = ?, updated_at = ?
       WHERE id = ?`,
    [nickname, now, customPlayerId]
  );
}
