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
  /**
   * Remove a round from the caller's history. Backend call to `leave_round`
   * RPC: flips the caller's claim row to 'not-claimed'. If the caller was
   * the last claimant, the cleanup trigger drops the round entirely. Either
   * way, the round vanishes from this device.
   */
  deleteRoundFromHistory: (roundId: string) => Promise<void>;
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

  // Track previous account for sign-out detection; same pattern as
  // PlayerContext. On sign-out, we clear cloud-cached state (rounds + custom
  // courses) but preserve catalog courses (they're static seed data).
  const prevAccountUserIdRef = useRef<string | null>(null);

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

  // Sign-out reset: when account transitions non-null -> null, wipe cloud-
  // cached rounds + custom courses. Catalog courses stay (they're static
  // seed data and have nothing to do with the user's account). currentRound
  // also clears so a signed-out user doesn't carry an in-flight round from
  // the previous session into anonymous mode.
  useEffect(() => {
    if (!hydrated || !accountHydrated) return;
    const prev = prevAccountUserIdRef.current;
    const curr = account?.userId ?? null;
    if (prev !== null && curr === null) {
      setCourses((prevCourses) => prevCourses.filter((c) => c.source === 'catalog'));
      setCompletedRounds([]);
      setCurrentRound(null);
      cloudCoursesSyncedAccountRef.current = null;
      cloudRoundsSyncedAccountRef.current = null;
    }
    prevAccountUserIdRef.current = curr;
  }, [account, accountHydrated, hydrated]);

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

  // ===========================================================================
  // Round sync (Phase D)
  //
  // Local Round shape uses local Player.ids in `playerIds` and `claims` keys.
  // Cloud rounds_table uses (a) local Player.ids preserved verbatim in
  // `player_ids` (jsonb string[]) so the scorer's participant list survives
  // round-trips, plus (b) `player_user_ids` (uuid[]) for the linked-friend
  // subset. Round_claims rows key claim status by `claimant_user_id` (UUID).
  //
  // We translate at the boundary:
  //   · Push: round.claims map (keyed by local Player.id) -> round_claims rows
  //     (keyed by claimant_user_id). Skip non-linked participants.
  //   · Pull: round_claims rows -> round.claims map by looking up the local
  //     Player whose `userId` matches the cloud claimant_user_id. Unlinked
  //     claimants on synced rounds (e.g., a friend Ben hasn't friended back)
  //     show up under a synthetic id we don't yet support; left for a follow-up.
  //
  // Subscriptions: we listen to all rounds + round_claims; RLS limits what
  // arrives. INSERT/UPDATE on rounds upserts local; DELETE removes local.
  // INSERT/UPDATE on round_claims patches the corresponding round's claims map;
  // DELETE clears it.
  // ===========================================================================
  const playerRosterRef = useRef(playerRoster);
  playerRosterRef.current = playerRoster;

  const completedRoundsRef = useRef(completedRounds);
  completedRoundsRef.current = completedRounds;

  const cloudRoundsSyncedAccountRef = useRef<string | null>(null);

  type CloudRoundRow = {
    id: string;
    owner_user_id: string;
    course_snapshot: Course;
    scoring_rule: ScoringRule;
    player_ids: string[];
    player_user_ids: string[];
    teams: Team[] | null;
    scores: RoundScore[];
    current_hole_number: number;
    started_at: string;
    completed_at: string | null;
  };

  type CloudClaimRow = {
    round_id: string;
    claimant_user_id: string;
    status: ClaimStatus;
  };

  /**
   * Map a (round, claims-for-this-round) pair into the local Round shape.
   * Translates cloud claimant_user_id -> local Player.id by lookup against
   * the current roster snapshot.
   */
  const cloudToLocalRound = useCallback(
    (row: CloudRoundRow, claimRows: CloudClaimRow[]): Round => {
      const claims: Record<string, ClaimStatus> = {};
      for (const claim of claimRows) {
        const localPlayer = playerRosterRef.current.find((p) => p.userId === claim.claimant_user_id);
        if (localPlayer) {
          claims[localPlayer.id] = claim.status;
        }
      }
      // ownerId in our local model is the local Player.id of the scorer.
      // For our own rounds that's the default player; for friends' rounds
      // the scorer maps to a roster entry we have for them (or undefined).
      const ownerLocal = playerRosterRef.current.find((p) => p.userId === row.owner_user_id);
      return {
        id: row.id,
        course: row.course_snapshot,
        scoringRule: row.scoring_rule,
        playerIds: row.player_ids,
        teams: row.teams ?? undefined,
        currentHoleNumber: row.current_hole_number,
        scores: row.scores,
        startedAt: row.started_at,
        completedAt: row.completed_at ?? undefined,
        claims: Object.keys(claims).length > 0 ? claims : undefined,
        ownerId: ownerLocal?.id,
      };
    },
    []
  );

  /**
   * Translate a local Round into the cloud row shape for INSERT/UPSERT.
   * `player_user_ids` is computed from the current roster: any participant
   * whose Player.userId is set (and is a real UUID) goes into the array.
   */
  const localToCloudRow = useCallback(
    (round: Round, ownerUserId: string) => {
      const playerUserIds: string[] = [];
      for (const pid of round.playerIds) {
        const p = playerRosterRef.current.find((q) => q.id === pid);
        if (p?.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.userId)) {
          playerUserIds.push(p.userId);
        }
      }
      return {
        id: round.id,
        owner_user_id: ownerUserId,
        course_snapshot: round.course,
        scoring_rule: round.scoringRule,
        player_ids: round.playerIds,
        player_user_ids: playerUserIds,
        teams: round.teams ?? null,
        scores: round.scores,
        current_hole_number: round.currentHoleNumber,
        started_at: round.startedAt,
        completed_at: round.completedAt ?? null,
      };
    },
    []
  );

  /**
   * Push a freshly-completed round (and any pending claim rows for linked
   * friends) to the cloud. The scorer's claim row is auto-seeded by the
   * `seed_scorer_claim` trigger, so we only insert the participants'.
   */
  const cloudUpsertRound = useCallback(
    async (round: Round) => {
      if (!account) return;
      const ownerUserId = account.userId;
      const { error: roundErr } = await supabase
        .from('rounds')
        .upsert(localToCloudRow(round, ownerUserId), { onConflict: 'id' });
      if (roundErr) {
        console.warn('[rounds] upsert failed:', roundErr);
        return;
      }
      // Insert pending claim rows for each linked-friend participant who isn't
      // already claimed (i.e., not the scorer). The trigger creates the
      // scorer's row automatically; we ON CONFLICT DO NOTHING so re-runs are
      // idempotent.
      const claimRows = (round.claims
        ? Object.entries(round.claims)
            .map(([localPlayerId, status]) => {
              const p = playerRosterRef.current.find((q) => q.id === localPlayerId);
              if (!p?.userId) return null;
              if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.userId)) return null;
              if (p.userId === ownerUserId) return null; // scorer; trigger handles
              return {
                round_id: round.id,
                claimant_user_id: p.userId,
                status,
              };
            })
            .filter((x): x is { round_id: string; claimant_user_id: string; status: ClaimStatus } => x !== null)
        : []);
      if (claimRows.length > 0) {
        const { error: claimErr } = await supabase
          .from('round_claims')
          .upsert(claimRows, { onConflict: 'round_id,claimant_user_id' });
        if (claimErr) console.warn('[rounds] claim upsert failed:', claimErr);
      }
    },
    [account, localToCloudRow]
  );

  /**
   * Push a single claim status change. Used by setRoundClaim.
   */
  const cloudUpsertClaim = useCallback(
    async (roundId: string, participantLocalId: string, status: ClaimStatus) => {
      if (!account) return;
      const p = playerRosterRef.current.find((q) => q.id === participantLocalId);
      if (!p?.userId) return;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.userId)) return;
      const { error } = await supabase
        .from('round_claims')
        .upsert(
          {
            round_id: roundId,
            claimant_user_id: p.userId,
            status,
          },
          { onConflict: 'round_id,claimant_user_id' }
        );
      if (error) console.warn('[rounds] claim upsert failed:', error);
    },
    [account]
  );

  /**
   * Server-side leave_round RPC. Flips caller's claim to 'not-claimed' and
   * cleanup trigger may drop the round entirely.
   */
  const cloudLeaveRound = useCallback(
    async (roundId: string) => {
      if (!account) return;
      const { error } = await supabase.rpc('leave_round', { target_round_id: roundId });
      if (error) console.warn('[rounds] leave_round failed:', error);
    },
    [account]
  );

  // Initial pull-and-merge for rounds + claims.
  useEffect(() => {
    if (!hydrated || !accountHydrated) return;
    if (!account) {
      cloudRoundsSyncedAccountRef.current = null;
      return;
    }
    if (cloudRoundsSyncedAccountRef.current === account.userId) return;

    let cancelled = false;
    const ownerUserId = account.userId;

    const sync = async () => {
      const [{ data: roundsData, error: roundsErr }, { data: claimsData, error: claimsErr }] =
        await Promise.all([
          supabase.from('rounds').select('*'),
          supabase.from('round_claims').select('*'),
        ]);

      if (roundsErr) {
        console.warn('[rounds] initial sync rounds pull failed:', roundsErr);
        return;
      }
      if (claimsErr) {
        console.warn('[rounds] initial sync claims pull failed:', claimsErr);
        return;
      }
      if (cancelled) return;

      const rounds = (roundsData ?? []) as CloudRoundRow[];
      const claims = (claimsData ?? []) as CloudClaimRow[];
      const claimsByRound = new Map<string, CloudClaimRow[]>();
      for (const c of claims) {
        const arr = claimsByRound.get(c.round_id) ?? [];
        arr.push(c);
        claimsByRound.set(c.round_id, arr);
      }

      const cloudById = new Map(rounds.map((r) => [r.id, r]));
      const localSnapshot = completedRoundsRef.current;

      // Merge: cloud wins for shared ids; local-only keeps local; cloud-only adds.
      const merged: Round[] = [];
      const seen = new Set<string>();
      for (const local of localSnapshot) {
        const cloud = cloudById.get(local.id);
        if (cloud) {
          merged.push(cloudToLocalRound(cloud, claimsByRound.get(cloud.id) ?? []));
          seen.add(cloud.id);
        } else {
          merged.push(local);
        }
      }
      for (const cloud of rounds) {
        if (seen.has(cloud.id)) continue;
        merged.push(cloudToLocalRound(cloud, claimsByRound.get(cloud.id) ?? []));
      }

      if (cancelled) return;
      setCompletedRounds(merged);

      // Push local-only rounds. Their corresponding claim rows for linked
      // friends get pushed too via cloudUpsertRound's logic.
      const localOnly = localSnapshot.filter((r) => !cloudById.has(r.id));
      for (const r of localOnly) {
        await cloudUpsertRound(r);
      }

      cloudRoundsSyncedAccountRef.current = ownerUserId;
    };

    sync();
    return () => {
      cancelled = true;
    };
  }, [account, hydrated, accountHydrated, cloudToLocalRound, cloudUpsertRound]);

  // Realtime subscriptions for rounds + round_claims.
  useEffect(() => {
    if (!account) return;

    const channel = supabase
      .channel('rounds-and-claims')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string })?.id;
            if (!oldId) return;
            setCompletedRounds((prev) => prev.filter((r) => r.id !== oldId));
            return;
          }
          const row = payload.new as CloudRoundRow;
          // Need claims for this round to populate the claims map.
          (async () => {
            const { data: claims } = await supabase
              .from('round_claims')
              .select('*')
              .eq('round_id', row.id);
            const claimRows = (claims ?? []) as CloudClaimRow[];
            const merged = cloudToLocalRound(row, claimRows);
            setCompletedRounds((prev) => {
              const i = prev.findIndex((r) => r.id === merged.id);
              if (i === -1) return [merged, ...prev];
              const next = prev.slice();
              next[i] = merged;
              return next;
            });
          })();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'round_claims' },
        (payload) => {
          const newRow = payload.new as CloudClaimRow | undefined;
          const oldRow = payload.old as CloudClaimRow | undefined;
          const roundId = newRow?.round_id ?? oldRow?.round_id;
          const claimantId = newRow?.claimant_user_id ?? oldRow?.claimant_user_id;
          if (!roundId || !claimantId) return;

          // Resolve the local Player.id whose userId matches.
          const localPlayer = playerRosterRef.current.find((p) => p.userId === claimantId);
          if (!localPlayer) return;

          setCompletedRounds((prev) =>
            prev.map((r) => {
              if (r.id !== roundId) return r;
              const nextClaims = { ...(r.claims ?? {}) };
              if (payload.eventType === 'DELETE') {
                delete nextClaims[localPlayer.id];
              } else if (newRow) {
                nextClaims[localPlayer.id] = newRow.status;
              }
              return {
                ...r,
                claims: Object.keys(nextClaims).length > 0 ? nextClaims : undefined,
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account, cloudToLocalRound]);

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
          // Fire-and-forget cloud push. Failures are warned but local state
          // is authoritative; a future re-sync will pick up missed pushes.
          void cloudUpsertRound(completedRound);
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
        void cloudUpsertClaim(roundId, participantId, status);
      },
      deleteRoundFromHistory: async (roundId) => {
        // Optimistic local removal. If the cloud RPC fails, the next sync
        // pull will restore the round.
        setCompletedRounds((prev) => prev.filter((r) => r.id !== roundId));
        await cloudLeaveRound(roundId);
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
      cloudUpsertRound,
      cloudUpsertClaim,
      cloudLeaveRound,
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
