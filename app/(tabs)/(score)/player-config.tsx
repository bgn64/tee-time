/**
 * Player configuration screen — add/remove players before starting a round.
 * Sub-screen of the Score tab. Header left = "‹ Course" back button.
 *
 * Player count constraints (v1): 1–4. You is always present and non-removable.
 * At cap (4), Add Player and Quick-add affordances are disabled.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlayerBottomSheet } from '@/components/PlayerBottomSheet';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Player } from '@/types/golf';

const MAX_PLAYERS = 4;

export default function PlayerConfigScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { startRound, courses } = useGolfRound();
  const { recentPlayers, markRecent } = usePlayers();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Course', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const course = courses.find((c) => c.id === courseId);

  const [roundPlayers, setRoundPlayers] = useState<Player[]>(() => {
    const userPlayer = recentPlayers.find((p) => p.isUser);
    return userPlayer ? [userPlayer] : [];
  });
  const [showSheet, setShowSheet] = useState(false);

  const atCap = roundPlayers.length >= MAX_PLAYERS;

  function addToRound(player: Player) {
    if (atCap) return;
    if (roundPlayers.some((p) => p.id === player.id)) return;
    setRoundPlayers((prev) => [...prev, player]);
    markRecent(player.id);
  }

  function removeFromRound(playerId: string) {
    setRoundPlayers((prev) => prev.filter((p) => p.id !== playerId));
  }

  function handleStartRound() {
    if (!courseId || roundPlayers.length === 0) return;
    startRound(courseId, roundPlayers);
    // Locked round: replace the Score tab stack so Scoring becomes the root
    // and there's no back-stack to pop into Player Config.
    router.replace('/(tabs)/(score)/scoring');
  }

  // Recent players not already in the round
  const availableRecents = recentPlayers.filter(
    (p) => !roundPlayers.some((rp) => rp.id === p.id)
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {course && <Text style={styles.courseContext}>{course.name}</Text>}
        <Text style={styles.title}>Who's playing?</Text>

        <Text style={styles.sectionTitle}>In this round</Text>
        {roundPlayers.map((player) => (
          <View key={player.id} style={styles.playerRow}>
            <View style={[styles.avatar, { backgroundColor: player.color || colors.primary }]}>
              <Text style={styles.avatarText}>{player.name[0]}</Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.name}</Text>
              {player.isUser && <Text style={styles.playerTag}>Always included</Text>}
            </View>
            {!player.isUser && (
              <Pressable onPress={() => removeFromRound(player.id)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>×</Text>
              </Pressable>
            )}
          </View>
        ))}

        <Pressable
          style={[styles.addButton, atCap && styles.addButtonDisabled]}
          onPress={() => !atCap && setShowSheet(true)}
          disabled={atCap}>
          <Text style={[styles.addButtonText, atCap && styles.addButtonTextDisabled]}>
            + Add Player
          </Text>
        </Pressable>

        {availableRecents.length > 0 && !atCap && (
          <>
            <Text style={styles.sectionTitle}>Quick add</Text>
            {availableRecents.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <View
                  style={[styles.avatar, { backgroundColor: player.color || colors.primary }]}>
                  <Text style={styles.avatarText}>{player.name[0]}</Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  <Text style={styles.playerTag}>Recent</Text>
                </View>
                <Pressable onPress={() => addToRound(player)} style={styles.addActionBtn}>
                  <Text style={styles.addActionBtnText}>+</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.startButton, roundPlayers.length === 0 && styles.disabledButton]}
          onPress={handleStartRound}
          disabled={roundPlayers.length === 0}>
          <Text style={styles.startButtonText}>⛳ Start Round</Text>
        </Pressable>
      </View>

      <PlayerBottomSheet
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        onSelectPlayer={(player) => {
          addToRound(player);
          setShowSheet(false);
        }}
        excludeIds={roundPlayers.map((p) => p.id)}
        atCap={atCap}
      />
    </View>
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
      paddingBottom: 100,
    },
    courseContext: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 18,
      marginBottom: 8,
    },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 6,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
    },
    playerInfo: { flex: 1, marginLeft: 10 },
    playerName: { fontSize: 14, fontWeight: '700', color: colors.textTitle },
    playerTag: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    removeBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeBtnText: { fontSize: 20, fontWeight: '400', color: colors.textMuted },
    addActionBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addActionBtnText: { fontSize: 20, fontWeight: '700', color: colors.primary },
    addButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 10,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      padding: 12,
      marginTop: 4,
    },
    addButtonDisabled: { opacity: 0.4 },
    addButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    addButtonTextDisabled: { color: colors.textMuted },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      padding: 16,
      paddingBottom: 28,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    startButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 22,
      paddingVertical: 14,
    },
    disabledButton: { opacity: 0.4 },
    startButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  });
}
