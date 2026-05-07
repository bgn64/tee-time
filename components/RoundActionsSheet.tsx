/**
 * Bottom action sheet shown when the user taps the ⋯ overflow on the
 * Scoring screen. Items: View scorecard / Finish round / Abandon round / Cancel.
 *
 * Abandon and early-finish are flagged with a TODO confirmation step in their
 * call sites — the design doc explicitly leaves the confirm UX as TODO.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onViewScorecard: () => void;
  onFinishRound: () => void;
  onAbandonRound: () => void;
};

export function RoundActionsSheet({
  visible,
  onClose,
  onViewScorecard,
  onFinishRound,
  onAbandonRound,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function wrap(action: () => void) {
    return () => {
      onClose();
      // Defer the action by a tick so the sheet's dismiss animation isn't
      // interrupted by a navigation transition starting in the same frame.
      setTimeout(action, 0);
    };
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheetContainer}>
          <View style={styles.itemsCard}>
            <Pressable style={styles.item} onPress={wrap(onViewScorecard)}>
              <Text style={styles.itemText}>📋  View scorecard</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.item} onPress={wrap(onFinishRound)}>
              <Text style={styles.itemText}>🏁  Finish round</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.item} onPress={wrap(onAbandonRound)}>
              <Text style={[styles.itemText, styles.dangerText]}>⚠️  Abandon round</Text>
            </Pressable>
          </View>

          <Pressable style={styles.cancelCard} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
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
    sheetContainer: {
      paddingHorizontal: 12,
      paddingBottom: 28,
    },
    itemsCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      overflow: 'hidden',
    },
    item: {
      paddingVertical: 16,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    itemText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textTitle,
    },
    dangerText: {
      color: '#d32f2f',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
    },
    cancelCard: {
      marginTop: 8,
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
    },
    cancelText: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
    },
  });
}
