/**
 * Round detail — read-only scorecard for a single completed round.
 *
 * Reached from the Rounds list (and later, from the Feed deep-link). Looks up
 * the round by id from `completedRounds`. The grid itself is rendered by the
 * shared `<ReadOnlyScorecard />` component, which is also used by the Score
 * tab's in-progress scorecard view.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';
import { Round } from '@/types/golf';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getRoundTotalRelative(round: Round): number {
  let total = 0;
  for (const score of round.scores) {
    const hole = round.course.holes.find((h) => h.number === score.holeNumber);
    if (hole) total += score.strokes - hole.par;
  }
  return total;
}

function formatScore(rel: number): string {
  if (rel === 0) return 'E';
  if (rel > 0) return `+${rel}`;
  return `−${Math.abs(rel)}`;
}

export default function RoundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { completedRounds } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Rounds', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  const round = completedRounds.find((r) => r.id === id);

  if (!round) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundIcon}>⛳</Text>
        <Text style={styles.notFoundTitle}>Round not found</Text>
        <Text style={styles.notFoundBody}>
          It may have been abandoned or the link is stale.
        </Text>
      </View>
    );
  }

  const totalRel = getRoundTotalRelative(round);
  const isScramble = round.scoringRule === 'scramble';
  const dateLabel = formatDate(round.completedAt ?? round.startedAt);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{round.course.name}</Text>
      {round.course.location ? (
        <Text style={styles.location}>{round.course.location}</Text>
      ) : null}
      <Text style={styles.subtitle}>
        {isScramble ? 'Scramble' : 'Stroke'} · {dateLabel} · Final{' '}
        <Text
          style={[
            styles.subtitleScore,
            totalRel > 0 && styles.scoreOver,
            totalRel < 0 && styles.scoreUnder,
          ]}>
          {formatScore(totalRel)}
        </Text>
      </Text>

      <ReadOnlyScorecard round={round} />
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textTitle,
    },
    location: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 8,
      marginBottom: 16,
    },
    subtitleScore: {
      fontWeight: '800',
      color: colors.textTitle,
    },
    scoreOver: {
      color: colors.accent,
    },
    scoreUnder: {
      color: colors.primaryDark,
    },
    notFound: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      padding: 32,
      gap: 8,
    },
    notFoundIcon: {
      fontSize: 36,
      opacity: 0.5,
      marginBottom: 4,
    },
    notFoundTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textTitle,
    },
    notFoundBody: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 240,
    },
  });
}
