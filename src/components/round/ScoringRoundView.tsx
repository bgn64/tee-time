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
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from './CommentsSheet';
import { CourseBanner } from './CourseBanner';
import { RoundActionBar } from './RoundActionBar';
import { ScorecardSheet } from './ScorecardSheet';
import { SwipeableHoleEditor } from './SwipeableHoleEditor';
import { GlassCard, NeonButton, NumericText, StatChip } from '@/components/aurora';
import { useCommentSummary } from '@/library/comments/useRoundComments';
import { formatRelativeTime, formatScore, getScorerProgress } from '@/library/golf/scoring';
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
  const currentHole = round.course.holes.find((h) => h.number === currentHoleNumber);
  const primaryScorerId =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0
      ? round.teams?.[0]?.id
      : round.playerIds[0];
  const progress = getScorerProgress(round, primaryScorerId);
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
          <GlassCard strong glow style={styles.headerCard}>
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
            {currentHole ? (
              <View style={styles.hero}>
                <View style={styles.heroNumberWrap}>
                  <Text style={styles.heroEyebrow}>HOLE</Text>
                  <NumericText style={styles.heroNumber}>
                    {currentHole.number}
                  </NumericText>
                </View>
                <View style={styles.heroMeta}>
                  <Text style={styles.heroCourse} numberOfLines={1}>
                    {round.course.name}
                  </Text>
                  <View style={styles.heroStats}>
                    <StatChip label="Par" value={currentHole.par} state="neutral" />
                    {currentHole.yardage ? (
                      <StatChip label="Yards" value={currentHole.yardage} state="neutral" />
                    ) : null}
                    {currentHole.handicapIndex ? (
                      <StatChip label="Hcp" value={currentHole.handicapIndex} state="neutral" />
                    ) : null}
                  </View>
                </View>
                <View style={styles.toParChip}>
                  <Text style={styles.toParLabel}>TO PAR</Text>
                  <NumericText style={styles.toParValue}>
                    {formatScore(progress.relativeScore)}
                  </NumericText>
                  <Text style={styles.toParThru}>THRU {progress.thruCount}</Text>
                </View>
              </View>
            ) : null}
          </GlassCard>

          <SwipeableHoleEditor
            round={round}
            currentHoleNumber={currentHoleNumber}
            onChangeCurrentHole={onChangeCurrentHole}
            onChangeScore={onChangeScore}
            onPressTeeForScorer={onPressTeeForScorer}
          />

          <View style={styles.footer}>
            <NeonButton
              label="Scorecard"
              variant="ghost"
              onPress={() => setScorecardOpen(true)}
              iconLeft={<Ionicons name="grid-outline" size={17} color={colors.cyan} />}
            />

            {onPrimary ? (
              <NeonButton
                label={primaryLabel ?? 'Continue'}
                onPress={onPrimary}
              />
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
      backgroundColor: 'transparent',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 14,
      paddingTop: 14,
    },
    card: {
      gap: 12,
    },
    headerCard: {
      gap: 16,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
    },
    heroNumberWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 78,
      height: 82,
      borderRadius: 22,
      backgroundColor: colors.night,
      borderWidth: 1,
      borderColor: colors.glassStroke,
    },
    heroEyebrow: {
      color: colors.cyan,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
    heroNumber: {
      color: colors.lime,
      fontSize: 42,
      fontWeight: '900',
      lineHeight: 46,
    },
    heroMeta: {
      flex: 1,
      minWidth: 0,
      gap: 9,
    },
    heroCourse: {
      color: colors.textTitle,
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: -0.3,
    },
    heroStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    toParChip: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 72,
      minHeight: 72,
      borderRadius: 20,
      backgroundColor: colors.glowLime,
      borderWidth: 1,
      borderColor: colors.lime,
    },
    toParLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    toParValue: {
      color: colors.lime,
      fontSize: 25,
      fontWeight: '900',
      lineHeight: 29,
    },
    toParThru: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    footer: {
      paddingTop: 2,
      gap: 8,
    },
    actionBarWrap: {
      marginTop: 2,
    },
  });
}
