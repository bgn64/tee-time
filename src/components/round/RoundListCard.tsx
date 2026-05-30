/**
 * RoundListCard — the at-a-glance card used by both list views (the
 * home feed and the rounds tab). Same visual as the round-detail
 * view's "top portion" so the language is consistent across surfaces:
 *
 *   1. <LiveTopStrip /> when in progress — a 6px live cue at the
 *      very top of the clipped card shell.
 *   2. <RoundCardHeader showScoreBlock={false} /> — neutral header
 *      with owner identity, course/location, and format pills
 *      where applicable. No big score block — the per-scorer rows
 *      below carry every scorer's score (matches the detail view).
 *   3. <ScorerStack isEditing={false} /> — per-scorer rows with
 *      identity + final / running score on line 1; tee pill on line
 *      2 when set (static, no buttons).
 *   4. Footer chip row — three peer chips: comment count, Like
 *      (Phase 1 placeholder), and "View round details". The chips
 *      are the only interactive elements; the card itself is NOT a
 *      Pressable. This both fixes the nested-button HTML error
 *      (whole-card Pressable wrapping inner Pressables) and gives
 *      every action equal visual weight.
 *
 * The caller wires `onOpen` to push into the appropriate tab's
 * detail route so back-nav stays inside the tab. This component is
 * tab-agnostic.
 *
 * Replaces the older lean FeedCardLarge (just band + footer) by
 * adding the ScorerStack between them — visually richer at the cost
 * of vertical space. Acceptable trade-off because users wanted the
 * list cards to convey per-scorer detail without a tap-through.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveStatusChip } from './LiveStatusChip';
import { LiveTopStrip } from './LiveTopStrip';
import { RoundCardHeader } from './RoundCardHeader';
import { ScorerStack } from './ScorerStack';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { formatRelativeTime } from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  /** Fires when the user taps either the comments chip or the "View round details" chip. Typically pushes into the detail route. */
  onOpen: () => void;
  /** Accessibility label suffix for the "View round details" chip. */
  detailsAccessibilityLabel?: string;
};

export function RoundListCard({ round, onOpen, detailsAccessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { count, lastAt } = useCommentSummary(round.id);
  const isInProgress = !round.completedAt;
  const commentChipText = formatCommentChipText(count, lastAt);

  return (
    <View style={styles.card}>
      {isInProgress ? <LiveTopStrip /> : null}
      <RoundCardHeader
        round={round}
        showScoreBlock={false}
        rightSlot={isInProgress ? <LiveStatusChip /> : undefined}
      />
      <View style={styles.body}>
        <ScorerStack round={round} isEditing={false} />
      </View>
      <View style={styles.foot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={commentChipText}
          onPress={onOpen}
          style={({ pressed }) => [
            styles.chip,
            styles.commentChip,
            pressed && styles.chipPressed,
          ]}>
          <Text style={[styles.chipText, styles.mutedChipText]} numberOfLines={1}>
            {commentChipText}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Like (coming soon)"
          onPress={noop}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
          <Text style={styles.chipText}>♡ Like</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            detailsAccessibilityLabel ?? `View round details for ${round.course.name}`
          }
          onPress={onOpen}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
          <Text style={styles.chipText}>View round details →</Text>
        </Pressable>
      </View>
    </View>
  );
}

function noop() {
  // Phase 1 placeholder: Like chip is wired but does nothing until
  // the reactions schema lands. See docs/round-card-footer-spec.md.
}

function formatCommentChipText(count: number, lastAt?: string | null): string {
  if (count <= 0) return '💬 Be the first to comment';

  const label = count === 1 ? 'comment' : 'comments';
  const age = lastAt ? ` · ${formatRelativeTime(lastAt)}` : '';
  return `💬 ${count} ${label}${age}`;
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginBottom: 14,
    },
    body: {
      padding: 10,
      // ScorerStack already renders its own bordered card. The body
      // padding here sits between the neutral header and the scorer
      // stack so the visual rhythm matches the detail view.
    },
    foot: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      backgroundColor: colors.cardBg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    commentChip: {
      flex: 1,
      minWidth: 0,
    },
    chipPressed: {
      opacity: 0.82,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textTitle,
    },
    mutedChipText: {
      color: colors.textMuted,
    },
  });
}
