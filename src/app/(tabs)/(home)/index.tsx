/**
 * Home tab — friend-rounds feed.
 *
 * Reads from `useFeedRounds()` — a thin PowerSync projection over
 * local SQLite that filters scorecards through the local `friendships`
 * join (so unfriending hides cards immediately even before PowerSync
 * prunes the cached rows). Live rounds (in-flight) pin to the top
 * with a heartbeat status banner; completed rounds follow.
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
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import { GlassCard, NeonButton, PHONE_MAX_WIDTH, SectionLabel, SegmentedToggle } from '@/components/aurora';
import { CompletedRoundRow } from '@/components/round/CompletedRoundRow';
import { RoundListCard } from '@/components/round/RoundListCard';
import { IncomingRequestsBanner } from '@/components/social/IncomingRequestsBanner';
import { PullToRefreshScrollView } from '@/components/widgets/PullToRefreshScrollView';
import { useRefresh } from '@/library/data/useRefresh';
import { useFeedRounds } from '@/library/golf/useFeedRounds';
import { useAccount } from '@/library/social/AccountContext';
import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

type FeedSegment = 'feed' | 'live' | 'friends';

const SEGMENTS: { key: FeedSegment; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'live', label: 'Live' },
  { key: 'friends', label: 'Friends' },
];

export default function HomeFeedScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const refresh = useRefresh();

  const { account } = useAccount();
  const { friends, hydrated: friendsHydrated } = useFriends();
  const { liveRounds, completedRounds, isLoading: feedLoading } = useFeedRounds();
  const [segment, setSegment] = React.useState<FeedSegment>('feed');

  const feedRounds = React.useMemo(
    () => [...liveRounds, ...completedRounds],
    [liveRounds, completedRounds]
  );

  // Segment filters the two sections. "Live" hides completed; "Friends"
  // drops the viewer's own rounds (the social slice). "Feed" shows all.
  const myId = account?.userId;
  const liveForSegment = React.useMemo(
    () =>
      segment === 'friends'
        ? liveRounds.filter((r) => r.ownerUserId !== myId)
        : liveRounds,
    [segment, liveRounds, myId]
  );
  const completedForSegment = React.useMemo(
    () =>
      segment === 'live'
        ? []
        : segment === 'friends'
          ? completedRounds.filter((r) => r.ownerUserId !== myId)
          : completedRounds,
    [segment, completedRounds, myId]
  );

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
  if (friends.length === 0 && feedRounds.length === 0) {
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

  if (feedRounds.length === 0) {
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

  const nothingInSegment =
    liveForSegment.length === 0 && completedForSegment.length === 0;

  return (
    <PullToRefreshScrollView
      onRefresh={refresh}
      style={styles.scroll}
      contentContainerStyle={styles.content}>
      <IncomingRequestsBanner style={styles.banner} />
      <SegmentedToggle
        options={SEGMENTS}
        value={segment}
        onChange={setSegment}
        style={styles.seg}
      />

      {liveForSegment.length > 0 ? (
        <>
          {liveForSegment.map((round) => (
            <RoundListCard
              key={round.id}
              round={round}
              detailRoutePrefix="/(tabs)/(home)/round"
              profileRoutePrefix="/(tabs)/(home)/profile"
            />
          ))}
        </>
      ) : null}

      {completedForSegment.length > 0 ? (
        <>
          <SectionLabel>Completed</SectionLabel>
          {completedForSegment.map((round) => (
            <CompletedRoundRow
              key={round.id}
              round={round}
              onPress={() =>
                router.push(`/(tabs)/(home)/round/${round.id}` as never)
              }
            />
          ))}
        </>
      ) : null}

      {nothingInSegment ? (
        <GlassCard strong style={styles.segmentEmpty}>
          <Text style={styles.segmentEmptyText}>
            {segment === 'live'
              ? 'No live rounds right now.'
              : 'Nothing from friends yet.'}
          </Text>
        </GlassCard>
      ) : null}
    </PullToRefreshScrollView>
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
    seg: {
      marginBottom: 6,
    },
    segmentEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
      marginTop: 12,
    },
    segmentEmptyText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
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
