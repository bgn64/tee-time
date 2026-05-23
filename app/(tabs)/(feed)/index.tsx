/**
 * Feed tab — chronological list of friends' completed rounds.
 *
 * Each round renders as a large, self-contained FeedCardLarge — no
 * tap-through, optional caption + tee swatches handled gracefully.
 * The in-page "Feed" title is dropped (the persistent app header
 * already labels the tab).
 *
 * Three empty states (pre-account / no friends / no friend rounds)
 * keep the previous shape and CTAs.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FeedCardLarge } from '@/components/FeedCardLarge';
import { IncomingRequestsBanner } from '@/components/IncomingRequestsBanner';
import { LiveRoundStrip } from '@/components/LiveRoundStrip';
import { RefreshButton } from '@/components/RefreshButton';
import { useAccount } from '@/state/AccountContext';
import { useFriends } from '@/state/FriendsContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useProfileCache } from '@/state/ProfileCacheContext';
import { useScreenRefresh } from '@/state/useScreenRefresh';
import { useTheme } from '@/state/ThemeContext';

export default function FeedScreen() {
  const { colors } = useTheme();
  const { account } = useAccount();
  const { friends, refreshFriendsAndRequests } = useFriends();
  const { profileCache } = useProfileCache();
  const { completedRounds, liveRounds, refreshScorecards } = useGolfRound();
  const { allPlayers } = usePlayers();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'text', text: 'FEED' },
    right: { kind: 'profile' },
  });

  // Feed: every Round visible to the viewer that isn't owned by them.
  // RLS already restricts visibility to owner-or-friend-of-owner, so the
  // remaining rows are friend-owned. Sort by completedAt desc.
  const friendRounds = useMemo(() => {
    const myId = account?.userId;
    const rows = completedRounds.filter((r) => r.ownerUserId && r.ownerUserId !== myId);
    return [...rows].sort((a, b) => {
      const at = new Date(a.completedAt ?? a.startedAt).getTime();
      const bt = new Date(b.completedAt ?? b.startedAt).getTime();
      return bt - at;
    });
  }, [completedRounds, account]);

  const { refreshing, onRefresh } = useScreenRefresh([
    refreshScorecards,
    refreshFriendsAndRequests,
  ]);

  // -------- Empty states --------
  if (!account) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentEmpty}>
        <View style={styles.preaccountBanner}>
          <Text style={styles.preaccountHead}>✦  SIGN IN TO UNLOCK</Text>
          <Text style={styles.preaccountBody}>
            The feed shows rounds your friends have scored. Sign in and connect with friends to
            see them roll in here in real time.
          </Text>
          <Pressable style={styles.preaccountBtn} onPress={() => router.push('/sign-in')}>
            <Text style={styles.preaccountBtnText}>Sign in</Text>
          </Pressable>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📰</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>
            Once you have an account, your friends' rounds will appear here chronologically.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (friends.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }>
        <RefreshButton
          refreshing={refreshing}
          onPress={onRefresh}
          accessibilityLabel="Refresh feed"
        />
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Find friends to see their rounds</Text>
          <Text style={styles.emptyBody}>
            Search for friends by their <Text style={styles.codeChip}>@handle</Text> and add them.
            Their completed rounds will appear here.
          </Text>
          <Pressable
            style={styles.primaryCta}
            onPress={() => router.push('/(tabs)/(you)/friends/search')}>
            <Text style={styles.primaryCtaText}>+  Find friends</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (friendRounds.length === 0) {
    // Even with no completed friend rounds, surface a live strip if a
    // friend happens to be scoring right now — otherwise fall through
    // to the regular empty state.
    if (liveRounds.length === 0) {
      return (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }>
          <RefreshButton
            refreshing={refreshing}
            onPress={onRefresh}
            accessibilityLabel="Refresh feed"
          />
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>⛳</Text>
            <Text style={styles.emptyTitle}>No friend rounds yet</Text>
            <Text style={styles.emptyBody}>
              You're connected with friends, but no one has scored a round you can see yet. Your own
              rounds live in the <Text style={styles.emptyBodyEm}>Rounds</Text> tab.
            </Text>
            <Pressable
              style={styles.outlineCta}
              onPress={() => router.push('/(tabs)/(rounds)')}>
              <Text style={styles.outlineCtaText}>View Rounds</Text>
            </Pressable>
          </View>
        </ScrollView>
      );
    }
  }

  // -------- Populated feed --------
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }>
      <IncomingRequestsBanner />
      <RefreshButton
        refreshing={refreshing}
        onPress={onRefresh}
        accessibilityLabel="Refresh feed"
      />
      <LiveRoundStrip rounds={liveRounds} profileCache={profileCache} />
      {friendRounds.map((round) => (
        <FeedCardLarge
          key={round.id}
          round={round}
          allPlayers={allPlayers}
          profileCache={profileCache}
        />
      ))}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 14,
      paddingBottom: 40,
    },
    contentEmpty: {
      padding: 20,
      paddingBottom: 40,
      flexGrow: 1,
    },

    empty: {
      alignItems: 'center',
      paddingTop: 40,
      paddingHorizontal: 16,
      gap: 10,
    },
    emptyIcon: {
      fontSize: 38,
      opacity: 0.5,
    },
    emptyTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: colors.textTitle,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 270,
    },
    emptyBodyEm: {
      color: colors.textTitle,
      fontWeight: '800',
    },
    codeChip: {
      fontFamily: 'SpaceMono',
      fontSize: 11,
      color: colors.primaryDark,
    },
    primaryCta: {
      marginTop: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    primaryCtaText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 13,
    },
    outlineCta: {
      marginTop: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    outlineCtaText: {
      color: colors.primaryDark,
      fontWeight: '800',
      fontSize: 13,
    },

    preaccountBanner: {
      backgroundColor: '#fff8e7',
      borderColor: '#f5e0b8',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    preaccountHead: {
      fontSize: 10,
      color: colors.accent,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    preaccountBody: {
      fontSize: 12,
      color: '#6b5a3a',
      lineHeight: 18,
      marginBottom: 10,
    },
    preaccountBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 9,
      alignItems: 'center',
    },
    preaccountBtnText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '800',
    },
  });
}
