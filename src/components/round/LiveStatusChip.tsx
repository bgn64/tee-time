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
      borderColor: colors.lime,
      backgroundColor: colors.glowLime,
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
      backgroundColor: colors.glowLime,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.lime,
    },
    label: {
      color: colors.lime,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.5,
      lineHeight: 12,
    },
  });
}
