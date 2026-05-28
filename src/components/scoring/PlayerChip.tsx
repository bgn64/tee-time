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

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';

type Props = {
  name: string;
  color: string;
  active?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function PlayerChip({ name, color, active = false, onPress, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const letter = (name[0] ?? '?').toUpperCase();

  const baseStyle = {
    backgroundColor: active ? withAlpha(colors.accent, 0.12) : colors.chipBg,
    borderColor: active ? colors.accent : ('transparent' as const),
  };

  const inner = (
    <>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.avatarLetter}>{letter}</Text>
      </View>
      <Text
        style={[styles.name, { color: colors.textTitle }]}
        numberOfLines={1}>
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

function withAlpha(hex: string, alpha: number): string {
  // Accepts #rrggbb (the theme tokens we use); falls back to the
  // original color string if anything else is passed in.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  name: {
    fontSize: 12,
    fontWeight: '700',
  },
});
