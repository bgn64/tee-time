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
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import FontAwesome from '@expo/vector-icons/FontAwesome';

import { FeedCardLarge } from '@/components/FeedCardLarge';
import { IncomingRequestsBanner } from '@/components/IncomingRequestsBanner';
import { LiveRoundStrip } from '@/components/LiveRoundStrip';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { useToast } from '@/state/ToastContext';

/** True on desktop web only; mobile (including iPad Safari & touchscreen
 * web) keeps using pull-to-refresh. Used to gate the manual refresh
 * button — RefreshControl pull-to-refresh has no equivalent mouse
 * gesture, so desktop users need a visible affordance. */
const IS_WEB = Platform.OS === 'web';

export default function FeedScreen() {
  const { colors } = useTheme();
  const { account } = useAccount();
  const { friends, profileCache, refreshFriendsAndRequests } = useSocial();
  const { completedRounds, liveRounds, refreshScorecards } = useGolfRound();
  const { allPlayers } = usePlayers();
  const { show: toastShow } = useToast();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [scoresResult, socialResult] = await Promise.all([
        refreshScorecards(),
        refreshFriendsAndRequests(),
      ]);
      if (!scoresResult.ok || !socialResult.ok) {
        toastShow("Couldn't refresh. Check your connection and try again.", {
          autoHideMs: 4000,
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshScorecards, refreshFriendsAndRequests, toastShow]);

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
      <ScrollView style={styles.container} contentContainerStyle={styles.contentEmpty}>
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
        <ScrollView style={styles.container} contentContainerStyle={styles.contentEmpty}>
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
      {IS_WEB ? (
        <View style={styles.webRefreshRow}>
          <Pressable
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityLabel="Refresh feed"
            style={({ pressed }) => [
              styles.webRefreshBtn,
              pressed && styles.webRefreshBtnPressed,
              refreshing && styles.webRefreshBtnDisabled,
            ]}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <FontAwesome name="refresh" size={12} color={colors.textMuted} />
            )}
            <Text style={styles.webRefreshLabel}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Text>
          </Pressable>
        </View>
      ) : null}
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
    webRefreshRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 8,
    },
    webRefreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    webRefreshBtnPressed: {
      opacity: 0.6,
    },
    webRefreshBtnDisabled: {
      opacity: 0.5,
    },
    webRefreshLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.3,
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
