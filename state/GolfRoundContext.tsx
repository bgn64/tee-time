/**
 * Provides in-memory + AsyncStorage-persisted golf round state.
 *
 * Persisted: `courses`, `currentRound`, `completedRounds` — survive app restarts.
 * Not persisted (transient): `pendingSelectedCourseId`.
 *
 * `hydrated` is exposed so the root layout can wait for storage reads before
 * un-blocking the splash screen.
 */

import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { recentCourses as seededRecentCourses } from '@/data/courses';
import { useAccount } from '@/state/AccountContext';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { usePlayers } from '@/state/PlayerContext';
import { supabase } from '@/state/supabaseClient';
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

  const { account, hydrated: accountHydrated } = useAccount();

  const coursesRef = useRef(courses);
  coursesRef.current = courses;

  const cloudCoursesSyncedAccountRef = useRef<string | null>(null);

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

  // -- Cloud sync for courses (custom courses only; catalog stays local-only) --
  const cloudUpsertCourse = useCallback(
    async (course: Course) => {
      if (!account) return;
      if (course.source !== 'custom') return;
      const { error } = await supabase
        .from('courses')
        .upsert(
          {
            owner_user_id: account.userId,
            id: course.id,
            name: course.name,
            location: course.location,
            holes: course.holes,
            source: course.source,
          },
          { onConflict: 'owner_user_id,id' }
        );
      if (error) console.warn('[courses] upsert failed:', error);
    },
    [account]
  );

  const cloudDeleteCourse = useCallback(
    async (courseId: string) => {
      if (!account) return;
      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('owner_user_id', account.userId)
        .eq('id', courseId);
      if (error) console.warn('[courses] delete failed:', error);
    },
    [account]
  );

  // One-time-per-account initial sync for courses. Same merge model as
  // PlayerContext: cloud rows replace local for shared ids; local-only
  // custom rows get pushed up. Catalog rows are static and not synced.
  useEffect(() => {
    if (!hydrated || !accountHydrated) return;
    if (!account) {
      cloudCoursesSyncedAccountRef.current = null;
      return;
    }
    if (cloudCoursesSyncedAccountRef.current === account.userId) return;

    let cancelled = false;
    const ownerUserId = account.userId;

    const sync = async () => {
      const { data: cloudRowsRaw, error } = await supabase
        .from('courses')
        .select('id, name, location, holes, source')
        .eq('owner_user_id', ownerUserId);

      if (error) {
        console.warn('[courses] initial sync pull failed:', error);
        return;
      }
      if (cancelled) return;

      const cloudRows = (cloudRowsRaw ?? []) as Array<{
        id: string;
        name: string;
        location: string | null;
        holes: any;
        source: 'catalog' | 'custom';
      }>;
      const cloudById = new Map(cloudRows.map((r) => [r.id, r]));
      const localSnapshot = coursesRef.current;

      const merged: Course[] = [];
      const seenIds = new Set<string>();
      for (const local of localSnapshot) {
        const cloud = cloudById.get(local.id);
        if (cloud) {
          merged.push({
            id: cloud.id,
            name: cloud.name,
            location: cloud.location ?? '',
            holes: cloud.holes,
            source: cloud.source,
          });
          seenIds.add(cloud.id);
        } else {
          merged.push(local);
        }
      }
      for (const cloud of cloudRows) {
        if (seenIds.has(cloud.id)) continue;
        merged.push({
          id: cloud.id,
          name: cloud.name,
          location: cloud.location ?? '',
          holes: cloud.holes,
          source: cloud.source,
        });
      }

      if (cancelled) return;
      setCourses(merged);

      // Push local-only CUSTOM courses up. Catalog rows are static seed data
      // and don't belong in the per-user table.
      const localOnlyCustom = localSnapshot.filter(
        (c) => c.source === 'custom' && !cloudById.has(c.id)
      );
      if (localOnlyCustom.length > 0) {
        const { error: pushError } = await supabase.from('courses').upsert(
          localOnlyCustom.map((c) => ({
            owner_user_id: ownerUserId,
            id: c.id,
            name: c.name,
            location: c.location,
            holes: c.holes,
            source: c.source,
          })),
          { onConflict: 'owner_user_id,id' }
        );
        if (pushError) console.warn('[courses] initial sync push failed:', pushError);
      }

      cloudCoursesSyncedAccountRef.current = ownerUserId;
    };

    sync();
    return () => {
      cancelled = true;
    };
  }, [account, hydrated, accountHydrated]);

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
        void cloudUpsertCourse(course);
      },
      updateCourse: (courseId, patch) => {
        let updated: Course | undefined;
        setCourses((prev) =>
          prev.map((c) => {
            if (c.id !== courseId) return c;
            updated = { ...c, ...patch, id: c.id, source: c.source };
            return updated;
          })
        );
        if (updated) void cloudUpsertCourse(updated);
      },
      removeCourse: (courseId) => {
        setCourses((prev) => prev.filter((c) => c.id !== courseId));
        void cloudDeleteCourse(courseId);
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
      cloudUpsertCourse,
      cloudDeleteCourse,
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
