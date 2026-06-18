/**
 * LiveTopStrip — 6px card-top live cue.
 *
 * Motion uses Reanimated shared values/worklets and respects the
 * system reduced-motion setting via Reanimated's `useReducedMotion`.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
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

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export function LiveTopStrip({ style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const shine = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(shine);
      shine.value = 0;
      return;
    }

    shine.value = 0;
    shine.value = withRepeat(
      withTiming(1, {
        duration: 2350,
        easing: Easing.inOut(Easing.cubic),
      }),
      -1,
      false
    );

    return () => cancelAnimation(shine);
  }, [reducedMotion, shine]);

  const shineStyle = useAnimatedStyle(() => {
    const left = interpolate(shine.value, [0, 0.52, 1], [-48, 108, 108]);
    return {
      left: `${left}%`,
    };
  });

  return (
    <LinearGradient
      colors={[colors.cyan, colors.lime, colors.violet]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.strip, style]}
      pointerEvents="none">
      {reducedMotion ? null : (
        <AnimatedLinearGradient
          colors={[
            'rgba(255,255,255,0)',
            'rgba(255,255,255,0.44)',
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.shine, shineStyle]}
        />
      )}
    </LinearGradient>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    strip: {
      height: 6,
      overflow: 'hidden',
      backgroundColor: colors.lime,
    },
    shine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: '44%',
    },
  });
}
