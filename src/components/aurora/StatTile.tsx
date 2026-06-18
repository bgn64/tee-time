/**
 * StatTile — profile stat tile with large tabular value and muted label.
 */

import { useMemo, type JSX } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { GlassSurface } from './GlassSurface';
import { NumericText } from './NumericText';

export function StatTile(props: { value: string | number; label: string; tone?: 'default' | 'lime' | 'cyan'; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tone = props.tone ?? 'default';

  return (
    <GlassSurface style={[styles.tile, props.style]}>
      <NumericText style={[styles.value, tone === 'lime' ? styles.lime : tone === 'cyan' ? styles.cyan : null]}>
        {props.value}
      </NumericText>
      <Text style={styles.label}>{props.label}</Text>
    </GlassSurface>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tile: {
      borderRadius: 16,
      padding: 14,
    },
    value: {
      color: colors.textTitle,
      fontSize: 25,
      fontWeight: '900',
    },
    lime: {
      color: colors.lime,
    },
    cyan: {
      color: colors.cyan,
    },
    label: {
      marginTop: 3,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
  });
}
