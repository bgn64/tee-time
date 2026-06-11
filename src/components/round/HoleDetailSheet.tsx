/**
 * HoleDetailSheet — per-hole detail viewer presented as a bottom sheet
 * for the feed card. Replaces the old "Holes" tab; opened by tapping a
 * hole-number pill on the scorecard (or the caption link, which defaults
 * to the first playable hole).
 *
 * Per the mockup (`mockups/feed-card-redesign.html`):
 *   - Swipe / drag between holes (PanResponder + Animated track) — a swipe
 *     advances at most one hole; taps on dots/arrows may jump further.
 *   - Web-only hover edge arrows + arrow-key / Escape support.
 *   - Constant height locked to the tallest hole.
 *   - Minimal dots (one per hole) at the bottom, tappable to jump.
 *   - Header shows just "Hole N" (par/hcp live in each scorer's row;
 *     position is conveyed by the dots).
 *
 * Per-hole body reuses the same atoms as the legacy `HolesTabContent`
 * (`ScorerSummaryRow` + `HoleStatsLine` + `ShotSequence`) so the read
 * matches everywhere. Modal pattern mirrors `CommentsSheet`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { HoleStatsLine } from './HoleStatsLine';
import { ScorerSummaryRow } from './ScorerSummaryRow';
import { ShotSequence } from '@/components/scoring/ShotSequence';
import { applicableStatsForHole } from '@/library/golf/builtInStats';
import { holeScoreDisplay } from '@/library/golf/holeScoreDisplay';
import { holesInRange } from '@/library/golf/scoring';
import { getHoleStats } from '@/library/golf/teeGrouping';
import { useRoundHoleDetails } from '@/library/golf/useRoundHoleDetails';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useRoundShotAttributions } from '@/library/golf/useRoundShotAttributions';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import { deviceSupportsHover } from '@/library/utils/hoverCapability';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  visible: boolean;
  /** Hole NUMBER to open at (e.g. 1). Clamped to the playable range. */
  initialHole: number;
  onClose: () => void;
};

const IS_WEB = Platform.OS === 'web';
const SWIPE_DISTANCE = 0.18;
const SWIPE_VELOCITY = 0.3;

export function HoleDetailSheet({ round, visible, initialHole, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scorers = useRoundScorers(round);
  const { getValues } = useRoundHoleDetails(round.id);
  const { getContributors } = useRoundShotAttributions(round.id);

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
    const i = holes.findIndex((h) => h.number === initialHole);
    return i >= 0 ? i : 0;
  }, [holes, initialHole]);

  const [tx] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(startIndex);
  const [hovered, setHovered] = useState(false);
  const [canHover] = useState(deviceSupportsHover);
  const [heights, setHeights] = useState<number[]>(() => holes.map(() => 0));

  const maxHeight = heights.reduce((m, h) => (h > m ? h : m), 0);
  const count = holes.length;

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

  // PanResponder pager: a swipe advances at most one hole (drag clamped to
  // ±1 page), so a fast flick can't skip several holes.
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

  // Reset to the requested hole when the sheet (re)opens (state during
  // render — the React-recommended reset pattern; avoids setState-in-effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setIndex(startIndex);
  }

  // Position the track on open / once width is measured (no animation).
  useEffect(() => {
    if (visible && width > 0) {
      tx.setValue(-startIndex * width);
    }
  }, [visible, width, startIndex, tx]);

  // Web keyboard: ← / → step one hole, Escape closes.
  useEffect(() => {
    if (!IS_WEB || !visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') animateTo(index - 1);
      else if (e.key === 'ArrowRight') animateTo(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose, index, animateTo]);

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

  const currentHole = holes[index];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Close hole detail"
        />
        <View style={styles.sheet}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.head}>
            <Text style={styles.title}>
              {currentHole ? `Hole ${currentHole.number}` : 'Hole'}
            </Text>
            <Pressable
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close hole detail">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

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
                      style={[
                        styles.page,
                        { width, height: maxHeight || undefined },
                      ]}>
                      <View
                        style={styles.pageInner}
                        onLayout={(e) =>
                          setPaneHeight(i, e.nativeEvent.layout.height)
                        }>
                        {scorers.map((s, si) => {
                          const scoreForHole = round.scores.find(
                            (sc) =>
                              sc.scorerId === s.id &&
                              sc.holeNumber === hole.number
                          );
                          const strokes = scoreForHole?.strokes ?? null;
                          const display = holeScoreDisplay(strokes, hole.par);

                          const holeStats = s.tee
                            ? getHoleStats(s.tee, hole.number, hole)
                            : { par: hole.par, handicapIndex: hole.handicapIndex };

                          const tracked = trackedSet.has(s.id);
                          const values = tracked
                            ? getValues(s.id, hole.number)
                            : {};
                          const applicableStats = tracked
                            ? applicableStatsForHole(round.enabledStatKeys, hole)
                            : [];
                          const contributorIds = isScramble
                            ? getContributors(s.id, hole.number)
                            : [];
                          const hasStatsBody = applicableStats.length > 0;
                          const hasShotBody =
                            isScramble && contributorIds.length > 0;
                          const hasBody = hasStatsBody || hasShotBody;

                          return (
                            <View
                              key={s.id}
                              style={si > 0 ? styles.rowSep : styles.row}>
                              <ScorerSummaryRow
                                members={s.members}
                                name={s.name}
                                tee={s.tee ?? null}
                                scoreText={display.scoreText}
                                tone={display.tone}
                                scoreSub={display.scoreSub}
                                holeContext={{
                                  par: holeStats.par,
                                  handicapIndex: holeStats.handicapIndex,
                                  yardage:
                                    'yardage' in holeStats
                                      ? holeStats.yardage
                                      : undefined,
                                }}
                              />
                              {hasBody ? (
                                <View style={styles.body}>
                                  {hasStatsBody ? (
                                    <HoleStatsLine
                                      stats={applicableStats}
                                      values={values}
                                    />
                                  ) : null}
                                  {hasShotBody ? (
                                    <ShotSequence
                                      contributorIds={contributorIds}
                                      members={s.members}
                                    />
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
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
                <View
                  style={[styles.dot, i === index ? styles.dotActive : null]}
                />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.32)',
    },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: '85%',
      paddingBottom: 16,
    },
    handleWrap: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 6,
    },
    handle: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    title: {
      fontSize: 16,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.2,
    },
    close: {
      position: 'absolute',
      right: 12,
      top: -2,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    closeText: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700',
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
    pageInner: {
      paddingHorizontal: 18,
      paddingTop: 6,
      paddingBottom: 4,
    },
    row: {
      paddingTop: 12,
      paddingBottom: 14,
      gap: 10,
    },
    rowSep: {
      paddingTop: 12,
      paddingBottom: 14,
      gap: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    body: {
      gap: 10,
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
      paddingTop: 12,
      paddingHorizontal: 18,
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
