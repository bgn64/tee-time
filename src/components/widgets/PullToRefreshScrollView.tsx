/**
 * PullToRefreshScrollView — a ScrollView with Instagram-web-style
 * pull-to-refresh.
 *
 * Why this exists: React Native's `RefreshControl` is a no-op on
 * react-native-web — it renders a plain `View` and ignores `refreshing` /
 * `onRefresh` (see node_modules/react-native-web/.../RefreshControl), so the
 * web app gets no pull gesture and no spinner. This component implements the
 * gesture itself on web with raw touch handlers + Reanimated: dragging down
 * while scrolled to the top reveals a spinner that slides in; releasing past a
 * threshold runs `onRefresh` and holds the spinner until it settles. On native
 * (iOS/Android) it falls back to the platform `RefreshControl` so device builds
 * keep their native feel.
 *
 * The pull only engages when a drag *starts* at the very top of the scroll
 * (`scrollY <= 0`); otherwise the touch handlers no-op and never call
 * `preventDefault`, so mid-feed drags scroll the list normally. The browser's
 * own pull-to-refresh is disabled app-wide on web via
 * `overscroll-behavior-y: contain` so it can't compete with ours.
 *
 * API mirrors a small subset of ScrollView. `onRefresh` may return a Promise;
 * the spinner holds until it settles (errors included).
 *
 * Reanimated note: every shared-value mutation lives in a touch handler or a
 * promise callback — never in a `useEffect` — so the React Compiler's
 * `react-hooks/immutability` rule (effects must not mutate values they read)
 * stays satisfied. The effects here only sync a ref and patch CSS.
 */

import React from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/library/theme/ThemeContext';

// Pull past TRIGGER_DISTANCE and release to refresh. While refreshing the
// content rests REST_DISTANCE down so the spinner stays visible. MAX_DISTANCE
// clamps how far the content follows the finger; DRAG_RESISTANCE gives the
// rubber-band feel (the finger travels twice as far as the content).
const TRIGGER_DISTANCE = 64;
const REST_DISTANCE = 64;
const MAX_DISTANCE = 110;
const DRAG_RESISTANCE = 0.5;
// Min finger travel (px) before we lock the gesture to its dominant axis.
const AXIS_LOCK_THRESHOLD = 8;

type Props = {
  /** Refetch handler. May be async — the spinner holds until it settles. */
  onRefresh: () => Promise<unknown> | void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Spinner colour. Defaults to the theme primary. */
  tintColor?: string;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
};

export function PullToRefreshScrollView(props: Props) {
  // Platform.OS is constant at runtime, so this branch is stable across
  // renders — each platform always mounts the same subcomponent.
  return Platform.OS === 'web' ? (
    <WebPullToRefresh {...props} />
  ) : (
    <NativePullToRefresh {...props} />
  );
}

// ---------------------------------------------------------------------------
// Native (iOS/Android): the platform RefreshControl is the right tool.
// ---------------------------------------------------------------------------

function NativePullToRefresh({
  onRefresh,
  children,
  style,
  contentContainerStyle,
  tintColor,
  scrollEnabled = true,
  showsVerticalScrollIndicator,
}: Props) {
  const { colors } = useTheme();
  const spinnerColor = tintColor ?? colors.lime;

  const [refreshing, setRefreshing] = React.useState(false);
  const refreshingRef = React.useRef(false);
  const onRefreshRef = React.useRef(onRefresh);
  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const handleRefresh = React.useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    Promise.resolve(onRefreshRef.current())
      .catch(() => {})
      .finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      });
  }, []);

  return (
    <ScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={spinnerColor}
          colors={[spinnerColor, colors.cyan]}
          progressBackgroundColor={colors.glassFill2}
        />
      }>
      {children}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Web: custom touch-driven pull + Reanimated spinner.
// ---------------------------------------------------------------------------

// Disable the browser's native pull-to-refresh once, app-wide, on web so it
// can't fight our custom gesture. Idempotent — safe to call from every mount.
let webOverscrollPatched = false;
function patchWebOverscroll(): void {
  if (webOverscrollPatched || typeof document === 'undefined') return;
  webOverscrollPatched = true;
  document.documentElement.style.setProperty('overscroll-behavior-y', 'contain');
  document.body.style.setProperty('overscroll-behavior-y', 'contain');
}

