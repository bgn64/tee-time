/**
 * Visible toast surface. Reads the single-slot state from `useToast()` and
 * renders nothing when there's no active toast.
 *
 * Positioning:
 *   Absolute, bottom-center, lifted above the home-indicator / tab bar via
 *   the safe-area bottom inset (plus a small extra margin). Anchored to
 *   the root layout so it floats above all routes/tabs.
 *
 * Animation:
 *   Uses react-native's `Animated` API (matching `LiveRoundStrip`) — fade
 *   + slide-up on mount, fade on dismiss. Reanimated would be overkill for
 *   a single-slot surface.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/state/ThemeContext';
import { useToast } from '@/state/ToastContext';

const HORIZONTAL_MARGIN = 16;
const MAX_WIDTH = 480;
const BOTTOM_EXTRA = 24;

export function Toast() {
  const { toast } = useToast();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // We keep the last toast mounted briefly while it animates out so the
  // fade-out animation has something to operate on. `visibleToast` follows
  // `toast` immediately when a new toast arrives; when `toast` becomes null
  // we run the exit animation and clear `visibleToast` at the end.
  const [visibleToast, setVisibleToast] = useState(toast);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (toast) {
      // New toast (or replacement) — snap to the entrance start frame and
      // animate in.
      setVisibleToast(toast);
      opacity.setValue(0);
      translateY.setValue(12);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    // toast === null — animate out, then clear the mounted node.
    if (!visibleToast) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisibleToast(null);
      }
    });
    // We intentionally don't depend on `visibleToast` here — exit is driven
    // by `toast` going null, and re-running the effect on every visible
    // change would restart the animation mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!visibleToast) return null;

  const screenWidth = Dimensions.get('window').width;
  const width = Math.min(screenWidth - HORIZONTAL_MARGIN * 2, MAX_WIDTH);
  const bottom = insets.bottom + BOTTOM_EXTRA;

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <Animated.View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          {
            width,
            bottom,
            opacity,
            transform: [{ translateY }],
          },
        ]}>
        <Text style={styles.message} numberOfLines={2}>
          {visibleToast.message}
        </Text>
        {visibleToast.action ? (
          <Pressable
            accessibilityRole="button"
            onPress={visibleToast.action.onPress}
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}>
            <Text style={styles.actionLabel}>{visibleToast.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrapper: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#1f2a24',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    message: {
      flex: 1,
      color: '#ffffff',
      fontSize: 14,
      lineHeight: 18,
      marginRight: 12,
    },
    actionButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.primary,
    },
    actionButtonPressed: {
      opacity: 0.7,
    },
    actionLabel: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
    },
  });
}
