/**
 * Player configuration screen — add/remove players before starting a round.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlayerBottomSheet } from '@/components/PlayerBottomSheet';
import { useGolfRound } from '@/state/GolfRoundContext';
import { usePlayers } from '@/state/PlayerContext';
import { useTheme } from '@/state/ThemeContext';
import { Player } from '@/types/golf';

export default function PlayerConfigScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { startRound, courses } = useGolfRound();
  const { recentPlayers, markRecent } = usePlayers();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const course = courses.find((c) => c.id === courseId);

  const [roundPlayers, setRoundPlayers] = useState<Player[]>(() => {
    const userPlayer = recentPlayers.find((p) => p.isUser);
    return userPlayer ? [userPlayer] : [];
  });
  const [showSheet, setShowSheet] = useState(false);

  function addToRound(player: Player) {
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
    router.replace('./scoring');
  }

  // Recent players not already in the round
  const availableRecents = recentPlayers.filter(
    (p) => !roundPlayers.some((rp) => rp.id === p.id)
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {course && (
          <Text style={styles.courseContext}>{course.name}</Text>
        )}
        <Text style={styles.title}>Who's playing?</Text>

        {/* In this round */}
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

        <Pressable style={styles.addButton} onPress={() => setShowSheet(true)}>
          <Text style={styles.addButtonText}>+ Add Player</Text>
        </Pressable>

        {/* Recent players — full rows */}
        {availableRecents.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Quick add from recents</Text>
            {availableRecents.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <View
                  style={[styles.avatar, { backgroundColor: player.color || colors.primary }]}>
                  <Text style={styles.avatarText}>{player.name[0]}</Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  <Text style={styles.playerTag}>Last played recently</Text>
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
      padding: 24,
      paddingBottom: 100,
    },
    courseContext: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '600',
      marginBottom: 4,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 24,
      marginBottom: 12,
    },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
    },
    playerInfo: {
      flex: 1,
      marginLeft: 12,
    },
    playerName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textTitle,
    },
    playerTag: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    removeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeBtnText: {
      fontSize: 20,
      fontWeight: '400',
      color: colors.textMuted,
    },
    addActionBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addActionBtnText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.primary,
    },
    addButton: {
      alignItems: 'center',
      borderColor: colors.primary,
      borderRadius: 12,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      padding: 14,
      marginTop: 4,
    },
    addButtonText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      padding: 20,
      paddingBottom: 34,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    startButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
    },
    disabledButton: {
      opacity: 0.4,
    },
    startButtonText: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '800',
    },
  });
}
