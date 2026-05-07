/**
 * Bottom sheet for editing a single hole's par and (optional) yardage.
 *
 * Used by the course form (new-course.tsx) when the user long-presses a par
 * cell. The sheet is fully self-contained: it snapshots `initialPar` /
 * `initialYardage` on open, and Save / Cancel commit or discard accordingly.
 *
 * Yardage is parsed leniently: blank or non-numeric → null (unset).
 */

import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

const PAR_OPTIONS = [3, 4, 5];

type Props = {
  visible: boolean;
  holeNumber: number | null;
  initialPar: number;
  initialYardage: number | null;
  onCancel: () => void;
  onSave: (par: number, yardage: number | null) => void;
};

export function HoleDetailSheet({
  visible,
  holeNumber,
  initialPar,
  initialYardage,
  onCancel,
  onSave,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [par, setPar] = useState<number>(initialPar);
  const [yardageText, setYardageText] = useState<string>('');

  // Re-snapshot whenever the sheet opens for a (potentially different) hole.
  useEffect(() => {
    if (visible) {
      setPar(initialPar);
      setYardageText(initialYardage !== null ? String(initialYardage) : '');
    }
  }, [visible, initialPar, initialYardage]);

  function handleSave() {
    Keyboard.dismiss();
    const trimmed = yardageText.trim();
    let yardage: number | null = null;
    if (trimmed.length > 0) {
      const parsed = parseInt(trimmed, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        yardage = parsed;
      }
    }
    onSave(par, yardage);
  }

  function handleCancel() {
    Keyboard.dismiss();
    onCancel();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleCancel} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Hole {holeNumber ?? ''}</Text>

          <Text style={styles.label}>Par</Text>
          <View style={styles.parRow}>
            {PAR_OPTIONS.map((p) => {
              const isActive = p === par;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPar(p)}
                  style={[styles.parChip, isActive && styles.parChipActive]}>
                  <Text style={[styles.parChipText, isActive && styles.parChipTextActive]}>
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.yardageHeader}>
            <Text style={styles.label}>Yardage</Text>
            <Text style={styles.optionalChip}>OPTIONAL</Text>
          </View>
          <View style={styles.yardageRow}>
            <TextInput
              style={styles.yardageInput}
              value={yardageText}
              onChangeText={setYardageText}
              placeholder="e.g. 380"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
            <Text style={styles.yardsSuffix}>yds</Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save</Text>
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
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 34,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textTitle,
      marginBottom: 18,
    },
    label: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    parRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    parChip: {
      flex: 1,
      backgroundColor: colors.chipBg,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    parChipActive: {
      backgroundColor: colors.cardBg,
      borderColor: colors.primary,
    },
    parChipText: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textMuted,
    },
    parChipTextActive: {
      color: colors.textTitle,
    },
    yardageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    optionalChip: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.accent,
      backgroundColor: colors.accent + '22',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      letterSpacing: 0.5,
      overflow: 'hidden',
    },
    yardageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 4,
      gap: 8,
      marginBottom: 22,
    },
    yardageInput: {
      flex: 1,
      color: colors.textBody,
      fontSize: 16,
      paddingVertical: 10,
    },
    yardsSuffix: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1.5,
      paddingVertical: 14,
    },
    cancelBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textMuted,
    },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
    },
    saveBtnText: {
      fontSize: 15,
      fontWeight: '800',
      color: '#ffffff',
    },
  });
}
