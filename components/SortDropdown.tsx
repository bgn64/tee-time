/**
 * Compact anchored dropdown menu for the Rounds-tab Sort pill.
 *
 * Same modal-overlay pattern as RangeDropdown (full-screen Modal with
 * tap-to-dismiss backdrop and the menu floated near the top-left of
 * the content area, anchored by hard-coded margin to the Sort pill in
 * the toolbar). Generic over its options so the caller controls labels.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

export type SortOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  visible: boolean;
  current: T;
  options: ReadonlyArray<SortOption<T>>;
  onCancel: () => void;
  onPick: (next: T) => void;
};

export function SortDropdown<T extends string>({
  visible,
  current,
  options,
  onCancel,
  onPick,
}: Props<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.menuWrap}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            {options.map((opt, i) => {
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

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    menuWrap: {
      // Anchor near the top-right of the screen, where the Sort pill
      // lives in the Rounds toolbar (right side of the pill row, below
      // the search bar). Hard-coded positioning matches the
      // RangeDropdown approach — avoiding measureInWindow keeps the
      // trigger code simple.
      marginTop: 108,
      marginLeft: 'auto',
      marginRight: 20,
    },
    menu: {
      backgroundColor: colors.cardBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 180,
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
      paddingVertical: 11,
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
