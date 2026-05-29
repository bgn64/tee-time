/**
 * Custom-score sheet — opened from the ✕ chip on ScorerRow when
 * the user needs a value outside the −2…+2 quick-pick range. Shows a
 * large relative-to-par display with − / + steppers, the implied raw
 * stroke count, and a Done button to commit.
 *
 * Opens with `initialStrokes` (or par+3 when null) so the user can
 * adjust directly. Cancel discards.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatScore } from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';

type Props = {
  visible: boolean;
  scorerName: string;
  holeNumber: number;
  par: number;
  initialStrokes: number | null;
  onCancel: () => void;
  onConfirm: (strokes: number) => void;
};

export function CustomScoreSheet({
  visible,
  scorerName,
  holeNumber,
  par,
  initialStrokes,
  onCancel,
  onConfirm,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [draft, setDraft] = useState<number>(initialStrokes ?? par + 3);
  // Reset the draft each time the sheet (re)opens — implemented as a
  // render-time state set rather than an effect so the value is fresh
  // on the first render after `visible` flips, with no extra paint.
  const [lastResetForVisible, setLastResetForVisible] = useState<boolean>(visible);
  if (visible && !lastResetForVisible) {
    setLastResetForVisible(true);
    setDraft(initialStrokes ?? par + 3);
  } else if (!visible && lastResetForVisible) {
    setLastResetForVisible(false);
  }

  const rel = draft - par;
  const tone: 'over' | 'under' | 'even' = rel > 0 ? 'over' : rel < 0 ? 'under' : 'even';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Custom score</Text>
          <Text style={styles.subtitle}>
            {scorerName}  ·  Hole {holeNumber}  ·  Par {par}
          </Text>

          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => setDraft((d) => Math.max(1, d - 1))}
              style={styles.stepBtn}
              hitSlop={6}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <View
              style={[
                styles.display,
                tone === 'over' && styles.displayOver,
                tone === 'under' && styles.displayUnder,
              ]}>
              <Text style={styles.displayText}>{formatScore(rel)}</Text>
            </View>
            <Pressable
              onPress={() => setDraft((d) => d + 1)}
              style={styles.stepBtn}
              hitSlop={6}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>

          <Text style={styles.strokes}>
            {draft} {draft === 1 ? 'stroke' : 'strokes'}
          </Text>

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

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      width: 280,
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 18,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    title: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textTitle,
      letterSpacing: 0.3,
    },
    subtitle: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 3,
      marginBottom: 18,
      letterSpacing: 0.3,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    stepBtn: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepText: {
      fontSize: 26,
      lineHeight: 28,
      fontWeight: '800',
      color: colors.primaryDark,
    },
    display: {
      minWidth: 96,
      height: 56,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    displayOver: { backgroundColor: colors.accent },
    displayUnder: { backgroundColor: colors.primaryDark },
    displayText: {
      color: '#fff',
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    strokes: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.3,
      marginTop: 10,
      marginBottom: 18,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      width: '100%',
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 11,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
    },
    doneBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 11,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    doneText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#fff',
    },
  });
}
