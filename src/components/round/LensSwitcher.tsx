/**
 * LensSwitcher — the Hole · Card · Chat segmented control on the live
 * scoring screen (mockup `04-aurora-glass.html`, the `.seg` control under
 * the course bar). Switches the scoring surface between per-hole entry,
 * the mid-round standings + running scorecard, and the live comment
 * thread, without leaving scoring.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type ScoringLens = 'hole' | 'card' | 'chat';

const OPTIONS: { key: ScoringLens; label: string }[] = [
  { key: 'hole', label: 'Hole' },
  { key: 'card', label: 'Card' },
  { key: 'chat', label: '💬 Chat' },
];

export function LensSwitcher({
  value,
  onChange,
}: {
  value: ScoringLens;
  onChange: (lens: ScoringLens) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.item,
              active ? styles.itemOn : null,
              pressed && !active ? styles.itemPressed : null,
            ]}>
            <Text style={[styles.label, active ? styles.labelOn : null]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    seg: {
      flexDirection: 'row',
      gap: 5,
      backgroundColor: colors.glassFill,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 16,
      padding: 5,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    itemOn: {
      backgroundColor: colors.glowLime,
      borderColor: colors.lime,
    },
    itemPressed: {
      backgroundColor: colors.glassFill2,
    },
    label: {
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: '700',
    },
    labelOn: {
      color: colors.lime,
    },
  });
}
