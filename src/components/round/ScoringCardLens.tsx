/**
 * ScoringCardLens — the "Card" lens on the live scoring screen: mid-round
 * Standings (everyone's running to-par) above the running scorecard grid
 * with the current hole marked (mockup `mockups/aurora-screens.html`, the
 * Scoring · Card lens). Read-only — score entry stays on the Hole lens.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RoundScorecardGrid } from './RoundScorecardGrid';
import { StandingsList } from './StandingsList';
import { GlassCard, SectionLabel } from '@/components/aurora';
import {
  performanceToneColor,
  useRoundPerformance,
  userIdForScorer,
} from '@/library/golf/performanceBenchmark';
import { formatScore, playerProgress } from '@/library/golf/scoring';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

export function ScoringCardLens({
  round,
  currentHoleNumber,
}: {
  round: Round;
  currentHoleNumber: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scorers = useRoundScorers(round);

  // Scramble shares one team score; surface it on the Standings label so
  // the team total reads even when there's a single team row below.
  const teamRel = scorers[0] ? playerProgress(round, scorers[0].id).rel : 0;
  const performance = useRoundPerformance(
    round,
    scorers[0]?.id,
    userIdForScorer(round, scorers[0]?.id)
  );
  const performanceColor = performanceToneColor(colors, performance.tone);
  const teamTag =
    round.scoringRule === 'scramble' ? `team ${formatScore(teamRel)}` : null;

  return (
    <View style={styles.wrap}>
      <SectionLabel
        right={
          teamTag ? (
            <Text style={[styles.teamTag, { color: performanceColor }]}>
              {teamTag}
            </Text>
          ) : undefined
        }>
        Standings
      </SectionLabel>
      <StandingsList round={round} />

      <SectionLabel>Round so far</SectionLabel>
      <GlassCard padded={false} style={styles.gridCard}>
        <RoundScorecardGrid
          round={round}
          scorers={scorers}
          currentHoleNumber={currentHoleNumber}
          performanceColor={performanceColor}
        />
      </GlassCard>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      gap: 4,
    },
    teamTag: {
      color: colors.cyan,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    gridCard: {
      overflow: 'hidden',
    },
  });
}
