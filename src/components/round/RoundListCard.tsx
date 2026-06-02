/**
 * RoundListCard — at-a-glance card used by the home feed.
 *
 * Phase 1 redesign — the card is now an edge-to-edge tabbed surface:
 *
 *   1. `<EditorialHeader>` — live strip (in-flight only) + small-caps
 *      meta line + course name + sub-line. The owner avatar, format
 *      pills, and big score block that used to live here have moved
 *      into the per-scorer rows on the Summary tab.
 *   2. `<TabbedRoundShell>` — `SUMMARY · SCORECARD · HOLES` segmented
 *      selector. Always lands on Summary on mount; no persistence
 *      across navigation.
 *      - Summary  : `<SummaryTabContent>` (Phase 1 baseline — no
 *                   aggregate tiles yet).
 *      - Scorecard: existing `<ReadOnlyScorecard>` (Phase 2 replaces
 *                   with `<HorizontalScorecard>`).
 *      - Holes    : "Coming soon" placeholder (Phase 3 lands the
 *                   read-only per-hole viewer; Phase 4 adds tags).
 *   3. `<RoundActionBar>` — Like + Comments. Comments-tap opens the
 *      `<CommentsSheet>` modal hosted by this card. Like-tap is a
 *      visual no-op until Phase 7 ships the likes table.
 *
 * `onOpen` is preserved as the navigation hook into the round's
 * detail route. The Summary tab body is wrapped in a Pressable so
 * any tap on the summary surface (avoid interactive subviews —
 * Summary has none in Phase 1) opens the detail screen. Tabs other
 * than Summary do NOT navigate — the user uses them to read in
 * place.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CommentsSheet } from './CommentsSheet';
import { EditorialHeader } from './EditorialHeader';
import { RoundActionBar } from './RoundActionBar';
import { SummaryTabContent } from './SummaryTabContent';
import { TabbedRoundShell } from './TabbedRoundShell';
import { ReadOnlyScorecard } from '@/components/scoring/ReadOnlyScorecard';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import {
  formatRelativeTime,
  getScorerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

import { HolesTabPlaceholder } from './HolesTabPlaceholder';

type Props = {
  round: Round;
  /**
   * Fires when the user taps the Summary tab area (anywhere not on an
   * interactive subview). Typically pushes the appropriate
   * `round/[id]` route for the parent tab stack.
   */
  onOpen: () => void;
  /** Accessibility label suffix for the Summary tap-through. */
  detailsAccessibilityLabel?: string;
};

export function RoundListCard({
  round,
  onOpen,
  detailsAccessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { count: commentCount } = useCommentSummary(round.id);
  const { likedByMe, count: likeCount, toggle: toggleLike } = useRoundLikes(
    round.id
  );
  const [sheetVisible, setSheetVisible] = useState(false);

  const { topLineLeft, topLineRight } = useMemo(
    () => deriveTopLine(round),
    [round]
  );
  const subtitle = useMemo(() => deriveSubtitle(round), [round]);

  const isInProgress = !round.completedAt;

  return (
    <View style={styles.card}>
      <EditorialHeader
        liveStripVisible={isInProgress}
        topLineLeft={topLineLeft}
        topLineRight={topLineRight}
        title={round.course.name}
        subtitle={subtitle}
      />
      <TabbedRoundShell
        summary={
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={
              detailsAccessibilityLabel ??
              `View round details for ${round.course.name}`
            }>
            <SummaryTabContent round={round} />
          </Pressable>
        }
        scorecard={
          <View style={styles.tabBody}>
            <ReadOnlyScorecard round={round} />
          </View>
        }
        holes={<HolesTabPlaceholder />}
      />
      <RoundActionBar
        liked={likedByMe}
        likeCount={likeCount}
        commentCount={commentCount}
        onToggleLike={toggleLike}
        onOpenComments={() => setSheetVisible(true)}
      />
      <CommentsSheet
        visible={sheetVisible}
        roundId={round.id}
        ownerUserId={round.ownerUserId ?? ''}
        commentCount={commentCount}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

function deriveTopLine(round: Round): {
  topLineLeft: string;
  topLineRight?: string;
} {
  const isInProgress = !round.completedAt;
  const ownerUserId = round.ownerUserId ?? '';
  const ownerScorerId =
    scorerIdForUser(round, ownerUserId) ?? userParticipantKey(ownerUserId);

  if (isInProgress) {
    const { thruCount } = getScorerProgress(round, ownerScorerId);
    const left =
      thruCount > 0 ? `LIVE · THRU ${thruCount}` : 'LIVE · NOT STARTED';
    const right = formatRelativeTime(round.lastScoreAt ?? round.startedAt);
    return { topLineLeft: left, topLineRight: right };
  }
  const left = `Completed · ${formatRelativeTime(round.completedAt ?? round.startedAt)}`;
  return { topLineLeft: left };
}

function deriveSubtitle(round: Round): string {
  const location = round.course.location?.trim();
  const format = round.scoringRule === 'scramble' ? 'Scramble' : 'Stroke';
  const holes = `${round.course.holes.length} holes`;
  const parts = [location, format, holes].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
  return parts.join(' · ');
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      // Edge-to-edge — no border, soft drop shadow only. The full-width
      // shadow extends to the screen edges so the card lifts off the
      // page background without a hard rectangle outline.
      ...colors.shadowCard,
      marginBottom: 14,
    },
    tabBody: {
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
  });
}

