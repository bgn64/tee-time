/**
 * Participant key — namespacing for `scorecards.participants[*].participantKey`.
 *
 * A scorecard can have three kinds of participants:
 *
 *   user:{uuid}    — the signed-in user OR one of their friends. Resolves
 *                    via the `profiles` table (own_profile / friend_profiles
 *                    sync streams, with a tier-3 direct Supabase fetch for
 *                    ex-friends).
 *   custom:{uuid}  — a custom (off-app) player owned by the signed-in user.
 *                    Resolves via `custom_players`. Soft-deleted rows still
 *                    resolve — the resolver intentionally ignores
 *                    `deleted_at` so historic scorecards keep rendering
 *                    correctly.
 *   legacy raw id  — pre-prefix scorecards used unprefixed seed ids like
 *                    `'player-you'`. The resolver falls back to
 *                    `findSeedPlayer` for those so in-flight rounds from
 *                    the seeded era still render.
 *
 * Two helpers build the canonical form; one parses an arbitrary key into
 * a discriminated union so consumers can pattern-match without scanning
 * the string twice.
 */

export type ParsedParticipantKey =
  | { kind: 'user'; userId: string }
  | { kind: 'custom'; customPlayerId: string }
  | { kind: 'legacy'; rawId: string };

const USER_PREFIX = 'user:';
const CUSTOM_PREFIX = 'custom:';

export function userParticipantKey(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

export function customParticipantKey(customPlayerId: string): string {
  return `${CUSTOM_PREFIX}${customPlayerId}`;
}

export function parseParticipantKey(key: string): ParsedParticipantKey {
  if (key.startsWith(USER_PREFIX)) {
    return { kind: 'user', userId: key.slice(USER_PREFIX.length) };
  }
  if (key.startsWith(CUSTOM_PREFIX)) {
    return { kind: 'custom', customPlayerId: key.slice(CUSTOM_PREFIX.length) };
  }
  return { kind: 'legacy', rawId: key };
}

/** True when the key was minted with the new prefixed format. */
export function isPrefixedParticipantKey(key: string): boolean {
  return key.startsWith(USER_PREFIX) || key.startsWith(CUSTOM_PREFIX);
}
