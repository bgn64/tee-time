/**
 * ScoreMark — primitive that wraps a stroke number with the
 * USGA-style shape outline that conveys the relative-to-par result:
 *
 *   - Eagle (strokes ≤ par − 2)  → double-circle (`.dcircle`)
 *   - Birdie (strokes == par − 1) → single circle (`.circle`)
 *   - Par   (strokes == par)      → plain (no outline)
 *   - Bogey (strokes == par + 1)  → single square (`.square`)
 *   - Double or worse              → double square (`.dsquare`)
 *
 * No colour tinting per mockup §6 — the outline shape carries the
 * meaning, and the stroke number stays in `textTitle` regardless of
 * the result. Reserving colour for status (live, current selection)
 * keeps the scorecard readable on dim cards in dark mode.
 *
 * Renders a "—" placeholder when `strokes` is null / undefined so
 * unscored holes render consistently.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Variant = 'plain' | 'circle' | 'dcircle' | 'square' | 'dsquare';

export type ScoreMarkSize = 'sm' | 'md';

type Props = {
  /** Stroke count for the hole; null/undefined renders a "—" placeholder. */
  strokes: number | null | undefined;
  /** Hole par; required to compute the relative-to-par variant. */
  par: number;
  /** Visual size. Default 'sm' (scorecard cell). */
  size?: ScoreMarkSize;
};

export function ScoreMark({ strokes, par, size = 'sm' }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (strokes == null || !Number.isFinite(strokes) || strokes <= 0) {
    return (
      <View style={[styles.shell, dimensions(size)]}>
        <Text style={[styles.empty, fontSize(size)]}>—</Text>
      </View>
    );
  }

  const variant = variantFor(strokes, par);
  const shellStyle = [
    styles.shell,
    dimensions(size),
    variant === 'circle' ? styles.circle : null,
    variant === 'dcircle' ? styles.dcircle : null,
    variant === 'square' ? styles.square : null,
    variant === 'dsquare' ? styles.dsquare : null,
  ];
  const innerStyle =
    variant === 'dcircle' || variant === 'dsquare' ? styles.dInner : null;

  return (
    <View style={shellStyle}>
      <View style={[styles.inner, innerStyle, dimensions(size)]}>
        <Text style={[styles.text, fontSize(size)]}>{strokes}</Text>
      </View>
    </View>
  );
}

function variantFor(strokes: number, par: number): Variant {
  const rel = strokes - par;
  if (rel <= -2) return 'dcircle';
  if (rel === -1) return 'circle';
  if (rel === 0) return 'plain';
  if (rel === 1) return 'square';
  return 'dsquare';
}

function dimensions(size: ScoreMarkSize) {
  if (size === 'md') {
    return { minWidth: 28, height: 28, borderRadius: 14 };
  }
  return { minWidth: 22, height: 22, borderRadius: 11 };
}

function fontSize(size: ScoreMarkSize) {
  return { fontSize: size === 'md' ? 13 : 12 };
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    shell: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    inner: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      fontWeight: '900',
      color: colors.textTitle,
      lineHeight: 14,
    },
    empty: {
      color: colors.textMuted,
      fontWeight: '700',
      opacity: 0.5,
    },
    circle: {
      borderWidth: 1.5,
      borderColor: colors.textTitle,
    },
    dcircle: {
      borderWidth: 1.5,
      borderColor: colors.textTitle,
      padding: 2,
    },
    square: {
      borderWidth: 1.5,
      borderColor: colors.textTitle,
      borderRadius: 4,
    },
    dsquare: {
      borderWidth: 1.5,
      borderColor: colors.textTitle,
      borderRadius: 4,
      padding: 2,
    },
    dInner: {
      borderWidth: 1.5,
      borderColor: colors.textTitle,
      borderRadius: 11,
    },
  });
}
