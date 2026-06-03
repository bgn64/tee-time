/**
 * ScoringHolesBody — editing Holes tab body.
 *
 * Composes:
 *   [HoleStepperCombo]
 *   per scorer:
 *     [ScoreEntryAccordion]   ← ScorerSummaryRow + chips + stat section
 *
 * Mirrors the layout of `HolesTabContent` (the viewing surface) so
 * the live-scoring and live-viewing surfaces look like the same
 * screen with chips swapped in. Both pull from `useRoundScorers`
 * and pass per-hole context to `ScorerSummaryRow` so the meta line
 * (yardage · Par · Hcp) is identical across surfaces.
 *
 * Lives in `src/components/round/` (not `scoring/`) because it's
 * scoped to the round-detail surface and reads through the round +
 * tags hooks, not the scoring screen's local state.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScoreEntryAccordion } from './ScoreEntryAccordion';
import { HoleStepperCombo } from '@/components/scoring/HoleStepperCombo';
import {
  effectiveEnabledTags,
} from '@/library/golf/achievementTags';
import { holeScoreDisplay } from '@/library/golf/holeScoreDisplay';
import { getHoleStats } from '@/library/golf/teeGrouping';
import { useRoundAchievementTags } from '@/library/golf/useRoundAchievementTags';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useRoundShotAttributions } from '@/library/golf/useRoundShotAttributions';
import { useRoundTrackedStats } from '@/library/golf/useRoundTrackedStats';
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
  const { getValues, setTagValue } = useRoundAchievementTags(round.id);
  const { getOverride, setOverride } = useRoundTrackedStats(round.id);
  const { getContributors, setContributors } = useRoundShotAttributions(
    round.id
  );

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  const currentHole = round.course.holes.find(
    (h) => h.number === currentHoleNumber
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

        // Per-hole hero score (replaces running totals).
        const display = holeScoreDisplay(strokes, currentHole.par);

        const values = getValues(s.id, currentHoleNumber);
        const override = getOverride(s.id);
        const enabledTags = effectiveEnabledTags(round.scoringRule, override);
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
                ? (next) => onChangeScore(s.id, currentHoleNumber, next)
                : undefined
            }
            scorerId={s.id}
            scoringRule={round.scoringRule}
            values={values}
            enabledTags={enabledTags}
            onSetValue={(tagKey, value) => {
              void setTagValue(s.id, currentHoleNumber, tagKey, value);
            }}
            onChangeEnabledTags={(next) => {
              void setOverride(s.id, next);
            }}
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
