/**
 * ScorePip — compact score result pip computed from strokes relative to par.
 */

import { useMemo, type JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { NumericText } from './NumericText';

type PipKind = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';

export function ScorePip(props: { strokes: number; par: number; size?: number }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const size = props.size ?? 24;
  const kind = kindFor(props.strokes, props.par);
  const dynamicStyle = { width: size, height: size, borderRadius: size / 2 };
  const textStyle = { fontSize: Math.max(10, size * 0.5), lineHeight: Math.max(12, size * 0.58) };

  return (
    <View style={[styles.pip, dynamicStyle, pipStyle(styles, kind)]}>
      <NumericText style={[styles.text, textStyle, textStyleFor(styles, kind)]}>{props.strokes}</NumericText>
    </View>
  );
}

function kindFor(strokes: number, par: number): PipKind {
  const relative = strokes - par;
  if (relative <= -2) return 'eagle';
  if (relative === -1) return 'birdie';
  if (relative === 0) return 'par';
  if (relative === 1) return 'bogey';
  return 'double';
}

function pipStyle(styles: ReturnType<typeof makeStyles>, kind: PipKind) {
  if (kind === 'eagle') return styles.eagle;
  if (kind === 'birdie') return styles.birdie;
  if (kind === 'bogey') return styles.bogey;
  if (kind === 'double') return styles.double;
  return styles.par;
}

function textStyleFor(styles: ReturnType<typeof makeStyles>, kind: PipKind) {
  if (kind === 'eagle') return styles.eagleText;
  if (kind === 'birdie') return styles.birdieText;
  if (kind === 'bogey') return styles.bogeyText;
  if (kind === 'double') return styles.doubleText;
  return styles.parText;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pip: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      fontWeight: '900',
      textAlign: 'center',
      includeFontPadding: false,
    },
    eagle: {
      backgroundColor: colors.pipEagleBg,
    },
    birdie: {
      borderWidth: 1.5,
      borderColor: colors.pipBirdieRing,
      backgroundColor: colors.glowLime,
    },
    par: {
      backgroundColor: colors.glassFill,
    },
    bogey: {
      borderWidth: 1.5,
      borderColor: colors.pipBogeyRing,
      backgroundColor: colors.glassFill,
    },
    double: {
      borderWidth: 1.5,
      borderColor: colors.accent,
      backgroundColor: colors.glassFill,
    },
    eagleText: {
      color: colors.pipEagleText,
    },
    birdieText: {
      color: colors.pipBirdie,
    },
    parText: {
      color: colors.textTitle,
    },
    bogeyText: {
      color: colors.pipBogey,
    },
    doubleText: {
      color: colors.accent,
    },
  });
}
