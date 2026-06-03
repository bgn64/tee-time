/**
 * HolesTabContent — read-only per-hole viewer for the feed / completed
 * round detail surfaces. Mirrors the layout of the editing surface
 * (`ScoringHolesBody`) so toggling between live-scoring and live-viewing
 * doesn't look like two different apps:
 *
 *   [HoleStepperCombo]
 *   per scorer:
 *     [ScorerSummaryRow with per-hole context + per-hole hero score]
 *     [AchievementTagRow mode="read"]  — same 3-state pills, with
 *                                        DID WELL / HURT ME headers.
 *                                        Unset pills render plain so
 *                                        the viewer sees what the
 *                                        scorer committed to track.
 *     [ShotSequence] (scramble + whose_shots enabled)
 *
 * The hole context (par / hcp / yardage) comes from `getHoleStats`
 * so legacy rounds whose `course_snapshot` predates the per-tee
 * schema fall back to the scalar `Hole.par` / `Hole.handicapIndex`.
 *
 * Hole-focus state is local — defaults to `currentHoleNumber` on
 * in-flight rounds (so the live viewer lands on the hole the scorer
 * is on) and hole 1 otherwise.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AchievementTagRow } from './AchievementTagRow';
import { ScorerSummaryRow } from './ScorerSummaryRow';
import { HoleStepperCombo } from '@/components/scoring/HoleStepperCombo';
import { ShotSequence } from '@/components/scoring/ShotSequence';
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
};

export function HolesTabContent({ round }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const scorers = useRoundScorers(round);
  const { getValues } = useRoundAchievementTags(round.id);
  const { getOverride } = useRoundTrackedStats(round.id);
  const { getContributors } = useRoundShotAttributions(round.id);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;

  // Hole-focus state. In-flight rounds default to the live current
  // hole; completed rounds default to the first playable hole. We
  // don't sync this across navigations — the user lands fresh each
  // time, matching the no-tab-persistence convention.
  const [focusedHole, setFocusedHole] = useState<number>(
    round.currentHoleNumber || round.course.holes[0]?.number || 1
  );

  const hole = round.course.holes.find((h) => h.number === focusedHole);

  // Per-scorer strokes-by-hole for the stepper's mini-grid. We use
  // the first scorer's perspective; the grid is a navigation aid,
  // not a per-scorer view.
  const firstScorerStrokes = useMemo(() => {
    const m = new Map<number, number>();
    const id = scorers[0]?.id;
    if (!id) return m;
    for (const s of round.scores) {
      if (s.scorerId === id) m.set(s.holeNumber, s.strokes);
    }
    return m;
  }, [round.scores, scorers]);

  if (scorers.length === 0 || !hole) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.stepperWrap}>
        <HoleStepperCombo
          current={focusedHole}
          range={round.holeRange}
          allHoles={round.course.holes}
          strokesByHole={firstScorerStrokes}
          onPickHole={setFocusedHole}
        />
      </View>
      {scorers.map((s, i) => {
        const scoreForHole = round.scores.find(
          (sc) => sc.scorerId === s.id && sc.holeNumber === focusedHole
        );
        const strokes = scoreForHole?.strokes ?? null;
        const display = holeScoreDisplay(strokes, hole.par);

        // Per-hole context for this scorer's tee. When the scorer
        // has no tee, fall back to the scalar Hole row so the meta
        // line still reads (par / hcp).
        const holeStats = s.tee
          ? getHoleStats(s.tee, focusedHole, hole)
          : { par: hole.par, handicapIndex: hole.handicapIndex };

        const values = getValues(s.id, focusedHole);
        const enabledTags = effectiveEnabledTags(
          round.scoringRule,
          getOverride(s.id)
        );
        const contributorIds = isScramble
          ? getContributors(s.id, focusedHole)
          : [];
        // Show the body when there's anything to render: tracked-stat
        // pills, or scramble shot attribution.
        const hasTagBody =
          enabledTags.filter((k) => k !== 'whose_shots').length > 0;
        const hasShotBody = isScramble && contributorIds.length > 0;
        const hasBody = hasTagBody || hasShotBody;

        return (
          <View key={s.id} style={i > 0 ? styles.rowSep : styles.row}>
            <ScorerSummaryRow
              members={s.members}
              name={s.name}
              tee={s.tee ?? null}
              scoreText={display.scoreText}
              tone={display.tone}
              scoreSub={display.scoreSub}
              holeContext={{
                par: holeStats.par,
                handicapIndex: holeStats.handicapIndex,
                yardage: 'yardage' in holeStats ? holeStats.yardage : undefined,
              }}
            />
            {hasBody ? (
              <View style={styles.body}>
                {hasTagBody ? (
                  <AchievementTagRow
                    mode="read"
                    values={values}
                    enabledTags={enabledTags}
                    isScramble={isScramble}
                  />
                ) : null}
                {hasShotBody ? (
                  <ShotSequence
                    contributorIds={contributorIds}
                    members={s.members}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
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
    stepperWrap: {
      paddingTop: 4,
      paddingBottom: 10,
    },
    row: {
      paddingTop: 12,
      paddingBottom: 14,
      gap: 10,
    },
    rowSep: {
      paddingTop: 12,
      paddingBottom: 14,
      gap: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    body: {
      gap: 10,
    },
  });
}
