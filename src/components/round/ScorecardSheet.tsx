/**
 * ScorecardSheet — quick full-scorecard viewer presented as a bottom
 * sheet for the editing screens. Opened by the footer's "Scorecard"
 * button.
 *
 * Per the mockup (`mockups/scoring-screen-redesign.html`): the Front 9
 * is stacked over the Back 9 (no swiping) and the body scrolls if it
 * overflows. Reuses `HorizontalScorecard layout="single"` (fit-to-width,
 * no horizontal scroll) so the grid matches the feed card's scorecard.
 *
 * Read-only — hole navigation on the editing surface is handled by the
 * per-hole pager's dots; this sheet is just an at-a-glance overview.
 * Modal pattern mirrors `HoleDetailSheet` / `CommentsSheet`.
 */

import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { HorizontalScorecard } from '@/components/scoring/HorizontalScorecard';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  visible: boolean;
  onClose: () => void;
};

export function ScorecardSheet({ round, visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Split into Front 9 over Back 9 only when the round spans both nines;
  // otherwise a single grid for the active range (mirrors RoundListCard).
  const hasBackNine = round.course.holes.some((h) => h.number > 9);
  const splitNines = round.holeRange === 'all' && hasBackNine;

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
          accessibilityLabel="Close scorecard"
        />
        <View style={styles.sheet}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.head}>
            <Text style={styles.title}>Scorecard</Text>
            <Pressable
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close scorecard">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}>
            {splitNines ? (
              <>
                <HorizontalScorecard round={round} layout="single" range="front9" />
                <View style={styles.gap} />
                <HorizontalScorecard round={round} layout="single" range="back9" />
              </>
            ) : (
              <HorizontalScorecard
                round={round}
                layout="single"
                range={round.holeRange}
              />
            )}
          </ScrollView>
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
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '88%',
      paddingBottom: 16,
    },
    handleWrap: {
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 4,
    },
    handle: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    head: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    title: {
      fontSize: 16,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.2,
    },
    close: {
      position: 'absolute',
      right: 12,
      top: -2,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    closeText: {
      fontSize: 16,
      color: colors.textMuted,
      fontWeight: '700',
    },
    body: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 18,
    },
    gap: {
      height: 14,
    },
  });
}
