/**
 * Bottom action sheet for per-custom-course actions (Edit / Delete).
 * Opened from the ⋯ button on a custom course card in the picker; mirrors
 * the locked round's RoundActionsSheet pattern so users see one consistent
 * "more actions" surface across the app.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeContext';

type Props = {
  visible: boolean;
  courseName: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function CourseActionsSheet({ visible, courseName, onClose, onEdit, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function wrap(action: () => void) {
    return () => {
      onClose();
      // Defer the action a tick so the dismiss animation isn't clipped by a
      // navigation transition starting in the same frame.
      setTimeout(action, 0);
    };
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheetContainer}>
          <View style={styles.itemsCard}>
            {courseName ? (
              <>
                <Text style={styles.contextTitle} numberOfLines={1}>
                  {courseName}
                </Text>
                <View style={styles.divider} />
              </>
            ) : null}
            <Pressable style={styles.item} onPress={wrap(onEdit)}>
              <Text style={styles.itemText}>✎  Edit course</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.item} onPress={wrap(onDelete)}>
              <Text style={[styles.itemText, styles.dangerText]}>🗑  Delete course</Text>
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
    contextTitle: {
      paddingTop: 12,
      paddingBottom: 8,
      paddingHorizontal: 20,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.4,
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
