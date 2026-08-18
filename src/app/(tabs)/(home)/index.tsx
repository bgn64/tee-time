/**
 * Home tab — friend-rounds feed.
 *
 * Reads from `useFeedRounds()` — a thin PowerSync projection over
 * local SQLite that filters scorecards through the local `friendships`
 * join (so unfriending hides cards immediately even before PowerSync
 * prunes the cached rows). Live rounds (in-flight) pin to the top
 * with a heartbeat status banner; completed rounds follow as the
 * same rich cards, grouped by completion month.
 * Each section is sorted newest-first by its own recency timestamp
 * (`lastScoreAt` for live, `completedAt` for done).
 *
 * Empty-state gating: both `useFriends().hydrated` AND
 * `useFeedRounds().isLoading === false` must be settled before
 * showing an empty state — otherwise a cold start flashes
 * "no friends".
 *
 * Tap-through: from any scorecard participant cell (avatar in the
 * main grid OR name link in FinalTotals), push onto the home stack's
 * own `profile/[userId]` route. Per-tab convention — back returns to
 * the feed.
 */

import React from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GlassCard, NeonButton, PHONE_MAX_WIDTH, SectionLabel } from '@/components/aurora';
import { RoundListCard } from '@/components/round/RoundListCard';
import { IncomingRequestsBanner } from '@/components/social/IncomingRequestsBanner';
import { PullToRefreshScrollView } from '@/components/widgets/PullToRefreshScrollView';
import { useRefresh } from '@/library/data/useRefresh';
import { useRound } from '@/library/golf/RoundContext';
import { getScorerProgress, monthKey, scorerIdForUser } from '@/library/golf/scoring';
import { useFeedRounds } from '@/library/golf/useFeedRounds';
import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';

export default function HomeFeedScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const refresh = useRefresh();

  const { friends, hydrated: friendsHydrated } = useFriends();
  const { liveRounds, completedRounds, isLoading: feedLoading } = useFeedRounds();
  const { currentRound, userId } = useRound();

  const feedRounds = React.useMemo(
    () => [...liveRounds, ...completedRounds],
    [liveRounds, completedRounds]
  );
  const completedGroups = React.useMemo(() => {
    const groups: { key: string; rounds: Round[] }[] = [];
    for (const round of completedRounds) {
      const key = monthKey(new Date(round.completedAt ?? round.startedAt));
      const last = groups[groups.length - 1];
      if (last?.key === key) {
        last.rounds.push(round);
      } else {
        groups.push({ key, rounds: [round] });
      }
    }
    return groups;
  }, [completedRounds]);

  // Don't decide between empty/populated states until BOTH the friend
  // list and the feed query have settled — otherwise the screen
  // flashes the "no friends" CTA on cold start.
  const settled = friendsHydrated && !feedLoading;

  if (!settled) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentEmpty}>
        <IncomingRequestsBanner style={styles.banner} />
        <GlassCard strong glow style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </GlassCard>
      </ScrollView>
    );
  }

  // Friend-less welcome screen — only when the user has neither
  // friends NOR any own completed rounds to show. The feed includes
  // own completed rounds, so a friendless user with a finished round
  // still sees their own card and skips this CTA.
  if (friends.length === 0 && feedRounds.length === 0 && !currentRound) {
    return (
      <PullToRefreshScrollView
        onRefresh={refresh}
        style={styles.scroll}
        contentContainerStyle={styles.contentEmpty}>
        <IncomingRequestsBanner style={styles.banner} />
        <GlassCard strong glow style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Find friends to see their rounds</Text>
          <Text style={styles.emptyBody}>
            Search for friends by their <Text style={styles.codeChip}>@handle</Text> and add
            them. Their rounds — and your own completed rounds —
            will show up here.
          </Text>
          <NeonButton
            label="+  Find friends"
            size="sm"
            style={styles.primaryCta}
            onPress={() => router.push('/(tabs)/(search)' as never)}
          />
        </GlassCard>
      </PullToRefreshScrollView>
    );
  }

  if (feedRounds.length === 0 && !currentRound) {
    return (
      <PullToRefreshScrollView
        onRefresh={refresh}
        style={styles.scroll}
        contentContainerStyle={styles.contentEmpty}>
        <IncomingRequestsBanner style={styles.banner} />
        <GlassCard strong glow style={styles.empty}>
          <Text style={styles.emptyIcon}>⛳</Text>
          <Text style={styles.emptyTitle}>No rounds yet</Text>
          <Text style={styles.emptyBody}>
            You&apos;re connected with friends, but no one has scored a
            round you can see yet. Your in-progress rounds live on the{' '}
            <Text style={styles.emptyBodyEm}>Score</Text> tab; finished
            rounds will show up here.
          </Text>
        </GlassCard>
      </PullToRefreshScrollView>
    );
  }

  return (
    <PullToRefreshScrollView
      onRefresh={refresh}
      style={styles.scroll}
      contentContainerStyle={styles.content}>
      <IncomingRequestsBanner style={styles.banner} />
      <ContinueRoundBanner round={currentRound} userId={userId} />

      {liveRounds.length > 0 ? (
        <>
          <SectionLabel>Live now</SectionLabel>
          {liveRounds.map((round) => (
            <RoundListCard
              key={round.id}
              round={round}
              detailRoutePrefix="/(tabs)/(home)/round"
              profileRoutePrefix="/(tabs)/(home)/profile"
            />
          ))}
        </>
      ) : null}

      {completedRounds.length > 0 ? (
        <>
          {completedGroups.map((group) => (
            <React.Fragment key={group.key}>
              <SectionLabel>{group.key}</SectionLabel>
              {group.rounds.map((round) => (
                <RoundListCard
                  key={round.id}
                  round={round}
                  detailRoutePrefix="/(tabs)/(home)/round"
                  profileRoutePrefix="/(tabs)/(home)/profile"
                />
              ))}
            </React.Fragment>
          ))}
        </>
      ) : null}
    </PullToRefreshScrollView>
  );
}

