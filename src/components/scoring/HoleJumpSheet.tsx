/**
 * HoleJumpSheet — bottom-sheet modal that lets the user jump to any
 * in-range hole. Mounts as a 3-column grid of small cells (one per
 * hole in range). Each cell shows the hole number on top and the
 * active scorer's stroke (rendered through `<ScoreMark>` so the
 * USGA outline matches the scorecard).
 *
 * Per the design decision (Q8 in plan.md): bottom sheet on ALL
 * platforms — not a popover/anchor variant on web. One primitive
 * for everyone, matching the conventions used by `TeePickerSheet`,
 * `RangeDropdown`, and `ConfirmAbandonSheet`.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassSurface, NumericText } from '@/components/aurora';
import { ScoreMark } from './ScoreMark';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Hole } from '@/types/golf';

type Props = {
  visible: boolean;
  visibleHoles: readonly Hole[];
  currentHoleNumber: number;
  strokesByHole?: ReadonlyMap<number, number>;
  onClose: () => void;
  onPick: (holeNumber: number) => void;
};

export function HoleJumpSheet({
  visible,
  visibleHoles,
  currentHoleNumber,
  strokesByHole,
  onClose,
  onPick,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
          accessibilityLabel="Dismiss hole picker"
        />
        <GlassSurface strong glow style={styles.sheet}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.head}>
            <Text style={styles.title}>Jump to hole</Text>
            <Pressable
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close hole picker">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {visibleHoles.map((hole) => {
              const isCurrent = hole.number === currentHoleNumber;
              const strokes = strokesByHole?.get(hole.number) ?? null;
              return (
                <Pressable
                  key={hole.number}
                  style={[styles.cell, isCurrent ? styles.cellCurrent : null]}
                  onPress={() => onPick(hole.number)}
                  accessibilityRole="button"
                  accessibilityLabel={`Jump to hole ${hole.number}`}>
                  <NumericText
                    style={[
                      styles.cellHole,
                      isCurrent ? styles.cellHoleCurrent : null,
                    ]}>
                    Hole {hole.number}
                  </NumericText>
                  <View style={styles.cellScoreWrap}>
                    <ScoreMark
                      strokes={strokes}
                      par={hole.par}
                      size="md"
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </GlassSurface>
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
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      paddingBottom: 24,
      maxHeight: '85%',
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
      paddingHorizontal: 18,
      paddingBottom: 12,
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
      marginLeft: 'auto',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    closeText: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 14,
      paddingTop: 12,
      gap: 8,
    },
    cell: {
      // 3 columns: each cell is roughly (parent - 14*2 padding - 8*2 gap) / 3
      // ≈ (390-28-16)/3 ≈ 115px on the standard phone wrapper. Using
      // flexBasis with `% - gap` math is brittle in RN; we just hard-set
      // a min-width and let flex-wrap handle the layout.
      flexBasis: '31%',
      minWidth: 100,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      gap: 6,
    },
    cellCurrent: {
      backgroundColor: colors.glowLime,
      borderColor: colors.lime,
    },
    cellHole: {
      fontSize: 11,
      fontWeight: '900',
      color: colors.textMuted,
      letterSpacing: 0.4,
    },
    cellHoleCurrent: {
      color: colors.lime,
    },
    cellScoreWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
