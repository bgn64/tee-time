/**
 * Helpers for building `AvatarMember[]` clusters out of a Round's scorers.
 *
 * Shared between the live-scoring screen and the round-detail edit screen
 * so they resolve scramble team members identically — full live identity
 * chain (account → profileCache → roster fallback) with a final fall-back
 * to the local roster keyed by `participantKey` so mid-scoring rounds
 * (whose participant entries are seeded with only `{participantKey, teeId,
 * teamId}`) still render real names.
 *
 * Mirrors the resolution pattern used by `components/ReadOnlyScorecard.tsx`.
 */

import { resolveParticipantIdentity } from '@/lib/participantIdentity';
import type { Account } from '@/types/account';
import type { Player, Round, RoundParticipant } from '@/types/golf';
import type { ProfileSummary } from '@/types/social';

import type { AvatarMember } from '@/components/TeamAvatarCluster';

export type ScorerMembersDeps = {
  account: Account | null;
  profileCache: Record<string, ProfileSummary>;
  allPlayers: Player[];
  /** Used when neither the resolver nor the roster fallback yields a color. */
  fallbackColor: string;
};

/**
 * Resolve a single participant to an `AvatarMember`. Linked / locally-named
 * participants use the resolver; otherwise we fall back to the local roster
 * by `participantKey`.
 */
export function resolveParticipantMember(
  p: RoundParticipant,
  deps: ScorerMembersDeps
): AvatarMember {
  const identity = resolveParticipantIdentity(p, {
    account: deps.account,
    profileCache: deps.profileCache,
    allPlayers: deps.allPlayers,
  });

  let name: string;
  let color: string | undefined;
  if (p.linkedUserId || p.localDisplayName) {
    name = identity.displayName;
    color = identity.color;
  } else {
    const roster = deps.allPlayers.find((q) => q.id === p.participantKey);
    name = roster?.displayName ?? roster?.nickname ?? identity.displayName;
    color = roster?.color ?? identity.color;
  }

  return {
    id: p.participantKey,
    name,
    color: color ?? deps.fallbackColor,
  };
}

/**
 * Members belonging to a single team, resolved through the live identity
 * chain. Returned in the order they appear in `round.participants`.
 */
export function buildTeamMembers(
  round: Round,
  teamId: string,
  deps: ScorerMembersDeps
): AvatarMember[] {
  return (round.participants ?? [])
    .filter((p) => p.teamId === teamId)
    .map((p) => resolveParticipantMember(p, deps));
}
