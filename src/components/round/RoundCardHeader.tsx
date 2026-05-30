/**
 * RoundCardHeader — the neutral card header shared between the feed
 * card and the round-detail view. Carries everything a viewer needs
 * to identify the round at a glance: course + location, format /
 * hole-range pills, owner avatar + handle + relative time,
 * and the owner's score block.
 *
 * Extracted from the original `FeedCardLarge` band so the feed
 * preview and the detail view share the exact same layout — per
 * design feedback, the elements shouldn't get rearranged across
 * surfaces.
 *
 * Live cards (no `completedAt`):
 *   - The list card passes a live status chip into `rightSlot`.
 *   - Score block shows the owner's running ±score with a "THRU N"
 *     subline.
 *   - The "X ago" label reflects `round.lastScoreAt` when available,
 *     falling back to `startedAt`.
 *
 * Completed cards: the relative-time label is the round's
 * `completedAt` (an immutable, meaningful moment).
 */

import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatRelativeTime,
  formatScore,
  getRoundTotalRelative,
  getScorerProgress,
  holeRangeLabel,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { userParticipantKey } from '@/library/golf/participantKey';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  /**
   * Whether to render the big score block on the bottom-right of
   * the header. The lean feed card defaults this to true (the header
   * is the only score affordance there); detail views pass false
   * since the per-scorer rows below already carry every scorer's
   * score, making the band score redundant.
   */
  showScoreBlock?: boolean;
  /** Optional right-side slot in the course-title row. */
  rightSlot?: ReactNode;
};

export function RoundCardHeader({
  round,
  showScoreBlock = true,
  rightSlot,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const ownerUserId = round.ownerUserId ?? '';
  const { profile: ownerProfile } = useProfile(ownerUserId || null);

  const ownerName =
    ownerProfile?.displayName?.trim() ||
    (ownerProfile?.handle ? `@${ownerProfile.handle}` : 'a friend');
  const ownerInitial = getOwnerInitial(
    ownerProfile?.displayName ?? ownerProfile?.handle ?? ownerName
  );
  const ownerColor = ownerProfile?.avatarColor ?? colors.primary;

  const isInProgress = !round.completedAt;
  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  // Owner-perspective scorer: the header's big chip shows the owner's
  // own running total. In stroke that's the owner's participantKey;
  // in scramble it's the id of the team the owner is on.
  const ownerScorerId =
    scorerIdForUser(round, ownerUserId) ?? userParticipantKey(ownerUserId);

  const totalRel = getRoundTotalRelative(round, ownerScorerId);
  let totalStrokes = 0;
  for (const s of round.scores) {
    if (s.scorerId !== ownerScorerId) continue;
    const hole = round.course.holes.find((h) => h.number === s.holeNumber);
    if (!hole) continue;
    if (round.holeRange === 'front9' && s.holeNumber > 9) continue;
    if (round.holeRange === 'back9' && s.holeNumber <= 9) continue;
    totalStrokes += s.strokes;
  }

  const { thruCount } = getScorerProgress(round, ownerScorerId);

  const liveDate = round.lastScoreAt ?? round.startedAt;
  const dateLabel = formatRelativeTime(
    isInProgress ? liveDate : (round.completedAt ?? round.startedAt)
  );
  const location = round.course.location;

  const holesLabel = holeRangeLabel(round.course.holes, round.holeRange);

  return (
    <View style={styles.header}>
      <View style={styles.courseRow}>
        <View style={styles.courseCopy}>
          <Text style={styles.courseTitle} numberOfLines={2}>
            {round.course.name}
          </Text>
          {location ? (
            <Text style={styles.location} numberOfLines={1}>
              {location}
            </Text>
          ) : null}
        </View>
        {rightSlot ? (
          <View style={styles.rightSlot}>{rightSlot}</View>
        ) : null}
      </View>
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {isScramble ? 'SCRAMBLE' : 'STROKE'}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{holesLabel}</Text>
        </View>
      </View>
      <View style={styles.ownerRow}>
        <View style={[styles.ownerAvatar, { backgroundColor: ownerColor }]}>
          <Text style={styles.ownerAvatarText}>{ownerInitial}</Text>
        </View>
        <Text style={styles.ownerLine} numberOfLines={1}>
          {ownerName} · {dateLabel}
        </Text>
        {showScoreBlock ? (
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreRel}>
              {totalStrokes > 0 ? formatScore(totalRel) : '—'}
            </Text>
            {isInProgress && thruCount > 0 ? (
              <Text style={styles.scoreThru}>THRU {thruCount}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function getOwnerInitial(source: string): string {
  const trimmed = source.trim().replace(/^@/, '');
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?';
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    header: {
      backgroundColor: colors.cardBg,
      paddingHorizontal: 16,
      paddingTop: 15,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    courseRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    courseCopy: {
      flex: 1,
      minWidth: 0,
    },
    courseTitle: {
      color: colors.textTitle,
      fontSize: 20,
      fontWeight: '900',
      lineHeight: 24,
    },
    location: {
      color: colors.textMuted,
      fontSize: 12.5,
      marginTop: 2,
      fontWeight: '500',
    },
    rightSlot: {
      flexShrink: 0,
      alignItems: 'flex-end',
      paddingTop: 1,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
    },
    pill: {
      backgroundColor: colors.chipBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    pillText: {
      fontSize: 9.5,
      fontWeight: '900',
      letterSpacing: 0.6,
      color: colors.textTitle,
    },
    ownerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    ownerAvatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ownerAvatarText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '900',
      lineHeight: 13,
    },
    ownerLine: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: '700',
      minWidth: 0,
    },
    scoreBlock: {
      alignItems: 'flex-end',
      marginLeft: 'auto',
    },
    scoreRel: {
      color: colors.primaryDark,
      fontSize: 30,
      fontWeight: '800',
      lineHeight: 32,
    },
    scoreThru: {
      marginTop: 2,
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
  });
}
