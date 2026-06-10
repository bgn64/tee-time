/**
 * RoundListCard — at-a-glance card used by the home feed.
 *
 * Edge-to-edge tabbed surface:
 *
 *   1. `<EditorialHeader>` — live strip (in-flight only) + small-caps
 *      meta line + course name + sub-line. The owner avatar, format
 *      pills, and big score block that used to live here have moved
 *      into the per-scorer rows on the Summary tab.
 *   2. `<SwipeableCardContent>` — a horizontally-swipeable band with
 *      two panes: Summary and Scorecard. Constant height (locked to the
 *      taller pane), minimal dots indicator, and desktop-only hover edge
 *      arrows. The old segmented `SUMMARY · SCORECARD · HOLES` selector
 *      is gone; per-hole detail moved out of a tab into a sheet (below).
 *      The Scorecard renders front-9 over back-9 (`layout="stacked"`),
 *      its hole numbers are pills, and a caption underneath opens the
 *      per-hole `<HoleDetailSheet>`.
 *   3. `<RoundActionBar>` — Like + Comments. Comments-tap opens the
 *      `<CommentsSheet>` modal hosted by this card.
 *
 * The card is intentionally NOT tappable as a whole. Everything is
 * shown inline now — the previous "tap to view details" hover affordance
 * was retired so the cards behave like static social-feed posts. Likes
 * and comments are the only interactive surfaces on the card; tabs are
 * used in place to read details.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CommentsSheet } from './CommentsSheet';
import { EditorialHeader } from './EditorialHeader';
import { HoleDetailSheet } from './HoleDetailSheet';
import { RoundActionBar } from './RoundActionBar';
import { SummaryTabContent } from './SummaryTabContent';
import { SwipeableCardContent, type SwipePane } from './SwipeableCardContent';
import { HorizontalScorecard } from '@/components/scoring/HorizontalScorecard';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import {
  formatRelativeTime,
  getScorerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useAccount } from '@/library/social/AccountContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
};

export function RoundListCard({ round }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const { account } = useAccount();
  const { count: commentCount } = useCommentSummary(round.id);
  const { likedByMe, count: likeCount, toggle: toggleLike } = useRoundLikes(
    round.id
  );
  const [sheetVisible, setSheetVisible] = useState(false);
  const [holeSheetOpen, setHoleSheetOpen] = useState(false);
  const [initialHole, setInitialHole] = useState(1);

  function openHoleSheet(holeNumber: number) {
    setInitialHole(holeNumber);
    setHoleSheetOpen(true);
  }

  const { topLineLeft, topLineRight } = useMemo(
    () => deriveTopLine(round),
    [round]
  );
  const subtitle = useMemo(() => deriveSubtitle(round), [round]);

  const isInProgress = !round.completedAt;
  // Edit affordance is owner-only for completed rounds. In-progress
  // rounds resume editing via the scoring tab, not via the card.
  const isOwner =
    !!account?.userId && account.userId === (round.ownerUserId ?? '');
  const canEdit = isOwner && !isInProgress;

  const scorecardCaption = (
    <Text style={styles.captionText}>
      Tap a hole for detail — or start at{' '}
      <Text
        style={styles.captionLink}
        onPress={() => openHoleSheet(1)}
        accessibilityRole="button"
        accessibilityLabel="Open hole 1 detail">
        Hole 1
      </Text>
      .
    </Text>
  );

  const panes: SwipePane[] = [
    {
      key: 'summary',
      label: 'Summary',
      content: <SummaryTabContent round={round} />,
    },
    {
      key: 'scorecard',
      label: 'Scorecard',
      content: (
        <HorizontalScorecard
          round={round}
          layout="stacked"
          onPressHoleDetail={openHoleSheet}
          detailCaption={scorecardCaption}
        />
      ),
    },
  ];

  return (
    <View style={styles.card}>
      <EditorialHeader
        liveStripVisible={isInProgress}
        topLineLeft={topLineLeft}
        topLineRight={topLineRight}
        title={round.course.name}
        subtitle={subtitle}
      />
      <SwipeableCardContent panes={panes} />
      <RoundActionBar
        liked={likedByMe}
        likeCount={likeCount}
        commentCount={commentCount}
        onToggleLike={toggleLike}
        onOpenComments={() => setSheetVisible(true)}
        onEdit={
          canEdit
            ? () =>
                router.push(
                  `/(tabs)/(score)/previous/${round.id}/edit` as never
                )
            : undefined
        }
      />
      <CommentsSheet
        visible={sheetVisible}
        roundId={round.id}
        ownerUserId={round.ownerUserId ?? ''}
        commentCount={commentCount}
        onClose={() => setSheetVisible(false)}
      />
      <HoleDetailSheet
        round={round}
        visible={holeSheetOpen}
        initialHole={initialHole}
        onClose={() => setHoleSheetOpen(false)}
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
    captionText: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted,
    },
    captionLink: {
      color: colors.primaryDark,
      fontWeight: '800',
    },
  });
}

