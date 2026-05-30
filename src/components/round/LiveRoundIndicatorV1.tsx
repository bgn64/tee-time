/**
 * LiveRoundIndicatorV1 — "Heartbeat halo"
 *
 * Design intent:
 * A full-width, card-sized status banner that makes a live round feel
 * meaningfully different from completed cards without requiring a card
 * redesign. The visual language stays close to the app: primary green
 * gradient, rounded 14-18px corners, heavy labels, and a small accent
 * flash for urgency.
 *
 * Motion spec:
 * - Two halo rings expand from the live orb every 1.45s using a
 *   repeated timing sequence. Opacity fades as the rings grow.
 * - The center orb performs a short "heartbeat" scale pop, then rests.
 * - Animations start on mount and are driven by Reanimated shared
 *   values/worklets; no timers or React state loops are used.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { formatRelativeTime } from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type LiveRoundIndicatorSize = 'sm' | 'md' | 'lg';

export type LiveRoundIndicatorV1Props = {
  /** ISO timestamp for the latest score this device knows about. */
  lastScoreAt?: string;
  /** Optional scorer display name for the activity line. */
  scorerName?: string;
  /** Compact variants for feed cards vs. detail/header placements. */
  size?: LiveRoundIndicatorSize;
  /** Optional host-card spacing/positioning override. */
  style?: StyleProp<ViewStyle>;
};

const SIZE = {
  sm: {
    minHeight: 52,
    padH: 11,
    padV: 8,
    radius: 14,
    orbWrap: 34,
    orb: 10,
    title: 10.5,
    detail: 11,
    meta: 8.5,
  },
  md: {
    minHeight: 62,
    padH: 13,
    padV: 10,
    radius: 16,
    orbWrap: 40,
    orb: 12,
    title: 11,
    detail: 12,
    meta: 9,
  },
  lg: {
    minHeight: 74,
    padH: 15,
    padV: 12,
    radius: 18,
    orbWrap: 48,
    orb: 14,
    title: 12,
    detail: 13,
    meta: 9.5,
  },
} as const;

export function LiveRoundIndicatorV1({
  lastScoreAt,
  scorerName,
  size = 'md',
  style,
}: LiveRoundIndicatorV1Props) {
  const { colors, themeName } = useTheme();
  const config = SIZE[size];
  const styles = useMemo(
    () => makeStyles(colors, themeName, config, size),
    [colors, themeName, config, size]
  );

  const halo = useSharedValue(0);
  const beat = useSharedValue(0);

  useEffect(() => {
    halo.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 1450,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(0, { duration: 1 })
      ),
      -1,
      false
    );

    beat.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 150,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(0, {
          duration: 210,
          easing: Easing.in(Easing.quad),
        }),
        withDelay(880, withTiming(0, { duration: 1 }))
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(halo);
      cancelAnimation(beat);
    };
  }, [beat, halo]);

  const haloStyle = useAnimatedStyle(() => {
    const scale = interpolate(halo.value, [0, 0.7, 1], [0.72, 1.7, 2.05]);
    const opacity = interpolate(halo.value, [0, 0.18, 0.78, 1], [0.42, 0.5, 0.08, 0]);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const trailingHaloStyle = useAnimatedStyle(() => {
    const phase = (halo.value + 0.46) % 1;
    const scale = interpolate(phase, [0, 0.7, 1], [0.72, 1.55, 1.9]);
    const opacity = interpolate(phase, [0, 0.16, 0.74, 1], [0.28, 0.34, 0.05, 0]);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + beat.value * 0.28 }],
  }));

  const gradientColors: [string, string, string] = [
    colors.primaryDark,
    colors.primary,
    themeName === 'dark' ? withAlpha(colors.accent, 0.88) : colors.accent,
  ];
  const detail = activityLine(lastScoreAt, scorerName);
  const accessibilityLabel = `Live round in progress. ${detail}`;

  return (
    <View style={[styles.frame, style]} accessibilityLabel={accessibilityLabel}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}>
        <View style={styles.orbWrap}>
          <Animated.View style={[styles.halo, haloStyle]} />
          <Animated.View style={[styles.halo, styles.haloSoft, trailingHaloStyle]} />
          <Animated.View style={[styles.orb, orbStyle]}>
            <View style={styles.orbCore} />
          </Animated.View>
        </View>

        <View style={styles.copy}>
          <Text style={styles.kicker}>LIVE ROUND</Text>
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        </View>

        <View style={styles.status}>
          <Text style={styles.statusText}>NOW</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function activityLine(lastScoreAt?: string, scorerName?: string): string {
  if (lastScoreAt && scorerName) {
    return `${scorerName} scored ${formatRelativeTime(lastScoreAt)}`;
  }
  if (lastScoreAt) return `Updated ${formatRelativeTime(lastScoreAt)}`;
  if (scorerName) return `${scorerName} is scoring now`;
  return 'Scoring is happening right now';
}

function makeStyles(
  colors: ThemeColors,
  themeName: 'light' | 'dark',
  config: (typeof SIZE)[LiveRoundIndicatorSize],
  size: LiveRoundIndicatorSize
) {
  const haloColor = themeName === 'dark' ? colors.primary : '#ffffff';
  const isSmall = size === 'sm';
  return StyleSheet.create({
    frame: {
      minHeight: config.minHeight,
      borderRadius: config.radius,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, themeName === 'dark' ? 0.55 : 0.35),
      backgroundColor: colors.cardBg,
      overflow: 'hidden',
      shadowColor: colors.primaryDark,
      shadowOpacity: themeName === 'dark' ? 0.2 : 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    gradient: {
      minHeight: config.minHeight,
      paddingHorizontal: config.padH,
      paddingVertical: config.padV,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    orbWrap: {
      width: config.orbWrap,
      height: config.orbWrap,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    halo: {
      position: 'absolute',
      width: config.orbWrap * 0.58,
      height: config.orbWrap * 0.58,
      borderRadius: config.orbWrap,
      borderWidth: 1.5,
      borderColor: withAlpha(haloColor, 0.78),
    },
    haloSoft: {
      borderColor: withAlpha(haloColor, 0.46),
    },
    orb: {
      width: config.orb,
      height: config.orb,
      borderRadius: config.orb / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ffffff',
      shadowColor: '#ffffff',
      shadowOpacity: 0.65,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 3,
    },
    orbCore: {
      width: Math.max(4, config.orb * 0.46),
      height: Math.max(4, config.orb * 0.46),
      borderRadius: config.orb,
      backgroundColor: colors.accent,
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    kicker: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: config.meta,
      fontWeight: '800',
      letterSpacing: 1,
    },
    detail: {
      color: '#ffffff',
      fontSize: config.detail,
      fontWeight: '800',
      marginTop: 2,
      letterSpacing: 0.1,
    },
    status: {
      paddingHorizontal: isSmall ? 6 : 8,
      paddingVertical: isSmall ? 3 : 4,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
      flexShrink: 0,
    },
    statusText: {
      color: '#ffffff',
      fontSize: config.title,
      fontWeight: '900',
      letterSpacing: 0.7,
    },
  });
}

function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
