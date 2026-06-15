/**
 * RoundListCard — at-a-glance card used by the home feed.
 *
 * Edge-to-edge tabbed surface:
 *
 *   1. `<CourseBanner>` — a deterministically generated course banner
 *      (gradient + motif, seeded per course) titled Instagram-style:
 *      the round owner's @handle on top, course · location beneath, and
 *      the small-caps meta (completed/live + relative time). A ⋯ overflow
 *      opens an anchored popover for round actions (View details; plus
 *      Edit, owner-only on completed rounds). Replaces the former
 *      `<EditorialHeader>`.
 *   2. `<SwipeableCardContent>` — a horizontally-swipeable band. Panes:
 *      Summary, then the scorecard split into Front 9 / Back 9 sections
 *      (a single Scorecard pane for one-nine rounds). Constant height
 *      (locked to the tallest pane), minimal dots, desktop-only hover
 *      edge arrows. When the round has tracked stats, scorecard hole
 *      numbers are pills and a caption opens the per-hole
 *      `<HoleDetailSheet>`; with no stats the numbers are plain text.
 *   3. `<RoundActionBar>` — Like + Comments (uniform on every round;
 *      Edit lives in the banner's ⋯ menu). Comments-tap opens the
 *      `<CommentsSheet>` modal hosted by this card.
 *
 * The card is intentionally NOT tappable as a whole. Everything is
 * shown inline now — the previous "tap to view details" hover affordance
 * was retired so the cards behave like static social-feed posts. Likes,
 * comments, and the banner ⋯ menu are the interactive surfaces; tabs are
 * used in place to read details.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CommentsSheet } from './CommentsSheet';
import { CourseBanner } from './CourseBanner';
import type { OverflowItem } from './HeaderOverflowMenu';
import { HoleDetailSheet } from './HoleDetailSheet';
import { RoundActionBar } from './RoundActionBar';
import { SummaryTabContent } from './SummaryTabContent';
import { SwipeableCardContent, type SwipePane } from './SwipeableCardContent';
import { HorizontalScorecard } from '@/components/scoring/HorizontalScorecard';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import {
  formatRelativeTime,
  holesInRange,
} from '@/library/golf/scoring';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useRoundStatEngagement } from '@/library/golf/useRoundStatEngagement';
import { useAccount } from '@/library/social/AccountContext';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  /**
   * Route prefix for this card's detail screen, e.g.
   * `/(tabs)/(home)/round` on the home feed or
   * `/(tabs)/(score)/previous` on the Previous-rounds list. The "View
   * details" overflow item pushes `${detailRoutePrefix}/${round.id}`.
   */
  detailRoutePrefix: string;
  /**
   * Route prefix for the owner's profile in this card's tab stack, e.g.
   * `/(tabs)/(home)/profile`. Tapping the header avatar/@handle pushes
   * `${profileRoutePrefix}/${ownerUserId}` so it stays in this tab.
   */
  profileRoutePrefix: string;
};

