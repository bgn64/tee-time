/**
 * Unlinked players drilldown.
 *
 * Pushed when the People-tab "Unlinked players" drawer-link is tapped.
 * Read-only list of roster entries that have no `userId` set. Tap a row →
 * the per-person detail screen.
 *
 * No add affordance — copy points users back to the Score flow's player
 * picker for creating new unlinked entries.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useSocial } from '@/state/SocialContext';
import { useTheme } from '@/state/ThemeContext';

export default function UnlinkedPlayersScreen() {
  const { colors } = useTheme();
  const { allPlayers, defaultPlayerId } = usePlayers();
  const { friends } = useSocial();
  const { completedRounds } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'People', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const friendsSet = useMemo(() => new Set(friends), [friends]);

  const unlinked = useMemo(() => {
    return allPlayers
      .filter(
        (p) =>
          p.id !== defaultPlayerId &&
          !(p.userId && friendsSet.has(p.userId))
      )
      .sort((a, b) => a.nickname.localeCompare(b.nickname));
  }, [allPlayers, defaultPlayerId, friendsSet]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Unlinked players</Text>
        <Text style={styles.subtitle}>
          Players you've added during scoring who aren't tied to a real account.
        </Text>

        {unlinked.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={styles.emptyBody}>You don't have any unlinked players yet.</Text>
          </View>
        ) : (
          unlinked.map((player) => {
            const n = completedRounds.filter((r) => r.playerIds.includes(player.id)).length;
            const subtext =
              n === 0
                ? 'No rounds together yet'
                : `${n} ${n === 1 ? 'round' : 'rounds'} together`;
            return (
              <Pressable
                key={player.id}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/(people)/[id]', params: { id: player.id } })
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
                  <Text style={styles.rosterMeta}>{subtext}</Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            );
          })
        )}

        <View style={styles.hintCard}>
          <Text style={styles.hintText}>
            ℹ Add unlinked players from the <Text style={styles.hintBold}>Score</Text> flow when
            picking who's playing. These entries are local labels only — they don't count
            toward anyone else's stats.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textTitle, marginBottom: 6 },
    subtitle: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: 14 },
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
    },
    avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
    rosterBody: { flex: 1, minWidth: 0 },
    rosterName: { fontSize: 14, fontWeight: '700', color: colors.textTitle },
    rosterMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    chev: { fontSize: 18, fontWeight: '700', color: colors.textMuted, opacity: 0.5 },
    hintCard: {
      marginTop: 14,
      padding: 11,
      backgroundColor: colors.chipBg,
      borderRadius: 10,
    },
    hintText: { fontSize: 11.5, color: colors.textMuted, lineHeight: 17 },
    hintBold: { color: colors.textTitle, fontWeight: '800' },
    emptyWrap: { alignItems: 'center', paddingTop: 36, paddingBottom: 8 },
    emptyIcon: { fontSize: 32, opacity: 0.5, marginBottom: 6 },
    emptyBody: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  });
}
