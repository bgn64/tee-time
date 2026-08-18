import { useMemo } from 'react';

import { findTee } from './courseHelpers';
import { computeWhsHandicap } from './handicap';
import { parseParticipantKey } from './participantKey';
import {
  getScorerProgress,
  holesInRange,
  scorerIdForUser,
} from './scoring';
import { getHoleStats } from './teeGrouping';
import { usePlayerCompletedRounds } from './useCompletedRounds';
import type { ThemeColors } from '@/library/theme/themes';
import type { Round } from '@/types/golf';

export type PerformanceTone = 'good' | 'steady' | 'bad' | 'neutral';

export type PerformanceBenchmark = {
  tone: PerformanceTone;
  targetRelative: number | null;
  scoringAverageGross: number | null;
  grossScore: number | null;
};

const MIN_AVERAGE_ROUNDS = 3;
const BENCHMARK_HISTORY_LIMIT = 20;

export function userIdForScorer(round: Round, scorerId: string | undefined): string | null {
  if (!scorerId) return null;
  if (round.scoringRule === 'stroke') {
    const parsed = parseParticipantKey(scorerId);
    return parsed.kind === 'user' ? parsed.userId : null;
  }
  const team = round.teams?.find((candidate) => candidate.id === scorerId);
  for (const participantKey of team?.playerIds ?? []) {
    const parsed = parseParticipantKey(participantKey);
    if (parsed.kind === 'user') return parsed.userId;
  }
  return null;
}

export function performanceToneColor(
  colors: ThemeColors,
  tone: PerformanceTone
): string {
  if (tone === 'good') return colors.performanceGood;
  if (tone === 'steady') return colors.performanceSteady;
  if (tone === 'bad') return colors.performanceBad;
  return colors.textTitle;
}

export function useRoundPerformance(
  round: Round,
  scorerId: string | undefined,
  userId: string | null
): PerformanceBenchmark {
  const { rounds } = usePlayerCompletedRounds(userId, BENCHMARK_HISTORY_LIMIT);
  return useMemo(
    () => buildPerformanceBenchmark(round, scorerId, userId, rounds),
    [round, scorerId, userId, rounds]
  );
}

export function buildPerformanceBenchmark(
  round: Round,
  scorerId: string | undefined,
  userId: string | null,
  history: Round[]
): PerformanceBenchmark {
  const progress = getScorerProgress(round, scorerId);
  const grossScore = grossForScorer(round, scorerId);
  if (!scorerId || !userId || progress.thruCount === 0) {
    return {
      tone: 'neutral',
      targetRelative: null,
      scoringAverageGross: userId
        ? comparableAverageGross(round, history, userId)
        : null,
      grossScore,
    };
  }

  const priorRounds = history.filter((candidate) => candidate.id !== round.id);
  const handicapTarget = handicapTargetRelative(
    round,
    scorerId,
    userId,
    priorRounds
  );
  const averageTarget =
    handicapTarget == null
      ? historicalTargetRelative(round, userId, progress.thruCount, priorRounds)
      : null;
  const targetRelative = handicapTarget ?? averageTarget;

  return {
    tone: toneFor(progress.relativeScore, targetRelative),
    targetRelative,
    scoringAverageGross: comparableAverageGross(round, priorRounds, userId),
    grossScore,
  };
}

function toneFor(actual: number, target: number | null): PerformanceTone {
  if (target == null) return 'neutral';
  const delta = actual - target;
  if (delta <= -1) return 'good';
  if (delta >= 1) return 'bad';
  return 'steady';
}

