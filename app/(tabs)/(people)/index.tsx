/**
 * People tab landing — Friends-primary list.
 *
 * Under the v6 redesign the People tab has no segmented control. Friends
 * are the primary content. Unlinked players surface only as a subtle
 * "drawer-link" card at the bottom of the list when there's at least one
 * unlinked entry; if zero, the drawer-link is hidden entirely.
 *
 * Pinned at the top: incoming friend-request banner, when applicable.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { Player, Round } from '@/types/golf';

function roundsTogether(playerId: string, rounds: Round[]): number {
  return rounds.filter((r) => r.playerIds.includes(playerId)).length;
}

export default function PeopleScreen() {
  const { colors } = useTheme();
  const { allPlayers, defaultPlayerId } = usePlayers();
  const { completedRounds } = useGolfRound();
  const { account } = useAccount();
  const { friends, incomingRequests, acceptIncomingRequest, declineIncomingRequest } = useSocial();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'text', text: 'PEOPLE' },
    right: { kind: 'profile' },
  });

  const friendsSet = useMemo(() => new Set(friends), [friends]);

  // Friend rows: dedupe by userId, prefer the most-played-with roster entry.
  const friendRows = useMemo(() => {
    return friends
      .map((userId) => {
        const candidates = allPlayers.filter((p) => p.userId === userId);
        if (candidates.length === 0) return null;
        const ranked = candidates
          .map((p) => ({ player: p, n: roundsTogether(p.id, completedRounds) }))
          .sort((a, b) => b.n - a.n);
        return ranked[0];
      })
      .filter((r): r is { player: Player; n: number } => r !== null)
      .sort((a, b) => a.player.nickname.localeCompare(b.player.nickname));
  }, [friends, allPlayers, completedRounds]);

  // Unlinked players = roster entries with no userId (and not the default
  // player, which represents the user themselves).
  const unlinkedCount = useMemo(() => {
    return allPlayers.filter(
      (p) =>
        p.id !== defaultPlayerId &&
        !(p.userId && friendsSet.has(p.userId))
    ).length;
  }, [allPlayers, defaultPlayerId, friendsSet]);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Friends</Text>

        {/* Incoming friend-request banner. */}
        {incomingRequests.length > 0 && (
          <View style={styles.requestBanner}>
            <Text style={styles.requestBannerHead}>
              ⏳  {incomingRequests.length === 1
                ? '1 FRIEND REQUEST'
                : `${incomingRequests.length} FRIEND REQUESTS`}
            </Text>
            {incomingRequests.map((req) => (
              <View key={req.id} style={styles.requestRow}>
                <View style={[styles.requestAvatar, { backgroundColor: req.fromAvatarColor }]}>
                  <Text style={styles.requestAvatarText}>
                    {req.fromDisplayName[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestFrom} numberOfLines={1}>
                    <Text style={styles.requestFromBold}>{req.fromDisplayName}</Text>{' '}
                    <Text style={styles.requestHandle}>@{req.fromHandle}</Text>
                  </Text>
                  <Text style={styles.requestSubtext}>wants to be friends</Text>
                </View>
                <View style={styles.requestActions}>
                  <Pressable
                    style={[styles.requestBtn, styles.requestBtnDanger]}
                    onPress={() => declineIncomingRequest(req.id)}>
                    <Text style={styles.requestBtnDangerText}>Decline</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.requestBtn, styles.requestBtnPrimary]}
                    onPress={() => acceptIncomingRequest(req.id)}>
                    <Text style={styles.requestBtnPrimaryText}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

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
        ) : friendRows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptyBody}>
              Find golf buddies on Tee Time by their @handle. They'll show up here once they
              accept your request.
            </Text>
            <Pressable
              style={styles.emptyCta}
              onPress={() => router.push('/(tabs)/(people)/search')}>
              <Text style={styles.emptyCtaText}>+  Find friends</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {friendRows.map(({ player, n }) => (
              <Pressable
                key={player.userId ?? player.id}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/(people)/[id]',
                    params: { id: player.id },
                  })
                }
                style={styles.rosterCard}>
                <View
                  style={[styles.avatar, { backgroundColor: player.color || colors.primary }]}>
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
            ))}
            <Pressable
              style={styles.findFriendsRow}
              onPress={() => router.push('/(tabs)/(people)/search')}>
              <Text style={styles.findFriendsText}>+  Find more friends</Text>
            </Pressable>
          </>
        )}

        {/* Unlinked drawer-link, hidden entirely when count = 0. */}
        {account && unlinkedCount > 0 && (
          <Pressable
            style={styles.drawerLink}
            onPress={() => router.push('/(tabs)/(people)/unlinked')}>
            <Text style={styles.drawerLinkLabel}>
              👤  Unlinked players
              <Text style={styles.drawerLinkCount}>  · {unlinkedCount}</Text>
            </Text>
            <Text style={styles.drawerLinkChev}>›</Text>
          </Pressable>
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
    drawerLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      paddingHorizontal: 12,
      paddingVertical: 11,
      backgroundColor: colors.chipBg,
      borderRadius: 10,
    },
    drawerLinkLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
    drawerLinkCount: { fontWeight: '800' },
    drawerLinkChev: { fontSize: 16, color: colors.textMuted, opacity: 0.6 },
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
    requestBanner: {
      backgroundColor: '#fff8e7',
      borderColor: '#f5e0b8',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    requestBannerHead: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    requestAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    requestAvatarText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
    requestInfo: { flex: 1, minWidth: 0 },
    requestFrom: { fontSize: 12, color: '#6b5a3a' },
    requestFromBold: { color: colors.textTitle, fontWeight: '800' },
    requestHandle: { color: colors.primaryDark, fontWeight: '700' },
    requestSubtext: { fontSize: 10.5, color: '#8a7656', marginTop: 1 },
    requestActions: { flexDirection: 'row', gap: 6 },
    requestBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7 },
    requestBtnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e0d0a8' },
    requestBtnDangerText: { color: '#7c6b4f', fontSize: 11, fontWeight: '800' },
    requestBtnPrimary: { backgroundColor: colors.primary },
    requestBtnPrimaryText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  });
}
