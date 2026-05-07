/**
 * Course creation form. Pushed sub-screen of the Score tab. Header left =
 * "‹ Course" back button. On save, the new course is added to the library
 * and the screen pops back to Course Selection.
 *
 * TODO (per design doc): on save, pop back with the new course pre-selected
 * on the Course Selection screen (requires lifting selection state above
 * Course Selection or returning a route param).
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';
import { Hole } from '@/types/golf';

export default function NewCourseScreen() {
  const { addCourse } = useGolfRound();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Course', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [holeCount, setHoleCount] = useState('18');
  const [pars, setPars] = useState<string[]>(Array(18).fill('4'));

  const parsedHoleCount = Math.max(1, Math.min(18, parseInt(holeCount, 10) || 18));

  function updateHoleCount(text: string) {
    setHoleCount(text);
    const count = Math.max(1, Math.min(18, parseInt(text, 10) || 18));
    setPars((prev) => {
      if (count > prev.length) {
        return [...prev, ...Array(count - prev.length).fill('4')];
      }
      return prev.slice(0, count);
    });
  }

  function updatePar(index: number, value: string) {
    setPars((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function saveCourse() {
    if (!name.trim()) return;

    const holes: Hole[] = Array.from({ length: parsedHoleCount }, (_, i) => ({
      number: i + 1,
      par: Math.max(1, parseInt(pars[i], 10) || 4),
    }));

    addCourse({
      id: `course-${Date.now()}`,
      name: name.trim(),
      location: location.trim(),
      holes,
    });

    router.back();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create a Course</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Course Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Pine Ridge Golf Club"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Seattle, WA"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Number of Holes</Text>
        <TextInput
          style={styles.input}
          value={holeCount}
          onChangeText={updateHoleCount}
          keyboardType="number-pad"
          placeholder="18"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Par per Hole</Text>
        <View style={styles.parGrid}>
          {Array.from({ length: parsedHoleCount }, (_, i) => (
            <View key={i} style={styles.parItem}>
              <Text style={styles.parLabel}>{i + 1}</Text>
              <TextInput
                style={styles.parInput}
                value={pars[i]}
                onChangeText={(text) => updatePar(i, text)}
                keyboardType="number-pad"
              />
            </View>
          ))}
        </View>
      </View>

      <Pressable
        style={[styles.saveButton, !name.trim() && styles.disabledButton]}
        onPress={saveCourse}
        disabled={!name.trim()}>
        <Text style={styles.saveButtonText}>Save Course</Text>
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
      paddingBottom: 40,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 8,
    },
    field: {
      marginTop: 22,
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.textBody,
      fontSize: 16,
      padding: 14,
    },
    parGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    parItem: {
      alignItems: 'center',
      width: 52,
    },
    parLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 4,
    },
    parInput: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      color: colors.textBody,
      fontSize: 16,
      padding: 8,
      textAlign: 'center',
      width: 52,
    },
    saveButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      marginTop: 32,
      paddingVertical: 16,
    },
    disabledButton: {
      opacity: 0.4,
    },
    saveButtonText: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '800',
    },
  });
}
