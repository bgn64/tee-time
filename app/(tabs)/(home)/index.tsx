/**
 * Home tab — course selection (no active round) or continue-round card (active round).
 */

import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, Text } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useTheme } from '@/state/ThemeContext';

export default function HomeScreen() {
  const { colors } = useTheme();
  const { currentRound, courses, completedRounds } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? '');

  // Active round — show continue card
  if (currentRound) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Round in Progress</Text>
        <Text style={styles.title}>{currentRound.course.name}</Text>

        <Link href="/scoring" asChild>
          <Pressable style={styles.continueCard}>
            <Text style={styles.continueHole}>
              Hole {currentRound.currentHoleNumber} of {currentRound.course.holes.length}
            </Text>
            <Text style={styles.continueCta}>Tap to continue →</Text>
          </Pressable>
        </Link>
      </ScrollView>
    );
  }

  // No active round — course selection (this IS the home screen per design)
  function handleNext() {
    if (!selectedCourseId) return;
    router.push({ pathname: './player-config', params: { courseId: selectedCourseId } });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Good morning ☀️</Text>
      <Text style={styles.title}>Let's hit the course</Text>

      {courses.map((course) => {
        const isSelected = course.id === selectedCourseId;
        return (
          <Pressable
            key={course.id}
            onPress={() => setSelectedCourseId(course.id)}
            style={[styles.courseCard, isSelected && styles.courseCardSelected]}>
            <Text style={[styles.courseName, isSelected && styles.courseNameSelected]}>
              {course.name}
            </Text>
            <Text style={styles.courseMeta}>
              {course.location} · {course.holes.length} holes · Par{' '}
              {course.holes.reduce((t, h) => t + h.par, 0)}
            </Text>
          </Pressable>
        );
      })}

      <Link href="/new-course" asChild>
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
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 24,
      paddingTop: 64,
      paddingBottom: 40,
    },
    greeting: {
      fontSize: 16,
      color: colors.textMuted,
      fontWeight: '600',
      marginBottom: 4,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 24,
    },
    courseCard: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1.5,
      marginBottom: 12,
      padding: 16,
    },
    courseCardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.chipBg,
    },
    courseName: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textTitle,
    },
    courseNameSelected: {
      color: colors.primaryDark,
    },
    courseMeta: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 4,
    },
    addCourseBtn: {
      alignItems: 'center',
      borderColor: colors.primary,
      borderRadius: 14,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      padding: 16,
      marginBottom: 4,
    },
    addCourseBtnText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    nextBtn: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      marginTop: 24,
      paddingVertical: 16,
    },
    disabledBtn: {
      opacity: 0.4,
    },
    nextBtnText: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '800',
    },
    // Continue round card
    continueCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.primary,
      marginTop: 24,
      padding: 20,
    },
    continueHole: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textTitle,
    },
    continueCta: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.accent,
      marginTop: 8,
    },
  });
}
