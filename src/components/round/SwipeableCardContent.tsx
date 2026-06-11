/**
 * SwipeableCardContent — horizontally-swipeable content band for the
 * feed card. Replaces the segmented `TabbedRoundShell` on the feed
 * surface only (the editing/detail surfaces keep the tabbed shell).
 *
 * Behaviour (mockups/feed-card-redesign.html):
 *   - Swipe / drag between panes, driven by `PanResponder` + `Animated`
 *     (not a paging `ScrollView`) so a gesture advances **at most one
 *     pane** — a fast flick can't skip several sections, which felt
 *     disorienting. (A paging ScrollView on RN-Web carries momentum
 *     across multiple snap points.)
 *   - Constant height: the band is locked to the tallest pane so the card
 *     never resizes between panes; shorter panes are vertically centred.
 *   - Minimal dots indicator (one per pane), tappable to jump (a tap may
 *     move more than one — only the swipe is limited to one).
 *   - Desktop-only hover edge arrows (web); hidden on touch; edge-aware.
 *
 * Pure layout: callers pass fully-rendered pane content. The active index
 * is owned here and not persisted across mounts.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

export type SwipePane = {
  /** Stable key + accessibility label for the dot (e.g. "Summary"). */
  key: string;
  label: string;
  content: ReactNode;
};

type Props = {
  panes: SwipePane[];
};

const IS_WEB = Platform.OS === 'web';
// Release thresholds for committing a one-step move.
const SWIPE_DISTANCE = 0.18; // fraction of the pane width
const SWIPE_VELOCITY = 0.3;

export function SwipeableCardContent({ panes }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // The Animated.Value lives in state (not a ref) so we never read a ref
  // during render — satisfies the React Compiler's `react-hooks/refs` rule.
  const [tx] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [heights, setHeights] = useState<number[]>(() => panes.map(() => 0));

  const maxHeight = heights.reduce((m, h) => (h > m ? h : m), 0);
  const count = panes.length;

  const animateTo = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(count - 1, i));
      setIndex(clamped);
      Animated.timing(tx, {
        toValue: -clamped * width,
        duration: 240,
        useNativeDriver: false,
      }).start();
    },
    [count, width, tx]
  );

  // PanResponder pager: a swipe advances at most one pane (the drag is
  // clamped to ±1 page), so a fast flick can't skip several sections.
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim only horizontal-dominant drags so vertical scrolling (the
        // feed) and taps pass through untouched.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 8,
        onPanResponderMove: (_e, g) => {
          if (!width) return;
          const base = -index * width;
          let dx = g.dx;
          if (dx > width) dx = width + (dx - width) * 0.2;
          if (dx < -width) dx = -width + (dx + width) * 0.2;
          let val = base + dx;
          const lower = -(count - 1) * width;
          if (val > 0) val = val * 0.2;
          else if (val < lower) val = lower + (val - lower) * 0.2;
          tx.setValue(val);
        },
        onPanResponderRelease: (_e, g) => {
          if (!width) return;
          let target = index;
          if (g.dx <= -width * SWIPE_DISTANCE || g.vx <= -SWIPE_VELOCITY)
            target += 1;
          else if (g.dx >= width * SWIPE_DISTANCE || g.vx >= SWIPE_VELOCITY)
            target -= 1;
          animateTo(target);
        },
        onPanResponderTerminate: () => animateTo(index),
      }),
    [index, width, count, tx, animateTo]
  );

  function onViewportLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - width) > 0.5) {
      setWidth(w);
      tx.setValue(-index * w);
    }
  }

  function setPaneHeight(i: number, h: number) {
    setHeights((prev) => {
      if (Math.abs((prev[i] ?? 0) - h) < 0.5) return prev;
      const next = prev.slice();
      next[i] = h;
      return next;
    });
  }

  // Web-only hover handlers (no-ops on native) so the edge arrows fade in.
  // Pointer events (not a Pressable wrapper): a Pressable around the pager
  // would claim the touch responder on RN-Web and the PanResponder swipe
  // would never engage.
  const hoverProps = IS_WEB
    ? {
        onPointerEnter: () => setHovered(true),
        onPointerLeave: () => setHovered(false),
      }
    : {};

  return (
    <View style={styles.wrap}>
      <View
        style={styles.viewport}
        onLayout={onViewportLayout}
        {...hoverProps}
        {...pan.panHandlers}>
        <Animated.View
          style={[
            styles.track,
            {
              width: width ? width * count : undefined,
              height: maxHeight || undefined,
              transform: [{ translateX: tx }],
            },
          ]}>
          {width > 0
            ? panes.map((pane, i) => (
                <View
                  key={pane.key}
                  style={[styles.page, { width, height: maxHeight || undefined }]}>
                  <View
                    onLayout={(e) =>
                      setPaneHeight(i, e.nativeEvent.layout.height)
                    }>
                    {pane.content}
                  </View>
                </View>
              ))
            : null}
        </Animated.View>

        {IS_WEB && hovered && index > 0 ? (
          <Pressable
            style={[styles.arrow, styles.arrowPrev]}
            onPress={() => animateTo(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous">
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
        ) : null}
        {IS_WEB && hovered && index < count - 1 ? (
          <Pressable
            style={[styles.arrow, styles.arrowNext]}
            onPress={() => animateTo(index + 1)}
            accessibilityRole="button"
            accessibilityLabel="Next">
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.dots}>
        {panes.map((pane, i) => (
          <Pressable
            key={pane.key}
            onPress={() => animateTo(i)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ selected: i === index }}
            accessibilityLabel={pane.label}>
            <View style={[styles.dot, i === index ? styles.dotActive : null]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      paddingTop: 6,
    },
    viewport: {
      position: 'relative',
      overflow: 'hidden',
    },
    track: {
      flexDirection: 'row',
    },
    page: {
      justifyContent: 'center',
    },
    arrow: {
      position: 'absolute',
      top: '50%',
      transform: [{ translateY: -15 }],
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 3,
      zIndex: 4,
    },
    arrowPrev: { left: 8 },
    arrowNext: { right: 8 },
    arrowText: {
      fontSize: 17,
      fontWeight: '900',
      color: colors.textTitle,
      lineHeight: 20,
    },
    dots: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 11,
      paddingBottom: 3,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    dotActive: {
      width: 18,
      backgroundColor: colors.primaryDark,
    },
  });
}
