/**
 * FrontBackPill — compact dropdown pill embedded inside the
 * `HorizontalScorecard` to switch between "All 18 / Front 9 / Back 9"
 * views of the round.
 *
 * Only mounts when the course has 18+ holes — for 9-hole courses the
 * range is implicitly always "all" and there's nothing to pick.
 *
 * Implementation borrows the `RangeDropdown` modal-overlay pattern
 * (transparent modal + tap-out dismissal) but renders the menu inline
 * relative to the pill via a self-anchored layout rather than the
 * hard-coded screen offset that `RangeDropdown` uses (because the
 * scorecard pill can appear at any vertical position depending on the
 * surrounding content).
 *
 * Local state: the visible pill owns the dropdown's open state; the
 * caller just passes the current range + a setter.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassSurface } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { HoleRange } from '@/types/golf';

type Props = {
  current: HoleRange;
  onChange: (next: HoleRange) => void;
};

type Option = { value: HoleRange; label: string };

const OPTIONS: readonly Option[] = [
  { value: 'all', label: 'All 18' },
  { value: 'front9', label: 'Front 9' },
  { value: 'back9', label: 'Back 9' },
];

function labelFor(range: HoleRange): string {
  return OPTIONS.find((o) => o.value === range)?.label ?? 'All 18';
}

export function FrontBackPill({ current, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  function pick(next: HoleRange) {
    setOpen(false);
    if (next !== current) onChange(next);
  }

  return (
    <>
      <Pressable
        style={styles.pill}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${labelFor(current)}. Tap to switch range.`}>
        <Text style={styles.label}>{labelFor(current)}</Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel="Dismiss range picker">
          <View style={styles.menuWrap}>
            <GlassSurface strong glow style={styles.menu}>
              {OPTIONS.map((opt, i) => {
                const isActive = opt.value === current;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.item,
                      i > 0 ? styles.itemBorderTop : null,
                      isActive ? styles.itemActive : null,
                    ]}
                    onPress={() => pick(opt.value)}>
                    <Text
                      style={[
                        styles.itemLabel,
                        isActive ? styles.itemLabelActive : null,
                      ]}>
                      {opt.label}
                    </Text>
                    {isActive ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </GlassSurface>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    label: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.textTitle,
    },
    caret: {
      fontSize: 10,
      color: colors.textMuted,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.32)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuWrap: {
      width: 200,
    },
    menu: {
      borderRadius: 12,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 8,
    },
    itemBorderTop: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    itemActive: {
      backgroundColor: colors.glowLime,
    },
    itemLabel: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.textTitle,
    },
    itemLabelActive: {
      color: colors.primaryDark,
      fontWeight: '900',
    },
    check: {
      fontSize: 13,
      fontWeight: '900',
      color: colors.primaryDark,
    },
  });
}
