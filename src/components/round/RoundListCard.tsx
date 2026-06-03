/**
 * RoundListCard — at-a-glance card used by the home feed.
 *
 * Edge-to-edge tabbed surface:
 *
 *   1. `<EditorialHeader>` — live strip (in-flight only) + small-caps
 *      meta line + course name + sub-line. The owner avatar, format
 *      pills, and big score block that used to live here have moved
 *      into the per-scorer rows on the Summary tab.
 *   2. `<TabbedRoundShell>` — `SUMMARY · SCORECARD · HOLES` segmented
 *      selector. Always lands on Summary on mount; no persistence
 *      across navigation. The HOLES tab is hidden when the round has
 *      no per-hole stat data — pre-feature rounds and brand-new rounds
 *      that haven't been tagged don't surface an empty tab.
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
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CommentsSheet } from './CommentsSheet';
import { EditorialHeader } from './EditorialHeader';
import { HolesTabContent } from './HolesTabContent';
import { RoundActionBar } from './RoundActionBar';
import { SummaryTabContent } from './SummaryTabContent';
import { TabbedRoundShell } from './TabbedRoundShell';
import { HorizontalScorecard } from '@/components/scoring/HorizontalScorecard';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import {
  formatRelativeTime,
  getScorerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useRoundStatEngagement } from '@/library/golf/useRoundStatEngagement';
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
  const engagement = useRoundStatEngagement(round.id);
  const [sheetVisible, setSheetVisible] = useState(false);

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
        summary={<SummaryTabContent round={round} />}
        scorecard={
          <View style={styles.tabBody}>
            <HorizontalScorecard round={round} />
          </View>
        }
        holes={engagement.hasAny ? <HolesTabContent round={round} /> : undefined}
      />
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

