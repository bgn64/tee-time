/**
 * Provides in-memory + AsyncStorage-persisted golf round state.
 *
 * Persisted: `courses`, `currentRound`, `completedRounds` — survive app restarts.
 * Not persisted (transient): `pendingSelectedCourseId`.
 *
 * `hydrated` is exposed so the root layout can wait for storage reads before
 * un-blocking the splash screen.
 */

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { recentCourses as seededRecentCourses } from '@/data/courses';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { usePlayers } from '@/state/PlayerContext';
import { ClaimStatus, Course, Round, RoundScore, ScoringRule, Team } from '@/types/golf';

type GolfRoundContextValue = {
  completedRounds: Round[];
  courses: Course[];
  currentRound: Round | null;
  // Transient hint set by new-course on save and consumed by Course Selection
  // on focus, so the freshly-created course can be pre-selected without
  // threading params through router.back(). NOT persisted.
  pendingSelectedCourseId: string | null;
  setPendingSelectedCourseId: (id: string | null) => void;
  addCourse: (course: Course) => void;
  updateCourse: (courseId: string, patch: Partial<Omit<Course, 'id' | 'source'>>) => void;
  removeCourse: (courseId: string) => void;
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
  /**
   * Update a single per-participant claim entry on a completed round. Used
   * by the bulk-claim sheet, the auto-claim stub, and (eventually) Mike's
   * side claim/reject UI.
   */
  setRoundClaim: (roundId: string, participantId: string, status: ClaimStatus) => void;
  hydrated: boolean;
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
  const [hydrated, setHydrated] = useState(false);

  // Read-only roster snapshot used by completeCurrentRound to seed claim
  // entries for linked-friend participants. PlayerProvider wraps this
  // provider so the call is safe.
  const { allPlayers: playerRoster, defaultPlayerId } = usePlayers();

  // Hydrate from storage on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadJSON<Course[]>(STORAGE_KEYS.COURSES, seededRecentCourses),
      loadJSON<Round | null>(STORAGE_KEYS.CURRENT_ROUND, null),
      loadJSON<Round[]>(STORAGE_KEYS.COMPLETED_ROUNDS, []),
    ]).then(([loadedCourses, loadedCurrent, loadedCompleted]) => {
      if (cancelled) return;
      setCourses(loadedCourses);
      setCurrentRound(loadedCurrent);
      setCompletedRounds(loadedCompleted);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-key write effects (gated on hydration so we don't stomp stored data
  // with the seed on first render).
  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.COURSES, courses);
  }, [courses, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.CURRENT_ROUND, currentRound);
  }, [currentRound, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveJSON(STORAGE_KEYS.COMPLETED_ROUNDS, completedRounds);
  }, [completedRounds, hydrated]);

  const value = useMemo<GolfRoundContextValue>(
    () => ({
      completedRounds,
      courses,
      currentRound,
      pendingSelectedCourseId,
      setPendingSelectedCourseId,
      hydrated,
      addCourse: (course) => {
        setCourses((prev) => [...prev, course]);
      },
      updateCourse: (courseId, patch) => {
        setCourses((prev) =>
          prev.map((c) => (c.id === courseId ? { ...c, ...patch, id: c.id, source: c.source } : c))
        );
      },
      removeCourse: (courseId) => {
        setCourses((prev) => prev.filter((c) => c.id !== courseId));
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
          // The default player owns rounds they score. Once friends'
          // rounds start syncing in (real Supabase), inbound rounds will
          // arrive with their friend-owner ids preserved.
          ownerId: defaultPlayerId ?? undefined,
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

          // Seed pending claims for any participant who is currently linked
          // to a real account (Player.userId is set). The owner of the round
          // doesn't get a claim — their participation is self-evident.
          // For scramble rounds the claim is keyed by playerId still, with
          // semantics "yes, I was on this team."
          const claims: Record<string, ClaimStatus> = {};
          for (const playerId of round.playerIds) {
            if (playerId === defaultPlayerId) continue;
            const participant = playerRoster.find((p) => p.id === playerId);
            if (participant?.userId) {
              claims[playerId] = 'pending';
            }
          }

          const completedRound: Round = {
            ...round,
            completedAt: new Date().toISOString(),
            claims: Object.keys(claims).length > 0 ? claims : undefined,
          };

          setCompletedRounds((rounds) => [completedRound, ...rounds]);
          return null;
        });
      },
      abandonCurrentRound: () => {
        // Discards the in-flight round entirely; nothing is persisted to history.
        setCurrentRound(null);
      },
      setRoundClaim: (roundId, participantId, status) => {
        setCompletedRounds((rounds) =>
          rounds.map((r) => {
            if (r.id !== roundId) return r;
            const nextClaims = { ...(r.claims ?? {}), [participantId]: status };
            return { ...r, claims: nextClaims };
          })
        );
      },
    }),
    [
      completedRounds,
      courses,
      currentRound,
      pendingSelectedCourseId,
      hydrated,
      playerRoster,
      defaultPlayerId,
    ]
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
