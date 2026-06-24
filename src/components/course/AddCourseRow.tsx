/**
 * "Add a course" entry row — shown on the new-round course picker and the
 * Search · Courses pane so a user can create a course that isn't in the
 * catalog. Mirrors the mockup's dashed "＋ Add a course" affordance.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function AddCourseRow({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a course not in the catalog">
      <View style={styles.icon}>
        <Ionicons name="add" size={20} color={colors.cyan} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title}>Add a course</Text>
        <Text style={styles.meta}>Not in the catalog? Create it.</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.glassFill,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.cyan,
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: { flex: 1, minWidth: 0 },
    title: { fontSize: 15, fontWeight: '800', color: colors.cyan },
    meta: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}
