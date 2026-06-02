/**
 * CommentsSheet — bottom-sheet modal wrapping the existing
 * `CommentsSection` thread + composer.
 *
 * Uses the `TeePickerSheet`-style modal pattern (RN `Modal`
 * + tap-out scrim + bottom-anchored panel + drag-handle) rather
 * than the browser-native `<dialog>` or Reanimated 4 layout
 * animations so it works identically on iOS, Android, and RN-Web.
 *
 * Visibility is controlled by the parent (`RoundListCard` /
 * `RoundDetailView` open it from the action bar's Comments tap).
 * On dismiss (scrim tap, hardware back, drag-to-close placeholder,
 * or close button), the parent flips `visible` back to false.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

import { CommentsSection } from './CommentsSection';

type Props = {
  visible: boolean;
  roundId: string;
  /** Round owner — passed through to `CommentsSection` for the scorer badge. */
  ownerUserId: string;
  /** Optional count badge in the sheet header. */
  commentCount?: number;
  onClose: () => void;
};

export function CommentsSheet({
  visible,
  roundId,
  ownerUserId,
  commentCount,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Close comments"
        />
        <View style={styles.sheet}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.head}>
            <Text style={styles.title}>Comments</Text>
            {commentCount != null && commentCount > 0 ? (
              <Text style={styles.count}>· {commentCount}</Text>
            ) : null}
            <Pressable
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close comments">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            <CommentsSection roundId={roundId} ownerUserId={ownerUserId} />
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
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.32)',
    },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: '85%',
      paddingBottom: 12,
    },
    handleWrap: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 6,
    },
    handle: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    title: {
      fontSize: 16,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.2,
    },
    count: {
      marginLeft: 6,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    close: {
      marginLeft: 'auto',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    closeText: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700',
    },
    body: {
      flex: 1,
    },
  });
}
