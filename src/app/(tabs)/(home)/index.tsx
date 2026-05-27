/**
 * Home tab — friend-rounds feed.
 *
 * Reads from `useFeedRounds()` — a thin PowerSync projection over
 * local SQLite that filters scorecards through the local `friendships`
 * join (so unfriending hides cards immediately even before PowerSync
 * prunes the cached rows). Live rounds (in-flight, ≥1 score) pin to
 * the top with a pulsing IN PROGRESS pill; completed rounds follow.
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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { FeedCardLarge } from '@/components/feed/FeedCardLarge';
import { IncomingRequestsBanner } from '@/components/social/IncomingRequestsBanner';
import { useFeedRounds } from '@/library/golf/useFeedRounds';
import { useFriends } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

export default function HomeFeedScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const { friends, hydrated: friendsHydrated } = useFriends();
  const { liveRounds, completedRounds, isLoading: feedLoading } = useFeedRounds();

  const feedRounds = React.useMemo(
    () => [...liveRounds, ...completedRounds],
    [liveRounds, completedRounds]
  );

  // Tap-through wires every scorecard cell to a Home-stack push so
  // the back stack stays inside the Home tab.
  const onPressParticipant = React.useCallback(
    (userId: string) => {
      router.push(`/(tabs)/(home)/profile/${userId}` as never);
    },
    [router]
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
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScrollView>
    );
  }

  if (friends.length === 0) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentEmpty}>
        <IncomingRequestsBanner style={styles.banner} />
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Find friends to see their rounds</Text>
          <Text style={styles.emptyBody}>
            Search for friends by their <Text style={styles.codeChip}>@handle</Text> and add
            them. Their rounds will show up here.
          </Text>
          <Pressable
            style={styles.primaryCta}
            onPress={() => router.push('/(tabs)/(search)' as never)}>
            <Text style={styles.primaryCtaText}>+  Find friends</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (feedRounds.length === 0) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentEmpty}>
        <IncomingRequestsBanner style={styles.banner} />
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⛳</Text>
          <Text style={styles.emptyTitle}>No friend rounds yet</Text>
          <Text style={styles.emptyBody}>
            You&apos;re connected with friends, but no one has scored a round you can see yet.
            Your own rounds live on the <Text style={styles.emptyBodyEm}>Score</Text> tab.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}>
      <IncomingRequestsBanner style={styles.banner} />
      {feedRounds.map((fr) => (
        <FeedCardLarge
          key={fr.round.id}
          feedRound={fr}
          onPressParticipant={onPressParticipant}
        />
      ))}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.background
    },
    content: {
      padding: 14,
      paddingBottom: 40
    },
    contentEmpty: {
      padding: 20,
      paddingBottom: 40,
      flexGrow: 1
    },
    banner: {
      marginBottom: 14
    },
    empty: {
      alignItems: 'center',
      paddingTop: 40,
      paddingHorizontal: 16,
      gap: 10
    },
    emptyIcon: {
      fontSize: 38,
      opacity: 0.5
    },
    emptyTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: colors.textTitle,
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
      color: colors.primary
    },
    primaryCta: {
      marginTop: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary
    },
    primaryCtaText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 13
    }
  });
}
