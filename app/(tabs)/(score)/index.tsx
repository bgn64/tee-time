/**
 * Course Selection — root of the Score tab when no round is active.
 * Per design: no card pre-selected; Next is disabled until the user picks one.
 */

import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useScreenHeader } from '@/state/HeaderContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useTheme } from '@/state/ThemeContext';

export default function CourseSelectionScreen() {
  const { colors } = useTheme();
  const { courses } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  useScreenHeader({
    left: { kind: 'text', text: 'SCORE' },
    right: { kind: 'profile' },
  });

  function handleNext() {
    if (!selectedCourseId) return;
    router.push({
      pathname: '/(tabs)/(score)/player-config',
      params: { courseId: selectedCourseId },
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Let's hit the course</Text>

      {courses.map((course) => {
        const isSelected = course.id === selectedCourseId;
        const totalPar = course.holes.reduce((t, h) => t + h.par, 0);
        return (
          <Pressable
            key={course.id}
            onPress={() => setSelectedCourseId(course.id)}
            style={[styles.courseCard, isSelected && styles.courseCardSelected]}>
            <Text style={[styles.courseName, isSelected && styles.courseNameSelected]}>
              {course.name}
            </Text>
            <Text style={styles.courseMeta}>
              {course.location} · {course.holes.length} holes · Par {totalPar}
            </Text>
          </Pressable>
        );
      })}

      <Link href="/(tabs)/(score)/new-course" asChild>
        <Pressable style={styles.addCourseBtn}>
          <Text style={styles.addCourseBtnText}>+ Create New Course</Text>
        </Pressable>
      </Link>

      <Pressable
        style={[styles.nextBtn, !selectedCourseId && styles.disabledBtn]}
        onPress={handleNext}
        disabled={!selectedCourseId}>
        <Text style={styles.nextBtnText}>Next →</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingTop: 20, paddingBottom: 40 },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 16,
      marginTop: 4,
    },
    courseCard: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      borderWidth: 1,
      marginBottom: 8,
      padding: 14,
    },
    courseCardSelected: {
      borderLeftColor: colors.accent,
      borderColor: colors.accent,
      backgroundColor: colors.chipBg,
    },
    courseName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textTitle,
    },
    courseNameSelected: {
      color: colors.textTitle,
    },
    courseMeta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 3,
    },
    addCourseBtn: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 12,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      paddingVertical: 12,
      marginTop: 8,
      marginBottom: 4,
    },
    addCourseBtnText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    nextBtn: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 22,
      marginTop: 16,
      paddingVertical: 14,
    },
    disabledBtn: { opacity: 0.4 },
    nextBtnText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
    },
  });
}
