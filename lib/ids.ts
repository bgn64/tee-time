/**
 * Id generators for entities created locally.
 *
 * UUID v4 from `expo-crypto`, which provides a single `randomUUID()` surface
 * on both web and native. We don't migrate existing rows — entities created
 * before this change keep their timestamp-based ids — but every new row from
 * this point forward uses UUIDs.
 *
 * Friend-linked roster rows are an intentional exception: they use the
 * deterministic id `player-${userId}` so the partial-unique DB index on
 * (owner_user_id, linked_user_id) can prevent duplicates from races. See
 * `ensureRosterForFriend` in `state/PlayerContext.tsx`.
 */

import * as Crypto from 'expo-crypto';

export function newRoundId(): string {
  return Crypto.randomUUID();
}

export function newPlayerId(): string {
  return Crypto.randomUUID();
}

export function newCourseId(): string {
  return Crypto.randomUUID();
}
