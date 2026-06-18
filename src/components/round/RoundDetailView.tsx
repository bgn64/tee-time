/**
 * RoundDetailView — Aurora Glass round detail lane.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CommentsSection } from './CommentsSection';
import { CourseBanner } from './CourseBanner';
import type { OverflowItem } from './HeaderOverflowMenu';
import { GlassCard, NumericText, ScorePip, SectionLabel, StatChip } from '@/components/aurora';
import { applicableStatsForHole } from '@/library/golf/builtInStats';
import { yardageForHoleRange } from '@/library/golf/courseHelpers';
import { formatRelativeTime, formatScore, holesInRange, playerProgress } from '@/library/golf/scoring';
import { useRoundHoleDetails } from '@/library/golf/useRoundHoleDetails';
import { useRoundScorers, type RoundScorer } from '@/library/golf/useRoundScorers';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Hole, Round } from '@/types/golf';

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
  const { getValues } = useRoundHoleDetails(round.id);

  const isInProgress = !round.completedAt;
  const timeText = formatRelativeTime(
    isInProgress ? round.lastScoreAt ?? round.startedAt : round.completedAt ?? round.startedAt
  );

  const ownerUserId = round.ownerUserId ?? '';
  const onPressOwner = ownerUserId
    ? () => router.push(`${profileRoutePrefix}/${ownerUserId}` as never)
    : undefined;

  const primaryScorer = scorers[0];
  const progress = primaryScorer ? playerProgress(round, primaryScorer.id) : { rel: 0, thru: 0 };
  const quickStats = useMemo(
    () => computeQuickStats(round, primaryScorer, getValues),
    [round, primaryScorer, getValues]
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
          <NumericText style={styles.heroScore}>{formatScore(progress.rel)}</NumericText>
          <Text style={styles.heroLabel}>to par{progress.thru ? `\nthru ${progress.thru}` : ''}</Text>
          <View style={styles.quickStats}>
            <StatChip label="FIR" value={quickStats.fir} state={quickStats.firState} style={styles.quickChip} />
            <StatChip label="GIR" value={quickStats.gir} state={quickStats.girState} style={styles.quickChip} />
          </View>
        </View>
      </GlassCard>

      <GlassCard padded={false} style={styles.detailCard}>
        <FullScorecard round={round} scorers={scorers} />
      </GlassCard>

      <View style={styles.commentsWrap}>
        <SectionLabel right={<Text style={styles.commentCountLabel}>{commentCount}</Text>}>Comments</SectionLabel>
        <CommentsSection roundId={round.id} ownerUserId={round.ownerUserId ?? ''} />
      </View>
    </View>
  );
}

function FullScorecard({ round, scorers }: { round: Round; scorers: RoundScorer[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const holes = holesInRange(round.course.holes, round.holeRange);
  const front = holes.filter((h) => h.number <= 9);
  const back = holes.filter((h) => h.number >= 10);
  const hasBack = back.length > 0;

  return (
    <View style={styles.scorecardBody}>
      <NineGrid label="Out" holes={front} round={round} scorers={scorers} />
      {hasBack ? <View style={styles.scoreDivider} /> : null}
      {hasBack ? <NineGrid label="In" holes={back} round={round} scorers={scorers} /> : null}
      <View style={styles.totalBar}>
        <Text style={styles.totalMuted}>
          Out <Text style={styles.totalStrong}>{nineTotal(round, front, scorers[0]?.id)}</Text>
          {hasBack ? ' · In ' : ''}
          {hasBack ? <Text style={styles.totalStrong}>{nineTotal(round, back, scorers[0]?.id)}</Text> : null}
        </Text>
        {scorers[0] ? (
          <NumericText style={styles.totalToPar}>
            {formatScore(playerProgress(round, scorers[0].id).rel)} · thru {playerProgress(round, scorers[0].id).thru}
          </NumericText>
        ) : null}
      </View>
    </View>
  );
}

function NineGrid({ label, holes, round, scorers }: { label: string; holes: Hole[]; round: Round; scorers: RoundScorer[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const padded = [...holes, ...Array.from({ length: Math.max(0, 9 - holes.length) }, (_, i) => ({ number: -i - 1, par: 0 } as Hole))];

  return (
    <View style={styles.nine}>
      <ScoreRow label="Hole" cells={padded.map((h) => (h.number > 0 ? String(h.number) : ''))} muted />
      <ScoreRow label="Par" cells={padded.map((h) => (h.par ? String(h.par) : ''))} />
      {scorers.map((scorer) => (
        <View key={scorer.id} style={styles.scoreRow}>
          <Text style={styles.rowLabel} numberOfLines={1}>{scorers.length === 1 ? label : shortName(scorer.name)}</Text>
          {padded.map((hole) => {
            if (hole.number < 0) return <View key={hole.number} style={styles.scoreCell} />;
            const score = round.scores.find((s) => s.scorerId === scorer.id && s.holeNumber === hole.number);
            return (
              <View key={hole.number} style={styles.scoreCell}>
                {score ? <ScorePip strokes={score.strokes} par={hole.par} size={24} /> : <Text style={styles.dash}>—</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ScoreRow({ label, cells, muted }: { label: string; cells: string[]; muted?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      {cells.map((cell, i) => (
        <View key={`${label}-${i}`} style={styles.scoreCell}>
          <NumericText style={[styles.cellText, muted ? styles.cellMuted : null]}>{cell}</NumericText>
        </View>
      ))}
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
    const applicable = applicableStatsForHole(round.enabledStatKeys, hole);
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

function nineTotal(round: Round, holes: Hole[], scorerId: string | undefined): string {
  if (!scorerId || holes.length === 0) return '—';
  let total = 0;
  let entered = 0;
  for (const hole of holes) {
    const score = round.scores.find((s) => s.scorerId === scorerId && s.holeNumber === hole.number);
    if (score) {
      total += score.strokes;
      entered += 1;
    }
  }
  return entered === holes.length ? String(total) : entered ? `${total}` : '—';
}

function shortName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
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
    scorecardBody: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
    },
    nine: {
      gap: 4,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 28,
    },
    rowLabel: {
      width: 42,
      color: colors.textMuted,
      fontSize: 9.5,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    scoreCell: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellText: {
      color: colors.textBody,
      fontSize: 12,
      fontWeight: '800',
    },
    cellMuted: {
      color: colors.textMuted,
      fontSize: 10.5,
    },
    dash: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.glassStroke,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      fontWeight: '900',
    },
    scoreDivider: {
      height: 1,
      backgroundColor: colors.glassStroke,
      marginVertical: 8,
    },
    totalBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
      gap: 12,
    },
    totalMuted: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    totalStrong: {
      color: colors.textTitle,
      fontWeight: '900',
    },
    totalToPar: {
      color: colors.lime,
      fontSize: 12,
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
