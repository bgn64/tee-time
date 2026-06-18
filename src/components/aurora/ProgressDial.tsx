/**
 * ProgressDial — circular to-par/progress ring with centered numeric value.
 */

import { useMemo, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { NumericText } from './NumericText';

export function ProgressDial(props: { value: string; label?: string; fraction: number; size?: number; trackColor?: string; progressColor?: string }): JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const size = props.size ?? 96;
  const strokeWidth = Math.max(6, size * 0.1);
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, Math.max(0, props.fraction));
  const progressColor = props.progressColor ?? colors.lime;
  const trackColor = props.trackColor ?? colors.glassStroke;
  const innerSize = size - strokeWidth * 2.2;

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={[styles.inner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        <NumericText style={[styles.value, { color: progressColor, fontSize: Math.max(22, size * 0.31) }]}>
          {props.value}
        </NumericText>
        {props.label ? <Text style={styles.label}>{props.label}</Text> : null}
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.lime,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 18,
    },
    inner: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBg,
    },
    value: {
      fontWeight: '900',
      lineHeight: 34,
    },
    label: {
      marginTop: 3,
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
  });
}
