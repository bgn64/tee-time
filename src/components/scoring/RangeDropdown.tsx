/**
 * Compact dropdown menu for the hole-range pill on the scoring screen.
 *
 * Renders a small floating menu anchored visually to a pill at the
 * top of the screen (implementation: full-screen Modal with a tap-to-
 * dismiss backdrop and the menu positioned near the top-left content
 * area). Three options — All 18 / Front 9 / Back 9 — with a checkmark
 * on the current value.
 *
 * Hidden when the course has fewer than 18 holes (range only matters
 * when the course has both halves).
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { HoleRange } from '@/types/golf';

type Props = {
  visible: boolean;
  current: HoleRange;
  onCancel: () => void;
  onPick: (next: HoleRange) => void;
};

const OPTIONS: { value: HoleRange; label: string }[] = [
  { value: 'all', label: '18 holes' },
  { value: 'front9', label: 'Front 9' },
  { value: 'back9', label: 'Back 9' },
];

export function RangeDropdown({ visible, current, onCancel, onPick }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.menuWrap}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            {OPTIONS.map((opt, i) => {
              const isActive = current === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.item,
                    i > 0 && styles.itemBorderTop,
                    isActive && styles.itemActive,
                  ]}
                  onPress={() => onPick(opt.value)}>
                  <Text style={[styles.label, isActive && styles.labelActive]}>
                    {opt.label}
                  </Text>
                  {isActive ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export function rangeLabel(range: HoleRange): string {
  if (range === 'front9') return 'Front 9';
  if (range === 'back9') return 'Back 9';
  return 'Playing 18';
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    menuWrap: {
      // Anchor near the top of the screen, slightly indented from the
      // left so the menu visually hangs from the range pill (which
      // lives in the second row of the title block). Hard-coded
      // positioning is intentional: avoiding a measureInWindow callback
      // keeps the trigger logic simple.
      marginTop: 110,
      marginLeft: 76,
    },
    menu: {
      backgroundColor: colors.cardBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 150,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    itemBorderTop: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    itemActive: {
      backgroundColor: 'rgba(124,179,66,0.10)',
    },
    label: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textTitle,
    },
    labelActive: {
      color: colors.primaryDark,
      fontWeight: '800',
    },
    check: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.primaryDark,
    },
  });
}
