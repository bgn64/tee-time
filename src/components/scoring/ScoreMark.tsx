/**
 * ScoreMark — primitive that wraps a stroke number with the
 * USGA-style shape outline that conveys the relative-to-par result:
 *
 *   - Eagle (strokes ≤ par − 2)  → double-circle: two concentric
 *                                  circles
 *   - Birdie (strokes == par − 1) → single circle
 *   - Par   (strokes == par)      → plain (no outline)
 *   - Bogey (strokes == par + 1)  → single square
 *   - Double or worse              → double-square: two concentric
 *                                    rounded squares
 *
 * Concentric implementation note: the inner ring is an
 * absolutely-positioned `<View>` inset by `INNER_INSET` from each
 * edge of the outer cell, with a smaller `borderRadius` so it
 * matches the outer's shape (circle inner inside circle outer,
 * rounded-square inner inside rounded-square outer). Absolute
 * positioning is the right tool here because (a) it keeps the
 * inner from participating in flex layout (the `<Text>` stays
 * centered via the outer's `alignItems` / `justifyContent`), and
 * (b) `top/left/right/bottom: N` naturally produces a centered
 * inset rectangle without us having to compute width/height from
 * the parent.
 *
 * Two earlier attempts had bugs worth recording so they don't
 * recur:
 *
 *   1. Original code used the same `dInner` style for both
 *      `dcircle` and `dsquare`, with `borderRadius: 11` — a
 *      circle. That produced a circle-inside-square for double
 *      bogey.
 *
 *   2. Fixing #1 by routing `dsquare` to a `dInnerSquare`
 *      (borderRadius: 4) was foiled by a `dimensions(size, true)`
 *      style appended LAST in the array, which override the
 *      borderRadius back to 11 (the dimensions helper hardcoded
 *      circle). Additionally that helper gave the inner the SAME
 *      `width` as the outer, so the inner overflowed the outer's
 *      padding region and visually merged into the outer border —
 *      making `dcircle` look identical to a single `circle`.
 *
 * Both classes of bug are avoided here by:
 *   - Not mixing per-size dimensions with per-variant shape in
 *     the same style array.
 *   - Using absolute positioning for the inner so its size is
 *     derived from the outer's bounds, not from a competing
 *     `width` value.
 *
 * No colour tinting per mockup §6 — the outline shape carries the
 * meaning, and the stroke number stays in `textTitle` regardless of
 * the result.
 *
 * Two-digit scores (10+) shrink the font instead of widening the
 * cell, so the fixed-width scorecard grid stays aligned.
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

// Distance between the outer ring and the inner ring on double
// variants. Chosen so the inner is visibly separated from the
// outer at both sizes while still leaving room for the text.
const INNER_INSET_SM = 2;
const INNER_INSET_MD = 3;

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

  const variant = variantFor(strokes, par);
  const isWide = strokes >= 10;
  const isDouble = variant === 'dcircle' || variant === 'dsquare';
  const isSquareLike = variant === 'square' || variant === 'dsquare';

  // Outer style: starts from the size dimensions (default circle
  // radius), then layers a square `borderRadius` if the variant is
  // a square shape, then layers the border colour for any non-plain
  // variant. Order matters: square's `borderRadius: 4` must come
  // AFTER the size's `borderRadius: 11` for the override to land.
  const outerStyle = [
    styles.shell,
    sizeStyle(size),
    isSquareLike ? styles.squareRadius : null,
    variant !== 'plain' ? styles.outline : null,
  ];

  // Inner ring style: absolute-positioned inset rectangle with
  // either a small radius (square) or the size-appropriate radius
  // (circle). The inset is the same for both shapes; the radius
  // determines what the inset rectangle looks like.
  const innerStyle = isDouble
    ? [
        styles.innerBase,
        innerInsetStyle(size),
        isSquareLike
          ? styles.innerSquareRadius
          : innerCircleRadiusStyle(size),
        styles.outline,
      ]
    : null;

  return (
    <View style={outerStyle}>
      {innerStyle ? <View style={innerStyle} pointerEvents="none" /> : null}
      <Text style={[styles.text, fontSize(size, isWide)]}>{strokes}</Text>
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

function sizeStyle(size: ScoreMarkSize) {
  // `borderRadius` here is half the side so circle variants render
  // as perfect circles. Square variants overwrite this further down
  // the style chain.
  if (size === 'md') {
    return { width: 28, height: 28, borderRadius: 14 };
  }
  return { width: 22, height: 22, borderRadius: 11 };
}

function innerInsetStyle(size: ScoreMarkSize) {
  const inset = size === 'md' ? INNER_INSET_MD : INNER_INSET_SM;
  return { top: inset, left: inset, right: inset, bottom: inset };
}

function innerCircleRadiusStyle(size: ScoreMarkSize) {
  // Inner side length = outer side − 2 × inset. Halve for the
  // perfect-circle borderRadius.
  if (size === 'md') {
    return { borderRadius: (28 - 2 * INNER_INSET_MD) / 2 };
  }
  return { borderRadius: (22 - 2 * INNER_INSET_SM) / 2 };
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
    // Single-source-of-truth for the ring colour + thickness;
    // reused by both the outer and the absolute-positioned inner.
    outline: {
      borderWidth: 1.5,
      borderColor: colors.textTitle,
    },
    // Square radius override; layered AFTER `sizeStyle` so it wins
    // the cascade for square + dsquare variants.
    squareRadius: {
      borderRadius: 4,
    },
    innerBase: {
      position: 'absolute',
    },
    // Smaller-than-outer radius gives the inner a visibly nested
    // rounded-square look (matches the outer's softer square).
    innerSquareRadius: {
      borderRadius: 2,
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
  });
}
