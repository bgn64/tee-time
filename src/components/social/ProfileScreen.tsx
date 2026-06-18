/**
 * ProfileScreen — shared Aurora profile body for every social entry point.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { Avatar, GlassCard, NeonButton, PHONE_MAX_WIDTH, SectionLabel, StatTile } from '@/components/aurora';
import { PullToRefreshScrollView } from '@/components/widgets/PullToRefreshScrollView';
import { useRefresh } from '@/library/data/useRefresh';
import { holesInRange, scoreForRoundsList, scorerIdForUser, formatRelativeTime, formatScore } from '@/library/golf/scoring';
import { useCompletedRounds } from '@/library/golf/useCompletedRounds';
import { useScorecardStats } from '@/library/golf/useScorecardStats';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useFriends, useProfile } from '@/library/social/FriendsContext';
import { signOut } from '@/library/supabase/auth';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';
import { FriendActionPill } from './FriendActionPill';

type Props = {
  userId: string;
  onPressFriends?: () => void;
};

type RoundMetric = {
  round: Round;
  total: number;
  relative: number;
};

export function ProfileScreen({ userId, onPressFriends }: Props) {
  const { colors } = useTheme();
  const account = useRequiredAccount();
  const { profile, loading } = useProfile(userId);
  const { friends } = useFriends();
  const { roundsPlayed, roundsTogether } = useScorecardStats();
  const { rounds } = useCompletedRounds();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const refresh = useRefresh();

  const isOwn = userId === account.userId;
  const targetKey = userParticipantKey(userId);
  const togetherCount = isOwn ? 0 : roundsTogether(userId);

  const roundMetrics = React.useMemo(() => {
    const scoped = isOwn
      ? rounds
      : rounds.filter((round) => round.playerIds.includes(targetKey));
    return scoped
      .map((round) => buildRoundMetric(round, isOwn ? account.userId : userId))
      .filter((metric): metric is RoundMetric => !!metric)
      .sort((a, b) => {
        const at = new Date(a.round.completedAt ?? a.round.startedAt).getTime();
        const bt = new Date(b.round.completedAt ?? b.round.startedAt).getTime();
        return bt - at;
      });
  }, [rounds, isOwn, targetKey, account.userId, userId]);

  const scoringAverage = React.useMemo(() => {
    if (roundMetrics.length === 0) return '—';
    const total = roundMetrics.reduce((acc, metric) => acc + metric.total, 0);
    return (total / roundMetrics.length).toFixed(1);
  }, [roundMetrics]);

  const personalBest = React.useMemo(() => {
    if (roundMetrics.length === 0) return '—';
    return String(Math.min(...roundMetrics.map((metric) => metric.total)));
  }, [roundMetrics]);

  const recentRounds = roundMetrics.slice(0, 3);

  if (loading && !profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <GlassCard strong glow style={styles.loadingCard}>
          <ActivityIndicator color={colors.lime} />
        </GlassCard>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <GlassCard strong glow style={styles.notFoundCard}>
          <Text style={styles.notFoundIcon}>👤</Text>
          <Text style={styles.notFoundTitle}>Profile not found</Text>
          <Text style={styles.notFoundBody}>
            They may have deleted their account or never finished signing up.
          </Text>
        </GlassCard>
      </View>
    );
  }

  return (
    <PullToRefreshScrollView
      onRefresh={refresh}
      style={styles.container}
      contentContainerStyle={styles.content}>
      <GlassCard strong glow style={styles.headerCard}>
        <Avatar
          initial={profile.displayName || profile.handle}
          color={isOwn ? undefined : profile.avatarColor}
          gradient={isOwn ? [colors.lime, colors.cyan] : undefined}
          size={86}
        />
        <Text style={styles.name}>{profile.displayName}</Text>
        <Text style={styles.handle}>@{profile.handle}</Text>

        {!isOwn ? (
          <View style={styles.pillRow}>
            <FriendActionPill target={profile} />
          </View>
        ) : null}
      </GlassCard>

      <View style={styles.tilesGrid}>
        {isOwn ? (
          <>
            <Pressable
              disabled={!onPressFriends}
              onPress={onPressFriends}
              style={({ pressed }) => [styles.tilePress, pressed && styles.tilePressed]}>
              <StatTile value={friends.length} label="Friends" tone="cyan" style={styles.tile} />
            </Pressable>
            <StatTile value={roundsPlayed} label="Rounds played" tone="lime" style={styles.tile} />
            <StatTile value={scoringAverage} label="Scoring average" style={styles.tile} />
            <StatTile value={personalBest} label="Personal best" tone="cyan" style={styles.tile} />
          </>
        ) : (
          <>
            <StatTile value={togetherCount} label="Rounds together" tone="lime" style={styles.tile} />
            <StatTile value={recentRounds.length} label="Recent together" tone="cyan" style={styles.tile} />
          </>
        )}
      </View>

      <SectionLabel>{isOwn ? 'Recent rounds' : 'Recent rounds together'}</SectionLabel>
      {recentRounds.length === 0 ? (
        <GlassCard style={styles.emptyRounds}>
          <Text style={styles.emptyText}>
            {isOwn ? 'No completed rounds yet.' : 'No shared completed rounds yet.'}
          </Text>
        </GlassCard>
      ) : (
        recentRounds.map((metric) => (
          <GlassCard key={metric.round.id} padded={false} style={styles.roundRow}>
            <View style={styles.roundScore}>
              <Text style={styles.roundTotal}>{metric.total}</Text>
              <Text style={styles.roundRelative}>{formatScore(metric.relative)}</Text>
            </View>
            <View style={styles.roundBody}>
              <Text style={styles.courseName} numberOfLines={1}>
                {metric.round.course.name}
              </Text>
              <Text style={styles.roundMeta} numberOfLines={1}>
                {metric.round.scoringRule} · {holesInRange(metric.round.course.holes, metric.round.holeRange).length} ·{' '}
                {formatRelativeTime(metric.round.completedAt ?? metric.round.startedAt)}
              </Text>
            </View>
          </GlassCard>
        ))
      )}

      {isOwn ? (
        <NeonButton
          label="Sign out"
          variant="ghost"
          style={styles.signOutBtn}
          onPress={() => {
            void signOut();
          }}
        />
      ) : null}
    </PullToRefreshScrollView>
  );
}

function buildRoundMetric(round: Round, metricUserId: string): RoundMetric | null {
  const scorerId = scorerIdForUser(round, metricUserId);
  if (!scorerId) return null;
  const allowed = new Set(holesInRange(round.course.holes, round.holeRange).map((hole) => hole.number));
  let total = 0;
  for (const score of round.scores) {
    if (score.scorerId !== scorerId || !allowed.has(score.holeNumber)) continue;
    total += score.strokes;
  }
  if (total <= 0) return null;
  return {
    round,
    total,
    relative: scoreForRoundsList(round, metricUserId)
  };
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent'
    },
    content: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      padding: 20,
      paddingBottom: 48
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    },
    loadingCard: {
      minWidth: 120,
      alignItems: 'center'
    },
    headerCard: {
      alignItems: 'center',
      paddingVertical: 22,
      marginBottom: 14
    },
    name: {
      marginTop: 14,
      color: colors.textTitle,
      fontSize: 22,
      fontWeight: '900',
      textAlign: 'center'
    },
    handle: {
      marginTop: 3,
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '700'
    },
    pillRow: {
      marginTop: 16
    },
    tilesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10
    },
    tile: {
      flexBasis: '47%',
      flexGrow: 1,
      minWidth: 138
    },
    tilePress: {
      flexBasis: '47%',
      flexGrow: 1,
      minWidth: 138
    },
    tilePressed: {
      opacity: 0.82,
      transform: [{ scale: 0.99 }]
    },
    roundRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      marginBottom: 8
    },
    roundScore: {
      width: 58,
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      alignItems: 'center',
      justifyContent: 'center'
    },
    roundTotal: {
      color: colors.textTitle,
      fontSize: 20,
      fontWeight: '900'
    },
    roundRelative: {
      color: colors.lime,
      fontSize: 11,
      fontWeight: '900',
      marginTop: 1
    },
    roundBody: {
      flex: 1,
      minWidth: 0
    },
    courseName: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '900'
    },
    roundMeta: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 3,
      textTransform: 'lowercase'
    },
    emptyRounds: {
      alignItems: 'center'
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: 'center'
    },
    signOutBtn: {
      marginTop: 18,
      alignSelf: 'center'
    },
    notFoundCard: {
      alignItems: 'center',
      maxWidth: 320
    },
    notFoundIcon: {
      fontSize: 36,
      marginBottom: 8
    },
    notFoundTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: colors.textTitle,
      marginBottom: 6
    },
    notFoundBody: {
      fontSize: 13,
      color: colors.textBody,
      textAlign: 'center',
      lineHeight: 18
    }
  });
}
