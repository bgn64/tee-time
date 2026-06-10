/**
 * SwipeableCardContent — horizontally-swipeable content band for the
 * feed card. Replaces the segmented `TabbedRoundShell` on the feed
 * surface only (the editing/detail surfaces keep the tabbed shell).
 *
 * Behaviour mirrors the mockup (`mockups/feed-card-redesign.html`):
 *   - Swipe / drag between panes (native paging via a horizontal
 *     `ScrollView` with `pagingEnabled` — follow-finger + snap on
 *     iOS/Android, and works on RN-Web).
 *   - Constant height: the band is locked to the tallest pane so the
 *     card never resizes between panes; shorter panes are vertically
 *     centred.
 *   - Minimal dots indicator (one per pane), tappable to jump.
 *   - Desktop-only hover edge arrows (web `pointer: fine`); hidden on
 *     touch. Edge-aware — no prev arrow on the first pane, no next on
 *     the last.
 *
 * Pure layout: callers pass fully-rendered pane content. The active
 * index is owned here and not persisted across mounts.
 */

import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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

export function SwipeableCardContent({ panes }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [heights, setHeights] = useState<number[]>(() => panes.map(() => 0));

  const maxHeight = heights.reduce((m, h) => (h > m ? h : m), 0);
  const count = panes.length;

  function onViewportLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - width) > 0.5) {
      setWidth(w);
      // Keep the current page aligned after a width change (resize /
      // orientation) without animating.
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ x: index * w, animated: false })
      );
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

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(count - 1, i));
    setIndex(clamped);
    if (width) scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(Math.max(0, Math.min(count - 1, i)));
  }

  // Web's paging ScrollView doesn't reliably emit onMomentumScrollEnd, so we
  // also derive the active page from onScroll (rounded to the nearest page)
  // — otherwise the dots never update on web.
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(Math.max(0, Math.min(count - 1, i)));
  }

  // On web we wrap in a Pressable purely to get hover in/out events so
  // the edge arrows can fade in. On native it's a plain View (no hover,
  // no arrows) so nothing interferes with the scroll gesture.
  const hoverProps = IS_WEB
    ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
    : {};

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.viewport}
        onLayout={onViewportLayout}
        {...hoverProps}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumEnd}
          style={maxHeight ? { height: maxHeight } : undefined}>
          {width > 0
            ? panes.map((pane, i) => (
                <View
                  key={pane.key}
                  style={[
                    styles.page,
                    { width, height: maxHeight || undefined },
                  ]}>
                  <View
                    onLayout={(e) =>
                      setPaneHeight(i, e.nativeEvent.layout.height)
                    }>
                    {pane.content}
                  </View>
                </View>
              ))
            : null}
        </ScrollView>

        {IS_WEB && hovered && index > 0 ? (
          <Pressable
            style={[styles.arrow, styles.arrowPrev]}
            onPress={() => goTo(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous">
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
        ) : null}
        {IS_WEB && hovered && index < count - 1 ? (
          <Pressable
            style={[styles.arrow, styles.arrowNext]}
            onPress={() => goTo(index + 1)}
            accessibilityRole="button"
            accessibilityLabel="Next">
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        ) : null}
      </Pressable>

      <View style={styles.dots}>
        {panes.map((pane, i) => (
          <Pressable
            key={pane.key}
            onPress={() => goTo(i)}
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
      // Faint divider between the header and the content band, mirroring
      // the action bar's top border below.
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      paddingTop: 6,
    },
    viewport: {
      position: 'relative',
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