export function RoundListCard({
  round,
  detailRoutePrefix,
  profileRoutePrefix,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const { account } = useAccount();
  const { profile: ownerProfile } = useProfile(round.ownerUserId ?? null);
  const { count: commentCount } = useCommentSummary(round.id);
  const { likedByMe, count: likeCount, toggle: toggleLike } = useRoundLikes(
    round.id
  );
  const engagement = useRoundStatEngagement(round.id);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [holeSheetOpen, setHoleSheetOpen] = useState(false);
  const [initialHole, setInitialHole] = useState(1);

  function openHoleSheet(holeNumber: number) {
    setInitialHole(holeNumber);
    setHoleSheetOpen(true);
  }

  const isInProgress = !round.completedAt;
  const timeText = formatRelativeTime(
    isInProgress
      ? round.lastScoreAt ?? round.startedAt
      : round.completedAt ?? round.startedAt
  );

  const ownerUserId = round.ownerUserId ?? '';
  const onPressOwner = ownerUserId
    ? () => router.push(`${profileRoutePrefix}/${ownerUserId}` as never)
    : undefined;
  // Edit affordance is owner-only for completed rounds. In-progress
  // rounds resume editing via the scoring tab, not via the card.
  const isOwner =
    !!account?.userId && account.userId === (round.ownerUserId ?? '');
  const canEdit = isOwner && !isInProgress;

  // Round-level actions live in the banner's ⋯ menu (not the footer, so
  // the action bar stays uniform). "View details" opens the full
  // round-detail screen (every card); Edit is owner-only on completed
  // rounds. In-progress rounds resume editing via the scoring tab.
  const overflowActions: OverflowItem[] = [
    {
      key: 'view',
      label: 'View details',
      icon: 'open-outline',
      onPress: () =>
        router.push(`${detailRoutePrefix}/${round.id}` as never),
    },
  ];
  if (canEdit) {
    overflowActions.push({
      key: 'edit',
      label: 'Edit round',
      icon: 'create-outline',
      onPress: () =>
        router.push(`/(tabs)/(score)/previous/${round.id}/edit` as never),
    });
  }

  // Per-hole detail is only worth surfacing when the round actually has
  // tracked stats — otherwise the sheet has nothing extra to show. With no
  // stats the hole numbers render as plain (non-tappable) text and no
  // caption is shown.
  const hasStats = engagement.hasAny;
  const onPressHole = hasStats ? openHoleSheet : undefined;

  function holeCaption(holeNumber: number) {
    if (!hasStats) return undefined;
    return (
      <Text style={styles.captionText}>
        Tap a hole for detail — or start at{' '}
        <Text
          style={styles.captionLink}
          onPress={() => openHoleSheet(holeNumber)}
          accessibilityRole="button"
          accessibilityLabel={`Open hole ${holeNumber} detail`}>
          Hole {holeNumber}
        </Text>
        .
      </Text>
    );
  }

  // Split the scorecard into Front 9 / Back 9 content sections when the
  // round spans both nines — keeps each feed card shorter. One-nine rounds
  // (or 9-hole courses) get a single scorecard pane.
  const hasBackNine = round.course.holes.some((h) => h.number > 9);
  const splitNines = round.holeRange === 'all' && hasBackNine;

  const panes: SwipePane[] = [
    {
      key: 'summary',
      label: 'Summary',
      content: <SummaryTabContent round={round} />,
    },
  ];

  if (splitNines) {
    const frontFirst =
      holesInRange(round.course.holes, 'front9')[0]?.number ?? 1;
    const backFirst =
      holesInRange(round.course.holes, 'back9')[0]?.number ?? 10;
    panes.push(
      {
        key: 'front',
        label: 'Front 9',
        content: (
          <HorizontalScorecard
            round={round}
            layout="single"
            range="front9"
            onPressHoleDetail={onPressHole}
            detailCaption={holeCaption(frontFirst)}
          />
        ),
      },
      {
        key: 'back',
        label: 'Back 9',
        content: (
          <HorizontalScorecard
            round={round}
            layout="single"
            range="back9"
            onPressHoleDetail={onPressHole}
            detailCaption={holeCaption(backFirst)}
          />
        ),
      }
    );
  } else {
    const first =
      holesInRange(round.course.holes, round.holeRange)[0]?.number ?? 1;
    panes.push({
      key: 'scorecard',
      label: 'Scorecard',
      content: (
        <HorizontalScorecard
          round={round}
          layout="single"
          range={round.holeRange}
          onPressHoleDetail={onPressHole}
          detailCaption={holeCaption(first)}
        />
      ),
    });
  }

  return (
    <View style={styles.card}>
      <CourseBanner
        handle={ownerProfile?.handle}
        displayName={ownerProfile?.displayName}
        avatarColor={ownerProfile?.avatarColor}
        avatarSeed={round.ownerUserId}
        courseName={round.course.name}
        timeText={timeText}
        isLive={isInProgress}
        onPressOwner={onPressOwner}
        overflowActions={overflowActions}
      />
      <SwipeableCardContent panes={panes} />
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
      <HoleDetailSheet
        round={round}
        visible={holeSheetOpen}
        initialHole={initialHole}
        onClose={() => setHoleSheetOpen(false)}
      />
    </View>
  );
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