function WebPullToRefresh({
  onRefresh,
  children,
  style,
  contentContainerStyle,
  tintColor,
  scrollEnabled = true,
  showsVerticalScrollIndicator,
}: Props) {
  const { colors } = useTheme();
  const spinnerColor = tintColor ?? colors.lime;
  const trackColor = colors.glassStroke;

  // Content offset (and, while refreshing, the resting spinner gap).
  const pull = useSharedValue(0);
  // 0..1 looped rotation driver, used only while refreshing.
  const spin = useSharedValue(0);
  // 1 while a refresh is in flight — switches the spinner to a continuous spin.
  const refreshingSV = useSharedValue(0);

  const scrollYRef = React.useRef(0);
  const startYRef = React.useRef<number | null>(null);
  const startXRef = React.useRef<number | null>(null);
  // Once a gesture's dominant axis is decided we stick with it: a
  // horizontal-dominant drag (e.g. swiping the card pager) must not also
  // arm the vertical pull-to-refresh, so a diagonal drag at the top can't
  // run both at once.
  const axisDecidedRef = React.useRef(false);
  // True only when a drag began at the very top — guards against turning a
  // normal upward scroll into a pull when the list flicks back to the top.
  const eligibleRef = React.useRef(false);
  const refreshingRef = React.useRef(false);

  const onRefreshRef = React.useRef(onRefresh);
  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  React.useEffect(() => {
    patchWebOverscroll();
  }, []);

  const startRefresh = () => {
    refreshingRef.current = true;
    refreshingSV.value = 1;
    pull.value = withTiming(REST_DISTANCE, { duration: 160 });
    spin.value = 0;
    spin.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.linear }),
      -1,
      false
    );
    Promise.resolve(onRefreshRef.current())
      .catch(() => {})
      .finally(() => {
        refreshingRef.current = false;
        refreshingSV.value = 0;
        cancelAnimation(spin);
        spin.value = 0;
        pull.value = withTiming(0, { duration: 240 });
      });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  };

  // On web the View forwards touch props to the DOM, so `nativeEvent` is a real
  // TouchEvent; `touches[0].pageY` is the live finger position.
  const touchY = (e: GestureResponderEvent): number | null => {
    const touch = e.nativeEvent.touches?.[0];
    return touch ? touch.pageY : null;
  };

  const touchX = (e: GestureResponderEvent): number | null => {
    const touch = e.nativeEvent.touches?.[0];
    return touch ? touch.pageX : null;
  };

  const onTouchStart = (e: GestureResponderEvent) => {
    if (refreshingRef.current) {
      eligibleRef.current = false;
      return;
    }
    const y = touchY(e);
    startYRef.current = y;
    startXRef.current = touchX(e);
    axisDecidedRef.current = false;
    // Pull only when the drag begins at the top of the scroll.
    eligibleRef.current = scrollYRef.current <= 0 && y != null;
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    if (refreshingRef.current || !eligibleRef.current) return;
    const start = startYRef.current;
    if (start == null) return;
    // Any real scroll offset means the user is scrolling, not pulling.
    if (scrollYRef.current > 0) {
      eligibleRef.current = false;
      pull.value = 0;
      return;
    }
    const y = touchY(e);
    if (y == null) return;
    const dy = y - start;

    // Lock to the gesture's dominant axis on the first meaningful move. A
    // horizontal-dominant drag (swiping the card pager) disarms the pull so
    // the two gestures can't both run on a diagonal drag at the top.
    if (!axisDecidedRef.current) {
      const startX = startXRef.current;
      const x = touchX(e);
      const dx = startX != null && x != null ? x - startX : 0;
      if (
        Math.abs(dx) > AXIS_LOCK_THRESHOLD ||
        Math.abs(dy) > AXIS_LOCK_THRESHOLD
      ) {
        axisDecidedRef.current = true;
        if (Math.abs(dx) > Math.abs(dy)) {
          eligibleRef.current = false;
          pull.value = 0;
          return;
        }
      }
    }

    pull.value = dy <= 0 ? 0 : Math.min(dy * DRAG_RESISTANCE, MAX_DISTANCE);
  };

  const onTouchEnd = () => {
    if (refreshingRef.current || !eligibleRef.current) return;
    eligibleRef.current = false;
    startYRef.current = null;
    if (pull.value >= TRIGGER_DISTANCE) {
      startRefresh();
    } else {
      pull.value = withTiming(0, { duration: 180 });
    }
  };

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pull.value }],
  }));

  const spinnerWrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pull.value - REST_DISTANCE }],
    opacity: interpolate(
      pull.value,
      [0, TRIGGER_DISTANCE * 0.4, TRIGGER_DISTANCE],
      [0, 0.5, 1],
      Extrapolation.CLAMP
    ),
  }));

  const circleStyle = useAnimatedStyle(() => {
    const dragRotation = interpolate(
      pull.value,
      [0, TRIGGER_DISTANCE],
      [0, 280],
      Extrapolation.CLAMP
    );
    const rotation = refreshingSV.value === 1 ? spin.value * 360 : dragRotation;
    const scale = interpolate(
      pull.value,
      [0, TRIGGER_DISTANCE],
      [0.55, 1],
      Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${rotation}deg` }, { scale }] };
  });

  return (
    <View
      style={[styles.root, style]}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}>
      <Animated.View
        pointerEvents="none"
        style={[styles.spinnerWrap, spinnerWrapStyle]}>
        <Animated.View
          style={[
            styles.spinnerCircle,
            {
              backgroundColor: colors.glassFill2,
              borderColor: trackColor,
              borderTopColor: spinnerColor,
              borderRightColor: colors.cyan,
            },
            circleStyle,
          ]}
        />
      </Animated.View>
      <Animated.ScrollView
        style={[styles.scroll, contentStyle]}
        contentContainerStyle={contentContainerStyle}
        onScroll={onScroll}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}>
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  spinnerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: REST_DISTANCE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
  },
});
