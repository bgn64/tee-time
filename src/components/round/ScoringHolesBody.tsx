/**
 * ScoringHolesBody — assembled scoring-mode Holes tab body.
 *
 * Composes:
 *   [HoleStepperCombo]
 *   per scorer:
 *     [ScoreEntryAccordion]   ← ScorerRow + chip row + Detail accordion
 *
 * Replaces the Phase 1 + Phase 3 interim arrangement (HoleStepperCombo
 * + ScorerStack) with proper per-scorer entry blocks that include
 * achievement-tag editing inside the Detail accordion. Phase 5 will
 * extend this by wiring the gear toggle into each accordion's header
 * via the `detailHeaderSlot` prop.
 *
 * Lives in `src/components/round/` (not `scoring/`) because it's
 * scoped to the round-detail surface and reads through the round +
 * tags hooks, not the scoring screen's local state.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScoreEntryAccordion } from './ScoreEntryAccordion';
import { HoleStepperCombo } from '@/components/scoring/HoleStepperCombo';
import { type AvatarMember } from '@/components/scoring/TeamAvatarCluster';
import {
  effectiveEnabledTags,
} from '@/library/golf/achievementTags';
import { findTee } from '@/library/golf/courseHelpers';
import { formatScore, playerProgress } from '@/library/golf/scoring';
import { useParticipantResolver } from '@/library/golf/useParticipantResolver';
import { useRoundAchievementTags } from '@/library/golf/useRoundAchievementTags';
import { useRoundShotAttributions } from '@/library/golf/useRoundShotAttributions';
import { useRoundTrackedStats } from '@/library/golf/useRoundTrackedStats';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round, Tee } from '@/types/golf';

type Props = {
  round: Round;
  currentHoleNumber: number;
  onChangeCurrentHole: (n: number) => void;
  onChangeScore?: (scorerId: string, holeNumber: number, strokes: number) => void;
};

type Scorer = {
  id: string;
  name: string;
  members: AvatarMember[];
};

export function ScoringHolesBody({
  round,
  currentHoleNumber,
  onChangeCurrentHole,
  onChangeScore,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resolver = useParticipantResolver(round.playerIds ?? []);
  const { getTags, toggleTag } = useRoundAchievementTags(round.id);
  const { getOverride, setOverride } = useRoundTrackedStats(round.id);
  const { getContributors, setContributors } = useRoundShotAttributions(
    round.id
  );

  const isScramble =
    round.scoringRule === 'scramble' && (round.teams?.length ?? 0) > 0;
  const isCompleted = !!round.completedAt;

  const scorers: Scorer[] = useMemo(() => {
    if (isScramble) {
      return (round.teams ?? []).map((team) => {
        const members: AvatarMember[] = team.playerIds.map((pid) => {
          const r = resolver.get(pid);
          return {
            id: pid,
            name: r?.displayName || 'Player',
            color: r?.avatarColor || colors.primary,
          };
        });
        return { id: team.id, name: team.name, members };
      });
    }
    return (round.playerIds ?? []).map((pid) => {
      const r = resolver.get(pid);
      const name = r?.displayName || 'Player';
      const color = r?.avatarColor || colors.primary;
      return {
        id: pid,
        name,
        members: [{ id: pid, name, color }],
      };
    });
  }, [
    isScramble,
    round.teams,
    round.playerIds,
    resolver,
    colors.primary,
  ]);

  function resolveScorerTee(scorerId: string): Tee | undefined {
    if (isScramble) {
      const team = round.teams?.find((t) => t.id === scorerId);
      const firstMember = team?.playerIds[0];
      if (!firstMember) return undefined;
      const p = round.participants.find(
        (q) => q.participantKey === firstMember
      );
      return findTee(round.course, p?.teeId);
    }
    const p = round.participants.find((q) => q.participantKey === scorerId);
    return findTee(round.course, p?.teeId);
  }

  // Strokes for each scorer at the current hole — drives the score
  // chip row's "active" highlight.
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
        const progress = playerProgress(round, s.id);
        const hasScores = progress.thru > 0;
        const runningText = hasScores ? formatScore(progress.rel) : 'E';
        const tone: 'over' | 'under' | 'even' = !hasScores
          ? 'even'
          : progress.rel > 0
            ? 'over'
            : progress.rel < 0
              ? 'under'
              : 'even';
        const thruText =
          !isCompleted && hasScores ? `THRU ${progress.thru}` : undefined;
        const tee = resolveScorerTee(s.id);
        const currentHoleScore = round.scores.find(
          (sc) => sc.scorerId === s.id && sc.holeNumber === currentHoleNumber
        );
        const tappedTags = getTags(s.id, currentHoleNumber);
        const override = getOverride(s.id);
        const enabledTags = effectiveEnabledTags(round.scoringRule, override);
        // Scramble shot-picker plumbing (no-op for stroke rounds).
        const contributorIds = isScramble
          ? getContributors(s.id, currentHoleNumber)
          : undefined;
        const teamMembers = isScramble ? s.members : undefined;

        return (
          <ScoreEntryAccordion
            key={s.id}
            members={s.members}
            name={s.name}
            scoreText={runningText}
            scoreTone={tone}
            scoreSub={thruText}
            tee={tee}
            holeNumber={currentHoleNumber}
            par={currentHole?.par ?? 0}
            strokes={currentHoleScore ? currentHoleScore.strokes : null}
            onChange={
              onChangeScore
                ? (strokes) => onChangeScore(s.id, currentHoleNumber, strokes)
                : undefined
            }
            scorerId={s.id}
            scoringRule={round.scoringRule}
            tappedTags={tappedTags}
            enabledTags={enabledTags}
            onToggleTag={(tagKey) => {
              void toggleTag(s.id, currentHoleNumber, tagKey);
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

function makeStyles(colors: ThemeColors) {
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
