/**
 * Inline score keypad. Sits at the bottom of the round detail when edit
 * mode is on. Three rows:
 *   1. (optional) Player nav — ◀ Name ▶ — only when the viewer can edit
 *      more than one scorer's row.
 *   2. Hole nav — ◀ Hole N · Par X ▶ — clamps to [1, maxHole].
 *   3. Quick-pick chips (Eagle / Birdie / Par / Bogey / +2).
 *   4. Stepper (− value +).
 *
 * Quick-picks + stepper write the score for the currently-selected cell;
 * the hole/player arrows move the selection. Tap a cell on the scorecard
 * to jump directly.
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
  /** Par for the selected hole. */
  par: number;
  /** Current strokes for the selected cell. */
  strokes: number | null;
  /** Currently selected hole (1-based). */
  holeNumber: number;
  /** Last hole number on the course (typically 18). */
  maxHole: number;
  onHoleChange: (next: number) => void;
  /** Optional player-nav row. Omit when only one scorer is editable. */
  scorer?: { name: string; color: string; index: number; total: number };
  onScorerChange?: (delta: 1 | -1) => void;
  onChange: (strokes: number) => void;
};

export function InlineScoreKeypad({
  par,
  strokes,
  holeNumber,
  maxHole,
  onHoleChange,
  scorer,
  onScorerChange,
  onChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleChip = (relative: number) => {
    onChange(Math.max(1, par + relative));
  };

  const decrement = () => {
    if (strokes === null) return;
    onChange(Math.max(1, strokes - 1));
  };

  const increment = () => {
    if (strokes === null) return;
    onChange(strokes + 1);
  };

  const prevHole = () => onHoleChange(Math.max(1, holeNumber - 1));
  const nextHole = () => onHoleChange(Math.min(maxHole, holeNumber + 1));

  const relative = strokes !== null ? strokes - par : null;
  const canPrevHole = holeNumber > 1;
  const canNextHole = holeNumber < maxHole;
  const showScorerNav = !!(scorer && onScorerChange && scorer.total > 1);

  return (
    <View style={styles.card}>
      {showScorerNav && scorer && (
        <View style={styles.navRow}>
          <Pressable onPress={() => onScorerChange?.(-1)} style={styles.navArrow}>
            <Text style={styles.navArrowText}>‹</Text>
          </Pressable>
          <View style={styles.navLabelWrap}>
            <View style={[styles.scorerDot, { backgroundColor: scorer.color }]} />
            <Text style={styles.navLabel} numberOfLines={1}>
              {scorer.name}
            </Text>
          </View>
          <Pressable onPress={() => onScorerChange?.(1)} style={styles.navArrow}>
            <Text style={styles.navArrowText}>›</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.navRow}>
        <Pressable
          onPress={prevHole}
          disabled={!canPrevHole}
          style={[styles.navArrow, !canPrevHole && styles.dim]}>
          <Text style={styles.navArrowText}>‹</Text>
        </Pressable>
        <View style={styles.navLabelWrap}>
          <Text style={styles.navLabel}>
            Hole {holeNumber} <Text style={styles.navLabelDim}>· Par {par}</Text>
          </Text>
        </View>
        <Pressable
          onPress={nextHole}
          disabled={!canNextHole}
          style={[styles.navArrow, !canNextHole && styles.dim]}>
          <Text style={styles.navArrowText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.chipRow}>
        {QUICK_PICKS.map((q) => {
          const active = relative === q.relative;
          return (
            <Pressable
              key={q.label}
              onPress={() => handleChip(q.relative)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{q.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.stepperRow}>
        <Pressable onPress={decrement} style={styles.stepperBtn}>
          <Text style={styles.stepperText}>−</Text>
        </Pressable>
        <View style={styles.strokesWrap}>
          <Text style={styles.strokes}>
            {relative === null ? '—' : formatScore(relative)}
          </Text>
        </View>
        <Pressable onPress={increment} style={styles.stepperBtn}>
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
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    navArrow: {
      width: 38,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navArrowText: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textTitle,
      lineHeight: 22,
    },
    navLabelWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    navLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    navLabelDim: {
      fontWeight: '600',
      color: colors.textMuted,
    },
    scorerDot: { width: 10, height: 10, borderRadius: 5 },
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
    dim: {
      opacity: 0.35,
    },
  });
}
