/**
 * Person detail — per-roster-entry view. Shows avatar, name, badge, count of
 * rounds together, recent rounds, and an inactive "Connect to a friend →" CTA
 * that previews the Phase 3 claim flow.
 *
 * In Phase 1 the CTA's tap shows a small alert pointing at Phase 3 — the
 * surface and copy exist so users build the right mental model before the
 * feature ships.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Player, Round } from '@/types/golf';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getRoundDate(round: Round): Date {
  return new Date(round.completedAt ?? round.startedAt);
}

function formatDate(d: Date): string {
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function hasLinkedAccount(player: Player): boolean {
  return Boolean((player as Player & { userId?: string }).userId);
}

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { getPlayer, defaultPlayerId } = usePlayers();
  const { completedRounds } = useGolfRound();
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
  const linked = hasLinkedAccount(player);

  function handleConnectTap() {
    Alert.alert(
      'Coming soon',
      'Linking a roster entry to a real account will be available in Phase 3 once accounts ship.'
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={[styles.bigAvatar, { backgroundColor: player.color || colors.primary }]}>
          <Text style={styles.bigAvatarText}>{player.name[0]?.toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{player.name}</Text>
        <View style={styles.badgeRow}>
          {isYou && <Text style={[styles.badge, styles.badgeYou]}>YOU · DEFAULT PLAYER</Text>}
          {!isYou && linked && (
            <Text style={[styles.badge, styles.badgeFriend]}>FRIEND</Text>
          )}
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

      {!isYou && !linked && (
        <View style={styles.connectBlock}>
          <Pressable
            onPress={handleConnectTap}
            style={({ pressed }) => [styles.connectBtn, pressed && styles.connectBtnPressed]}>
            <Text style={styles.connectBtnText}>Connect to a friend  →</Text>
          </Pressable>
          <Text style={styles.connectExplainer}>
            Coming soon. Once accounts ship, you'll be able to link {player.name} to a real
            user account — your shared rounds will appear on both of your histories.
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
      borderStyle: 'dashed',
      borderColor: colors.border,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.cardBg,
    },
    connectBtnPressed: {
      opacity: 0.6,
    },
    connectBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
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
