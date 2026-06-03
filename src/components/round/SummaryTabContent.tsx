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
import {
  computeScorerAggregates,
  filterAggregatesByEnabled,
} from '@/library/golf/aggregateStats';
import {
  effectiveEnabledTags,
} from '@/library/golf/achievementTags';
import {
  formatScore,
  holesInRange,
  playerProgress,
} from '@/library/golf/scoring';
import { useRoundAchievementTags } from '@/library/golf/useRoundAchievementTags';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import {
  summarizeContributions,
  useRoundShotAttributions,
} from '@/library/golf/useRoundShotAttributions';
import { useRoundStatEngagement } from '@/library/golf/useRoundStatEngagement';
import { useRoundTrackedStats } from '@/library/golf/useRoundTrackedStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  /**
   * When set, the tee chip below each scorer's name becomes a
   * Pressable that calls back with the scorer's id. Used by the
   * scoring/editing surface so the user can change tees from Summary
   * mid-round. Read-only surfaces (feed cards, completed-round
   * detail) leave it undefined and the chip renders bare.
   */
  onPressTeeForScorer?: (scorerId: string) => void;
};

export function SummaryTabContent({ round, onPressTeeForScorer }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scorers = useRoundScorers(round);
  const { rows: tagRows } = useRoundAchievementTags(round.id);
  const { getOverride } = useRoundTrackedStats(round.id);
  const { rows: shotRows } = useRoundShotAttributions(round.id);
  const engagement = useRoundStatEngagement(round.id);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const isCompleted = !!round.completedAt;

  const visibleHoles = useMemo(
    () => holesInRange(round.course.holes, round.holeRange),
    [round.course.holes, round.holeRange]
  );

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

        // Stat tiles are gated on (a) the scorer having engaged with
        // the stats feature at all (any tag row / override / shot
        // attribution), and (b) the result of their per-round
        // enabled-set filter. Pre-feature rounds never engaged, so
        // they show no tiles — matching the user's expectation that
        // old rounds shouldn't surface a row of zeros.
        const tiles = engagement.hasFor(s.id)
          ? filterAggregatesByEnabled(
              computeScorerAggregates(tagRows, s.id, visibleHoles),
              effectiveEnabledTags(round.scoringRule, getOverride(s.id))
            )
          : [];

        return (
          <View key={s.id} style={i > 0 ? styles.rowSep : styles.row}>
            <ScorerSummaryRow
              members={s.members}
              name={s.name}
              tee={s.tee ?? null}
              scoreText={scoreText}
              tone={tone}
              scoreSub={thruText}
              onPressTee={
                onPressTeeForScorer
                  ? () => onPressTeeForScorer(s.id)
                  : undefined
              }
            />
            <SummaryAggregateTiles tiles={tiles} />
            {isScramble && engagement.hasFor(s.id) ? (
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
