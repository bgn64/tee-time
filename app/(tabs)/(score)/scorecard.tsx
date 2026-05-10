/**
 * In-progress scorecard view. Reachable from the ⋯ overflow on Scoring.
 * Renders the same `<ReadOnlyScorecard />` grid the Rounds tab uses for
 * completed rounds, sourced from the active `currentRound`. If the round
 * has been finished or abandoned, we bounce back to the Score tab root.
 */

import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ReadOnlyScorecard } from '@/components/ReadOnlyScorecard';
import { formatScore, getRoundTotalRelative } from '@/lib/scoring';
import { useGolfRound } from '@/state/GolfRoundContext';
import { useScreenHeader } from '@/state/HeaderContext';
import { useTheme } from '@/state/ThemeContext';
import { Round } from '@/types/golf';

export default function ScorecardScreen() {
  const { colors } = useTheme();
  const { currentRound } = useGolfRound();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useScreenHeader({
    left: { kind: 'back', label: 'Score', onPress: () => router.back() },
    right: { kind: 'profile' },
  });

  if (!currentRound) {
    // Defensive: if the round disappeared (abandoned/finished while we were
    // here), bounce back to the Score tab root.
    router.replace('/(tabs)/(score)');
    return null;
  }

  const totalRel = getRoundTotalRelative(currentRound);
  const totalHoles = currentRound.course.holes.length;
  const holesScored = new Set(
    currentRound.scores
      .filter((s) =>
        currentRound.scoringRule === 'scramble'
          ? currentRound.teams?.some((t) => t.id === s.scorerId)
          : currentRound.playerIds.includes(s.scorerId)
      )
      .map((s) => s.holeNumber)
  ).size;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{currentRound.course.name}</Text>
      <Text style={styles.subtitle}>
        {currentRound.scoringRule === 'scramble' ? 'Scramble' : 'Stroke'} · in progress ·
        through {holesScored}/{totalHoles}{' '}
        <Text
          style={[
            styles.subtitleScore,
            totalRel > 0 && styles.scoreOver,
            totalRel < 0 && styles.scoreUnder,
          ]}>
          {holesScored > 0 ? formatScore(totalRel) : ''}
        </Text>
      </Text>

      <ReadOnlyScorecard round={currentRound} />
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
    subtitle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 6,
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
  });
}
