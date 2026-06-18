/**
 * ScreenBackground — full-bleed night gradient with soft Aurora glow blobs.
 */

import React, { useMemo, type JSX } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function ScreenBackground(props: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.root, props.style]}>
      <LinearGradient
        colors={[colors.nightTop, colors.nightViolet, colors.night] as const}
        locations={[0, 0.42, 1] as const}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.glowBlob, styles.limeBlob]} />
      <View pointerEvents="none" style={[styles.glowBlob, styles.cyanBlob]} />
      <View style={styles.content}>{props.children}</View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: colors.night,
    },
    content: {
      flex: 1,
    },
    glowBlob: {
      position: 'absolute',
      opacity: 0.4,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.7,
      shadowRadius: 90,
      elevation: 1,
    },
    limeBlob: {
      top: -60,
      right: -90,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: colors.glowLime,
      shadowColor: colors.lime,
    },
    cyanBlob: {
      top: 220,
      left: -120,
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: colors.glowCyan,
      shadowColor: colors.cyan,
    },
  });
}