function ContinueRoundBanner({
  round,
  userId,
}: {
  round: Round | null;
  userId: string | null;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  if (!round) return null;

  const scorerId = userId
    ? scorerIdForUser(round, userId)
    : round.ownerUserId
      ? scorerIdForUser(round, round.ownerUserId)
      : undefined;
  const { thruCount } = getScorerProgress(round, scorerId);

  return (
    <Pressable
      style={styles.resumeFrame}
      onPress={() => router.push('/(tabs)/(score)/scoring' as never)}
      accessibilityRole="button"
      accessibilityLabel="Continue your round">
      <LinearGradient
        colors={[colors.glowLime, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.resume}>
        <View style={styles.resumePlay}>
          <Text style={styles.resumePlayText}>▶</Text>
        </View>
        <View style={styles.resumeText}>
          <Text style={styles.resumeTitle}>Continue your round</Text>
          <Text style={styles.resumeSubtitle} numberOfLines={1}>
            {round.course.name} · thru {thruCount}
          </Text>
        </View>
        <Text style={styles.resumeChevron}>›</Text>
      </LinearGradient>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: 'transparent'
    },
    content: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 40
    },
    contentEmpty: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      padding: 20,
      paddingBottom: 40,
      flexGrow: 1
    },
    banner: {
      marginBottom: 14
    },
    resumeFrame: {
      marginBottom: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.lime,
      overflow: 'hidden',
    },
    resume: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    resumePlay: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.lime,
      shadowColor: colors.lime,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 4,
    },
    resumePlayText: {
      color: colors.onNeon,
      fontSize: 13,
      fontWeight: '900',
      marginLeft: 1,
    },
    resumeText: {
      flex: 1,
      minWidth: 0,
    },
    resumeTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    resumeSubtitle: {
      marginTop: 2,
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    resumeChevron: {
      marginLeft: 'auto',
      color: colors.lime,
      fontSize: 22,
      fontWeight: '700',
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
      paddingHorizontal: 18,
      gap: 10,
      marginTop: 24
    },
    emptyIcon: {
      fontSize: 38,
      opacity: 0.5
    },
    emptyTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: colors.lime,
      textAlign: 'center'
    },
    emptyBody: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 270
    },
    emptyBodyEm: {
      color: colors.textTitle,
      fontWeight: '800'
    },
    codeChip: {
      fontFamily: 'SpaceMono',
      fontSize: 11,
      color: colors.cyan
    },
    primaryCta: {
      marginTop: 10,
      alignSelf: 'center'
    }
  });
}