function handicapTargetRelative(
  round: Round,
  scorerId: string,
  userId: string,
  history: Round[]
): number | null {
  if (round.scoringRule !== 'stroke') return null;
  if (scorerIdForUser(round, userId) !== scorerId) return null;

  const index = computeWhsHandicap(history, userId).index;
  if (index == null) return null;

  const participant = round.participants.find(
    (candidate) => candidate.participantKey === `user:${userId}`
  );
  const tee = participant?.teeId
    ? findTee(round.course, participant.teeId)
    : undefined;
  if (!tee || tee.rating == null || tee.slope == null) return null;

  const holes = holesInRange(round.course.holes, round.holeRange);
  const parTotal = holes.reduce(
    (sum, hole) => sum + getHoleStats(tee, hole.number, hole).par,
    0
  );
  const courseHandicap = Math.round(
    index * (tee.slope / 113) + (tee.rating - parTotal)
  );
  const scored = new Set(
    round.scores
      .filter((score) => score.scorerId === scorerId && score.strokes > 0)
      .map((score) => score.holeNumber)
  );

  let target = 0;
  for (const hole of holes) {
    if (!scored.has(hole.number)) continue;
    const strokeIndex = getHoleStats(tee, hole.number, hole).handicapIndex;
    if (strokeIndex == null) return null;
    target += strokesReceived(strokeIndex, courseHandicap);
  }
  return target;
}

function historicalTargetRelative(
  round: Round,
  userId: string,
  thruCount: number,
  history: Round[]
): number | null {
  const totalHoles = holesInRange(round.course.holes, round.holeRange).length;
  const metrics = history
    .filter(
      (candidate) =>
        candidate.completedAt &&
        candidate.scoringRule === round.scoringRule &&
        holesInRange(candidate.course.holes, candidate.holeRange).length ===
          totalHoles
    )
    .map((candidate) => {
      const scorerId = scorerIdForUser(candidate, userId);
      const progress = getScorerProgress(candidate, scorerId);
      return progress.thruCount === totalHoles ? progress.relativeScore : null;
    })
    .filter((value): value is number => value != null);

  if (metrics.length < MIN_AVERAGE_ROUNDS || totalHoles === 0) return null;
  const average =
    metrics.reduce((sum, value) => sum + value, 0) / metrics.length;
  return average * (thruCount / totalHoles);
}

function comparableAverageGross(
  currentRound: Round,
  history: Round[],
  userId: string
): number | null {
  if (
    currentRound.scoringRule !== 'stroke' ||
    holesInRange(currentRound.course.holes, currentRound.holeRange).length !== 18
  ) {
    return null;
  }
  const totals = history
    .filter(
      (round) =>
        round.completedAt &&
        round.scoringRule === 'stroke' &&
        holesInRange(round.course.holes, round.holeRange).length === 18
    )
    .map((round) => {
      const scorerId = scorerIdForUser(round, userId);
      const progress = getScorerProgress(round, scorerId);
      if (progress.thruCount !== 18) return null;
      return grossForScorer(round, scorerId);
    })
    .filter((value): value is number => value != null);
  if (totals.length === 0) return null;
  return totals.reduce((sum, value) => sum + value, 0) / totals.length;
}

function grossForScorer(
  round: Round,
  scorerId: string | undefined
): number | null {
  if (!scorerId) return null;
  const allowed = new Set(
    holesInRange(round.course.holes, round.holeRange).map((hole) => hole.number)
  );
  const seen = new Set<number>();
  let total = 0;
  for (const score of round.scores) {
    if (
      score.scorerId !== scorerId ||
      !allowed.has(score.holeNumber) ||
      seen.has(score.holeNumber) ||
      score.strokes <= 0
    ) {
      continue;
    }
    seen.add(score.holeNumber);
    total += score.strokes;
  }
  return seen.size > 0 ? total : null;
}

function strokesReceived(strokeIndex: number, courseHandicap: number): number {
  if (courseHandicap >= 0) {
    const base = Math.floor(courseHandicap / 18);
    const remainder = courseHandicap - base * 18;
    return base + (strokeIndex <= remainder ? 1 : 0);
  }
  const give = -courseHandicap;
  const base = Math.floor(give / 18);
  const remainder = give - base * 18;
  return -(base + (strokeIndex > 18 - remainder ? 1 : 0));
}
