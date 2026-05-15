/**
 * Id generators for entities created locally.
 *
 * Inline RFC4122 v4 UUID via Math.random. Originally backed by
 * `expo-crypto`, but `expo-crypto`'s `randomUUID` is exported through its
 * AES submodule (`ExpoCryptoAES`), which Expo Go does not bundle — so any
 * import of `expo-crypto` crashed Android Expo Go at module load with
 * `Cannot find native module 'ExpoCryptoAES'`. We don't need
 * cryptographic randomness for these ids (we're after uniqueness, not
 * unpredictability), so a plain `Math.random` v4 generator suffices and
 * works identically on web + native + Expo Go + dev client.
 *
 * We don't migrate existing rows — entities created before this change
 * keep their timestamp-based ids — but every new row from this point
 * forward uses UUIDs.
 *
 * Friend-linked roster rows are an intentional exception: they use the
 * deterministic id `player-${userId}` so the partial-unique DB index on
 * (owner_user_id, linked_user_id) can prevent duplicates from races. See
 * `ensureRosterForFriend` in `state/PlayerContext.tsx`.
 */

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function newRoundId(): string {
  return uuidv4();
}

export function newPlayerId(): string {
  return uuidv4();
}

export function newCourseId(): string {
  return uuidv4();
}
