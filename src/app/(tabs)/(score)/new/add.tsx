/**
 * Add Course — create a course that isn't in the catalog, reached from the
 * new-round picker. On save the new course is selected for the round (the
 * single New round form deep-links with `?courseId=`), matching how the
 * picker hands off a catalog course.
 *
 * Redirect gate mirrors the picker: if a round is already in flight, send
 * the user to `/scoring` so they can't start a second round.
 */

import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AddCourseForm } from '@/components/course/AddCourseForm';
import { useRound } from '@/library/golf/RoundContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Course } from '@/types/golf';

export default function NewRoundAddCourseScreen() {
  const { colors } = useTheme();
  const { currentRound, roundHydrated } = useRound();

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

  const onCreated = (course: Course) => {
    router.replace({
      pathname: '/(tabs)/(score)' as never,
      params: { courseId: course.id },
    });
  };

  return (
    <View style={styles.container}>
      <AddCourseForm onCreated={onCreated} submitLabel="Save & pick course" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
