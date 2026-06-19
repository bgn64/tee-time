/**
 * ScreenBackground — full-bleed night base with soft Aurora glow washes.
 *
 * Mirrors the mockup's phone interior: a near-black vertical gradient
 * (screenBgTop -> screenBgBottom) overlaid with two soft radial glows
 * (lime upper-right, cyan upper-left). The glows are SVG radial gradients
 * that fade smoothly to transparent rather than filled discs, so there is
 * no hard circular edge.
 */

import React, { useId, useMemo, type JSX } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export function ScreenBackground(props: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Unique gradient ids — react-native-svg can mis-reuse <Defs> entries when
  // ids collide across <Svg> roots on some platforms.
  const uid = useId().replace(/:/g, '');
  const limeId = `aurora-lime-${uid}`;
  const cyanId = `aurora-cyan-${uid}`;

  return (
    <View style={[styles.root, props.style]}>
      <LinearGradient
        colors={[colors.screenBgTop, colors.screenBgBottom] as const}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.glow, styles.limeGlow]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={limeId} cx={0.5} cy={0.5} r={0.5}>
              <Stop offset={0} stopColor={colors.lime} stopOpacity={0.18} />
              <Stop offset={1} stopColor={colors.lime} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${limeId})`} />
        </Svg>
      </View>
      <View pointerEvents="none" style={[styles.glow, styles.cyanGlow]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={cyanId} cx={0.5} cy={0.5} r={0.5}>
              <Stop offset={0} stopColor={colors.cyan} stopOpacity={0.15} />
              <Stop offset={1} stopColor={colors.cyan} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${cyanId})`} />
        </Svg>
      </View>
      <View style={styles.content}>{props.children}</View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: colors.screenBgBottom,
    },
    content: {
      flex: 1,
    },
    glow: {
      position: 'absolute',
    },
    limeGlow: {
      top: -90,
      right: -110,
      width: 420,
      height: 360,
    },
    cyanGlow: {
      top: 120,
      left: -150,
      width: 460,
      height: 400,
    },
  });
}
