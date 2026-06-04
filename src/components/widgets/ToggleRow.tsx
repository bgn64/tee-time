/**
 * ToggleRow — one row in a settings-style list with an
 * iOS-style slider toggle on the right.
 *
 * Layout: [optional leading element] [label + optional sub] [toggle]
 *
 * Used by the round-creation flow's progressive-disclosure stat
 * tracking config (per-player toggles, then per-stat toggles).
 * Generic enough to be reused for any settings-style toggle list.
 *
 * Press behaviour: the whole row is tappable — tapping anywhere
 * fires `onToggle(!value)`. Renders disabled-state styling and
 * blocks taps when `disabled` is true.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  label: string;
  /** Smaller text under the label (e.g., "binary · par 4 + 5"). */
  sub?: string;
  value: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Optional element rendered before the label (e.g., an avatar).
   * No layout assumptions — the caller controls dimensions.
   */
  leading?: React.ReactNode;
};

export function ToggleRow({
  label,
  sub,
  value,
  onToggle,
  disabled,
  leading,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        onToggle(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[styles.row, disabled && styles.rowDisabled]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.textCol}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.track,
          value ? styles.trackOn : styles.trackOff,
        ]}>
        <View
          style={[
            styles.knob,
            value ? styles.knobOn : styles.knobOff,
          ]}
        />
      </View>
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
      paddingHorizontal: 4,
      minHeight: 50,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    leading: {
      flexShrink: 0,
    },
    textCol: {
      flex: 1,
      minWidth: 0,
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    sub: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 2,
    },
    track: {
      width: 44,
      height: 26,
      borderRadius: 14,
      padding: 2,
      justifyContent: 'center',
      flexShrink: 0,
    },
    trackOn: {
      backgroundColor: colors.primary,
    },
    trackOff: {
      // Chip bg sits between cardBg and border on the lightness
      // scale — gives the off-state a clear "well" look without
      // looking disabled.
      backgroundColor: colors.chipBg,
    },
    knob: {
      width: 22,
      height: 22,
      borderRadius: 11,
    },
    knobOn: {
      backgroundColor: '#ffffff',
      transform: [{ translateX: 18 }],
    },
    knobOff: {
      backgroundColor: '#d8e0d4',
    },
  });
}
