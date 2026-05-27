/**
 * Resolve display strings for a participant on a round.
 *
 * Pure helpers — the resolver map is built outside (typically by
 * `useParticipantResolver`) and passed in. Keeps this module
 * side-effect-free and easy to test, and avoids the destination
 * app's friend-graph/profile-cache wiring entirely.
 *
 * The fallback chain is intentional: when a resolver miss happens
 * (e.g., offline + ex-friend, or a custom player whose row hasn't
 * synced yet), we surface a generic "Player" placeholder rather
 * than crash.
 */

import type { ResolvedParticipant } from './useParticipantResolver';
import type { Round } from '@/types/golf';

export type NameSegment = {
  key: string;
  text: string;
  linked: boolean;
};

export type ParticipantResolver = Map<string, ResolvedParticipant>;

export function nameForParticipantKey(
  participantKey: string,
  resolver: ParticipantResolver
): string {
  return resolver.get(participantKey)?.displayName || 'Player';
}

export function buildNameSegments(
  round: Round,
  scorerId: string,
  resolver: ParticipantResolver
): NameSegment[] {
  const participant = round.participants.find((p) => p.participantKey === scorerId);
  const key = participant?.participantKey ?? scorerId;
  return [
    {
      key,
      text: nameForParticipantKey(key, resolver),
      linked: !!resolver.get(key)?.userId
    }
  ];
}

/** Short single-string label used in compact UI (avatars, headers). */
export function shortNameForScorer(
  round: Round,
  scorerId: string,
  resolver: ParticipantResolver
): string {
  return buildNameSegments(round, scorerId, resolver)
    .map((s) => s.text)
    .join('');
}
