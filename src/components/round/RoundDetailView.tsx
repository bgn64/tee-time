/**
 * RoundDetailView — Aurora Glass round detail lane.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CommentsSection } from './CommentsSection';
import { CourseBanner } from './CourseBanner';
import type { OverflowItem } from './HeaderOverflowMenu';
import { RoundScorecardGrid } from './RoundScorecardGrid';
import { GlassCard, NumericText, SectionLabel, StatChip, StatTile } from '@/components/aurora';
import {
  aggregateBinary,
  aggregateInteger,
} from '@/library/golf/aggregateHoleDetails';
import {
  applicableStatsForHole,
  enabledStatDefinitions,
} from '@/library/golf/builtInStats';
import { yardageForHoleRange } from '@/library/golf/courseHelpers';
import { isCustomStatKey } from '@/library/golf/customStats';
import { displayStatName } from '@/library/golf/statDisplay';
import {
  performanceToneColor,
  useRoundPerformance,
  userIdForScorer,
} from '@/library/golf/performanceBenchmark';
import {
  formatRelativeTime,
  formatScore,
  holesInRange,
  playerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import {
  useRoundHoleDetails,
  type HoleDetailsRow,
} from '@/library/golf/useRoundHoleDetails';
import { useRoundScorers, type RoundScorer } from '@/library/golf/useRoundScorers';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  profileRoutePrefix: string;
  overflowActions?: OverflowItem[];
};

type QuickStats = {
  fir: string;
  firState: 'on' | 'no' | 'neutral';
  gir: string;
  girState: 'on' | 'no' | 'neutral';
};

type StatSummary = {
  key: string;
  label: string;
  value: string;
  tone: 'default' | 'lime' | 'cyan' | 'danger';
  custom: boolean;
};

export function RoundDetailView({
  round,
  profileRoutePrefix,
  overflowActions,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const { profile: ownerProfile } = useProfile(round.ownerUserId ?? null);
  const { count: commentCount } = useCommentSummary(round.id);
  const scorers = useRoundScorers(round);
  const { rows: detailRows, getValues } = useRoundHoleDetails(round.id);

  const isInProgress = !round.completedAt;
  const timeText = formatRelativeTime(
    isInProgress ? round.lastScoreAt ?? round.startedAt : round.completedAt ?? round.startedAt
  );

  const ownerUserId = round.ownerUserId ?? '';
  const onPressOwner = ownerUserId
    ? () => router.push(`${profileRoutePrefix}/${ownerUserId}` as never)
    : undefined;

  const primaryScorerId =
    (round.ownerUserId
      ? scorerIdForUser(round, round.ownerUserId)
      : undefined) ?? scorers[0]?.id;
  const primaryScorer = scorers.find(
    (scorer) => scorer.id === primaryScorerId
  );
  const progress = primaryScorer ? playerProgress(round, primaryScorer.id) : { rel: 0, thru: 0 };
  const performance = useRoundPerformance(
    round,
    primaryScorer?.id,
    userIdForScorer(round, primaryScorer?.id)
  );
  const performanceColor = performanceToneColor(colors, performance.tone);
  const quickStats = computeQuickStats(round, primaryScorer, getValues);
  const statSummaries = computeStatSummaries(
    round,
    primaryScorer,
    detailRows
  );
  const courseSubline = formatCourseSubline(round, primaryScorer, progress.thru);
  const ownerKey = round.ownerUserId ? `user:${round.ownerUserId}` : null;
  const bannerSubtitle = useMemo(
    () => formatBannerSubtitle(round, scorers, ownerKey),
    [round, scorers, ownerKey]
  );

  return (
    <View style={styles.shell}>
      <GlassCard style={styles.bannerCard} glow>
        <CourseBanner
          handle={ownerProfile?.handle}
          displayName={ownerProfile?.displayName}
          avatarColor={ownerProfile?.avatarColor}
          avatarSeed={round.ownerUserId}
          courseName={round.course.name}
          subtitle={bannerSubtitle}
          timeText={timeText}
          isLive={isInProgress}
          onPressOwner={onPressOwner}
          overflowActions={overflowActions}
        />
        <View style={styles.courseBlock}>
          <Text style={styles.courseTitle}>{round.course.name}</Text>
          <Text style={styles.courseSubline}>{courseSubline}</Text>
        </View>
        <View style={styles.heroStrip}>
          <NumericText style={[styles.heroScore, { color: performanceColor }]}>
            {formatScore(progress.rel)}
          </NumericText>
          <Text style={styles.heroLabel}>to par{progress.thru ? `\nthru ${progress.thru}` : ''}</Text>
          <View style={styles.quickStats}>
            <StatChip label="FIR" value={quickStats.fir} state={quickStats.firState} style={styles.quickChip} />
            <StatChip label="GIR" value={quickStats.gir} state={quickStats.girState} style={styles.quickChip} />
          </View>
        </View>
      </GlassCard>

      <GlassCard padded={false} style={styles.detailCard}>
        <RoundScorecardGrid
          round={round}
          scorers={scorers}
          performanceColor={performanceColor}
        />
      </GlassCard>

      {statSummaries.length > 0 ? (
        <View>
          <SectionLabel
            right={
              <Text style={styles.statProgressLabel}>
                {scorers.length > 1 && primaryScorer
                  ? `${primaryScorer.name} · `
                  : ''}
                {progress.thru ? `thru ${progress.thru}` : 'not started'}
              </Text>
            }>
            Tracked stats
          </SectionLabel>
          <View style={styles.statGrid}>
            {statSummaries.map((stat) => (
              <StatTile
                key={stat.key}
                value={stat.value}
                label={stat.label}
                tone={stat.tone}
                custom={stat.custom}
                style={styles.statTile}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.commentsWrap}>
        <SectionLabel right={<Text style={styles.commentCountLabel}>{commentCount}</Text>}>Comments</SectionLabel>
        <CommentsSection roundId={round.id} ownerUserId={round.ownerUserId ?? ''} />
      </View>
    </View>
  );
}

function computeQuickStats(
  round: Round,
  scorer: RoundScorer | undefined,
  getValues: (scorerId: string, holeNumber: number) => Record<string, unknown>
): QuickStats {
  if (!scorer) return { fir: '—', firState: 'neutral', gir: '—', girState: 'neutral' };
  let firMade = 0;
  let firEntered = 0;
  let girMade = 0;
  let girEntered = 0;
  for (const hole of holesInRange(round.course.holes, round.holeRange)) {
    const applicable = applicableStatsForHole(
      round.enabledStatKeys,
      hole,
      round.customStatDefinitions
    );
    const values = getValues(scorer.id, hole.number);
    if (applicable.some((s) => s.key === 'fir') && typeof values.fir === 'boolean') {
      firEntered += 1;
      if (values.fir) firMade += 1;
    }
    if (applicable.some((s) => s.key === 'gir') && typeof values.gir === 'boolean') {
      girEntered += 1;
      if (values.gir) girMade += 1;
    }
  }
  return {
    fir: firEntered ? `${firMade}/${firEntered}` : '—',
    firState: firEntered ? (firMade * 2 >= firEntered ? 'on' : 'no') : 'neutral',
    gir: girEntered ? `${girMade}/${girEntered}` : '—',
    girState: girEntered ? (girMade * 2 >= girEntered ? 'on' : 'no') : 'neutral',
  };
}

function computeStatSummaries(
  round: Round,
  scorer: RoundScorer | undefined,
  rows: readonly HoleDetailsRow[]
): StatSummary[] {
  if (!scorer || !round.trackedScorerIds.includes(scorer.id)) return [];
  const holes = holesInRange(round.course.holes, round.holeRange);
  return enabledStatDefinitions(
    round.enabledStatKeys,
    round.customStatDefinitions
  ).map((stat) => {
    const custom = isCustomStatKey(stat.key);
    if (stat.type === 'binary') {
      const aggregate = aggregateBinary(rows, scorer.id, stat, holes);
      return {
        key: stat.key,
        label: displayStatName(stat.key, stat.label),
        value:
          aggregate.denom > 0 ? `${aggregate.num}/${aggregate.denom}` : '—',
        tone:
          aggregate.denom === 0
            ? 'default'
            : custom
              ? 'cyan'
              : stat.key === 'gir'
                ? 'cyan'
                : stat.yesTone === 'bad' && aggregate.num > 0
                  ? 'danger'
                  : 'lime',
        custom,
      };
    }
    const aggregate = aggregateInteger(rows, scorer.id, stat, holes);
    return {
      key: stat.key,
      label: displayStatName(stat.key, stat.label),
      value: aggregate.taggedCount > 0 ? String(aggregate.sum) : '—',
      tone:
        aggregate.taggedCount === 0 || aggregate.sum === 0
          ? 'default'
          : custom
            ? 'cyan'
            : stat.aggregateTone === 'bad'
              ? 'danger'
              : stat.aggregateTone === 'good'
                ? 'lime'
                : 'default',
      custom,
    };
  });
}

function formatCourseSubline(round: Round, scorer: RoundScorer | undefined, thru: number): string {
  const tee = scorer?.tee ?? round.course.tees?.[0];
  const teeLabel = tee?.name ? `${tee.name} tees` : 'Tees';
  const yardage =
    tee?.totalYardage ??
    yardageForHoleRange(round.course, round.holeRange, tee?.id);
  const totalHoles = round.course.holes.length || holesInRange(round.course.holes, round.holeRange).length;
  return `${teeLabel} · ${yardage ? yardage.toLocaleString() : '—'}y · thru ${thru} of ${totalHoles}`;
}

function formatBannerSubtitle(round: Round, scorers: RoundScorer[], ownerKey: string | null): string {
  const ruleLabel = round.scoringRule === 'scramble' ? 'Scramble' : 'Stroke';
  const names: string[] = [];
  const seen = new Set<string>();
  for (const scorer of scorers) {
    for (const member of scorer.members) {
      if (ownerKey && member.id === ownerKey) continue;
      if (seen.has(member.id)) continue;
      seen.add(member.id);
      names.push(member.handle ? `@${member.handle}` : member.name);
    }
  }
  return names.length > 0 ? `${ruleLabel} · ${names.join(', ')}` : ruleLabel;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    shell: {
      gap: 14,
    },
    bannerCard: {
      padding: 0,
      overflow: 'hidden',
    },
    courseBlock: {
      marginHorizontal: 18,
      marginTop: 13,
    },
    courseTitle: {
      color: colors.textTitle,
      fontSize: 19,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    courseSubline: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    heroStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginHorizontal: 16,
      marginTop: 14,
      paddingTop: 14,
      paddingBottom: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
    },
    heroScore: {
      color: colors.lime,
      fontSize: 46,
      lineHeight: 48,
      fontWeight: '900',
      letterSpacing: -1.4,
    },
    heroLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 16,
      textTransform: 'uppercase',
    },
    quickStats: {
      marginLeft: 'auto',
      flexDirection: 'row',
      gap: 8,
      flexShrink: 0,
    },
    quickChip: {
      minWidth: 58,
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    detailCard: {
      overflow: 'hidden',
    },
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
    },
    statTile: {
      flexBasis: '48%',
      minWidth: 140,
    },
    statProgressLabel: {
      color: colors.cyan,
      fontSize: 11,
      fontWeight: '900',
    },
    commentsWrap: {
      gap: 0,
    },
    commentCountLabel: {
      color: colors.cyan,
      fontSize: 12,
      fontWeight: '900',
    },
  });
}
