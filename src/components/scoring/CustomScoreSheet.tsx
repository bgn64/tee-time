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

import { GlassCard, NeonButton, NumericText, Stepper } from '@/components/aurora';
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
        <GlassCard strong glow style={styles.sheet}>
          <Text style={styles.title}>Custom score</Text>
          <Text style={styles.subtitle}>
            {scorerName}  ·  Hole {holeNumber}  ·  Par {par}
          </Text>

          <View style={styles.stepperRow}>
            <View
              style={[
                styles.display,
                tone === 'over' && styles.displayOver,
                tone === 'under' && styles.displayUnder,
              ]}>
              <Text style={styles.displayLabel}>TO PAR</Text>
              <NumericText style={styles.displayText}>{formatScore(rel)}</NumericText>
            </View>
            <Stepper
              value={draft}
              min={1}
              onDecrement={() => setDraft((d) => Math.max(1, d - 1))}
              onIncrement={() => setDraft((d) => d + 1)}
            />
          </View>

          <NumericText style={styles.strokes}>
            {draft} {draft === 1 ? 'stroke' : 'strokes'}
          </NumericText>

          <View style={styles.actions}>
            <NeonButton label="Cancel" variant="ghost" onPress={onCancel} style={styles.actionBtn} />
            <NeonButton label="Done" onPress={() => onConfirm(draft)} style={styles.actionBtn} />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      width: 320,
      maxWidth: '92%',
      alignItems: 'center',
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
      width: '100%',
      alignItems: 'center',
      gap: 14,
    },
    display: {
      width: '100%',
      height: 88,
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: colors.glowLime,
      borderWidth: 1,
      borderColor: colors.lime,
      alignItems: 'center',
      justifyContent: 'center',
    },
    displayOver: {
      backgroundColor: colors.glassFill2,
      borderColor: colors.accent,
    },
    displayUnder: {
      backgroundColor: colors.glowCyan,
      borderColor: colors.cyan,
    },
    displayLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
    displayText: {
      color: colors.lime,
      fontSize: 34,
      fontWeight: '900',
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
    actionBtn: {
      flex: 1,
    },
  });
}
