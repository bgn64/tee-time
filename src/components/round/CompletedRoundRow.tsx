/**
 * CompletedRoundRow — compact feed row for a finished round.
 *
 * The feed reserves the large swipeable `RoundListCard` for live rounds
 * and lists completed rounds as these compact rows (mirrors the mockup's
 * "Completed today" section). Shows the round owner's gross + to-par, the
 * course, a short meta line, and the like count; the whole row opens the
 * round detail.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NumericText } from '@/components/aurora';
import {
  formatScore,
  getRoundTotalRelative,
  holesInRange,
  scorerIdForUser,
} from '@/library/golf/scoring';
import { useRoundLikes } from '@/library/golf/useRoundLikes';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  onPress?: () => void;
};

export function CompletedRoundRow({ round, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { profile: ownerProfile } = useProfile(round.ownerUserId ?? null);
  const { count: likeCount } = useRoundLikes(round.id);

  // Headline = the round owner's score (the poster). Fall back to the
  // first recorded scorer when the owner didn't play (scored for others).
  const ownerScorerId = round.ownerUserId
    ? scorerIdForUser(round, round.ownerUserId)
    : undefined;
  const headlineScorerId = ownerScorerId ?? round.scores[0]?.scorerId;

  const rel = getRoundTotalRelative(round, headlineScorerId);
  const gross = useMemo(() => {
    const allowed = new Set(
      holesInRange(round.course.holes, round.holeRange).map((h) => h.number)
    );
    const seen = new Set<number>();
    let total = 0;
    for (const s of round.scores) {
      if (headlineScorerId && s.scorerId !== headlineScorerId) continue;
      if (!allowed.has(s.holeNumber)) continue;
      if (seen.has(s.holeNumber)) continue;
      seen.add(s.holeNumber);
      total += s.strokes;
    }
    return total;
  }, [round, headlineScorerId]);

  const relTone =
    rel > 0 ? styles.relOver : rel < 0 ? styles.relUnder : styles.relEven;

  const ownerHandle = ownerProfile?.handle
    ? `@${ownerProfile.handle}`
    : ownerProfile?.displayName ?? 'Someone';
  const ruleLabel = round.scoringRule === 'scramble' ? 'scramble' : 'stroke';
  const holeCount = holesInRange(round.course.holes, round.holeRange).length;
  const meta = `${ownerHandle} · ${ruleLabel} · ${holeCount} holes`;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${round.course.name} round`}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
      <View style={styles.scoreCol}>
        <NumericText style={styles.gross}>{gross || '—'}</NumericText>
        <NumericText style={[styles.rel, relTone]}>
          {formatScore(rel)}
        </NumericText>
      </View>
      <View style={styles.body}>
        <Text style={styles.course} numberOfLines={1}>
          {round.course.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {likeCount > 0 ? (
        <View style={styles.likes}>
          <Ionicons name="heart" size={13} color={colors.lime} />
          <NumericText style={styles.likeCount}>{likeCount}</NumericText>
        </View>
      ) : null}
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 13,
      paddingHorizontal: 15,
      marginBottom: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      backgroundColor: colors.glassFill,
    },
    pressed: {
      opacity: 0.78,
    },
    scoreCol: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      minWidth: 56,
    },
    gross: {
      fontSize: 26,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.5,
    },
    rel: {
      fontSize: 12,
      fontWeight: '800',
    },
    relUnder: {
      color: colors.lime,
    },
    relOver: {
      color: colors.accent,
    },
    relEven: {
      color: colors.textMuted,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    course: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textTitle,
      letterSpacing: -0.2,
    },
    meta: {
      marginTop: 2,
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    likes: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
    },
    likeCount: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textMuted,
    },
  });
}
