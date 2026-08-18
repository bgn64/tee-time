/**
 * GlassSurface — flat translucent Aurora glass base with a hairline stroke.
 */

import React, { useMemo, type JSX } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function GlassSurface(props: { children?: React.ReactNode; strong?: boolean; glow?: boolean; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.surface,
        props.strong ? styles.strong : styles.base,
        props.glow ? styles.glow : null,
        props.style,
      ]}>
      {/* TODO(p10): optional iOS blur via expo-glass-effect GlassView. */}
      {props.children}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    surface: {
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 20,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.35,
      shadowRadius: 28,
      elevation: 5,
    },
    base: {
      backgroundColor: colors.glassFill,
    },
    strong: {
      backgroundColor: colors.glassFill2,
    },
    glow: {
      shadowColor: colors.lime,
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 7,
    },
  });
}
