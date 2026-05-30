/**
 * RoundListCard — the at-a-glance card used by both list views (the
 * home feed and the rounds tab). Same visual as the round-detail
 * view's "top portion" so the language is consistent across surfaces:
 *
 *   1. <RoundCardHeader showScoreBlock={false} /> — gradient band
 *      with owner identity, course/location, and format pills
 *      where applicable. No big score block — the per-scorer rows
 *      below carry every scorer's score (matches the detail view).
 *   2. <LiveRoundIndicatorV1 /> when in progress — hero live banner.
 *   3. <ScorerStack isEditing={false} /> — per-scorer rows with
 *      identity + final / running score on line 1; tee pill on line
 *      2 when set (static, no buttons).
 *   4. Footer strip — comment count + last-comment relative time
 *      (or "be the first to comment") + tap-through chevron.
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

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveRoundIndicatorV1 } from './LiveRoundIndicatorV1';
import { RoundCardHeader } from './RoundCardHeader';
import { ScorerStack } from './ScorerStack';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { formatRelativeTime } from '@/library/golf/scoring';
import { useProfile } from '@/library/social/FriendsContext';
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

  const { count, lastAt } = useCommentSummary(round.id);
  const isInProgress = !round.completedAt;
  const { profile: ownerProfile } = useProfile(round.ownerUserId ?? null);
  const scorerName =
    isInProgress && round.scores.length > 0
      ? ownerProfile?.displayName ??
        (ownerProfile?.handle ? `@${ownerProfile.handle}` : undefined)
      : undefined;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? `Open round at ${round.course.name}`
      }>
      <RoundCardHeader round={round} showScoreBlock={false} />
      <View style={styles.body}>
        {isInProgress ? (
          <LiveRoundIndicatorV1
            size="lg"
            lastScoreAt={round.lastScoreAt ?? round.startedAt}
            scorerName={scorerName}
            style={styles.liveIndicator}
          />
        ) : null}
        <ScorerStack round={round} isEditing={false} />
      </View>
      <View style={styles.foot}>
        <View style={styles.footLeft}>
          <Text style={styles.statCount}>
            💬{' '}
            {count > 0 ? (
              <Text style={styles.statCountNum}>{count}</Text>
            ) : (
              '0'
            )}
          </Text>
          {count > 0 && lastAt ? (
            <Text style={styles.statHint}>
              last comment {formatRelativeTime(lastAt)}
            </Text>
          ) : (
            <Text style={styles.statHint}>be the first to comment</Text>
          )}
        </View>
        <Text style={styles.chev}>›</Text>
      </View>
    </Pressable>
  );
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
      // padding here sits between the gradient band and the scorer
      // stack so the visual rhythm matches the detail view.
    },
    liveIndicator: {
      marginBottom: 10,
    },
    foot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: colors.cardBg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    statCount: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textMuted,
    },
    statCountNum: {
      color: colors.textTitle,
      fontWeight: '800',
    },
    statHint: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
      flexShrink: 1,
    },
    chev: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '800',
      marginLeft: 8,
    },
  });
}
