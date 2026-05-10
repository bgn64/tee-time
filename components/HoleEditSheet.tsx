/**
 * Per-hole score edit sheet.
 *
 * Opened by tapping any editable cell on the round-detail scorecard. Has a
 * stroke stepper and a row of quick-pick chips (Eagle / Birdie / Par /
 * Bogey / +2) that snap to the appropriate stroke count given the hole's
 * par. Save fires `editHoleScore` on GolfRoundContext, which performs an
 * optimistic local update and then calls the `update_score` RPC.
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

type Props = {
  visible: boolean;
  holeNumber: number | null;
  par: number;
  initialStrokes: number | null;
  onCancel: () => void;
  onSave: (strokes: number) => void;
};

const QUICK_PICKS: Array<{ label: string; relative: number }> = [
  { label: 'Eagle', relative: -2 },
  { label: 'Birdie', relative: -1 },
  { label: 'Par', relative: 0 },
  { label: 'Bogey', relative: 1 },
  { label: '+2', relative: 2 },
];

function formatRelative(rel: number, strokes: number): string {
  if (strokes === 1) return 'Hole-in-one';
  if (rel === 0) return 'Par · E';
  if (rel < 0) return `${Math.abs(rel)} under`;
  return `+${rel} over`;
}

export function HoleEditSheet({
  visible,
  holeNumber,
  par,
  initialStrokes,
  onCancel,
  onSave,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [strokes, setStrokes] = useState<number>(initialStrokes ?? par);

  useEffect(() => {
    if (visible) {
      setStrokes(initialStrokes ?? par);
    }
  }, [visible, initialStrokes, par]);

  const relative = strokes - par;

  const handleQuick = (rel: number) => {
    setStrokes(Math.max(1, par + rel));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            Hole {holeNumber ?? '—'} · Par {par}
          </Text>
          <Text style={styles.subtitle}>Editing your score on this hole.</Text>

          <View style={styles.quickRow}>
            {QUICK_PICKS.map((q) => {
              const active = strokes === Math.max(1, par + q.relative);
              return (
                <Pressable
                  key={q.label}
                  onPress={() => handleQuick(q.relative)}
                  style={[styles.quickChip, active && styles.quickChipActive]}>
                  <Text style={[styles.quickText, active && styles.quickTextActive]}>
                    {q.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.stepper}>
            <Pressable
              style={styles.stepperBtn}
              onPress={() => setStrokes((s) => Math.max(1, s - 1))}>
              <Text style={styles.stepperBtnText}>−</Text>
            </Pressable>
            <View style={styles.stepperCenter}>
              <Text style={styles.strokes}>{strokes}</Text>
              <Text style={styles.relative}>{formatRelative(relative, strokes)}</Text>
            </View>
            <Pressable style={styles.stepperBtn} onPress={() => setStrokes((s) => s + 1)}>
              <Text style={styles.stepperBtnText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.ghostBtn]} onPress={onCancel}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.primaryBtn]}
              onPress={() => onSave(strokes)}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 28,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 14,
    },
    title: { fontSize: 16, fontWeight: '800', color: colors.textTitle, marginBottom: 4 },
    subtitle: { fontSize: 12, color: colors.textMuted, marginBottom: 14 },
    quickRow: {
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      marginBottom: 6,
      flexWrap: 'wrap',
    },
    quickChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: colors.chipBg,
    },
    quickChipActive: { backgroundColor: colors.primary },
    quickText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
    quickTextActive: { color: '#ffffff' },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginVertical: 18,
    },
    stepperBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    stepperBtnText: { fontSize: 22, fontWeight: '800', color: colors.textTitle },
    stepperCenter: { alignItems: 'center', minWidth: 80 },
    strokes: { fontSize: 36, fontWeight: '800', color: colors.textTitle },
    relative: { fontSize: 11, color: colors.textMuted, marginTop: -2 },
    actions: { flexDirection: 'row', gap: 8 },
    btn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
    ghostBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    ghostBtnText: { color: colors.textMuted, fontWeight: '800', fontSize: 13 },
    primaryBtn: { backgroundColor: colors.primary },
    primaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  });
}
