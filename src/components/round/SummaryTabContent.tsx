/**
 * SummaryTabContent — per-scorer summary row + (when stats are
 * tracked for the scorer) an inline aggregate tile strip.
 *
 * Tiles are built here, not in a helper, because the per-stat
 * type discrimination + tone wiring is small enough that a
 * separate helper would just hide the structure. The renderer
 * (`SummaryAggregateTiles`) only owns presentation.
 *
 * Derivations match `ScorerStack`: stroke rounds get one row per
 * participant; scramble rounds get one row per team. Display
 * identity comes from `useParticipantResolver`; running totals
 * come from `playerProgress` so the row matches every other
 * surface.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScorerSummaryRow } from './ScorerSummaryRow';
import {
  SummaryAggregateTiles,
  type AggregateTile,
} from './SummaryAggregateTiles';
import { TeamContributionRow } from './TeamContributionRow';
import {
  aggregateBinary,
  aggregateInteger,
} from '@/library/golf/aggregateHoleDetails';
import {
  BUILT_IN_STATS,
  getStat,
} from '@/library/golf/builtInStats';
import {
  formatScore,
  holesInRange,
  playerProgress,
} from '@/library/golf/scoring';
import { useRoundHoleDetails } from '@/library/golf/useRoundHoleDetails';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import {
  summarizeContributions,
  useRoundShotAttributions,
} from '@/library/golf/useRoundShotAttributions';
import { useRoundStatEngagement } from '@/library/golf/useRoundStatEngagement';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  /**
   * When set, the tee chip below each scorer's name becomes a
   * Pressable that calls back with the scorer's id. Used by the
   * scoring/editing surface so the user can change tees from
   * Summary mid-round. Read-only surfaces (feed cards,
   * completed-round detail) leave it undefined and the chip
   * renders bare.
   */
  onPressTeeForScorer?: (scorerId: string) => void;
};

export function SummaryTabContent({ round, onPressTeeForScorer }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scorers = useRoundScorers(round);
  const { rows: detailsRows } = useRoundHoleDetails(round.id);
  const { rows: shotRows } = useRoundShotAttributions(round.id);
  const engagement = useRoundStatEngagement(round.id);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const isCompleted = !!round.completedAt;

  const visibleHoles = useMemo(
    () => holesInRange(round.course.holes, round.holeRange),
    [round.course.holes, round.holeRange]
  );

  // Resolve the round's enabled stat keys to definitions, in
  // canonical registry order. Unknown keys (e.g., a future custom
  // stat the client doesn't know about) are skipped.
  const enabledStats = useMemo(() => {
    const enabledSet = new Set(round.enabledStatKeys);
    return BUILT_IN_STATS.filter((s) => enabledSet.has(s.key));
  }, [round.enabledStatKeys]);

  const trackedSet = useMemo(
    () => new Set(round.trackedScorerIds),
    [round.trackedScorerIds]
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

        // Stat tiles are gated on (a) the scorer being in the
        // round's tracked set AND (b) actually having engaged with
        // any stat. Pre-feature rounds + scorers who never tagged
        // anything show no tiles.
        const tracked = trackedSet.has(s.id);
        const tiles: AggregateTile[] =
          tracked && engagement.hasFor(s.id)
            ? enabledStats.map((stat) => {
                const def = getStat(stat.key);
                if (!def) {
                  return {
                    kind: 'integer',
                    label: stat.label,
                    sum: 0,
                    totalApplicable: 0,
                    tone: 'neutral',
                  };
                }
                if (def.type === 'binary') {
                  const agg = aggregateBinary(detailsRows, s.id, def, visibleHoles);
                  return {
                    kind: 'binary',
                    label: def.label,
                    num: agg.num,
                    denom: agg.denom,
                    totalApplicable: agg.totalApplicable,
                    tone: def.yesTone,
                  };
                }
                const agg = aggregateInteger(detailsRows, s.id, def, visibleHoles);
                return {
                  kind: 'integer',
                  label: def.label,
                  sum: agg.sum,
                  totalApplicable: agg.totalApplicable,
                  tone: def.aggregateTone,
                };
              })
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
