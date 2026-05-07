/**
 * Provides in-memory golf round state and actions for the prototype.
 */

import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { recentCourses as seededRecentCourses } from '@/data/courses';
import { Course, Round, RoundScore, ScoringRule, Team } from '@/types/golf';

type GolfRoundContextValue = {
  completedRounds: Round[];
  courses: Course[];
  currentRound: Round | null;
  // Transient hint set by new-course on save and consumed by Course Selection
  // on focus, so the freshly-created course can be pre-selected without
  // threading params through router.back().
  pendingSelectedCourseId: string | null;
  setPendingSelectedCourseId: (id: string | null) => void;
  addCourse: (course: Course) => void;
  startRound: (
    courseId: string,
    playerIds?: string[],
    scoringRule?: ScoringRule,
    teams?: Team[]
  ) => void;
  setHoleScore: (scorerId: string, holeNumber: number, relativeScore: number) => void;
  setCustomHoleScore: (scorerId: string, holeNumber: number, strokes: number) => void;
  goToPreviousHole: () => void;
  goToNextHole: () => void;
  completeCurrentRound: () => void;
  abandonCurrentRound: () => void;
};

const GolfRoundContext = createContext<GolfRoundContextValue | undefined>(undefined);

function replaceScore(scores: RoundScore[], nextScore: RoundScore) {
  const existingScoreIndex = scores.findIndex(
    (score) =>
      score.scorerId === nextScore.scorerId && score.holeNumber === nextScore.holeNumber
  );

  if (existingScoreIndex === -1) {
    return [...scores, nextScore];
  }

  return scores.map((score, index) => (index === existingScoreIndex ? nextScore : score));
}

export function GolfRoundProvider({ children }: PropsWithChildren) {
  const [courses, setCourses] = useState<Course[]>(seededRecentCourses);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [completedRounds, setCompletedRounds] = useState<Round[]>([]);
  const [pendingSelectedCourseId, setPendingSelectedCourseId] = useState<string | null>(null);

  const value = useMemo<GolfRoundContextValue>(
    () => ({
      completedRounds,
      courses,
      currentRound,
      pendingSelectedCourseId,
      setPendingSelectedCourseId,
      addCourse: (course) => {
        setCourses((prev) => [...prev, course]);
      },
      startRound: (courseId, playerIds = [], scoringRule = 'stroke', teams) => {
        const course = courses.find((c) => c.id === courseId);

        if (!course) {
          throw new Error(`Cannot start round for unknown course: ${courseId}`);
        }

        setCurrentRound({
          id: `round-${Date.now()}`,
          course,
          scoringRule,
          playerIds,
          teams,
          currentHoleNumber: 1,
          scores: [],
          startedAt: new Date().toISOString(),
        });
      },
      setHoleScore: (scorerId, holeNumber, relativeScore) => {
        setCurrentRound((round) => {
          if (!round) {
            throw new Error('Cannot set score without a current round.');
          }

          const hole = round.course.holes.find((courseHole) => courseHole.number === holeNumber);

          if (!hole) {
            throw new Error(`Cannot set score for unknown hole: ${holeNumber}`);
          }

          const strokes = Math.max(1, hole.par + relativeScore);
          const nextScore = { scorerId, holeNumber, strokes };

          return {
            ...round,
            scores: replaceScore(round.scores, nextScore),
          };
        });
      },
      setCustomHoleScore: (scorerId, holeNumber, strokes) => {
        setCurrentRound((round) => {
          if (!round) {
            throw new Error('Cannot set custom score without a current round.');
          }

          const hasHole = round.course.holes.some((courseHole) => courseHole.number === holeNumber);

          if (!hasHole) {
            throw new Error(`Cannot set custom score for unknown hole: ${holeNumber}`);
          }

          const nextScore = { scorerId, holeNumber, strokes: Math.max(1, strokes) };

          return {
            ...round,
            scores: replaceScore(round.scores, nextScore),
          };
        });
      },
      goToPreviousHole: () => {
        setCurrentRound((round) => {
          if (!round) {
            throw new Error('Cannot go to previous hole without a current round.');
          }

          return {
            ...round,
            currentHoleNumber: Math.max(1, round.currentHoleNumber - 1),
          };
        });
      },
      goToNextHole: () => {
        setCurrentRound((round) => {
          if (!round) {
            throw new Error('Cannot go to next hole without a current round.');
          }

          return {
            ...round,
            currentHoleNumber: Math.min(round.course.holes.length, round.currentHoleNumber + 1),
          };
        });
      },
      completeCurrentRound: () => {
        setCurrentRound((round) => {
          if (!round) {
            throw new Error('Cannot complete a round when no current round exists.');
          }

          const completedRound = {
            ...round,
            completedAt: new Date().toISOString(),
          };

          setCompletedRounds((rounds) => [completedRound, ...rounds]);
          return null;
        });
      },
      abandonCurrentRound: () => {
        // Discards the in-flight round entirely; nothing is persisted to history.
        setCurrentRound(null);
      },
    }),
    [completedRounds, courses, currentRound, pendingSelectedCourseId]
  );

  return <GolfRoundContext.Provider value={value}>{children}</GolfRoundContext.Provider>;
}

export function useGolfRound() {
  const context = useContext(GolfRoundContext);

  if (!context) {
    throw new Error('useGolfRound must be used inside GolfRoundProvider.');
  }

  return context;
}
