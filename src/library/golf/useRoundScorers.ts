/**
 * useRoundScorers — canonical scorer list for a round.
 *
 * "Scorer" is whichever entity owns a row of scores: a single
 * participant in a stroke round, or a team in scramble. Three places
 * in the codebase need the same projection — the Summary tab, the
 * Holes viewing tab, and the Holes scoring tab — and they were each
 * computing it separately, which is a recipe for the surfaces drifting
 * apart (e.g. one resolves a tee differently than the other).
 *
 * The hook bundles:
 *   - scorer identity (id, display name, ordered AvatarMembers)
 *   - tee resolution via the round's participants list
 *
 * For stroke rounds: one entry per participant. For scramble rounds
 * with teams: one entry per team. The team's tee follows the first
 * member's participant tee (matches the existing rule).
 *
 * Read-only — all writes still go through the round-context / hooks.
 */

import { useMemo } from 'react';

import { type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import { findTee } from '@/library/golf/courseHelpers';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round, Tee } from '@/types/golf';

export type RoundScorer = {
  /** Stable scorer id — participantKey for stroke, team.id for scramble. */
  id: string;
  /** Display name (player name or team name). */
  name: string;
  /** Avatar member list — one entry for stroke, all team members for scramble. */
  members: AvatarMember[];
  /** Resolved tee for the scorer, or undefined when no tee is selected. */
  tee?: Tee;
  /** Linked user id (stroke only); enables tap-to-profile from scorecard cells. */
  userId?: string;
};

export function useRoundScorers(round: Round): RoundScorer[] {
  const { colors } = useTheme();
  const resolver = useParticipantResolver(round.playerIds ?? []);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  return useMemo<RoundScorer[]>(() => {
    if (isScramble) {
      return (round.teams ?? []).map((team) => {
        const members: AvatarMember[] = team.playerIds.map((pid) => {
          const r = resolver.get(pid);
          return {
            id: pid,
            name: r?.displayName || 'Player',
            color: r?.avatarColor || colors.primary,
            handle: r?.handle,
          };
        });
        // Team tee follows the first member's participant entry. The
        // SAME rule is applied wherever a scramble team's tee needs
        // to be resolved (HorizontalScorecard, SummaryTabContent, ...);
        // bundling it here keeps surfaces in lockstep.
        const firstMember = team.playerIds[0];
        const teeId = firstMember
          ? round.participants.find((p) => p.participantKey === firstMember)
              ?.teeId
          : undefined;
        return {
          id: team.id,
          name: team.name,
          members,
          tee: findTee(round.course, teeId),
        };
      });
    }
    return (round.playerIds ?? []).map((pid) => {
      const r = resolver.get(pid);
      const name = r?.displayName || 'Player';
      const color = r?.avatarColor || colors.primary;
      const teeId = round.participants.find(
        (p) => p.participantKey === pid
      )?.teeId;
      return {
        id: pid,
        name,
        members: [{ id: pid, name, color, handle: r?.handle }],
        tee: findTee(round.course, teeId),
        userId: r?.userId,
      };
    });
  }, [
    isScramble,
    round.teams,
    round.playerIds,
    round.participants,
    round.course,
    resolver,
    colors.primary,
  ]);
}
