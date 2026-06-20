/**
 * StatTile — profile stat tile with large tabular value and muted label.
 */

import { useMemo, type JSX } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { GlassSurface } from './GlassSurface';
import { NumericText } from './NumericText';

export function StatTile(props: {
  value: string | number;
  label: string;
  tone?: 'default' | 'lime' | 'cyan';
  style?: StyleProp<ViewStyle>;
  /** When provided, the tile becomes pressable and shows a corner chevron. */
  onPress?: () => void;
}): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tone = props.tone ?? 'default';

  const valueNode = (
    <NumericText style={[styles.value, tone === 'lime' ? styles.lime : tone === 'cyan' ? styles.cyan : null]}>
      {props.value}
    </NumericText>
  );
  const labelNode = <Text style={styles.label}>{props.label}</Text>;

  if (!props.onPress) {
    return (
      <GlassSurface style={[styles.tile, props.style]}>
        {valueNode}
        {labelNode}
      </GlassSurface>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={({ pressed }) => [props.style, pressed ? styles.pressed : null]}>
      <GlassSurface style={[styles.tile, styles.pressFill]}>
        {valueNode}
        {labelNode}
        <Text style={styles.chevron}>›</Text>
      </GlassSurface>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tile: {
      borderRadius: 16,
      padding: 14,
    },
    pressFill: {
      width: '100%',
    },
    pressed: {
      opacity: 0.72,
    },
    chevron: {
      position: 'absolute',
      top: 10,
      right: 12,
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: '800',
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
