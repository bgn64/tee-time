/**
 * ScoringRoundView — the shared full-screen editing surface for both
 * the live-scoring screen and the completed-round edit screen.
 *
 * Edge-to-edge (no card), mirroring the feed card's chrome but for
 * editing (mockups `scoring-screen-redesign.html` /
 * `edit-round-screen-redesign.html`):
 *
 *   [EditorialHeader]            live strip + meta + course title
 *   [SwipeableHoleEditor]        per-hole editing pager (flex: 1)
 *   [footer]
 *     Scorecard button           → ScorecardSheet (Front 9 / Back 9)
 *     primary button             "Finish round" / "Done" (onPrimary)
 *     RoundActionBar             Like + Comments
 *
 * The route owns the native stack header (back + title + ⋯ overflow for
 * the destructive Abandon/Delete), the destructive confirm, the tee
 * picker, and the score/tee write wiring (passed in as callbacks). This
 * component owns the editorial header, the pager, the footer, and the
 * scorecard + comments sheets.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from './CommentsSheet';
import { EditorialHeader } from './EditorialHeader';
import { RoundActionBar } from './RoundActionBar';
import { ScorecardSheet } from './ScorecardSheet';
import { SwipeableHoleEditor } from './SwipeableHoleEditor';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { userParticipantKey } from '@/library/golf/participantKey';
import {
  formatRelativeTime,
  getScorerProgress,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  profileRoutePrefix: string;
  currentHoleNumber: number;
  onChangeCurrentHole: (n: number) => void;
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
  onPressTeeForScorer?: (scorerId: string) => void;
  /** Footer primary button label, e.g. "Finish round" / "Done". */
  primaryLabel: string;
  onPrimary: () => void;
};

export function ScoringRoundView({
  round,
  profileRoutePrefix,
  currentHoleNumber,
  onChangeCurrentHole,
  onChangeScore,
  onPressTeeForScorer,
  primaryLabel,
  onPrimary,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const { count: commentCount } = useCommentSummary(round.id);
  const { likedByMe, count: likeCount, toggle: toggleLike } = useRoundLikes(
    round.id
  );

  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const { topLineLeft, topLineRight } = useMemo(
    () => deriveTopLine(round),
    [round]
  );
  const subtitle = useMemo(() => deriveSubtitle(round), [round]);
  const isInProgress = !round.completedAt;

  return (
    <View style={styles.container}>
      <EditorialHeader
        liveStripVisible={isInProgress}
        topLineLeft={topLineLeft}
        topLineRight={topLineRight}
        title={round.course.name}
        subtitle={subtitle}
      />

      <SwipeableHoleEditor
        round={round}
        currentHoleNumber={currentHoleNumber}
        onChangeCurrentHole={onChangeCurrentHole}
        onChangeScore={onChangeScore}
        onPressTeeForScorer={onPressTeeForScorer}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <Pressable
          style={styles.scorecardBtn}
          onPress={() => setScorecardOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open scorecard">
          <Ionicons name="grid-outline" size={17} color={colors.primaryDark} />
          <Text style={styles.scorecardBtnText}>Scorecard</Text>
        </Pressable>

        <Pressable
          style={styles.primaryBtn}
          onPress={onPrimary}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}>
          <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
        </Pressable>

        <View style={styles.actionBarWrap}>
          <RoundActionBar
            liked={likedByMe}
            likeCount={likeCount}
            commentCount={commentCount}
            onToggleLike={toggleLike}
            onOpenComments={() => setCommentsOpen(true)}
          />
        </View>
      </View>

      <ScorecardSheet
        round={round}
        visible={scorecardOpen}
        onClose={() => setScorecardOpen(false)}
      />

      <CommentsSheet
        visible={commentsOpen}
        roundId={round.id}
        ownerUserId={round.ownerUserId ?? ''}
        commentCount={commentCount}
        onClose={() => setCommentsOpen(false)}
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
    container: {
      flex: 1,
      backgroundColor: colors.cardBg,
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 8,
    },
    scorecardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.chipBg,
      borderRadius: 12,
      paddingVertical: 13,
    },
    scorecardBtnText: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.primaryDark,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '800',
    },
    actionBarWrap: {
      marginHorizontal: -16,
      marginTop: 2,
    },
  });
}
