/**
 * Centered confirmation modal shown before discarding an in-progress round.
 * Triggered from the ⋯ overflow → "Abandon round" item.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmAbandonSheet({ visible, onCancel, onConfirm }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>Discard this round?</Text>
          <Text style={styles.body}>Scores will be lost. This can't be undone.</Text>
          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.confirmButton]} onPress={onConfirm}>
              <Text style={styles.confirmText}>Discard round</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 20,
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.textTitle,
      textAlign: 'center',
    },
    body: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 18,
    },
    button: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.chipBg,
    },
    cancelText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textTitle,
    },
    confirmButton: {
      backgroundColor: '#d32f2f',
    },
    confirmText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#ffffff',
    },
  });
}
