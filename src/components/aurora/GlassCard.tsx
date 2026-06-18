/**
 * GlassCard — padded, rounded card surface for Aurora screen content.
 */

import React, { useMemo, type JSX } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { GlassSurface } from './GlassSurface';

export function GlassCard(props: { children?: React.ReactNode; strong?: boolean; glow?: boolean; padded?: boolean; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <GlassSurface
      strong={props.strong}
      glow={props.glow}
      style={[styles.card, props.padded === false ? null : styles.padded, props.style]}>
      {props.children}
    </GlassSurface>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: 24,
      borderColor: colors.glassStroke,
    },
    padded: {
      padding: 16,
    },
  });
}
