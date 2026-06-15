/**
 * ScoringRoundView — the shared full-screen editing surface for both
 * the live-scoring screen and the completed-round edit screen.
 *
 * Edge-to-edge (no card), mirroring the feed card's chrome but for
 * editing (mockups `scoring-banner.html`,
 * `scoring-screen-redesign.html`, `edit-round-screen-redesign.html`):
 *
 *   [CourseBanner]               per-course gradient + @handle title +
 *                                live/completed meta (purely visual
 *                                here — no ⋯ on the banner)
 *   [SwipeableHoleEditor]        per-hole editing pager (flex: 1)
 *   [footer]
 *     Scorecard button           → ScorecardSheet (Front 9 / Back 9)
 *     primary button             optional — "Finish round" on live
 *                                scoring; omitted on edit (Done is in
 *                                the header there)
 *     RoundActionBar             Like + Comments
 *
 * The route owns the native stack header (back + title + ⋯ overflow for
 * the destructive Abandon/Delete), the destructive confirm, the tee
 * picker, and the score/tee write wiring (passed in as callbacks). This
 * component owns the course banner, the pager, the footer, and the
 * scorecard + comments sheets.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from './CommentsSheet';
import { CourseBanner } from './CourseBanner';
import { RoundActionBar } from './RoundActionBar';
import { ScorecardSheet } from './ScorecardSheet';
import { SwipeableHoleEditor } from './SwipeableHoleEditor';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { formatRelativeTime } from '@/library/golf/scoring';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useProfile } from '@/library/social/FriendsContext';
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
  /**
   * Footer primary button, e.g. "Finish round" on the live-scoring
   * screen. Omit both to hide the footer primary entirely (the
   * edit-round screen does this — its "Done" lives in the header).
   */
  primaryLabel?: string;
  onPrimary?: () => void;
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
  const router = useRouter();

  const { count: commentCount } = useCommentSummary(round.id);
  const { likedByMe, count: likeCount, toggle: toggleLike } = useRoundLikes(
    round.id
  );
  const { profile: ownerProfile } = useProfile(round.ownerUserId ?? null);

  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

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

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 14 },
        ]}
        showsVerticalScrollIndicator={false}>
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
          />

          <SwipeableHoleEditor
            round={round}
            currentHoleNumber={currentHoleNumber}
            onChangeCurrentHole={onChangeCurrentHole}
            onChangeScore={onChangeScore}
            onPressTeeForScorer={onPressTeeForScorer}
          />

          <View style={styles.footer}>
            <Pressable
              style={styles.scorecardBtn}
              onPress={() => setScorecardOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open scorecard">
              <Ionicons name="grid-outline" size={17} color={colors.primaryDark} />
              <Text style={styles.scorecardBtnText}>Scorecard</Text>
            </Pressable>

            {onPrimary ? (
              <Pressable
                style={styles.primaryBtn}
                onPress={onPrimary}
                accessibilityRole="button"
                accessibilityLabel={primaryLabel}>
                <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
              </Pressable>
            ) : null}

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
        </View>
      </ScrollView>

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

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 14,
      paddingTop: 14,
    },
    card: {
      // Match the feed card (RoundListCard): square corners, no border
      // line, soft drop shadow only. Sizes to its content (the pager
      // locks to the tallest hole) so a one-scorer round stays compact.
      backgroundColor: colors.cardBg,
      ...colors.shadowCard,
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
