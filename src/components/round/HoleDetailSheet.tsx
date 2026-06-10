/**
 * HoleDetailSheet — per-hole detail viewer presented as a bottom sheet
 * for the feed card. Replaces the old "Holes" tab; opened by tapping a
 * hole-number pill on the scorecard (or the caption link, which defaults
 * to the first playable hole).
 *
 * Per the mockup (`mockups/feed-card-redesign.html`) the sheet hosts a
 * horizontal hole pager that mirrors the card's content pager:
 *   - Swipe / drag between holes (paging `ScrollView` — follow-finger +
 *     snap on native, works on RN-Web).
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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
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
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  visible: boolean;
  /** Hole NUMBER to open at (e.g. 1). Clamped to the playable range. */
  initialHole: number;
  onClose: () => void;
};

const IS_WEB = Platform.OS === 'web';

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

  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(startIndex);
  const [hovered, setHovered] = useState(false);
  const [heights, setHeights] = useState<number[]>(() => holes.map(() => 0));

  const maxHeight = heights.reduce((m, h) => (h > m ? h : m), 0);
  const count = holes.length;

  // Reset to the requested hole when the sheet (re)opens. Adjusting
  // state during render — not in an effect — is the React-recommended
  // way to reset state in response to a prop change, and sidesteps the
  // cascading-render lint on setState-in-effect.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setIndex(startIndex);
  }

  // Snap to the requested hole once width is known (no animation). Only
  // depends on visibility + width so user-driven index changes don't
  // re-trigger it.
  useEffect(() => {
    if (visible && width > 0) {
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ x: startIndex * width, animated: false })
      );
    }
  }, [visible, width, startIndex]);

  // Web keyboard: ← / → step holes, Escape closes.
  useEffect(() => {
    if (!IS_WEB || !visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') {
        setIndex((i) => stepTo(i - 1, count, width, scrollRef));
      } else if (e.key === 'ArrowRight') {
        setIndex((i) => stepTo(i + 1, count, width, scrollRef));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, count, width, onClose]);

  function onViewportLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - width) > 0.5) setWidth(w);
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
  // also derive the active hole from onScroll so the header + dots update.
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(Math.max(0, Math.min(count - 1, i)));
  }

  const hoverProps = IS_WEB
    ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
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
            </ScrollView>

            {IS_WEB && hovered && index > 0 ? (
              <Pressable
                style={[styles.arrow, styles.arrowPrev]}
                onPress={() => goTo(index - 1)}
                accessibilityRole="button"
                accessibilityLabel="Previous hole">
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
            ) : null}
            {IS_WEB && hovered && index < count - 1 ? (
              <Pressable
                style={[styles.arrow, styles.arrowNext]}
                onPress={() => goTo(index + 1)}
                accessibilityRole="button"
                accessibilityLabel="Next hole">
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
            ) : null}
          </Pressable>

          <View style={styles.dots}>
            {holes.map((hole, i) => (
              <Pressable
                key={hole.number}
                onPress={() => goTo(i)}
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

function stepTo(
  next: number,
  count: number,
  width: number,
  ref: React.RefObject<ScrollView | null>
): number {
  const clamped = Math.max(0, Math.min(count - 1, next));
  if (width) ref.current?.scrollTo({ x: clamped * width, animated: true });
  return clamped;
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
