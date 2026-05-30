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
 *   4. Direction A footer — primary details CTA plus secondary
 *      comment / Like chips.
 *
 * The whole card is a Pressable; the caller wires `onPress` to push
 * into the appropriate tab's detail route so back-nav stays inside
 * the tab. This component is tab-agnostic.
 *
 * Replaces the older lean FeedCardLarge (just band + footer) by
 * adding the ScorerStack between them — visually richer at the cost
 * of vertical space. Acceptable trade-off because users wanted the
 * list cards to convey per-scorer detail without a tap-through.
 */

import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

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
  /** Fires when the card is tapped. Typically pushes into the detail route. */
  onPress: () => void;
  /** Accessibility label for the whole-card Pressable. */
  accessibilityLabel?: string;
};

export function RoundListCard({ round, onPress, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [isCtaHovered, setIsCtaHovered] = useState(false);

  const { count, lastAt } = useCommentSummary(round.id);
  const isInProgress = !round.completedAt;
  const commentChipText = formatCommentChipText(count, lastAt);
  const openFromChild = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPress();
  };
  const handleLikePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? `Open round at ${round.course.name}`
      }>
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
          accessibilityLabel={`View round details for ${round.course.name}`}
          onPress={openFromChild}
          onHoverIn={
            Platform.OS === 'web' ? () => setIsCtaHovered(true) : undefined
          }
          onHoverOut={
            Platform.OS === 'web' ? () => setIsCtaHovered(false) : undefined
          }
          style={({ pressed }) => [
            styles.primaryCta,
            isCtaHovered && styles.primaryCtaHovered,
            pressed && styles.primaryCtaPressed,
          ]}>
          <Text style={styles.primaryCtaText}>View round details</Text>
          <Text style={styles.primaryCtaChev}>›</Text>
        </Pressable>
        <View style={styles.chipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={commentChipText}
            onPress={openFromChild}
            style={({ pressed }) => [
              styles.secondaryChip,
              styles.commentChip,
              pressed && styles.secondaryChipPressed,
            ]}>
            <Text style={styles.commentChipText} numberOfLines={1}>
              {commentChipText}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Like (coming soon)"
            onPress={handleLikePress}
            style={({ pressed }) => [
              styles.secondaryChip,
              styles.likeChip,
              pressed && styles.secondaryChipPressed,
            ]}>
            <Text style={styles.likeChipText}>♡ Like</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function formatCommentChipText(count: number, lastAt?: string | null): string {
  if (count <= 0) return '💬 Be the first to comment';

  const label = count === 1 ? 'comment' : 'comments';
  const age = lastAt ? ` · ${formatRelativeTime(lastAt)}` : '';
  return `💬 ${count} ${label}${age}`;
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    cardPressed: {
      opacity: 0.92,
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
    },
    primaryCta: {
      minHeight: 44,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: colors.chipBg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      gap: 12,
    },
    primaryCtaHovered: {
      backgroundColor: withAlpha(colors.primary, 0.12),
      borderColor: withAlpha(colors.primary, 0.24),
    },
    primaryCtaPressed: {
      backgroundColor: withAlpha(colors.primary, 0.16),
      borderColor: withAlpha(colors.primary, 0.24),
      transform: [{ scale: 0.992 }],
    },
    primaryCtaText: {
      color: colors.textTitle,
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 0.1,
    },
    primaryCtaChev: {
      color: colors.textMuted,
      fontSize: 21,
      fontWeight: '900',
      lineHeight: 22,
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 9,
    },
    secondaryChip: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryChipPressed: {
      opacity: 0.82,
    },
    commentChip: {
      flex: 1,
      minWidth: 0,
    },
    commentChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    likeChip: {
      flexShrink: 0,
    },
    likeChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
    },
  });
}
