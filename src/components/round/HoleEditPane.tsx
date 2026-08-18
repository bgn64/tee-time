/**
 * HoleEditPane — per-scorer editing content for ONE hole. The pure
 * content of a single pane in the scoring screen's per-hole pager:
 *
 *   "Hole N"
 *   per scorer: [ScoreEntryAccordion]  (summary row + chips + stats
 *                                        + scramble shot picker)
 *
 * Extracted from the old `ScoringHolesBody` map body so the pager
 * (`SwipeableHoleEditor`) can render one of these per hole while
 * calling the shared data hooks only once. Takes fully-resolved data
 * + write callbacks — no hooks of its own.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScoreEntryAccordion } from './ScoreEntryAccordion';
import type { RoundScorer } from '@/library/golf/useRoundScorers';
import {
  applicableStatsForHole,
  type IntegerStatDefinition,
  type StatKey,
  type StatValue,
  type StatValueMap,
} from '@/library/golf/builtInStats';
import { holeScoreDisplay } from '@/library/golf/holeScoreDisplay';
import { playerProgress } from '@/library/golf/scoring';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Hole, Round } from '@/types/golf';

type Props = {
  round: Round;
  hole: Hole;
  scorers: RoundScorer[];
  userScorerId?: string;
  trackedSet: ReadonlySet<string>;
  isScramble: boolean;
  getValues: (scorerId: string, holeNumber: number) => StatValueMap;
  getContributors: (scorerId: string, holeNumber: number) => readonly string[];
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
  onChangeStat: (
    scorerId: string,
    holeNumber: number,
    statKey: StatKey,
    value: StatValue | null
  ) => void;
  onChangeContributors: (
    scorerId: string,
    holeNumber: number,
    next: readonly string[]
  ) => void;
  seedDefaults: (
    scorerId: string,
    holeNumber: number,
    integerStats: IntegerStatDefinition[]
  ) => void;
  onPressTeeForScorer?: (scorerId: string) => void;
};

export function HoleEditPane({
  round,
  hole,
  scorers,
  userScorerId,
  trackedSet,
  isScramble,
  getValues,
  getContributors,
  onChangeScore,
  onChangeStat,
  onChangeContributors,
  seedDefaults,
  onPressTeeForScorer,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const statsForThisHole = useMemo(
    () => applicableStatsForHole(round.enabledStatKeys, hole),
    [round.enabledStatKeys, hole]
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.holeHead}>
        <Text style={styles.holeTitle}>Hole {hole.number}</Text>
      </View>
      {scorers.map((s) => {
        const scoreForHole = round.scores.find(
          (sc) => sc.scorerId === s.id && sc.holeNumber === hole.number
        );
        const strokes = scoreForHole?.strokes ?? null;
        const display = holeScoreDisplay(strokes, hole.par);

        const tracked = trackedSet.has(s.id);
        const applicableStats = tracked ? statsForThisHole : [];
        const values = tracked ? getValues(s.id, hole.number) : {};
        const contributorIds = isScramble
          ? getContributors(s.id, hole.number)
          : undefined;
        const teamMembers = isScramble ? s.members : undefined;
        const running = playerProgress(round, s.id);

        return (
          <ScoreEntryAccordion
            key={s.id}
            members={s.members}
            name={s.name}
            runningScore={running}
            isYou={s.id === userScorerId}
            round={round}
            scorerId={s.id}
            scoreText={display.scoreText}
            scoreTone={display.tone}
            scoreSub={display.scoreSub}
            tee={s.tee}
            onPressTee={
              onPressTeeForScorer ? () => onPressTeeForScorer(s.id) : undefined
            }
            holeNumber={hole.number}
            par={hole.par}
            strokes={strokes}
            onChange={
              onChangeScore
                ? (next) => {
                    // Seed integer-stat defaults on the very first
                    // score entry for this (scorer, hole) when tracked
                    // and any integer stat applies — so the stepper
                    // shows the default and the stored aggregate
                    // matches the screen. Mirrors the old
                    // ScoringHolesBody behaviour.
                    const wasEmpty = strokes == null;
                    onChangeScore(s.id, hole.number, next);
                    if (wasEmpty && tracked && next > 0) {
                      const integerStats = applicableStats.filter(
                        (st): st is IntegerStatDefinition =>
                          st.type === 'integer'
                      );
                      if (integerStats.length > 0) {
                        seedDefaults(s.id, hole.number, integerStats);
                      }
                    }
                  }
                : undefined
            }
            applicableStats={applicableStats}
            values={values}
            onChangeStat={
              tracked
                ? (statKey, value) =>
                    onChangeStat(s.id, hole.number, statKey, value)
                : undefined
            }
            teamMembers={teamMembers}
            contributorIds={contributorIds}
            onChangeContributors={
              isScramble
                ? (next) => onChangeContributors(s.id, hole.number, next)
                : undefined
            }
          />
        );
      })}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 18,
      paddingBottom: 8,
    },
    holeHead: {
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 2,
    },
    holeTitle: {
      fontSize: 15,
      fontWeight: '900',
      color: colors.textTitle,
      letterSpacing: -0.2,
    },
  });
}
