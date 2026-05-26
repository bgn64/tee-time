/**
 * Player Selection — Step 1 of the Score-tab round-setup flow.
 *
 * Trimmed version of the destination `players.tsx`: "You" is always
 * pinned (locked); the other seeded sample players are toggleable up
 * to 4 total. No roster CRUD, no fuzzy search, no profile-cache
 * avatars. Tap "Next" to forward courseId + comma-separated playerIds
 * to the format screen.
 *
 * Redirect gate: like the index screen, bounces to `/scoring` when a
 * round is already in flight.
 */

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { PlayerRow } from '@/components/scoring/PlayerRow';
import { SEED_COURSES } from '@/data/courses';
import { SEED_PLAYERS, SELF_PLAYER_ID } from '@/data/players';
import { useRound } from '@/library/golf/RoundContext';
import { useTheme } from '@/library/theme/ThemeContext';

const MAX_PLAYERS = 4;

export default function PlayersScreen() {
  const { colors } = useTheme();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const { currentRound, roundHydrated } = useRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // "You" is always selected first.
  const [selectedIds, setSelectedIds] = useState<string[]>([SELF_PLAYER_ID]);

  if (!roundHydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (currentRound) {
    return <Redirect href="/(tabs)/(score)/scoring" />;
  }

  const course = SEED_COURSES.find((c) => c.id === courseId);
  const atCap = selectedIds.length >= MAX_PLAYERS;

  function toggle(playerId: string) {
    setSelectedIds((prev) => {
      if (playerId === SELF_PLAYER_ID) return prev;
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= MAX_PLAYERS) return prev;
      return [...prev, playerId];
    });
  }

  function handleNext() {
    if (!courseId || selectedIds.length === 0) return;
    router.push({
      pathname: '/(tabs)/(score)/format' as never,
      params: { courseId, playerIds: selectedIds.join(',') },
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textTitle} />
          <Text style={styles.backText}>Course</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {course && (
          <Text style={styles.greeting} numberOfLines={1}>
            {course.name}
            {course.location ? ` · ${course.location}` : ''}
          </Text>
        )}
        <Text style={styles.title}>Who&apos;s playing?</Text>
        <Text style={styles.hint}>
          Tap a player to add them. Up to {MAX_PLAYERS} total — you&apos;re
          always in.
        </Text>

        <View style={styles.list}>
          {SEED_PLAYERS.map((p) => {
            const isSelf = p.id === SELF_PLAYER_ID;
            const selected = selectedIds.includes(p.id);
            const disabled = !selected && atCap;
            return (
              <View
                key={p.id}
                style={[disabled && styles.disabledWrap]}>
                <PlayerRow
                  player={p}
                  selected={selected}
                  locked={isSelf}
                  onToggle={() => toggle(p.id)}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.nextBtn,
            (selectedIds.length === 0 || !courseId) && styles.nextBtnDisabled,
          ]}
          disabled={selectedIds.length === 0 || !courseId}
          onPress={handleNext}>
          <Text style={styles.nextBtnText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerRow: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 4,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingRight: 8,
    },
    backText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    content: {
      padding: 14,
      paddingTop: 8,
      paddingBottom: 32,
    },
    greeting: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.2,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginTop: 4,
    },
    hint: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 6,
      marginBottom: 14,
    },
    list: { gap: 8 },
    disabledWrap: { opacity: 0.45 },
    footer: {
      padding: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    nextBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    nextBtnDisabled: {
      backgroundColor: colors.chipBg,
    },
    nextBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 14,
      letterSpacing: 0.3,
    },
  });
}
