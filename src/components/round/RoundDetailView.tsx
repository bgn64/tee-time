/**
 * RoundDetailView — full detail render for a single round, shared by
 * every detail-view state in the app:
 *
 *   ① Completed + viewing  (feed / Previous-rounds read-only)
 *   ④ In-progress + viewing (feed live round)
 *
 * Read-only surface. Like `RoundListCard`, it's an edge-to-edge tabbed
 * surface (Summary · Scorecard · Holes) hosted inside `TabbedRoundShell`
 * so the surfaces share the same chrome. The editing states (② live
 * scoring, ③ completed-round edit) now use the dedicated
 * `ScoringRoundView` instead of this component.
 *
 * Action bar (Like + Comments) sits at the bottom of the card; the
 * Comments tap opens a bottom-sheet modal. `topActions` and
 * `footerActions` slots host the route-specific Edit / Delete buttons
 * on the viewing screens.
 */

import { useRouter } from 'expo-router';
import { ReactNode, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CommentsSheet } from './CommentsSheet';
import { EditorialHeader } from './EditorialHeader';
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

  /** Optional slot above the card (e.g. Edit button). */
  topActions?: ReactNode;
  /** Optional slot below the card (e.g. Delete button). */
  footerActions?: ReactNode;
};

export function RoundDetailView({
  round,
  profileRoutePrefix,
  topActions,
  footerActions,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

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

  // Holes tab visibility: shown only when at least one scorer has
  // tracked-stat data — otherwise the tab has nothing useful to render
  // and we hide it to keep the segmented control focused on tabs with
  // real content.
  const showHolesTab = engagement.hasAny;
  const holesBody = showHolesTab ? <HolesTabContent round={round} /> : undefined;

  return (
    <View style={styles.shell}>
      {topActions ? <View style={styles.actionsSlot}>{topActions}</View> : null}

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

      {footerActions ? (
        <View style={styles.actionsSlot}>{footerActions}</View>
      ) : null}
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
    actionsSlot: {
      // Lets the route wrapper inject any padding it wants on the
      // children it passes.
    },
  });
}

