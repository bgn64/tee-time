/**
 * Resolve display strings for a participant on a round.
 *
 * The destination app's `scorerNames.ts` is ~190 lines because it
 * resolves linked friend accounts via a profile cache, an account
 * provider, and live OnboardingContext nicknames. Our port drops all
 * of that: every participant has a `participantKey` that maps to a
 * seed player id, and that's it. The function still returns the
 * same `NameSegment[]` shape so `ScoreEntryRow` and `ReadOnlyScorecard`
 * can render an array of inline runs (one entry per participant) the
 * way the destination does — just without the linked-friend pressable
 * branch.
 */

import { findSeedPlayer } from '@/data/players';
import type { Round } from '@/types/golf';

export type NameSegment = {
  key: string;
  text: string;
  linked: boolean;
};

export function nameForParticipantKey(participantKey: string): string {
  return findSeedPlayer(participantKey)?.nickname ?? 'Player';
}

export function buildNameSegments(round: Round, scorerId: string): NameSegment[] {
  const participant = round.participants.find((p) => p.participantKey === scorerId);
  if (!participant) {
    return [{ key: scorerId, text: nameForParticipantKey(scorerId), linked: false }];
  }
  return [
    {
      key: participant.participantKey,
      text: nameForParticipantKey(participant.participantKey),
      linked: false,
    },
  ];
}

/** Short single-string label used in compact UI (avatars, headers). */
export function shortNameForScorer(round: Round, scorerId: string): string {
  return buildNameSegments(round, scorerId)
    .map((s) => s.text)
    .join('');
}
