/**
 * Resolve a participant's current display name + color for rendering.
 *
 * v7 rendering rules:
 *   - Linked participants render LIVE from the current profile (the
 *     viewer's own account, the SocialContext's `profileCache`, or — as a
 *     fallback — a roster entry whose `userId` matches).
 *   - Unlinked participants have no live source; their `unlinkedDisplayName`
 *     / `unlinkedDisplayColor` snapshot (captured by the scorer at Round-
 *     completion time) is used directly.
 *
 * This helper is the single place any UI surface should go to ask "what
 * does this participant look like right now?" — keeps the resolution order
 * consistent across ReadOnlyScorecard, the feed card, the round detail,
 * and anywhere else.
 */
import type { Account } from '@/types/account';
import type { Player, RoundParticipant } from '@/types/golf';
import type { ProfileSummary } from '@/types/social';

export type ResolvedIdentity = {
  displayName: string;
  color?: string;
  handle?: string;
};

export type IdentityContext = {
  account: Account | null;
  profileCache: Record<string, ProfileSummary>;
  /** Owner's local roster. Used as a last-resort fallback when profileCache misses. */
  allPlayers: Player[];
};

export function resolveParticipantIdentity(
  participant: RoundParticipant,
  ctx: IdentityContext
): ResolvedIdentity {
  const { linkedUserId } = participant;

  if (linkedUserId) {
    if (ctx.account && ctx.account.userId === linkedUserId) {
      return {
        displayName: ctx.account.displayName,
        color: ctx.account.avatarColor,
        handle: ctx.account.handle,
      };
    }
    const cached = ctx.profileCache[linkedUserId];
    if (cached) {
      return {
        displayName: cached.displayName,
        color: cached.avatarColor,
        handle: cached.handle,
      };
    }
    const rosterMatch = ctx.allPlayers.find((p) => p.userId === linkedUserId);
    if (rosterMatch) {
      return {
        displayName: rosterMatch.displayName ?? rosterMatch.nickname,
        color: rosterMatch.color,
        handle: rosterMatch.handle,
      };
    }
    return { displayName: 'Friend' };
  }

  return {
    displayName: participant.unlinkedDisplayName ?? 'Player',
    color: participant.unlinkedDisplayColor,
  };
}
