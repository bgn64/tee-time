/**
 * Custom integer sheet — opened from the ✕ chip on a
 * `HoleDetailRow` for integer stats when the user needs a value
 * outside the stat's quick-pick range. Generic number picker
 * (min …) with stepper buttons + Done.
 *
 * Mirrors `CustomScoreSheet` (used for score entry) but doesn't
 * carry golf-specific framing (no par, no relative-to-par
 * display). Title/subtitle come from props so any integer stat
 * can reuse the same sheet.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  initialValue: number | null;
  /** Minimum allowed value (inclusive). Defaults to 0. */
  min?: number;
  onCancel: () => void;
  onConfirm: (value: number) => void;
};

export function CustomIntegerSheet({
  visible,
  title,
  subtitle,
  initialValue,
  min = 0,
  onCancel,
  onConfirm,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [draft, setDraft] = useState<number>(initialValue ?? min);
  // Reset the draft each time the sheet (re)opens — same pattern
  // as CustomScoreSheet: render-time state set, no extra paint.
  const [lastResetForVisible, setLastResetForVisible] = useState<boolean>(visible);
  if (visible && !lastResetForVisible) {
    setLastResetForVisible(true);
    setDraft(initialValue ?? min);
  } else if (!visible && lastResetForVisible) {
    setLastResetForVisible(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => setDraft((d) => Math.max(min, d - 1))}
              style={styles.stepBtn}
              hitSlop={6}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <View style={styles.display}>
              <Text style={styles.displayText}>{draft}</Text>
            </View>
            <Pressable
              onPress={() => setDraft((d) => d + 1)}
              style={styles.stepBtn}
              hitSlop={6}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.doneBtn} onPress={() => onConfirm(draft)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
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
      justifyContent: 'center',
      alignItems: 'center',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 18,
      width: '82%',
      maxWidth: 360,
      alignItems: 'center',
      gap: 12,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
    },
    subtitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 4,
    },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepText: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    display: {
      minWidth: 70,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    displayText: {
      fontSize: 26,
      fontWeight: '900',
      color: colors.textTitle,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
      width: '100%',
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
    },
    cancelText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.textBody,
    },
    doneBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    doneText: {
      fontSize: 13.5,
      fontWeight: '800',
      color: '#fff',
    },
  });
}
