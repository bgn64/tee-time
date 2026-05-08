/**
 * People tab landing — Roster ↔ Friends segmented control.
 *
 * Roster: everyone in PlayerContext. Each row badges as YOU (default player),
 * FRIEND (Player.userId set AND that userId is in the friends list), or
 * UNCLAIMED (no userId, or userId not friended).
 *
 * Friends: post-account, lists each linked friend as a row (deduped by
 * userId — multiple Players can share a userId, in which case we surface
 * the most-played-with one). Pre-account, shows the existing "coming soon"
 * empty state pointing at sign-in.
 *
 * Phase 3 step 8 additions:
 *   · Incoming-friend-request banner pinned above the segmented control
 *     when `incomingRequests` has any pending entries. Accept opens the
 *     bulk-claim sheet for shared past rounds; decline silently removes.
 *   · "@handle" chip rendered inline on FRIEND rows.
 *   · Friends-segment populated state with CTA into source-less search.
 *   · Explainer card auto-hides post-sign-in (not strictly required but
 *     keeps the cap-height clean once the user already understands the
 *     model).
 *
 * Tap a roster row → /(tabs)/(people)/[id].
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BulkClaimSheet } from '@/components/BulkClaimSheet';
import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { Player, Round } from '@/types/golf';

type SegmentKey = 'roster' | 'friends';

function roundsTogether(playerId: string, completedRounds: Round[]): number {
  return completedRounds.filter((r) => r.playerIds.includes(playerId)).length;
}

export default function PeopleScreen() {
  const { colors } = useTheme();
  const { allPlayers, defaultPlayerId } = usePlayers();
  const { completedRounds } = useGolfRound();
  const { account } = useAccount();
  const { friends, incomingRequests, acceptIncomingRequest, declineIncomingRequest } = useSocial();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [segment, setSegment] = useState<SegmentKey>('roster');
  const [bulkClaim, setBulkClaim] = useState<{
    friendName: string;
    friendPlayerId: string;
    rounds: Round[];
  } | null>(null);

  useScreenHeader({
    left: { kind: 'text', text: 'PEOPLE' },
    right: { kind: 'profile' },
  });

  const friendsSet = useMemo(() => new Set(friends), [friends]);

  const isLinkedFriend = (player: Player) =>
    Boolean(player.userId && friendsSet.has(player.userId));

  const friendsCount = friends.length;

  // Build the Friends-segment row list: dedupe by userId, pick the most-played-with
  // Player to render. Falls back to the first match if we have no rounds.
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

  const onAcceptIncoming = async (requestId: string) => {
    const result = await acceptIncomingRequest(requestId);
    if (!result) return;
    if (result.sharedRounds.length > 0 && result.matchedPlayerId) {
      const matched = allPlayers.find((p) => p.id === result.matchedPlayerId);
      setBulkClaim({
        friendName: matched?.nickname ?? 'New friend',
        friendPlayerId: result.matchedPlayerId,
        rounds: result.sharedRounds,
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.fixedTop}>
        <Text style={styles.title}>People</Text>

        {!account && (
          <View style={styles.explainCard}>
            <Text style={styles.explainHead}>📖  HOW THIS WORKS</Text>
            <Text style={styles.explainBody}>
              <Text style={styles.explainBold}>Roster</Text> is everyone you've golfed with — even
              if they don't have an account. Once accounts ship, you'll be able to link a roster
              entry to a real user, turning them into a <Text style={styles.explainBold}>Friend</Text>.
            </Text>
          </View>
        )}

        {/* Pinned incoming request banner — visible regardless of active segment
            so the user can act on it from either tab. */}
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
                    onPress={() => onAcceptIncoming(req.id)}>
                    <Text style={styles.requestBtnPrimaryText}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.segs}>
          <Pressable
            onPress={() => setSegment('roster')}
            style={[styles.seg, segment === 'roster' && styles.segActive]}>
            <Text style={[styles.segText, segment === 'roster' && styles.segTextActive]}>
              Roster
              <Text style={[styles.segCount, segment === 'roster' && styles.segCountActive]}>
                {' '}
                {allPlayers.length}
              </Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSegment('friends')}
            style={[styles.seg, segment === 'friends' && styles.segActive]}>
            <Text style={[styles.segText, segment === 'friends' && styles.segTextActive]}>
              Friends
              <Text style={[styles.segCount, segment === 'friends' && styles.segCountActive]}>
                {' '}
                {friendsCount}
              </Text>
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {segment === 'roster' ? (
          allPlayers.map((player) => {
            const isYou = player.id === defaultPlayerId;
            const linked = isLinkedFriend(player);
            const rounds = roundsTogether(player.id, completedRounds);
            const subtext = isYou
              ? `${rounds} ${rounds === 1 ? 'round' : 'rounds'} played`
              : rounds === 0
              ? 'No rounds together yet'
              : `${rounds} ${rounds === 1 ? 'round' : 'rounds'} together`;
            return (
              <Pressable
                key={player.id}
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
                    {linked && player.handle ? (
                      <Text style={styles.handleChip}> @{player.handle}</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.rosterMeta}>{subtext}</Text>
                </View>
                {isYou ? (
                  <Text style={[styles.badge, styles.badgeYou]}>YOU</Text>
                ) : linked ? (
                  <Text style={[styles.badge, styles.badgeFriend]}>FRIEND</Text>
                ) : (
                  <Text style={styles.badge}>UNCLAIMED</Text>
                )}
                <Text style={styles.chev}>›</Text>
              </Pressable>
            );
          })
        ) : !account ? (
          // Pre-account: existing "coming soon" empty state.
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>Friends are coming soon</Text>
            <Text style={styles.emptyBody}>
              Once accounts ship, you'll be able to link roster entries to real users and connect
              with golf buddies who also use the app.
            </Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push('/sign-in')}>
              <Text style={styles.emptyCtaText}>Sign in</Text>
            </Pressable>
          </View>
        ) : friendRows.length === 0 ? (
          // Post-account, no friends yet.
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptyBody}>
              Find golf buddies on Tee Time by their @handle. They'll be added to your roster
              automatically once you're linked.
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
                    {n > 0 ? ` · ${n} ${n === 1 ? 'round' : 'rounds'} together` : ' · 0 rounds together yet'}
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
      </ScrollView>

      {bulkClaim && (
        <BulkClaimSheet
          friendName={bulkClaim.friendName}
          friendPlayerId={bulkClaim.friendPlayerId}
          rounds={bulkClaim.rounds}
          onClose={() => setBulkClaim(null)}
        />
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    fixedTop: {
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 12,
    },
    explainCard: {
      backgroundColor: colors.accent + '15',
      borderColor: colors.accent + '44',
      borderWidth: 1,
      borderRadius: 10,
      padding: 11,
      marginBottom: 10,
    },
    explainHead: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    explainBody: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textBody,
    },
    explainBold: {
      fontWeight: '800',
      color: colors.textTitle,
    },
    segs: {
      flexDirection: 'row',
      gap: 4,
      backgroundColor: colors.chipBg,
      borderRadius: 12,
      padding: 4,
      marginBottom: 4,
    },
    seg: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 8,
    },
    segActive: {
      backgroundColor: colors.cardBg,
    },
    segText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    segTextActive: {
      color: colors.textTitle,
    },
    segCount: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      opacity: 0.75,
    },
    segCountActive: {
      color: colors.primaryDark,
      opacity: 0.9,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 12,
      paddingBottom: 32,
      flexGrow: 1,
    },
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
    avatarText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '800',
    },
    rosterBody: {
      flex: 1,
      minWidth: 0,
    },
    rosterName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    rosterMeta: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    badge: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.6,
      backgroundColor: colors.chipBg,
      color: colors.textMuted,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 5,
      overflow: 'hidden',
    },
    badgeYou: {
      backgroundColor: colors.accent + '22',
      color: colors.accent,
    },
    badgeFriend: {
      backgroundColor: colors.primary + '22',
      color: colors.primaryDark,
    },
    chev: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textMuted,
      opacity: 0.5,
      marginLeft: 2,
    },
    emptyWrap: {
      alignItems: 'center',
      gap: 6,
      paddingTop: 56,
      paddingHorizontal: 20,
    },
    emptyIcon: {
      fontSize: 36,
      marginBottom: 4,
      opacity: 0.6,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textTitle,
    },
    emptyBody: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 270,
    },
    phaseBadge: {
      marginTop: 14,
      backgroundColor: '#fbbf24',
      borderRadius: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    phaseBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: '#ffffff',
    },
    handleChip: {
      fontSize: 11,
      color: colors.primaryDark,
      fontWeight: '700',
    },
    rosterMetaFriend: {
      color: colors.primaryDark,
      fontWeight: '600',
    },
    requestBanner: {
      backgroundColor: '#fff8e7',
      borderColor: '#f5e0b8',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    requestBannerHead: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    requestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    requestAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    requestAvatarText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 12,
    },
    requestInfo: {
      flex: 1,
      minWidth: 0,
    },
    requestFrom: {
      fontSize: 12,
      color: '#6b5a3a',
    },
    requestFromBold: {
      color: colors.textTitle,
      fontWeight: '800',
    },
    requestHandle: {
      color: colors.primaryDark,
      fontWeight: '700',
    },
    requestSubtext: {
      fontSize: 10.5,
      color: '#8a7656',
      marginTop: 1,
    },
    requestActions: {
      flexDirection: 'row',
      gap: 6,
    },
    requestBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 7,
    },
    requestBtnDanger: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: '#e0d0a8',
    },
    requestBtnDangerText: {
      color: '#7c6b4f',
      fontSize: 11,
      fontWeight: '800',
    },
    requestBtnPrimary: {
      backgroundColor: colors.primary,
    },
    requestBtnPrimaryText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '800',
    },
    emptyCta: {
      marginTop: 14,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    emptyCtaText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 13,
    },
    findFriendsRow: {
      marginTop: 4,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: 'center',
    },
    findFriendsText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
  });
}
