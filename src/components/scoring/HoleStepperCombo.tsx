/**
 * HoleStepperCombo — `‹ Hole N ▾ ›` integrated stepper-combo per
 * the mockup. Replaces the chevron-based `HoleNavBar` pinned at the
 * top of the scoring screen with an in-tab control that owns three
 * touch targets:
 *
 *   - Left `‹`   step to previous hole (disabled at range start)
 *   - Centre tap open the `HoleJumpSheet` for direct jump
 *   - Right `›`  step to next hole (disabled at range end)
 *
 * Web-first per the design contract — click only, no swipe, no
 * auto-advance, no chevron buttons (those are the step buttons).
 * Edge holes disable the corresponding step button rather than
 * wrapping; users must explicitly tap the centre to jump out of the
 * range bounds.
 *
 * The popover grid (`HoleJumpSheet`) is opened locally; the parent
 * only sees `onPickHole(holeNumber)` when the user commits a value.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HoleJumpSheet } from './HoleJumpSheet';
import { NumericText } from '@/components/aurora';
import { holesInRange } from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Hole, HoleRange } from '@/types/golf';

type Props = {
  /** Current focused hole number. */
  current: number;
  /** Active hole range; clamps step bounds and shapes the jump grid. */
  range: HoleRange;
  /** Every hole on the course. Filtered through `range` internally. */
  allHoles: readonly Hole[];
  /**
   * Per-hole stroke for the active scorer. Used by the jump sheet
   * grid cells to render `<ScoreMark>` for already-scored holes.
   * Optional; missing entries render unscored placeholders.
   */
  strokesByHole?: ReadonlyMap<number, number>;
  /** Called with the new hole number on step + sheet pick. */
  onPickHole: (holeNumber: number) => void;
};

export function HoleStepperCombo({
  current,
  range,
  allHoles,
  strokesByHole,
  onPickHole,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const visibleHoles = useMemo(
    () => holesInRange([...allHoles], range),
    [allHoles, range]
  );

  const firstHole = visibleHoles[0]?.number ?? 1;
  const lastHole = visibleHoles[visibleHoles.length - 1]?.number ?? 18;
  const atStart = current <= firstHole;
  const atEnd = current >= lastHole;

  function stepBack(): void {
    if (atStart) return;
    // Find the previous hole in the in-range list (handles gappy
    // ranges if we ever introduce them).
    const idx = visibleHoles.findIndex((h) => h.number === current);
    const prev = idx > 0 ? visibleHoles[idx - 1] : visibleHoles[0];
    if (prev) onPickHole(prev.number);
  }

  function stepForward(): void {
    if (atEnd) return;
    const idx = visibleHoles.findIndex((h) => h.number === current);
    const next =
      idx >= 0 && idx < visibleHoles.length - 1
        ? visibleHoles[idx + 1]
        : visibleHoles[visibleHoles.length - 1];
    if (next) onPickHole(next.number);
  }

  return (
    <>
      <View style={styles.combo}>
        <Pressable
          style={[styles.step, atStart ? styles.stepDim : null]}
          onPress={stepBack}
          disabled={atStart}
          accessibilityRole="button"
          accessibilityLabel="Previous hole">
          <Text style={[styles.stepText, atStart ? styles.stepTextDim : null]}>
            ‹
          </Text>
        </Pressable>
        <Pressable
          style={styles.core}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Hole ${current}. Tap to jump to a different hole.`}>
          <NumericText style={styles.coreText}>Hole {current}</NumericText>
          <Text style={styles.caret}>▾</Text>
        </Pressable>
        <Pressable
          style={[styles.step, atEnd ? styles.stepDim : null]}
          onPress={stepForward}
          disabled={atEnd}
          accessibilityRole="button"
          accessibilityLabel="Next hole">
          <Text style={[styles.stepText, atEnd ? styles.stepTextDim : null]}>
            ›
          </Text>
        </Pressable>
      </View>

      <HoleJumpSheet
        visible={sheetOpen}
        visibleHoles={visibleHoles}
        currentHoleNumber={current}
        strokesByHole={strokesByHole}
        onClose={() => setSheetOpen(false)}
        onPick={(n) => {
          setSheetOpen(false);
          onPickHole(n);
        }}
      />
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    combo: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: colors.night,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      overflow: 'hidden',
      shadowColor: colors.cyan,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
    },
    step: {
      width: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDim: {
      opacity: 0.4,
    },
    stepText: {
      fontSize: 17,
      fontWeight: '900',
      color: colors.lime,
    },
    stepTextDim: {
      color: colors.textMuted,
    },
    core: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    coreText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textTitle,
    },
    caret: {
      fontSize: 10,
      color: colors.textMuted,
    },
  });
}
