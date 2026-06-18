/**
 * Centered confirmation modal shown before discarding an in-progress
 * round. Triggered from the Abandon-round affordance on the scoring
 * screen. On web platforms the calling screen typically falls back to
 * `confirmAsync` instead — this sheet is reserved for native iOS/Android.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard, NeonButton } from '@/components/aurora';
import { useTheme } from '@/library/theme/ThemeContext';

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
        <GlassCard strong glow style={styles.card}>
          <Text style={styles.title}>Discard this round?</Text>
          <Text style={styles.body}>Scores will be lost. This can&apos;t be undone.</Text>
          <View style={styles.buttonRow}>
            <NeonButton label="Cancel" variant="ghost" onPress={onCancel} style={styles.button} />
            <NeonButton label="Discard" onPress={onConfirm} style={styles.button} />
          </View>
        </GlassCard>
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
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    card: {
      width: '100%',
      maxWidth: 360,
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
    },
  });
}
