/**
 * ProfileScreen — shared Aurora profile body for every social entry point.
 */

import React from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { Avatar, GlassCard, NeonButton, NumericText, PHONE_MAX_WIDTH, SectionLabel, StatTile } from '@/components/aurora';
import { PullToRefreshScrollView } from '@/components/widgets/PullToRefreshScrollView';
import { useRefresh } from '@/library/data/useRefresh';
import { holesInRange, scoreForRoundsList, scorerIdForUser, formatRelativeTime, formatScore } from '@/library/golf/scoring';
import { computeWhsHandicap, formatHandicapIndex } from '@/library/golf/handicap';
import { useCompletedRounds } from '@/library/golf/useCompletedRounds';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useScorecardStats } from '@/library/golf/useScorecardStats';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useRequiredAccount } from '@/library/social/AccountContext';
import { useProfile } from '@/library/social/FriendsContext';
import { signOut } from '@/library/supabase/auth';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';
import { FriendActionPill } from './FriendActionPill';

type Props = {
  userId: string;
};

type RoundMetric = {
  round: Round;
  total: number;
  relative: number;
  holeCount: number;
  holesScored: number;
};

export function ProfileScreen({ userId }: Props) {
  const { colors } = useTheme();
  const account = useRequiredAccount();
  const { profile, loading } = useProfile(userId);
  const { roundsPlayed, roundsTogether } = useScorecardStats();
  const { rounds } = useCompletedRounds();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const refresh = useRefresh();
  const handleEditProfile = React.useCallback(() => {
    // TODO: open the edit-profile flow when that route exists.
  }, []);

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

  // Conservative gate for the headline stats: only full 18-hole
  // stroke-play rounds where every hole was scored, compared by
  // relative-to-par so courses with slightly different pars stay
  // comparable. Looser rounds are deferred until there's real data.
  const eligibleMetrics = React.useMemo(
    () => roundMetrics.filter(isStatEligible),
    [roundMetrics]
  );

  const scoringAverage = React.useMemo(() => {
    if (eligibleMetrics.length === 0) return '—';
    const sum = eligibleMetrics.reduce((acc, metric) => acc + metric.relative, 0);
    return formatRelativeAverage(sum / eligibleMetrics.length);
  }, [eligibleMetrics]);

  const personalBest = React.useMemo(() => {
    if (eligibleMetrics.length === 0) return '—';
    return formatScore(Math.min(...eligibleMetrics.map((metric) => metric.relative)));
  }, [eligibleMetrics]);

  const handicapIndex = React.useMemo(
    () => formatHandicapIndex(computeWhsHandicap(rounds, account.userId).index),
    [rounds, account.userId]
  );

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

  const joinedYear = formatJoinedYear(isOwn ? account.createdAt : profile.createdAt);
  const handleText = joinedYear ? `@${profile.handle} · joined ${joinedYear}` : `@${profile.handle}`;

  return (
    <PullToRefreshScrollView
      onRefresh={refresh}
      style={styles.container}
      contentContainerStyle={styles.content}>
      <View style={styles.profileHead}>
        <Avatar
          initial={profile.displayName || profile.handle}
          color={isOwn ? undefined : profile.avatarColor}
          gradient={isOwn ? [colors.lime, colors.cyan] : undefined}
          size={78}
          style={styles.profileAvatar}
        />
        <Text style={styles.name}>{profile.displayName}</Text>
        <Text style={styles.handle}>{handleText}</Text>

        {isOwn ? (
          <NeonButton
            label="Edit profile"
            variant="ghost"
            size="sm"
            style={styles.editBtn}
            onPress={handleEditProfile}
          />
        ) : (
          <View style={styles.pillRow}>
            <FriendActionPill target={profile} />
          </View>
        )}
      </View>

      <View style={styles.tilesGrid}>
        {isOwn ? (
          <>
            <StatTile value={roundsPlayed} label="Rounds played" tone="lime" style={styles.tile} />
            <StatTile value={scoringAverage} label="Scoring average" style={styles.tile} />
            <StatTile value={personalBest} label="Personal best" tone="cyan" style={styles.tile} />
            <StatTile
              value={handicapIndex}
              label="Handicap index"
              style={styles.tile}
              onPress={() => router.push('/(tabs)/(you)/handicap' as never)}
            />
          </>
        ) : (
          <>
            <StatTile value={togetherCount} label="Rounds together" tone="lime" style={styles.tile} />
            <StatTile value={recentRounds.length} label="Recent together" tone="cyan" style={styles.tile} />
          </>
        )}
      </View>

      <SectionLabel
        right={
          isOwn ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/(tabs)/(score)/previous' as never)}
              hitSlop={8}
              style={({ pressed }) => (pressed ? styles.linkPressed : null)}>
              <Text style={styles.sectionLink}>All rounds ›</Text>
            </Pressable>
          ) : null
        }>
        {isOwn ? 'Recent rounds' : 'Recent rounds together'}
      </SectionLabel>
      {recentRounds.length === 0 ? (
        <GlassCard style={styles.emptyRounds}>
          <Text style={styles.emptyText}>
            {isOwn ? 'No completed rounds yet.' : 'No shared completed rounds yet.'}
          </Text>
        </GlassCard>
      ) : (
        recentRounds.map((metric) => (
          <RecentRoundRow key={metric.round.id} metric={metric} styles={styles} />
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

type ProfileStyles = ReturnType<typeof makeStyles>;

function RecentRoundRow({ metric, styles }: { metric: RoundMetric; styles: ProfileStyles }) {
  const { count: likeCount } = useRoundLikes(metric.round.id);

  return (
    <GlassCard padded={false} style={styles.roundRow}>
      <View style={styles.roundScore}>
        <NumericText style={styles.roundTotal}>{metric.total}</NumericText>
        <NumericText style={styles.roundRelative}>{formatScore(metric.relative)}</NumericText>
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
      <Text style={styles.likeCount}>♥ {likeCount}</Text>
    </GlassCard>
  );
}

function buildRoundMetric(round: Round, metricUserId: string): RoundMetric | null {
  const scorerId = scorerIdForUser(round, metricUserId);
  if (!scorerId) return null;
  const allowed = new Set(
    holesInRange(round.course.holes, round.holeRange).map((hole) => hole.number)
  );
  const scoredHoles = new Set<number>();
  let total = 0;
  for (const score of round.scores) {
    if (score.scorerId !== scorerId || !allowed.has(score.holeNumber)) continue;
    if (score.strokes <= 0 || scoredHoles.has(score.holeNumber)) continue;
    scoredHoles.add(score.holeNumber);
    total += score.strokes;
  }
  if (total <= 0) return null;
  return {
    round,
    total,
    relative: scoreForRoundsList(round, metricUserId),
    holeCount: allowed.size,
    holesScored: scoredHoles.size
  };
}

function formatJoinedYear(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  const year = new Date(createdAt).getFullYear();
  return Number.isFinite(year) ? String(year) : null;
}

/**
 * Conservative gate for the headline profile stats (scoring average and
 * personal best): only full 18-hole stroke-play rounds where every hole was
 * scored. Looser formats — 9-hole, scramble, partial cards — are intentionally
 * excluded until there's enough real data to handle them well. (The handicap
 * index has its own eligibility rules in `library/golf/handicap.ts`.)
 */
function isStatEligible(metric: RoundMetric): boolean {
  return (
    metric.round.scoringRule === 'stroke' &&
    metric.holeCount === 18 &&
    metric.holesScored === metric.holeCount
  );
}

/** Signed one-decimal to-par average, e.g. "+2.7" / "−1.3" / "E". */
function formatRelativeAverage(avg: number): string {
  const rounded = Math.round(avg * 10) / 10;
  if (rounded === 0) return 'E';
  const magnitude = Math.abs(rounded).toFixed(1);
  return rounded > 0 ? `+${magnitude}` : `−${magnitude}`;
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
    profileHead: {
      alignItems: 'center',
      paddingTop: 12,
      paddingBottom: 4
    },
    profileAvatar: {
      marginBottom: 12
    },
    name: {
      color: colors.textTitle,
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center'
    },
    handle: {
      marginTop: 3,
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600'
    },
    editBtn: {
      marginTop: 13,
      borderRadius: 20
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
    sectionLink: {
      color: colors.cyan,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5
    },
    linkPressed: {
      opacity: 0.7
    },
    roundRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingHorizontal: 15,
      paddingVertical: 13,
      marginBottom: 11,
      borderRadius: 18
    },
    roundScore: {
      minWidth: 54
    },
    roundTotal: {
      color: colors.textTitle,
      fontSize: 24,
      fontWeight: '900'
    },
    roundRelative: {
      color: colors.cyan,
      fontSize: 11,
      fontWeight: '700'
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
    likeCount: {
      marginLeft: 'auto',
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700'
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
