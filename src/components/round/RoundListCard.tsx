/**
 * RoundListCard — static at-a-glance card used by the home feed.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { GlassCard, ProgressDial } from '@/components/aurora';
import { CommentsSheet } from './CommentsSheet';
import { CourseBanner } from './CourseBanner';
import type { OverflowItem } from './HeaderOverflowMenu';
import { RoundActionBar } from './RoundActionBar';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import {
  aggregateBinary,
  aggregateInteger,
} from '@/library/golf/aggregateHoleDetails';
import { getStat } from '@/library/golf/builtInStats';
import {
  formatRelativeTime,
  formatScore,
  getScorerProgress,
  holesInRange,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { useRoundHoleDetails } from '@/library/golf/useRoundHoleDetails';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useAccount } from '@/library/social/AccountContext';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  detailRoutePrefix: string;
  profileRoutePrefix: string;
};

export function RoundListCard({
  round,
  detailRoutePrefix,
  profileRoutePrefix,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const { account } = useAccount();
  const { profile: ownerProfile } = useProfile(round.ownerUserId ?? null);
  const { count: commentCount } = useCommentSummary(round.id);
  const { likedByMe, count: likeCount, toggle: toggleLike } = useRoundLikes(
    round.id
  );
  const { rows: detailsRows } = useRoundHoleDetails(round.id);
  const scorers = useRoundScorers(round);
  const [sheetVisible, setSheetVisible] = useState(false);

  const isInProgress = !round.completedAt;
  const timeText = formatRelativeTime(
    isInProgress
      ? round.lastScoreAt ?? round.startedAt
      : round.completedAt ?? round.startedAt
  );

  const ownerUserId = round.ownerUserId ?? '';
  const onPressOwner = ownerUserId
    ? () => router.push(`${profileRoutePrefix}/${ownerUserId}` as never)
    : undefined;
  const isOwner =
    !!account?.userId && account.userId === (round.ownerUserId ?? '');
  const canEdit = isOwner && !isInProgress;

  const overflowActions: OverflowItem[] = [];
  if (canEdit) {
    overflowActions.push({
      key: 'edit',
      label: 'Edit round',
      icon: 'create-outline',
      onPress: () =>
        router.push(`/(tabs)/(score)/previous/${round.id}/edit` as never),
    });
  }

  const ruleLabel = round.scoringRule === 'scramble' ? 'Scramble' : 'Stroke';
  const ownerKey = round.ownerUserId ? `user:${round.ownerUserId}` : null;
  const coPlayers = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const s of scorers) {
      for (const m of s.members) {
        if (ownerKey && m.id === ownerKey) continue;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        names.push(m.handle ? `@${m.handle}` : m.name);
      }
    }
    return names;
  }, [scorers, ownerKey]);
  const withText =
    coPlayers.length > 0
      ? ` · with ${coPlayers.slice(0, 2).join(', ')}${
          coPlayers.length > 2 ? ` +${coPlayers.length - 2}` : ''
        }`
      : '';
  const descriptor = `${ruleLabel}${withText}`;

  const visibleHoles = useMemo(
    () => holesInRange(round.course.holes, round.holeRange),
    [round.course.holes, round.holeRange]
  );
  const primaryScorerId =
    (round.ownerUserId ? scorerIdForUser(round, round.ownerUserId) : undefined) ??
    scorers[0]?.id;
  const primaryScorer = scorers.find((s) => s.id === primaryScorerId);
  const progress = getScorerProgress(round, primaryScorerId);
  const hasScores = progress.thruCount > 0;
  const totalHoles = visibleHoles.length || 18;
  const scoreText = hasScores ? formatScore(progress.relativeScore) : 'E';
  const progressColor = !hasScores
    ? colors.cyan
    : progress.relativeScore > 0
      ? colors.accent
      : progress.relativeScore < 0
        ? colors.lime
        : colors.cyan;
  const teeMeta = primaryScorer?.tee?.name
    ? `${primaryScorer.tee.name} tees`
    : null;
  const courseMeta = [
    teeMeta,
    hasScores
      ? `thru ${progress.thruCount} of ${totalHoles}`
      : `${totalHoles} holes`,
  ]
    .filter(Boolean)
    .join(' · ');

  const legend = useMemo(() => {
    if (!primaryScorerId) return [];
    const fir = getStat('fir');
    const gir = getStat('gir');
    const putts = getStat('putts');
    const items: { key: string; label: string; value: string; color: string }[] = [];
    if (fir?.type === 'binary') {
      const agg = aggregateBinary(detailsRows, primaryScorerId, fir, visibleHoles);
      if (agg.denom > 0) {
        items.push({
          key: 'fir',
          label: 'Fairways',
          value: `${agg.num}/${agg.denom}`,
          color: colors.lime,
        });
      }
    }
    if (gir?.type === 'binary') {
      const agg = aggregateBinary(detailsRows, primaryScorerId, gir, visibleHoles);
      if (agg.denom > 0) {
        items.push({
          key: 'gir',
          label: 'Greens',
          value: `${agg.num}/${agg.denom}`,
          color: colors.cyan,
        });
      }
    }
    if (putts?.type === 'integer') {
      const agg = aggregateInteger(detailsRows, primaryScorerId, putts, visibleHoles);
      if (agg.taggedCount > 0) {
        items.push({
          key: 'putts',
          label: 'Putts',
          value: String(agg.sum),
          color: colors.violet,
        });
      }
    }
    return items;
  }, [
    colors.cyan,
    colors.lime,
    colors.violet,
    detailsRows,
    primaryScorerId,
    visibleHoles,
  ]);

  const stripHoles = visibleHoles.slice(0, 9);
  const scoreByHole = useMemo(() => {
    const map = new Map<number, number>();
    if (!primaryScorerId) return map;
    for (const score of round.scores) {
      if (score.scorerId === primaryScorerId) {
        map.set(score.holeNumber, score.strokes);
      }
    }
    return map;
  }, [primaryScorerId, round.scores]);
  const openRound = () => router.push(`${detailRoutePrefix}/${round.id}` as never);

  return (
    <GlassCard padded={false} strong glow={isInProgress} style={styles.card}>
      <CourseBanner
        handle={ownerProfile?.handle}
        displayName={ownerProfile?.displayName}
        avatarColor={ownerProfile?.avatarColor}
        avatarSeed={round.ownerUserId}
        courseName={round.course.name}
        subtitle={descriptor}
        timeText={timeText}
        isLive={isInProgress}
        onPressOwner={onPressOwner}
        overflowActions={overflowActions}
      />
      <Pressable
        onPress={openRound}
        accessibilityRole="button"
        accessibilityLabel={`Open ${round.course.name} round`}>
        <View style={styles.body}>
          <Text style={styles.courseTitle} numberOfLines={2}>
            {round.course.name}
          </Text>
          <Text style={styles.courseMeta} numberOfLines={1}>
            {courseMeta}
          </Text>
          <View style={styles.ringRow}>
            <ProgressDial
              value={scoreText}
              label="TO PAR"
              fraction={progress.thruCount / totalHoles}
              size={96}
              progressColor={progressColor}
            />
            {legend.length > 0 ? (
              <View style={styles.legend}>
                {legend.map((item) => (
                  <View key={item.key} style={styles.legendRow}>
                    <View
                      style={[
                        styles.legendPill,
                        { backgroundColor: item.color },
                      ]}
                    />
                    <Text style={styles.legendLabel}>{item.label}</Text>
                    <Text style={styles.legendValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.holes}>
            {stripHoles.map((hole) => {
              const strokes = scoreByHole.get(hole.number);
              const birdie = typeof strokes === 'number' && strokes < hole.par;
              return (
                <View
                  key={hole.number}
                  style={[
                    styles.holeCell,
                    birdie ? styles.holeCellBirdie : null,
                  ]}>
                  <Text
                    style={[
                      styles.holeStrokes,
                      birdie ? styles.holeStrokesBirdie : null,
                      typeof strokes !== 'number'
                        ? styles.holeStrokesEmpty
                        : null,
                    ]}>
                    {typeof strokes === 'number' ? strokes : '–'}
                  </Text>
                  <Text style={styles.holeNumber}>{hole.number}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </Pressable>
      <RoundActionBar
        liked={likedByMe}
        likeCount={likeCount}
        commentCount={commentCount}
        onToggleLike={toggleLike}
        onOpenComments={() => setSheetVisible(true)}
        onOpenRound={openRound}
      />
      <CommentsSheet
        visible={sheetVisible}
        roundId={round.id}
        ownerUserId={round.ownerUserId ?? ''}
        commentCount={commentCount}
        onClose={() => setSheetVisible(false)}
      />
    </GlassCard>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginBottom: 16,
    },
    body: {
      paddingHorizontal: 18,
      paddingBottom: 14,
    },
    courseTitle: {
      marginTop: 1,
      color: colors.textTitle,
      fontSize: 19,
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    courseMeta: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: '600',
    },
    ringRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginVertical: 16,
    },
    legend: {
      flex: 1,
      minWidth: 0,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginVertical: 5,
    },
    legendPill: {
      width: 9,
      height: 9,
      borderRadius: 3,
    },
    legendLabel: {
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: '600',
    },
    legendValue: {
      color: colors.textTitle,
      fontSize: 12.5,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    holes: {
      flexDirection: 'row',
      gap: 5,
      marginTop: 1,
      marginBottom: 2,
    },
    holeCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: colors.glassFill2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
    },
    holeCellBirdie: {
      backgroundColor: colors.glowLime,
      borderColor: 'rgba(182, 255, 59, 0.32)',
    },
    holeStrokes: {
      color: colors.textTitle,
      fontSize: 12.5,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    holeStrokesBirdie: {
      color: colors.lime,
    },
    holeStrokesEmpty: {
      color: colors.textMuted,
    },
    holeNumber: {
      marginTop: 1,
      color: colors.textMuted,
      fontSize: 8.5,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
  });
}
