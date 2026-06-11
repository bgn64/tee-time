/**
 * SwipeableHoleEditor — the per-hole editing pager for the scoring /
 * edit screens. Each pane is a `HoleEditPane` (score chips + stat
 * inputs per scorer); swiping moves between holes.
 *
 * Mirrors the shipped feed pagers (`SwipeableCardContent` /
 * `HoleDetailSheet`):
 *   - One-step swipe: a `PanResponder` + `Animated` track clamps the
 *     drag to ±1 page so a flick can't skip several holes.
 *   - Minimal dots (one per hole, tappable), web-only hover edge arrows,
 *     and ← / → keyboard support on web.
 *   - Lint-clean refs pattern (Animated.Value in state, PanResponder in
 *     useMemo, animate in useCallback; `panHandlers` on a plain View —
 *     a Pressable wrapper would steal the touch responder on RN-Web).
 *
 * Like the feed pagers, the band locks to the tallest hole pane so the
 * height stays constant as you swipe and the card hugs its content
 * instead of stretching to fill the screen; shorter holes are centred.
 * A tall hole (many stats / scramble) is handled by the parent
 * ScrollView, which scrolls the whole surface.
 *
 * Data hooks are called ONCE here and the resolved values handed down to
 * each `HoleEditPane`. The active index is reported up via
 * `onChangeCurrentHole` so the round's stored current hole stays in sync.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { HoleEditPane } from './HoleEditPane';
import { holesInRange } from '@/library/golf/scoring';
import { useRoundHoleDetails } from '@/library/golf/useRoundHoleDetails';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useRoundShotAttributions } from '@/library/golf/useRoundShotAttributions';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import { deviceSupportsHover } from '@/library/utils/hoverCapability';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  currentHoleNumber: number;
  onChangeCurrentHole: (n: number) => void;
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
  onPressTeeForScorer?: (scorerId: string) => void;
};

const IS_WEB = Platform.OS === 'web';
const SWIPE_DISTANCE = 0.18;
const SWIPE_VELOCITY = 0.3;

export function SwipeableHoleEditor({
  round,
  currentHoleNumber,
  onChangeCurrentHole,
  onChangeScore,
  onPressTeeForScorer,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scorers = useRoundScorers(round);
  const { getValues, setValue, seedDefaults } = useRoundHoleDetails(round.id);
  const { getContributors, setContributors } = useRoundShotAttributions(
    round.id
  );

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  const trackedSet = useMemo(
    () => new Set(round.trackedScorerIds),
    [round.trackedScorerIds]
  );

  const holes = useMemo(
    () => holesInRange(round.course.holes, round.holeRange),
    [round.course.holes, round.holeRange]
  );

  const startIndex = useMemo(() => {
    const i = holes.findIndex((h) => h.number === currentHoleNumber);
    return i >= 0 ? i : 0;
    // Only seeds the initial index; the pager owns the index after mount
    // (it reports changes up via onChangeCurrentHole), so we deliberately
    // don't re-sync from currentHoleNumber on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holes]);

  const [tx] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(startIndex);
  const [hovered, setHovered] = useState(false);
  const [canHover] = useState(deviceSupportsHover);
  const [heights, setHeights] = useState<number[]>(() => holes.map(() => 0));

  const count = holes.length;
  const maxHeight = heights.reduce((m, h) => (h > m ? h : m), 0);

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

  // Report index changes up to the round's current-hole state. Kept in
  // an effect (not inside animateTo) so the pan handlers stay stable and
  // we don't fire a redundant write on mount. Latest callback/holes are
  // read through refs so this effect depends only on `index`.
  const onChangeRef = useRef(onChangeCurrentHole);
  useEffect(() => {
    onChangeRef.current = onChangeCurrentHole;
  });
  const holesRef = useRef(holes);
  useEffect(() => {
    holesRef.current = holes;
  });
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const n = holesRef.current[index]?.number;
    if (n != null) onChangeRef.current(n);
  }, [index]);

  const pan = useMemo(
    () =>
      PanResponder.create({
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

  // Web keyboard: ← / → step one hole.
  useEffect(() => {
    if (!IS_WEB) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') animateTo(index - 1);
      else if (e.key === 'ArrowRight') animateTo(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, animateTo]);

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

  const hoverProps = canHover
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
            ? holes.map((hole, i) => (
                <View
                  key={hole.number}
                  style={[styles.page, { width, height: maxHeight || undefined }]}>
                  <View
                    onLayout={(e) =>
                      setPaneHeight(i, e.nativeEvent.layout.height)
                    }>
                    <HoleEditPane
                      round={round}
                      hole={hole}
                      scorers={scorers}
                      trackedSet={trackedSet}
                      isScramble={isScramble}
                      getValues={getValues}
                      getContributors={getContributors}
                      onChangeScore={onChangeScore}
                      onChangeStat={(scorerId, holeNumber, statKey, value) =>
                        void setValue(scorerId, holeNumber, statKey, value)
                      }
                      onChangeContributors={(scorerId, holeNumber, next) =>
                        void setContributors(scorerId, holeNumber, next)
                      }
                      seedDefaults={(scorerId, holeNumber, integerStats) =>
                        void seedDefaults(scorerId, holeNumber, integerStats)
                      }
                      onPressTeeForScorer={onPressTeeForScorer}
                    />
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
            accessibilityLabel="Previous hole">
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
        ) : null}
        {IS_WEB && hovered && index < count - 1 ? (
          <Pressable
            style={[styles.arrow, styles.arrowNext]}
            onPress={() => animateTo(index + 1)}
            accessibilityRole="button"
            accessibilityLabel="Next hole">
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.dots}>
        {holes.map((hole, i) => (
          <Pressable
            key={hole.number}
            onPress={() => animateTo(i)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: i === index }}
            accessibilityLabel={`Hole ${hole.number}`}>
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
      flexWrap: 'wrap',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 9,
      paddingBottom: 3,
      paddingHorizontal: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
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
