/**
 * Friends list — reached by drill-in from the You tab's "Friends" row.
 *
 * Friends are the sole user-facing content. Local players (roster rows
 * without a linked user account) are intentionally invisible here: they
 * exist in the backend so stats and avatar colors stay consistent for
 * recurring non-app guests, but they are not browsable as an entity from
 * any top-level surface. See plan.md (Path 3a) for rationale.
 *
 * Pinned at the top: the shared IncomingRequestsBanner, when applicable.
 * The same banner also lives on the Feed tab so users always see pending
 * requests at the moment they open the app.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IncomingRequestsBanner } from '@/components/IncomingRequestsBanner';
import { RefreshButton } from '@/components/RefreshButton';
import { useAccount } from '@/state/AccountContext';
import { useFriends } from '@/state/FriendsContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useProfileCache } from '@/state/ProfileCacheContext';
import { useScreenRefresh } from '@/state/useScreenRefresh';
import { useTheme } from '@/state/ThemeContext';
import { Player, Round } from '@/types/golf';
import { ProfileSummary } from '@/types/social';

function roundsTogether(playerId: string, rounds: Round[]): number {
  return rounds.filter((r) => r.playerIds.includes(playerId)).length;
}

type FriendRow =
  | { kind: 'roster'; userId: string; player: Player; roundsTogether: number }
  | { kind: 'cached'; userId: string; profile: ProfileSummary }
  | { kind: 'placeholder'; userId: string };

export default function FriendsScreen() {
  const { colors } = useTheme();
  const { allPlayers } = usePlayers();
  const { completedRounds } = useGolfRound();
  const { account } = useAccount();
  const { friends, refreshFriendsAndRequests } = useFriends();
  const { profileCache, refreshProfiles } = useProfileCache();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'You', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  // Pull-to-refresh re-pulls friends + requests AND force-refreshes the
  // profileCache entries for the current friend list so display name /
  // avatar color edits made by a friend on their device propagate
  // here without restarting the app. friends[] is the input (stable
  // identity from SocialContext); the empty case short-circuits inside
  // refreshProfiles.
  const { refreshing, onRefresh } = useScreenRefresh([
    refreshFriendsAndRequests,
    () => refreshProfiles(friends),
  ]);

  // One row per friend userId. Never silently drop a friend — fall back
  // through roster → profileCache → placeholder so the list always reflects
  // `friends` 1:1. The roster path is preferred (it carries rounds-together
  // counts and the user-customized nickname).
  const friendRows: FriendRow[] = useMemo(() => {
    const rows: FriendRow[] = friends.map((userId) => {
      const candidates = allPlayers.filter((p) => p.userId === userId);
      if (candidates.length > 0) {
        const ranked = candidates
          .map((p) => ({ player: p, n: roundsTogether(p.id, completedRounds) }))
          .sort((a, b) => b.n - a.n);
        return {
          kind: 'roster' as const,
          userId,
          player: ranked[0].player,
          roundsTogether: ranked[0].n,
        };
      }
      const cached = profileCache[userId];
      if (cached) {
        return { kind: 'cached' as const, userId, profile: cached };
      }
      return { kind: 'placeholder' as const, userId };
    });
    return rows.sort((a, b) => {
      const nameA =
        a.kind === 'roster'
          ? a.player.nickname
          : a.kind === 'cached'
          ? a.profile.displayName
          : a.userId;
      const nameB =
        b.kind === 'roster'
          ? b.player.nickname
          : b.kind === 'cached'
          ? b.profile.displayName
          : b.userId;
      return nameA.localeCompare(nameB);
    });
  }, [friends, allPlayers, completedRounds, profileCache]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
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
          accessibilityLabel="Refresh friends"
        />
        <Text style={styles.title}>Friends</Text>

        <IncomingRequestsBanner />

        {!account ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>Friends are coming soon</Text>
            <Text style={styles.emptyBody}>
              Once accounts ship, you'll be able to connect with golf buddies who also use the app
              by their @handle.
            </Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push('/sign-in')}>
              <Text style={styles.emptyCtaText}>Sign in</Text>
            </Pressable>
          </View>
        ) : friends.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptyBody}>
              Find golf buddies on Tee Time by their @handle. They'll show up here once they
              accept your request.
            </Text>
            <Pressable
              style={styles.emptyCta}
              onPress={() => router.push('/(tabs)/(you)/friends/search')}>
              <Text style={styles.emptyCtaText}>+  Find friends</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {friendRows.map((row) => {
              if (row.kind === 'roster') {
                const { player, roundsTogether: n } = row;
                return (
                  <Pressable
                    key={row.userId}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/(you)/friends/[id]',
                        params: { id: player.id },
                      })
                    }
                    style={styles.rosterCard}>
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: player.color || colors.primary },
                      ]}>
                      <Text style={styles.avatarText}>{player.nickname[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={styles.rosterBody}>
                      <Text style={styles.rosterName} numberOfLines={1}>
                        {player.nickname}
                      </Text>
                      <Text style={[styles.rosterMeta, styles.rosterMetaFriend]}>
                        @{player.handle}
                        {n > 0
                          ? ` · ${n} ${n === 1 ? 'round' : 'rounds'} together`
                          : ' · 0 rounds together yet'}
                      </Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                );
              }
              if (row.kind === 'cached') {
                const { profile } = row;
                return (
                  <Pressable
                    key={row.userId}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/(you)/friends/[id]',
                        params: { id: row.userId },
                      })
                    }
                    style={styles.rosterCard}>
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: profile.avatarColor || colors.primary },
                      ]}>
                      <Text style={styles.avatarText}>
                        {profile.displayName[0]?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.rosterBody}>
                      <Text style={styles.rosterName} numberOfLines={1}>
                        {profile.displayName}
                      </Text>
                      <Text style={[styles.rosterMeta, styles.rosterMetaFriend]}>
                        @{profile.handle} · 0 rounds together yet
                      </Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                );
              }
              return (
                <View key={row.userId} style={styles.rosterCard}>
                  <View style={[styles.avatar, { backgroundColor: colors.textMuted }]}>
                    <Text style={styles.avatarText}>·</Text>
                  </View>
                  <View style={styles.rosterBody}>
                    <Text style={[styles.rosterName, { color: colors.textMuted }]} numberOfLines={1}>
                      Loading…
                    </Text>
                  </View>
                </View>
              );
            })}
            <Pressable
              style={styles.findFriendsRow}
              onPress={() => router.push('/(tabs)/(you)/friends/search')}>
              <Text style={styles.findFriendsText}>+  Find more friends</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 40, flexGrow: 1 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textTitle, marginBottom: 12 },
    rosterCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 11,
      marginBottom: 7,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
    rosterBody: { flex: 1, minWidth: 0 },
    rosterName: { fontSize: 14, fontWeight: '700', color: colors.textTitle },
    rosterMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    rosterMetaFriend: { color: colors.primaryDark, fontWeight: '600' },
    chev: { fontSize: 18, fontWeight: '700', color: colors.textMuted, opacity: 0.5, marginLeft: 2 },
    findFriendsRow: {
      marginTop: 4,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: 'center',
    },
    findFriendsText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
    emptyWrap: { alignItems: 'center', gap: 6, paddingTop: 56, paddingHorizontal: 20 },
    emptyIcon: { fontSize: 36, marginBottom: 4, opacity: 0.6 },
    emptyTitle: { fontSize: 14, fontWeight: '800', color: colors.textTitle },
    emptyBody: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 270,
    },
    emptyCta: {
      marginTop: 14,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    emptyCtaText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  });
}
