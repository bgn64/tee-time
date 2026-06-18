/**
 * PlayerChip — pill-shaped player avatar + name, used in the scramble
 * team-config UI. When `onPress` is omitted, the chip renders as a
 * plain View (not a Pressable) so it can be safely nested inside an
 * outer Pressable on react-native-web — Pressables compile to
 * `<button>`, and `<button>` inside `<button>` is invalid HTML.
 *
 * Pure display + an optional tap handler. All identity resolution is
 * upstream (color + name come from the participant resolver).
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  name: string;
  color: string;
  active?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function PlayerChip({ name, color, active = false, onPress, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const baseStyle = {
    backgroundColor: active ? colors.glowLime : colors.glassFill2,
    borderColor: active ? colors.lime : colors.glassStroke,
  };

  const inner = (
    <>
      <Avatar initial={name} color={color} size={26} circle />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
    </>
  );

  // When `onPress` isn't provided, render as a plain View. Lets the
  // chip live inside an outer Pressable (e.g. a destination team row
  // in scramble setup) without nesting a `<button>` inside another
  // `<button>` on react-native-web.
  if (!onPress) {
    return (
      <View
        accessibilityLabel={accessibilityLabel ?? name}
        style={[styles.chip, baseStyle]}>
        {inner}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      style={({ pressed }) => [
        styles.chip,
        baseStyle,
        pressed && !active && { opacity: 0.85 },
      ]}>
      {inner}
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 999,
      borderWidth: 1.5,
    },
    name: {
      color: colors.textTitle,
      fontSize: 12,
      fontWeight: '800',
    },
  });
}
