/**
 * Course Selection — step 1 of the new-round flow, opened from the
 * Rounds tab's hub via the "New round" action.
 *
 * Trimmed version of the destination `app/(tabs)/(score)/index.tsx`:
 * just a greeting + a short list of seeded courses. No search, no
 * recents, no "+ Create custom course" row. Tapping a row navigates
 * to the player picker.
 *
 * Redirect gate: if a round is already in flight, send the user
 * straight to `/scoring` so they can't deep-link to the picker and
 * start a second round.
 *
 * Header: a manual back affordance returns to the hub. Matches the
 * pattern used by `players.tsx` further down the flow.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CourseRow } from '@/components/scoring/CourseRow';
import { SEED_COURSES } from '@/data/courses';
import { useRound } from '@/library/golf/RoundContext';
import { useTheme } from '@/library/theme/ThemeContext';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function CourseSelectionScreen() {
  const { colors } = useTheme();
  const { currentRound, roundHydrated } = useRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textTitle} />
          <Text style={styles.backText}>Rounds</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>{getGreeting()}</Text>
        <Text style={styles.title}>Where are you teeing it up?</Text>
        <View style={styles.list}>
          {SEED_COURSES.map((c) => (
            <CourseRow
              key={c.id}
              course={c}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/(score)/players' as never,
                  params: { courseId: c.id },
                })
              }
            />
          ))}
        </View>
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
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      padding: 14,
      paddingTop: 8,
      paddingBottom: 32,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 4,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    backText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textTitle,
    },
    greeting: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.3,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginTop: 4,
      marginBottom: 16,
    },
    list: {
      gap: 10,
    },
  });
}
