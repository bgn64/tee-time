/**
 * RoundDetailView — full detail render for a single round, shared by
 * every detail-view state in the app:
 *
 *   ① Completed + viewing  (feed / Previous-rounds read-only)
 *   ④ In-progress + viewing (feed live round)
 *
 * Read-only surface. Like `RoundListCard`, it leads with the
 * deterministic `CourseBanner` (per-course gradient + @handle-led
 * title) and is an edge-to-edge tabbed surface (Summary · Scorecard ·
 * Holes) hosted inside `TabbedRoundShell` so the surfaces share the
 * same chrome. The editing states (② live scoring, ③ completed-round
 * edit) now use the dedicated `ScoringRoundView` instead.
 *
 * Action bar (Like + Comments) sits at the bottom of the card; the
 * Comments tap opens a bottom-sheet modal. Route-specific round
 * actions (Edit / Delete on the owner's Previous-rounds detail) are
 * passed via `overflowActions` and live in the banner's ⋯ menu —
 * matching the feed card.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CommentsSheet } from './CommentsSheet';
import { CourseBanner } from './CourseBanner';
import type { OverflowItem } from './HeaderOverflowMenu';
import { HolesTabContent } from './HolesTabContent';
import { RoundActionBar } from './RoundActionBar';
import { SummaryTabContent } from './SummaryTabContent';
import { TabbedRoundShell } from './TabbedRoundShell';
import { HorizontalScorecard } from '@/components/scoring/HorizontalScorecard';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { userParticipantKey } from '@/library/golf/participantKey';
import {
  formatRelativeTime,
  getScorerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useRoundStatEngagement } from '@/library/golf/useRoundStatEngagement';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  /**
   * Caller decides which tab's profile route to push to when a
   * scorer's avatar is tapped in the scorecard grid. Lets the
   * shared component sit inside any tab stack.
   */
  profileRoutePrefix: string;

  /**
   * Round-level actions for the banner's ⋯ overflow (e.g. Edit /
   * Delete on the owner's Previous-rounds detail). Omitted on
   * read-only views (e.g. a friend's round in the home tab), where
   * the banner shows no ⋯.
   */
  overflowActions?: OverflowItem[];
};

export function RoundDetailView({
  round,
  profileRoutePrefix,
  overflowActions,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const { profile: ownerProfile } = useProfile(round.ownerUserId ?? null);
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
  const isInProgress = !round.completedAt;

  // Holes tab visibility: shown only when at least one scorer has
  // tracked-stat data — otherwise the tab has nothing useful to render
  // and we hide it to keep the segmented control focused on tabs with
  // real content.
  const showHolesTab = engagement.hasAny;
  const holesBody = showHolesTab ? <HolesTabContent round={round} /> : undefined;

  return (
    <View style={styles.shell}>
      <View style={styles.card}>
        <CourseBanner
          course={round.course}
          handle={ownerProfile?.handle}
          displayName={ownerProfile?.displayName}
          metaLeft={topLineLeft}
          metaRight={topLineRight}
          isLive={isInProgress}
          overflowActions={overflowActions}
        />
        <TabbedRoundShell
          summary={<SummaryTabContent round={round} />}
          scorecard={
            <View style={styles.tabBody}>
              <HorizontalScorecard
                round={round}
                onPressParticipant={(userId) =>
                  router.push(`${profileRoutePrefix}/${userId}` as never)
                }
              />
            </View>
          }
          holes={holesBody}
        />
        <RoundActionBar
          liked={likedByMe}
          likeCount={likeCount}
          commentCount={commentCount}
          onToggleLike={toggleLike}
          onOpenComments={() => setSheetVisible(true)}
        />
      </View>

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

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    shell: {
      gap: 14,
    },
    card: {
      backgroundColor: colors.cardBg,
      ...colors.shadowCard,
    },
    tabBody: {
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
  });
}

