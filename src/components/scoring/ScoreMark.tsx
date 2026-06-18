/**
 * ScoreMark — compatibility wrapper for scorecard stroke cells.
 *
 * Non-empty scores now render through the shared Aurora `<ScorePip>`
 * primitive, preserving this component's public props for scoring/detail
 * surfaces while aligning birdie/eagle/bogey visuals with the feed cards.
 * Empty cells keep the existing em-dash placeholder.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScorePip } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

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
      <View style={[styles.shell, sizeStyle(size)]}>
        <Text style={[styles.empty, fontSize(size, false)]}>—</Text>
      </View>
    );
  }

  return <ScorePip strokes={strokes} par={par} size={size === 'md' ? 28 : 22} />;
}

function sizeStyle(size: ScoreMarkSize) {
  // `borderRadius` here is half the side so circle variants render
  // as perfect circles. Square variants overwrite this further down
  // the style chain.
  if (size === 'md') {
    return { width: 28, height: 28, borderRadius: 14 };
  }
  return { width: 22, height: 22, borderRadius: 11 };
}

function fontSize(size: ScoreMarkSize, isWide: boolean) {
  if (size === 'md') {
    return { fontSize: isWide ? 11 : 13 };
  }
  return { fontSize: isWide ? 10 : 12 };
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    shell: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: {
      color: colors.textMuted,
      fontWeight: '700',
      opacity: 0.5,
    },
  });
}
