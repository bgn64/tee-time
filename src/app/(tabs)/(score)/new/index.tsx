/**
 * Course Selection — step 1 of the new-round flow, opened from the
 * Rounds tab's hub via the "New round" action.
 *
 * Search-driven picker over the `public.courses` catalog. Typing into
 * the search bar issues debounced REST queries; tapping a row navigates
 * to the player picker. Catalog rows without per-hole scorecard data
 * are enriched lazily by `useCourse(id)` on the next screen, so the
 * picker itself doesn't need to discriminate enriched vs un-enriched.
 *
 * Redirect gate: if a round is already in flight, send the user
 * straight to `/scoring` so they can't deep-link to the picker and
 * start a second round.
 *
 * Native stack header (configured in `(score)/_layout.tsx`) supplies
 * the title and "< Rounds" back affordance.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CourseRow } from '@/components/scoring/CourseRow';
import { useCoursesSearch } from '@/library/golf/useCourses';
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

  const [query, setQuery] = useState('');
  const { courses, loading, error } = useCoursesSearch(query);

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

  const trimmedQuery = query.trim();
  const showEmptyPrompt = trimmedQuery.length === 0;
  const showNoResults = !showEmptyPrompt && !loading && !error && courses.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.greeting}>{getGreeting()}</Text>
        <Text style={styles.title}>Where are you teeing it up?</Text>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search courses by name"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            value={query}
            onChangeText={setQuery}
          />
          {loading ? <ActivityIndicator color={colors.textMuted} /> : null}
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {showEmptyPrompt ? (
          <Text style={styles.helperText}>
            Start typing a course name to see matches.
          </Text>
        ) : null}

        {showNoResults ? (
          <Text style={styles.helperText}>
            No courses match &ldquo;{trimmedQuery}&rdquo;.
          </Text>
        ) : null}

        <View style={styles.list}>
          {courses.map((c) => (
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
      paddingTop: 18,
      paddingBottom: 32,
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
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.cardBg,
      marginBottom: 14,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.textBody,
      paddingVertical: 0,
    },
    list: {
      gap: 10,
    },
    helperText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textMuted,
      paddingVertical: 8,
    },
    errorText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
      paddingVertical: 8,
    },
  });
}
