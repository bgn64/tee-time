/**
 * People tab landing — Roster ↔ Friends segmented control.
 *
 * Roster: everyone in PlayerContext. Each row badges as YOU (default player) or
 * UNCLAIMED (local-only). FRIEND becomes possible once accounts ship in Phase 3
 * (Player.userId is set on linked entries). The render handles the FRIEND case
 * forward-compatibly — currently it never appears since no Player has a userId.
 *
 * Friends: pre-account empty state pointing at Phase 3. The full per-tab design
 * (search, +Add, populated friends list) is in docs/identity-flow-mockups.html.
 *
 * Tap a roster row → /(tabs)/(people)/[id].
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Player, Round } from '@/types/golf';

type SegmentKey = 'roster' | 'friends';

function roundsTogether(playerId: string, completedRounds: Round[]): number {
  return completedRounds.filter((r) => r.playerIds.includes(playerId)).length;
}

// Forward-compatible: returns true once Player.userId is added in Phase 3.
function hasLinkedAccount(player: Player): boolean {
  return Boolean((player as Player & { userId?: string }).userId);
}

export default function PeopleScreen() {
  const { colors } = useTheme();
  const { allPlayers, defaultPlayerId } = usePlayers();
  const { completedRounds } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [segment, setSegment] = useState<SegmentKey>('roster');

  useScreenHeader({
    left: { kind: 'text', text: 'PEOPLE' },
    right: { kind: 'profile' },
  });

  const friendsCount = useMemo(() => allPlayers.filter(hasLinkedAccount).length, [allPlayers]);

  return (
    <View style={styles.container}>
      <View style={styles.fixedTop}>
        <Text style={styles.title}>People</Text>

        <View style={styles.explainCard}>
          <Text style={styles.explainHead}>📖  HOW THIS WORKS</Text>
          <Text style={styles.explainBody}>
            <Text style={styles.explainBold}>Roster</Text> is everyone you've golfed with — even
            if they don't have an account. Once accounts ship, you'll be able to link a roster
            entry to a real user, turning them into a <Text style={styles.explainBold}>Friend</Text>.
          </Text>
        </View>

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
            const linked = hasLinkedAccount(player);
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
                  <Text style={styles.avatarText}>{player.name[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.rosterBody}>
                  <Text style={styles.rosterName} numberOfLines={1}>
                    {player.name}
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
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>Friends are coming soon</Text>
            <Text style={styles.emptyBody}>
              Once accounts ship, you'll be able to link roster entries to real users and connect
              with golf buddies who also use the app.
            </Text>
            <View style={styles.phaseBadge}>
              <Text style={styles.phaseBadgeText}>PHASE 3</Text>
            </View>
          </View>
        )}
      </ScrollView>
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
  });
}
