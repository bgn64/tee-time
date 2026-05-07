/**
 * Person detail — per-roster-entry view. Shows avatar, name, badge, count of
 * rounds together, recent rounds, and (depending on state) one of:
 *   · "Connect to a friend →" CTA — when signed in, the entry isn't linked,
 *     and isn't the user themselves. Routes into the friend-search flow.
 *   · "REQUEST PENDING" pill — when there's an outgoing pending friend
 *     request whose `sourcePlayerId` matches this entry. The label is
 *     intentionally informational (no cancel-request affordance shipped
 *     in this step; flips to FRIEND on auto-accept).
 *   · Nothing — for YOU, FRIEND, or pre-account UNCLAIMED entries.
 *
 * Step 8 also threads the FRIEND chip + @handle inline alongside the
 * UNCLAIMED-vs-FRIEND-vs-YOU badge.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';
import { Round } from '@/types/golf';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getRoundDate(round: Round): Date {
  return new Date(round.completedAt ?? round.startedAt);
}

function formatDate(d: Date): string {
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { getPlayer, defaultPlayerId } = usePlayers();
  const { completedRounds } = useGolfRound();
  const { account } = useAccount();
  const { friends, outgoingRequests } = useSocial();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'People', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const player = id ? getPlayer(id) : undefined;

  const rounds = useMemo(() => {
    if (!player) return [];
    return completedRounds
      .filter((r) => r.playerIds.includes(player.id))
      .sort((a, b) => getRoundDate(b).getTime() - getRoundDate(a).getTime());
  }, [completedRounds, player]);

  if (!player) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundIcon}>👤</Text>
        <Text style={styles.notFoundTitle}>Player not found</Text>
        <Text style={styles.notFoundBody}>
          They may have been removed from your roster.
        </Text>
      </View>
    );
  }

  const isYou = player.id === defaultPlayerId;
  const linked = Boolean(player.userId && friends.includes(player.userId));
  const pendingRequest = outgoingRequests.find(
    (r) => r.sourcePlayerId === player.id && r.status === 'pending'
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={[styles.bigAvatar, { backgroundColor: player.color || colors.primary }]}>
          <Text style={styles.bigAvatarText}>{player.nickname[0]?.toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{player.nickname}</Text>
        {linked && player.handle ? (
          <Text style={styles.handleLine}>@{player.handle}</Text>
        ) : null}
        <View style={styles.badgeRow}>
          {isYou && <Text style={[styles.badge, styles.badgeYou]}>YOU · DEFAULT PLAYER</Text>}
          {!isYou && linked && <Text style={[styles.badge, styles.badgeFriend]}>FRIEND</Text>}
          {!isYou && !linked && <Text style={styles.badge}>UNCLAIMED</Text>}
        </View>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statNum}>{rounds.length}</Text>
        <Text style={styles.statLabel}>
          {rounds.length === 1
            ? isYou ? 'round played' : 'round together'
            : isYou ? 'rounds played' : 'rounds together'}
        </Text>
      </View>

      {/* Connect-to-a-friend CTA — only when there's an account, this entry
          isn't already linked, isn't the user, and there's no in-flight
          outgoing request from this row. */}
      {!isYou && !linked && account && !pendingRequest && (
        <View style={styles.connectBlock}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(tabs)/(people)/search',
                params: { sourcePlayerId: player.id },
              })
            }
            style={({ pressed }) => [styles.connectBtn, pressed && styles.connectBtnPressed]}>
            <Text style={styles.connectBtnText}>Connect to a friend  →</Text>
          </Pressable>
          <Text style={styles.connectExplainer}>
            Link {player.nickname} to a real account so they can see your shared rounds.
          </Text>
        </View>
      )}

      {/* Outgoing-pending state — unique to source-rooted requests. */}
      {!isYou && !linked && pendingRequest && (
        <View style={styles.pendingBlock}>
          <Text style={styles.pendingPill}>REQUEST PENDING</Text>
          <Text style={styles.pendingExplainer}>
            Sent to <Text style={styles.pendingExplainerEm}>@{pendingRequest.toHandle}</Text>.
            Once they accept, this entry will link automatically.
          </Text>
        </View>
      )}

      {/* Pre-account UNCLAIMED entries get the original Phase 1 explainer. */}
      {!isYou && !linked && !account && (
        <View style={styles.connectBlock}>
          <View style={styles.connectBtnDisabled}>
            <Text style={styles.connectBtnText}>Connect to a friend  →</Text>
          </View>
          <Text style={styles.connectExplainer}>
            Sign in to link {player.nickname} to a real account. Their shared rounds will appear
            on both of your histories.
          </Text>
        </View>
      )}

      {rounds.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionLabel}>RECENT ROUNDS</Text>
          {rounds.slice(0, 5).map((round) => (
            <Pressable
              key={round.id}
              style={styles.roundRow}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/(rounds)/[id]',
                  params: { id: round.id },
                })
              }>
              <View style={styles.roundInfo}>
                <Text style={styles.roundCourse} numberOfLines={1}>
                  {round.course.name}
                </Text>
                <Text style={styles.roundMeta}>
                  {round.scoringRule === 'scramble' ? 'Scramble' : 'Stroke'} ·{' '}
                  {formatDate(getRoundDate(round))}
                </Text>
              </View>
              <Text style={styles.roundChev}>›</Text>
            </Pressable>
          ))}
          {rounds.length > 5 && (
            <Text style={styles.moreNote}>+ {rounds.length - 5} more</Text>
          )}
        </View>
      )}
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
      padding: 20,
      paddingBottom: 40,
    },
    profileCard: {
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      paddingVertical: 22,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    bigAvatar: {
      width: 78,
      height: 78,
      borderRadius: 39,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    bigAvatarText: {
      color: '#ffffff',
      fontSize: 30,
      fontWeight: '800',
    },
    name: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    handleLine: {
      fontSize: 13,
      color: colors.primaryDark,
      fontWeight: '700',
      marginTop: 2,
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 8,
    },
    badge: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.6,
      backgroundColor: colors.chipBg,
      color: colors.textMuted,
      paddingHorizontal: 7,
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
    statsCard: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 12,
    },
    statNum: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textTitle,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    connectBlock: {
      marginBottom: 16,
    },
    connectBtn: {
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.primary,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.cardBg,
    },
    connectBtnDisabled: {
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      opacity: 0.7,
    },
    connectBtnPressed: {
      opacity: 0.6,
    },
    connectBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primaryDark,
    },
    connectExplainer: {
      fontSize: 11.5,
      color: colors.textMuted,
      lineHeight: 17,
      textAlign: 'center',
      paddingHorizontal: 8,
      marginTop: 8,
      fontStyle: 'italic',
    },
    pendingBlock: {
      marginBottom: 16,
      alignItems: 'center',
    },
    pendingPill: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.7,
      backgroundColor: '#fff8e7',
      color: colors.accent,
      borderWidth: 1,
      borderColor: '#f5e0b8',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      overflow: 'hidden',
    },
    pendingExplainer: {
      fontSize: 11.5,
      color: colors.textMuted,
      lineHeight: 17,
      textAlign: 'center',
      paddingHorizontal: 8,
      marginTop: 8,
      fontStyle: 'italic',
    },
    pendingExplainerEm: {
      color: colors.primaryDark,
      fontWeight: '700',
      fontStyle: 'normal',
    },
    recentSection: {
      marginTop: 8,
    },
    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.textMuted,
      marginBottom: 8,
    },
    roundRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 5,
      gap: 8,
    },
    roundInfo: {
      flex: 1,
      minWidth: 0,
    },
    roundCourse: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
    },
    roundMeta: {
      fontSize: 10.5,
      color: colors.textMuted,
      marginTop: 2,
    },
    roundChev: {
      fontSize: 18,
      color: colors.textMuted,
      opacity: 0.5,
    },
    moreNote: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: 6,
    },
    notFound: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      padding: 32,
      gap: 8,
    },
    notFoundIcon: {
      fontSize: 36,
      opacity: 0.5,
      marginBottom: 4,
    },
    notFoundTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
    },
    notFoundBody: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 240,
    },
  });
}
