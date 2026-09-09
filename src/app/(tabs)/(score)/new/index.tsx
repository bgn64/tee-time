/**
 * Course Selection — step 1 of the new-round flow, opened from the
 * Rounds tab's hub via the "New round" action.
 *
 * The idle state shows the signed-in user's three most recently played
 * distinct courses and latest score at each. Typing into the search bar
 * switches to debounced REST queries over the `public.courses` catalog;
 * tapping either kind of row returns to the single New round form with the
 * selected course id. Catalog rows without per-hole scorecard data are
 * enriched lazily by `useCourse(id)` on the next screen, so the picker itself
 * doesn't need to discriminate enriched vs un-enriched.
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

import { GlassCard, GlassSurface, PHONE_MAX_WIDTH, SectionLabel } from '@/components/aurora';
import { AddCourseRow } from '@/components/course/AddCourseRow';
import { CourseRow } from '@/components/scoring/CourseRow';
import { getScorerProgress, scorerIdForUser } from '@/library/golf/scoring';
import { useCompletedRounds } from '@/library/golf/useCompletedRounds';
import { useCoursesSearch } from '@/library/golf/useCourses';
import { useRound } from '@/library/golf/RoundContext';
import { useAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function CourseSelectionScreen() {
  const { colors } = useTheme();
  const { account } = useAccount();
  const { currentRound, roundHydrated } = useRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const { courses, loading, error } = useCoursesSearch(query);
  const { rounds: completedRounds, isLoading: completedRoundsLoading } = useCompletedRounds();
  const recentCourses = useMemo(() => {
    const userId = account?.userId;
    if (!userId) return [];

    const seenCourseIds = new Set<string>();
    const recent: { course: (typeof completedRounds)[number]['course']; score: number }[] = [];
    const newestFirst = [...completedRounds].sort(
      (a, b) =>
        Date.parse(b.completedAt ?? b.startedAt) - Date.parse(a.completedAt ?? a.startedAt)
    );

    for (const round of newestFirst) {
      const scorerId = scorerIdForUser(round, userId);
      if (!scorerId || seenCourseIds.has(round.course.id)) continue;

      const progress = getScorerProgress(round, scorerId);
      if (progress.thruCount === 0) continue;

      seenCourseIds.add(round.course.id);
      recent.push({ course: round.course, score: progress.relativeScore });
      if (recent.length === 3) break;
    }

    return recent;
  }, [account?.userId, completedRounds]);

  if (!roundHydrated) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  }

  if (currentRound) {
    return <Redirect href="/(tabs)/(score)/scoring" />;
  }

  const trimmedQuery = query.trim();
  const showEmptyPrompt = trimmedQuery.length === 0;
  const showRecentCourses = showEmptyPrompt && recentCourses.length > 0;
  const showEmptyHelper = showEmptyPrompt && !completedRoundsLoading && !showRecentCourses;
  const showNoResults = !showEmptyPrompt && !loading && !error && courses.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.title}>Choose your course</Text>
          <Text style={styles.subtitle}>Search the catalog, then finish setup on one Aurora screen.</Text>
        </View>

        <GlassSurface strong glow style={styles.searchRow}>
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
          {loading ? <ActivityIndicator color={colors.lime} /> : null}
        </GlassSurface>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {showEmptyPrompt && completedRoundsLoading ? (
          <ActivityIndicator color={colors.lime} style={styles.recentLoading} />
        ) : null}

        {showEmptyHelper ? (
          <Text style={styles.helperText}>
            Start typing a course name to see matches.
          </Text>
        ) : null}

        {showRecentCourses ? (
          <GlassCard strong style={styles.resultsCard}>
            <SectionLabel style={styles.sectionLabel}>Recently played</SectionLabel>
            <View style={styles.list}>
              {recentCourses.map(({ course, score }) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  lastRoundScore={score}
                  onPress={() =>
                    router.replace({
                      pathname: '/(tabs)/(score)' as never,
                      params: { courseId: course.id },
                    })
                  }
                />
              ))}
            </View>
          </GlassCard>
        ) : null}

        {showNoResults ? (
          <Text style={styles.helperText}>
            No courses match &ldquo;{trimmedQuery}&rdquo;.
          </Text>
        ) : null}

        {courses.length > 0 ? (
          <GlassCard strong style={styles.resultsCard}>
            <SectionLabel style={styles.sectionLabel}>Matching courses</SectionLabel>
            <View style={styles.list}>
              {courses.map((c) => (
                <CourseRow
                  key={c.id}
                  course={c}
                  onPress={() =>
                    router.replace({
                      pathname: '/(tabs)/(score)' as never,
                      params: { courseId: c.id },
                    })
                  }
                />
              ))}
            </View>
          </GlassCard>
        ) : null}

        <View style={styles.addRow}>
          <AddCourseRow onPress={() => router.push('/(tabs)/(score)/new/add' as never)} />
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      width: '100%',
      maxWidth: PHONE_MAX_WIDTH,
      alignSelf: 'center',
      padding: 16,
      paddingTop: 20,
      paddingBottom: 36,
    },
    hero: {
      marginBottom: 16,
    },
    greeting: {
      fontSize: 12,
      fontWeight: '900',
      color: colors.cyan,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 30,
      fontWeight: '900',
      color: colors.textTitle,
      marginTop: 4,
      letterSpacing: -0.5,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 19,
      marginTop: 6,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 18,
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
    resultsCard: {
      marginTop: 8,
    },
    addRow: {
      marginTop: 12,
    },
    sectionLabel: {
      marginTop: 0,
    },
    helperText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      paddingVertical: 8,
    },
    recentLoading: {
      alignSelf: 'flex-start',
      marginVertical: 8,
    },
    errorText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.accent,
      paddingVertical: 8,
    },
  });
}
