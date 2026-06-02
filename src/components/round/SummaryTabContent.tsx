/**
 * SummaryTabContent — Phase 1 baseline for the Summary tab body.
 *
 * Renders one row per scorer with avatar(s), name, tee chip, and the
 * scorer's hero score on the right (current ±total + `THRU N`
 * sub-label while in-flight). No accordion, no aggregate tiles yet —
 * Phase 5 grows this with inline per-scorer aggregate metrics
 * (Fairways / GIR / OB / Sand) and scramble team-contribution rows.
 *
 * Derivations match `ScorerStack`: stroke rounds get one row per
 * participant; scramble rounds get one row per team. Display
 * identity comes from `useParticipantResolver`; running totals come
 * from `playerProgress` so the row matches every other surface.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScorerSummaryRow } from './ScorerSummaryRow';
import { SummaryAggregateTiles } from './SummaryAggregateTiles';
import { TeamContributionRow } from './TeamContributionRow';
import { type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import {
  computeScorerAggregates,
  filterAggregatesByEnabled,
} from '@/library/golf/aggregateStats';
import {
  effectiveEnabledTags,
} from '@/library/golf/achievementTags';
import { findTee } from '@/library/golf/courseHelpers';
import {
  formatScore,
  holesInRange,
  playerProgress,
} from '@/library/golf/scoring';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useRoundAchievementTags } from '@/library/golf/useRoundAchievementTags';
import {
  summarizeContributions,
  useRoundShotAttributions,
} from '@/library/golf/useRoundShotAttributions';
import { useRoundTrackedStats } from '@/library/golf/useRoundTrackedStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round, Tee } from '@/types/golf';

type Props = {
  round: Round;
};

type Scorer = {
  id: string;
  name: string;
  members: AvatarMember[];
};

export function SummaryTabContent({ round }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const resolver = useParticipantResolver(round.playerIds ?? []);
  const { rows: tagRows } = useRoundAchievementTags(round.id);
  const { getOverride } = useRoundTrackedStats(round.id);
  const { rows: shotRows } = useRoundShotAttributions(round.id);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const isCompleted = !!round.completedAt;

  const visibleHoles = useMemo(
    () => holesInRange(round.course.holes, round.holeRange),
    [round.course.holes, round.holeRange]
  );

  const scorers: Scorer[] = useMemo(() => {
    if (isScramble) {
      return (round.teams ?? []).map((team) => {
        const members: AvatarMember[] = team.playerIds.map((pid) => {
          const r = resolver.get(pid);
          return {
            id: pid,
            name: r?.displayName || 'Player',
            color: r?.avatarColor || colors.primary,
          };
        });
        return { id: team.id, name: team.name, members };
      });
    }
    return (round.playerIds ?? []).map((pid) => {
      const r = resolver.get(pid);
      const name = r?.displayName || 'Player';
      const color = r?.avatarColor || colors.primary;
      return {
        id: pid,
        name,
        members: [{ id: pid, name, color }],
      };
    });
  }, [isScramble, round.teams, round.playerIds, resolver, colors.primary]);

  function resolveScorerTee(scorerId: string): Tee | undefined {
    if (isScramble) {
      const team = round.teams?.find((t) => t.id === scorerId);
      const firstMember = team?.playerIds[0];
      if (!firstMember) return undefined;
      const p = round.participants.find(
        (q) => q.participantKey === firstMember
      );
      return findTee(round.course, p?.teeId);
    }
    const p = round.participants.find((q) => q.participantKey === scorerId);
    return findTee(round.course, p?.teeId);
  }

  return (
    <View style={styles.list}>
      {scorers.map((s, i) => {
        const progress = playerProgress(round, s.id);
        const hasScores = progress.thru > 0;
        const scoreText = hasScores ? formatScore(progress.rel) : 'E';
        const tone: 'over' | 'under' | 'even' = !hasScores
          ? 'even'
          : progress.rel > 0
            ? 'over'
            : progress.rel < 0
              ? 'under'
              : 'even';
        const thruText =
          !isCompleted && hasScores
            ? `THRU ${progress.thru}`
            : isCompleted
              ? 'FINAL'
              : undefined;

        const tee = resolveScorerTee(s.id);

        // Aggregate tiles — derived from the scorer's tag rows
        // filtered through their per-round enabled set. Empty array
        // (e.g. scorer turned every stat off) → SummaryAggregateTiles
        // renders nothing.
        const rawAggregates = computeScorerAggregates(
          tagRows,
          s.id,
          visibleHoles
        );
        const enabled = effectiveEnabledTags(round.scoringRule, getOverride(s.id));
        const tiles = filterAggregatesByEnabled(rawAggregates, enabled);

        return (
          <View key={s.id} style={i > 0 ? styles.rowSep : styles.row}>
            <ScorerSummaryRow
              members={s.members}
              name={s.name}
              tee={tee ?? null}
              scoreText={scoreText}
              tone={tone}
              scoreSub={thruText}
            />
            <SummaryAggregateTiles tiles={tiles} />
            {isScramble ? (
              <TeamContributionRow
                contributions={summarizeContributions(
                  shotRows,
                  s.id,
                  s.members.map((m) => m.id)
                )}
                members={s.members}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      paddingHorizontal: 18,
      paddingTop: 4,
      paddingBottom: 8,
    },
    row: {
      paddingVertical: 10,
    },
    rowSep: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      paddingTop: 10,
      paddingBottom: 10,
    },
  });
}
