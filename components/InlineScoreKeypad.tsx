/**
 * Inline score keypad. Sits at the bottom of the round detail when edit
 * mode is on. Two rows of controls:
 *   1. Quick-pick chips (Eagle / Birdie / Par / Bogey / +2) — set strokes
 *      relative to par in one tap.
 *   2. Stepper (− / value / +) — fine-tune.
 *
 * Disabled (visually) when no cell is selected; tapping a chip or stepper
 * button does nothing until the round detail picks a cell.
 *
 * The keypad does NOT show "Editing: You · Hole 4 · Par X" labels above
 * itself — the scorecard's dashed outline + green-tinted row tell the
 * user everything they need.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatScore } from '@/lib/scoring';
import { useTheme } from '@/state/ThemeContext';

const QUICK_PICKS: Array<{ label: string; relative: number }> = [
  { label: 'Eagle', relative: -2 },
  { label: 'Birdie', relative: -1 },
  { label: 'Par', relative: 0 },
  { label: 'Bogey', relative: 1 },
  { label: '+2', relative: 2 },
];

type Props = {
  /** Par for the selected hole. Ignored if `disabled`. */
  par: number;
  /** Current strokes for the selected cell. */
  strokes: number | null;
  /** True when no cell is selected — chips + stepper are visually inert. */
  disabled: boolean;
  onChange: (strokes: number) => void;
};

export function InlineScoreKeypad({ par, strokes, disabled, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleChip = (relative: number) => {
    if (disabled) return;
    onChange(Math.max(1, par + relative));
  };

  const decrement = () => {
    if (disabled || strokes === null) return;
    onChange(Math.max(1, strokes - 1));
  };

  const increment = () => {
    if (disabled || strokes === null) return;
    onChange(strokes + 1);
  };

  const relative = strokes !== null ? strokes - par : null;

  return (
    <View style={styles.card}>
      <View style={styles.chipRow}>
        {QUICK_PICKS.map((q) => {
          const active = !disabled && relative === q.relative;
          return (
            <Pressable
              key={q.label}
              onPress={() => handleChip(q.relative)}
              style={[styles.chip, active && styles.chipActive, disabled && styles.dim]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{q.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={decrement}
          style={[styles.stepperBtn, disabled && styles.dim]}>
          <Text style={styles.stepperText}>−</Text>
        </Pressable>
        <View style={styles.strokesWrap}>
          <Text style={[styles.strokes, disabled && styles.strokesDim]}>
            {disabled || relative === null ? '—' : formatScore(relative)}
          </Text>
        </View>
        <Pressable
          onPress={increment}
          style={[styles.stepperBtn, disabled && styles.dim]}>
          <Text style={styles.stepperText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 11,
      padding: 10,
      marginTop: 6,
    },
    chipRow: {
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      marginBottom: 8,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: colors.chipBg,
    },
    chipActive: {
      backgroundColor: colors.primary,
    },
    chipText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    chipTextActive: {
      color: '#ffffff',
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
    },
    stepperBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperText: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textTitle,
    },
    strokesWrap: {
      minWidth: 64,
      alignItems: 'center',
    },
    strokes: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textTitle,
    },
    strokesDim: {
      color: colors.textMuted,
      opacity: 0.35,
    },
    dim: {
      opacity: 0.4,
    },
  });
}
