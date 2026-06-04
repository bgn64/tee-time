/**
 * ScoringHolesBody — editing Holes tab body.
 *
 * Composes:
 *   [HoleStepperCombo]
 *   per scorer:
 *     [ScoreEntryAccordion]   ← ScorerSummaryRow + chips + per-stat
 *                               HoleDetailRow stack + scramble shot
 *                               picker
 *
 * Mirrors the layout of `HolesTabContent` (the viewing surface) so
 * the live-scoring and live-viewing surfaces look like the same
 * screen with chips swapped in. Both pull from `useRoundScorers`
 * and pass per-hole context to `ScorerSummaryRow` so the meta line
 * (yardage · Par · Hcp) is identical across surfaces.
 *
 * Stats wiring: only scorers in `round.trackedScorerIds` receive
 * the per-stat input section. Each gets a row per stat that's both
 * enabled for the round AND applicable to the current hole's par
 * (`applicableStatsForHole`).
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScoreEntryAccordion } from './ScoreEntryAccordion';
import { HoleStepperCombo } from '@/components/scoring/HoleStepperCombo';
import {
  applicableStatsForHole,
  type IntegerStatDefinition,
} from '@/library/golf/builtInStats';
import { holeScoreDisplay } from '@/library/golf/holeScoreDisplay';
import { getHoleStats } from '@/library/golf/teeGrouping';
import { useRoundHoleDetails } from '@/library/golf/useRoundHoleDetails';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useRoundShotAttributions } from '@/library/golf/useRoundShotAttributions';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

type Props = {
  round: Round;
  currentHoleNumber: number;
  onChangeCurrentHole: (n: number) => void;
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
};

export function ScoringHolesBody({
  round,
  currentHoleNumber,
  onChangeCurrentHole,
  onChangeScore,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scorers = useRoundScorers(round);
  const { getValues, setValue, seedDefaults } = useRoundHoleDetails(round.id);
  const { getContributors, setContributors } = useRoundShotAttributions(
    round.id
  );

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  const currentHole = round.course.holes.find(
    (h) => h.number === currentHoleNumber
  );

  const trackedSet = useMemo(
    () => new Set(round.trackedScorerIds),
    [round.trackedScorerIds]
  );

  const statsForThisHole = useMemo(
    () =>
      currentHole
        ? applicableStatsForHole(round.enabledStatKeys, currentHole)
        : [],
    [round.enabledStatKeys, currentHole]
  );

  // Per-scorer strokes map for the hole-jump grid in the stepper.
  // We use the first scorer's strokes as a representative — the
  // grid only shows one scorer's perspective at a time, and on the
  // scoring surface "the active scorer" is the signed-in user
  // typically. For simplicity, just use the first scorer; the grid
  // is mainly a navigation aid.
  const firstScorerStrokes = useMemo(() => {
    const m = new Map<number, number>();
    const id = scorers[0]?.id;
    if (!id) return m;
    for (const s of round.scores) {
      if (s.scorerId === id) m.set(s.holeNumber, s.strokes);
    }
    return m;
  }, [round.scores, scorers]);

  if (!currentHole) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.stepperWrap}>
        <HoleStepperCombo
          current={currentHoleNumber}
          range={round.holeRange}
          allHoles={round.course.holes}
          strokesByHole={firstScorerStrokes}
          onPickHole={onChangeCurrentHole}
        />
      </View>
      {scorers.map((s) => {
        const currentHoleScore = round.scores.find(
          (sc) => sc.scorerId === s.id && sc.holeNumber === currentHoleNumber
        );
        const strokes = currentHoleScore?.strokes ?? null;

        const display = holeScoreDisplay(strokes, currentHole.par);

        const tracked = trackedSet.has(s.id);
        const applicableStats = tracked ? statsForThisHole : [];
        const values = tracked ? getValues(s.id, currentHoleNumber) : {};
        const contributorIds = isScramble
          ? getContributors(s.id, currentHoleNumber)
          : undefined;
        const teamMembers = isScramble ? s.members : undefined;

        // Per-hole context for the meta line — same source as
        // HolesTabContent so the surfaces stay aligned. Scorers
        // without a tee get the scalar Hole fallback.
        const holeStats = s.tee
          ? getHoleStats(s.tee, currentHoleNumber, currentHole)
          : {
              par: currentHole.par,
              handicapIndex: currentHole.handicapIndex,
            };

        return (
          <ScoreEntryAccordion
            key={s.id}
            members={s.members}
            name={s.name}
            scoreText={display.scoreText}
            scoreTone={display.tone}
            scoreSub={display.scoreSub}
            tee={s.tee}
            holeContext={{
              par: holeStats.par,
              handicapIndex: holeStats.handicapIndex,
              yardage: 'yardage' in holeStats ? holeStats.yardage : undefined,
            }}
            holeNumber={currentHoleNumber}
            par={currentHole.par}
            strokes={strokes}
            onChange={
              onChangeScore
                ? (next) => {
                    // Eager-default seed runs on the very first
                    // score entry for this (scorer, hole) tuple
                    // when the scorer is tracked AND any integer
                    // stat applies to the hole. The seed writes
                    // `stat.defaultValue` for each missing key
                    // atomically, so the user sees the stepper
                    // pre-populated and the stored aggregate
                    // matches what's on screen. See
                    // `useRoundHoleDetails.seedDefaults` for the
                    // single-transaction implementation.
                    const wasEmpty = strokes == null;
                    onChangeScore(s.id, currentHoleNumber, next);
                    if (wasEmpty && tracked && next > 0) {
                      const integerStats = applicableStats.filter(
                        (st): st is IntegerStatDefinition =>
                          st.type === 'integer'
                      );
                      if (integerStats.length > 0) {
                        void seedDefaults(
                          s.id,
                          currentHoleNumber,
                          integerStats
                        );
                      }
                    }
                  }
                : undefined
            }
            applicableStats={applicableStats}
            values={values}
            onChangeStat={
              tracked
                ? (statKey, value) => {
                    void setValue(s.id, currentHoleNumber, statKey, value);
                  }
                : undefined
            }
            teamMembers={teamMembers}
            contributorIds={contributorIds}
            onChangeContributors={
              isScramble
                ? (next) => {
                    void setContributors(s.id, currentHoleNumber, next);
                  }
                : undefined
            }
          />
        );
      })}
    </View>
  );
}

function makeStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingBottom: 8,
      paddingHorizontal: 18,
    },
    stepperWrap: {
      paddingTop: 4,
      paddingBottom: 10,
    },
  });
}
