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
import { StyleSheet, Text, View } from 'react-native';

import { ProgressDial } from '@/components/aurora';
import { TeamAvatarCluster, type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
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
   * When set, the summary leads with a big course-name title + context
   * line (the feed card passes this so the course is the body hero,
   * mirroring the mockup). Detail surfaces leave it undefined — their
   * header already shows the course.
   */
  leadCourseName?: string | null;
  /** Secondary line under the lead course title (e.g. "18 holes"). */
  leadContext?: string | null;
};

export function SummaryTabContent({ round, leadCourseName, leadContext }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scorers = useRoundScorers(round);
  const { rows: detailsRows } = useRoundHoleDetails(round.id);
  const { rows: shotRows } = useRoundShotAttributions(round.id);
  const engagement = useRoundStatEngagement(round.id);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

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

  const single = scorers.length === 1;

  return (
    <View style={styles.list}>
      {leadCourseName ? (
        <View style={styles.lead}>
          <Text style={styles.leadTitle} numberOfLines={2}>
            {leadCourseName}
          </Text>
          {leadContext ? (
            <Text style={styles.leadContext}>{leadContext}</Text>
          ) : null}
        </View>
      ) : null}
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
        // Always show "THRU N" (N = holes played) — completed rounds
        // included — so the reader knows how many holes the score covers
        // without needing the course length. No "FINAL" label.
        const thruText = hasScores ? `THRU ${progress.thru}` : undefined;

        const totalHoles = visibleHoles.length || 18;
        const fraction = totalHoles > 0 ? progress.thru / totalHoles : 0;
        const ringColor =
          tone === 'over'
            ? colors.accent
            : tone === 'even'
              ? colors.cyan
              : colors.lime;

        const teeMeta = s.tee
          ? s.tee.totalYardage
            ? `${s.tee.name} · ${s.tee.totalYardage.toLocaleString()} yds`
            : s.tee.name
          : null;

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
          <View key={s.id} style={i > 0 ? styles.blockSep : styles.block}>
            {!single ? (
              <View style={styles.idRow}>
                <TeamAvatarCluster
                  members={s.members}
                  size="sm"
                  ringColor={colors.cardBg}
                />
                <Text style={styles.handle} numberOfLines={1}>
                  {joinHandles(s.members)}
                </Text>
                {thruText ? <Text style={styles.thru}>{thruText}</Text> : null}
              </View>
            ) : null}
            <View style={styles.ringRow}>
              <ProgressDial
                value={scoreText}
                label="TO PAR"
                fraction={fraction}
                size={single ? 96 : 76}
                progressColor={ringColor}
              />
              <View style={styles.legend}>
                {single && thruText ? (
                  <Text style={styles.thruLead}>{thruText}</Text>
                ) : null}
                {teeMeta ? (
                  <Text style={styles.teeMeta} numberOfLines={1}>
                    {teeMeta}
                  </Text>
                ) : null}
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
            </View>
          </View>
        );
      })}
    </View>
  );
}

function joinHandles(members: readonly AvatarMember[]): string {
  const names = members.map((m) => m.handle ?? m.name);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 12,
    },
    lead: {
      marginBottom: 14,
    },
    leadTitle: {
      fontSize: 20,
      fontWeight: '900',
      letterSpacing: -0.3,
      color: colors.textTitle,
    },
    leadContext: {
      marginTop: 3,
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    block: {
      paddingVertical: 4,
    },
    blockSep: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
      paddingTop: 14,
      marginTop: 12,
    },
    idRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    handle: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    thru: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    ringRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    legend: {
      flex: 1,
      minWidth: 0,
    },
    thruLead: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 4,
    },
    teeMeta: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
  });
}
