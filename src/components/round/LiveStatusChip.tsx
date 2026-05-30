/**
 * LiveStatusChip — compact inline `● LIVE` confirmation.
 *
 * Motion uses Reanimated shared values/worklets and respects the
 * system reduced-motion setting via Reanimated's `useReducedMotion`.
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  style?: StyleProp<ViewStyle>;
};

export function LiveStatusChip({ style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }

    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1450,
        easing: Easing.out(Easing.cubic),
      }),
      -1,
      false
    );

    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion]);

  const haloStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 0.7, 1], [0.72, 2.65, 2.65]);
    const opacity = interpolate(pulse.value, [0, 0.7, 1], [0.38, 0, 0]);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const dotStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 0.7, 1], [0.86, 1, 0.86]);
    return {
      transform: [{ scale }],
    };
  });

  return (
    <View style={[styles.chip, style]} accessibilityLabel="Live round">
      <View style={styles.dotWrap}>
        {reducedMotion ? null : (
          <Animated.View style={[styles.dotHalo, haloStyle]} />
        )}
        <Animated.View style={[styles.dot, reducedMotion ? null : dotStyle]} />
      </View>
      <Text style={styles.label}>LIVE</Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.3),
      backgroundColor: withAlpha(colors.primary, 0.12),
    },
    dotWrap: {
      width: 8,
      height: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotHalo: {
      position: 'absolute',
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: withAlpha(colors.primary, 0.35),
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    label: {
      color: colors.primaryDark,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.5,
      lineHeight: 12,
    },
  });
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
