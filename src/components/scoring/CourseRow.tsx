/**
 * One-line course row used on the Score-tab index screen.
 *
 * Compact, themed list item showing the course name + location and a
 * chevron. Tappable; the caller wires the navigation.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/library/theme/ThemeContext';
import type { Course } from '@/types/golf';

type Props = {
  course: Course;
  onPress: () => void;
};

export function CourseRow({ course, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.icon}>
        <Ionicons name="golf-outline" size={20} color={colors.primaryDark} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {course.name}
        </Text>
        {course.location ? (
          <Text style={styles.meta} numberOfLines={1}>
            {course.location}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontWeight: '800', color: colors.textTitle },
    meta: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}
