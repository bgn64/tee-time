/**
 * EditorialHeader — the magazine-style top band shared by the feed
 * card and the scoring screen.
 *
 * Pure presentational; the parent decides whether to show the
 * `LiveTopStrip` (in-flight rounds) and what to feed into the
 * top-line meta + course title.
 *
 * Replaces the composition that was previously done inline by the
 * (now-deleted) `RoundCardHeader` for the live banner. Owner avatar
 * + pills + score block (which used to live in `RoundCardHeader`)
 * now live in the per-scorer rows in `SummaryTabContent`, so the
 * header is intentionally simpler here.
 *
 * Design note: the mockup uses an accent-coloured 4px flat strip;
 * the existing `LiveTopStrip` is a primary-coloured 6px strip with
 * a polished shine animation. We deliberately reuse the existing
 * component to preserve the animation polish — the colour
 * discrepancy is a known minor deviation and can be revisited.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { LiveTopStrip } from './LiveTopStrip';

type Props = {
  /**
   * When true, renders the `LiveTopStrip` above the header text and
   * prefixes the top line with the accent live dot.
   */
  liveStripVisible: boolean;
  /**
   * Primary text in the small-caps meta line (e.g. "LIVE · THRU 11"
   * or "completed · today" or "started 2h ago").
   */
  topLineLeft: string;
  /**
   * Optional secondary text in the meta line, rendered after a dot
   * separator (e.g. "2h ago").
   */
  topLineRight?: string;
  /** Course name (the `<h3>`). */
  title: string;
  /** Sub-line: e.g. "Pebble Beach, CA · Stroke · 18 holes". */
  subtitle: string;
};

export function EditorialHeader({
  liveStripVisible,
  topLineLeft,
  topLineRight,
  title,
  subtitle,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View>
      {liveStripVisible ? <LiveTopStrip /> : null}
      <View style={styles.header}>
        <View style={styles.topRow}>
          {liveStripVisible ? <View style={styles.liveDot} /> : null}
          <Text style={styles.topText} numberOfLines={1}>
            {topLineLeft}
          </Text>
          {topLineRight ? (
            <>
              <Text style={styles.topSep}>·</Text>
              <Text style={styles.topText} numberOfLines={1}>
                {topLineRight}
              </Text>
            </>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      paddingTop: 16,
      paddingHorizontal: 18,
      paddingBottom: 8,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    topText: {
      fontSize: 11.5,
      color: colors.textMuted,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    topSep: {
      fontSize: 11.5,
      color: colors.textMuted,
      fontWeight: '700',
    },
    title: {
      marginTop: 4,
      fontSize: 20,
      lineHeight: 22,
      color: colors.textTitle,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    subtitle: {
      marginTop: 4,
      fontSize: 11.5,
      color: colors.textMuted,
      fontWeight: '500',
    },
  });
}
