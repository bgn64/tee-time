/**
 * HolesTabContent — read-only per-hole viewer for the feed / completed
 * round detail surfaces. Mirrors the layout of the editing surface
 * (`ScoringHolesBody`) so toggling between live-scoring and live-viewing
 * doesn't look like two different apps:
 *
 *   [HoleStepperCombo]
 *   per scorer:
 *     [ScorerSummaryRow with per-hole context + running hero score]
 *     [AchievementTagRow mode="read"]
 *     [ShotSequence] (scramble only)
 *
 * Earlier this surface had a `<ScorerPickPill>` that let the viewer
 * focus a single scorer at a time. We retired the pill in favour of
 * showing every scorer simultaneously — same as the scoring surface —
 * so the feed/scoring views share an at-a-glance presentation.
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
  formatScore,
  playerProgress,
} from '@/library/golf/scoring';
import { getHoleStats } from '@/library/golf/teeGrouping';
import { useRoundAchievementTags } from '@/library/golf/useRoundAchievementTags';
import { useRoundScorers } from '@/library/golf/useRoundScorers';
import { useRoundShotAttributions } from '@/library/golf/useRoundShotAttributions';
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
  const { getTags } = useRoundAchievementTags(round.id);
  const { getContributors } = useRoundShotAttributions(round.id);

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const isCompleted = !!round.completedAt;

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
        const progress = playerProgress(round, s.id);
        const hasScores = progress.thru > 0;
        const scoreText = hasScores ? formatScore(progress.rel) : 'E';
        const tone: 'over' | 'under' | 'even' = !hasScores
          ? 'even'
          : progress.rel > 0
            ? 'over'
            : progress.rel < 0
              ? 'under'
              : 'even';
        const scoreSub =
          !isCompleted && hasScores
            ? `THRU ${progress.thru}`
            : isCompleted
              ? 'FINAL'
              : undefined;

        // Per-hole context for this scorer's tee. When the scorer
        // has no tee, fall back to the scalar Hole row so the meta
        // line still reads (par / hcp).
        const holeStats = s.tee
          ? getHoleStats(s.tee, focusedHole, hole)
          : { par: hole.par, handicapIndex: hole.handicapIndex };

        const tappedTags = getTags(s.id, focusedHole);
        const contributorIds = isScramble
          ? getContributors(s.id, focusedHole)
          : [];
        const hasBody = tappedTags.length > 0 || contributorIds.length > 0;

        return (
          <View key={s.id} style={i > 0 ? styles.rowSep : styles.row}>
            <ScorerSummaryRow
              members={s.members}
              name={s.name}
              tee={s.tee ?? null}
              scoreText={scoreText}
              tone={tone}
              scoreSub={scoreSub}
              holeContext={{
                par: holeStats.par,
                handicapIndex: holeStats.handicapIndex,
                yardage: 'yardage' in holeStats ? holeStats.yardage : undefined,
              }}
            />
            {hasBody ? (
              <View style={styles.body}>
                {tappedTags.length > 0 ? (
                  <AchievementTagRow
                    mode="read"
                    tags={tappedTags}
                    isScramble={isScramble}
                  />
                ) : null}
                {isScramble && contributorIds.length > 0 ? (
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
