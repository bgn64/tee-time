/**
 * New round setup screen for selecting a course and confirming default players.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { defaultPlayer } from '@/data/courses';
import { useGolfRound } from '@/state/GolfRoundContext';

export default function NewRoundScreen() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const { recentCourses, startRound } = useGolfRound();
  const initialCourseId = useMemo(
    () =>
      recentCourses.some((course) => course.id === courseId)
        ? courseId
        : recentCourses[0]?.id ?? '',
    [courseId, recentCourses]
  );
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId);

  const selectedCourse = recentCourses.find((course) => course.id === selectedCourseId);

  function beginRound() {
    if (!selectedCourse) {
      throw new Error('Cannot begin a round without a selected course.');
    }

    startRound(selectedCourse.id, [defaultPlayer]);
    router.replace('/');
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>New Round</Text>
      <Text style={styles.title}>Set up your round</Text>
      <Text style={styles.description}>
        Pick a course and start with the default player. Player selection will get more flexible in
        a future version.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Course</Text>
        {recentCourses.map((course) => {
          const isSelected = course.id === selectedCourseId;

          return (
            <Pressable
              key={course.id}
              onPress={() => setSelectedCourseId(course.id)}
              style={[styles.courseCard, isSelected && styles.selectedCard]}>
              <Text style={styles.courseName}>{course.name}</Text>
              <Text style={styles.courseMeta}>{course.location}</Text>
              <Text style={styles.courseMeta}>
                {course.holes.length} holes · Par{' '}
                {course.holes.reduce((total, hole) => total + hole.par, 0)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Players</Text>
        <View style={styles.playerCard}>
          <Text style={styles.courseName}>{defaultPlayer.name}</Text>
          <Text style={styles.courseMeta}>Default player for this prototype</Text>
        </View>
      </View>

      <Pressable style={styles.primaryButton} onPress={beginRound}>
        <Text style={styles.primaryButtonText}>Begin Round</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 12,
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  courseCard: {
    borderColor: '#d0d7de',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  selectedCard: {
    borderColor: '#2e78b7',
    borderWidth: 2,
  },
  courseName: {
    fontSize: 17,
    fontWeight: '700',
  },
  courseMeta: {
    color: '#687076',
    marginTop: 4,
  },
  playerCard: {
    borderColor: '#d0d7de',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2e78b7',
    borderRadius: 999,
    marginTop: 32,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
});
