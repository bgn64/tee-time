/**
 * Provides in-memory + AsyncStorage-persisted golf round state, plus the
 * Supabase wiring for the new (v6) participant-based round model.
 *
 * Persisted: `courses`, `currentRound`, `completedRounds` — survive app restarts.
 * Not persisted (transient): `pendingSelectedCourseId`.
 *
 * `hydrated` is exposed so the root layout can wait for storage reads before
 * un-blocking the splash screen.
 *
 * Cloud model (post-006 redesign):
 *   · `rounds` row carries owner_user_id, course_snapshot, scoring_rule,
 *     player_ids (jsonb string[] of local participant_keys), player_user_ids
 *     (uuid[]; recomputed by trigger from confirmed linked participants),
 *     teams, scores, started_at/completed_at, owner_participant_key.
 *   · `round_participants` rows describe each scoring line; their
 *     confirmation_status drives the new confirm/deny flow.
 *
 * All mutations on participants flow through RPCs (confirm_participation,
 * deny_participation, leave_round, update_score). Direct row writes are
 * only used to insert participant rows when a round is being completed
 * by the owner.
 */

import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { recentCourses as seededRecentCourses } from '@/data/courses';
import { useAccount } from '@/state/AccountContext';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { usePlayers } from '@/state/PlayerContext';
import { supabase } from '@/state/supabaseClient';
import {
  ConfirmationStatus,
  Course,
  Round,
  RoundParticipant,
  RoundScore,
  ScoringRule,
  Team,
} from '@/types/golf';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GolfRoundContextValue = {
  completedRounds: Round[];
  courses: Course[];
  currentRound: Round | null;
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
   * Mutate one (scorerId, hole) entry on a completed round. Optimistically
   * patches local state, then calls update_score; on RPC failure the change
   * is rolled back. Edit-rights are enforced server-side.
   */
  editHoleScore: (
    roundId: string,
    scorerId: string,
    holeNumber: number,
    strokes: number
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Confirm the caller's pending participation in a round. */
  confirmParticipation: (roundId: string) => Promise<void>;
  /** Deny the caller's pending participation in a round. */
  denyParticipation: (roundId: string) => Promise<void>;
  /** Remove the caller from a round (or leave-as-owner). */
  leaveRound: (roundId: string) => Promise<void>;
  /**
   * Rounds where the *current user* has a pending participant row.
   * Surfaced by the new Pending sub-section in the Rounds tab.
   */
  pendingRoundsForMe: Round[];
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

  const { allPlayers: playerRoster, defaultPlayerId } = usePlayers();
  const { account, hydrated: accountHydrated } = useAccount();

  const coursesRef = useRef(courses);
  coursesRef.current = courses;

  const cloudCoursesSyncedAccountRef = useRef<string | null>(null);
  const cloudRoundsSyncedAccountRef = useRef<string | null>(null);

  const prevAccountUserIdRef = useRef<string | null>(null);

  const playerRosterRef = useRef(playerRoster);
  playerRosterRef.current = playerRoster;

  const completedRoundsRef = useRef(completedRounds);
  completedRoundsRef.current = completedRounds;

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

  // Sign-out reset.
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

  // -- Cloud sync for courses (custom courses only) --
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
  // Round / participant sync
  // ===========================================================================

  type CloudRoundRow = {
    id: string;
    owner_user_id: string;
    owner_participant_key: string | null;
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

  type CloudParticipantRow = {
    round_id: string;
    participant_key: string;
    linked_user_id: string | null;
    confirmation_status: ConfirmationStatus;
    display_name: string;
    display_color: string | null;
    team_id: string | null;
  };

  const cloudToLocalRound = useCallback(
    (row: CloudRoundRow, participants: CloudParticipantRow[]): Round => {
      const ownerLocal = playerRosterRef.current.find((p) => p.userId === row.owner_user_id);
      return {
        id: row.id,
        course: row.course_snapshot,
        scoringRule: row.scoring_rule,
        playerIds: row.player_ids,
        teams: row.teams ?? undefined,
        currentHoleNumber: row.current_hole_number,
        scores: row.scores ?? [],
        startedAt: row.started_at,
        completedAt: row.completed_at ?? undefined,
        ownerUserId: row.owner_user_id,
        ownerId: ownerLocal?.id ?? row.owner_participant_key ?? undefined,
        participants: participants.map((p) => ({
          participantKey: p.participant_key,
          linkedUserId: p.linked_user_id ?? undefined,
          status: p.confirmation_status,
          displayName: p.display_name,
          displayColor: p.display_color ?? undefined,
          teamId: p.team_id ?? undefined,
        })),
      };
    },
    []
  );

  /**
   * Build participant rows for a freshly completed round, using the local
   * roster to capture display names and link state. The owner's row is
   * created server-side via the seed_owner_participant trigger; we only
   * push rows for the *other* participants.
   */
  const buildParticipantRows = useCallback(
    (round: Round, ownerUserId: string): Array<{
      round_id: string;
      participant_key: string;
      linked_user_id: string | null;
      confirmation_status: ConfirmationStatus;
      display_name: string;
      display_color: string | null;
      team_id: string | null;
    }> => {
      const rows: Array<{
        round_id: string;
        participant_key: string;
        linked_user_id: string | null;
        confirmation_status: ConfirmationStatus;
        display_name: string;
        display_color: string | null;
        team_id: string | null;
      }> = [];

      // Resolve teamId by searching round.teams[*].playerIds.
      const teamForPlayer = (playerId: string): string | null => {
        if (!round.teams) return null;
        const team = round.teams.find((t) => t.playerIds.includes(playerId));
        return team?.id ?? null;
      };

      for (const playerId of round.playerIds) {
        const p = playerRosterRef.current.find((q) => q.id === playerId);
        if (!p) continue;
        const isOwner = p.userId === ownerUserId;
        if (isOwner) continue; // owner row seeded by trigger

        const linkedUserId =
          p.userId && UUID_REGEX.test(p.userId) ? p.userId : null;

        rows.push({
          round_id: round.id,
          participant_key: playerId,
          linked_user_id: linkedUserId,
          confirmation_status: linkedUserId ? 'pending' : 'confirmed',
          display_name: p.nickname,
          display_color: p.color ?? null,
          team_id: teamForPlayer(playerId),
        });
      }
      return rows;
    },
    []
  );

  const cloudUpsertRound = useCallback(
    async (round: Round) => {
      if (!account) return;
      const ownerUserId = account.userId;

      // The owner_participant_key is the local Player.id of the scorer in
      // their own roster. We send it so the server's seed trigger creates
      // an owner participant row whose key matches the scoreboard's
      // `scorerId` for stroke rounds.
      const ownerLocalId = round.ownerId ?? defaultPlayerId ?? '';

      const playerUserIds: string[] = [];
      for (const pid of round.playerIds) {
        const p = playerRosterRef.current.find((q) => q.id === pid);
        if (p?.userId && UUID_REGEX.test(p.userId)) {
          playerUserIds.push(p.userId);
        }
      }

      const { data: roundData, error: roundErr } = await supabase
        .from('rounds')
        .upsert(
          {
            id: round.id,
            owner_user_id: ownerUserId,
            owner_participant_key: ownerLocalId || null,
            course_snapshot: round.course,
            scoring_rule: round.scoringRule,
            player_ids: round.playerIds,
            player_user_ids: playerUserIds,
            teams: round.teams ?? null,
            scores: round.scores,
            current_hole_number: round.currentHoleNumber,
            started_at: round.startedAt,
            completed_at: round.completedAt ?? null,
          },
          { onConflict: 'id' }
        )
        .select();
      if (roundErr) {
        console.warn('[rounds] upsert failed:', roundErr);
        return;
      }
      void roundData;

      const participantRows = buildParticipantRows(round, ownerUserId);
      if (participantRows.length > 0) {
        const { error: pErr } = await supabase
          .from('round_participants')
          .upsert(participantRows, { onConflict: 'round_id,participant_key' });
        if (pErr) console.warn('[rounds] participant upsert failed:', pErr);
      }
    },
    [account, defaultPlayerId, buildParticipantRows]
  );

  // Initial pull.
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
      const [{ data: roundsData, error: roundsErr }, { data: pData, error: pErr }] =
        await Promise.all([
          supabase.from('rounds').select('*'),
          supabase.from('round_participants').select('*'),
        ]);

      if (roundsErr) {
        console.warn('[rounds] initial sync rounds pull failed:', roundsErr);
        return;
      }
      if (pErr) {
        console.warn('[rounds] initial sync participants pull failed:', pErr);
        return;
      }
      if (cancelled) return;

      const rounds = (roundsData ?? []) as CloudRoundRow[];
      const participants = (pData ?? []) as CloudParticipantRow[];
      const byRound = new Map<string, CloudParticipantRow[]>();
      for (const p of participants) {
        const arr = byRound.get(p.round_id) ?? [];
        arr.push(p);
        byRound.set(p.round_id, arr);
      }

      const cloudById = new Map(rounds.map((r) => [r.id, r]));
      const localSnapshot = completedRoundsRef.current;

      const merged: Round[] = [];
      const seen = new Set<string>();
      for (const local of localSnapshot) {
        const cloud = cloudById.get(local.id);
        if (cloud) {
          merged.push(cloudToLocalRound(cloud, byRound.get(cloud.id) ?? []));
          seen.add(cloud.id);
        } else {
          merged.push(local);
        }
      }
      for (const cloud of rounds) {
        if (seen.has(cloud.id)) continue;
        merged.push(cloudToLocalRound(cloud, byRound.get(cloud.id) ?? []));
      }

      if (cancelled) return;
      setCompletedRounds(merged);

      // Push local-only rounds (and their participant rows).
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

  // Realtime subscriptions for rounds + round_participants.
  useEffect(() => {
    if (!account) return;

    const channel = supabase
      .channel('rounds-and-participants')
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
          (async () => {
            const { data: pRows } = await supabase
              .from('round_participants')
              .select('*')
              .eq('round_id', row.id);
            const merged = cloudToLocalRound(row, (pRows ?? []) as CloudParticipantRow[]);
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
        { event: '*', schema: 'public', table: 'round_participants' },
        (payload) => {
          const newRow = payload.new as CloudParticipantRow | undefined;
          const oldRow = payload.old as CloudParticipantRow | undefined;
          const roundId = newRow?.round_id ?? oldRow?.round_id;
          const participantKey = newRow?.participant_key ?? oldRow?.participant_key;
          if (!roundId || !participantKey) return;

          setCompletedRounds((prev) =>
            prev.map((r) => {
              if (r.id !== roundId) return r;
              const list = r.participants ? [...r.participants] : [];
              const i = list.findIndex((p) => p.participantKey === participantKey);
              if (payload.eventType === 'DELETE') {
                if (i !== -1) list.splice(i, 1);
              } else if (newRow) {
                const next: RoundParticipant = {
                  participantKey: newRow.participant_key,
                  linkedUserId: newRow.linked_user_id ?? undefined,
                  status: newRow.confirmation_status,
                  displayName: newRow.display_name,
                  displayColor: newRow.display_color ?? undefined,
                  teamId: newRow.team_id ?? undefined,
                };
                if (i === -1) list.push(next);
                else list[i] = next;
              }
              return { ...r, participants: list };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account, cloudToLocalRound]);

  // -- RPC wrappers --
  const callConfirm = useCallback(
    async (roundId: string) => {
      if (!account) return;
      const { error } = await supabase.rpc('confirm_participation', { p_round_id: roundId });
      if (error) console.warn('[rounds] confirm_participation:', error);
    },
    [account]
  );

  const callDeny = useCallback(
    async (roundId: string) => {
      if (!account) return;
      const { error } = await supabase.rpc('deny_participation', { p_round_id: roundId });
      if (error) console.warn('[rounds] deny_participation:', error);
    },
    [account]
  );

  const callLeave = useCallback(
    async (roundId: string) => {
      if (!account) return;
      const { error } = await supabase.rpc('leave_round', { p_round_id: roundId });
      if (error) console.warn('[rounds] leave_round:', error);
    },
    [account]
  );

  const callUpdateScore = useCallback(
    async (roundId: string, scorerId: string, hole: number, strokes: number) => {
      if (!account) return { ok: true as const };
      const { error } = await supabase.rpc('update_score', {
        p_round_id: roundId,
        p_scorer_id: scorerId,
        p_hole: hole,
        p_strokes: strokes,
      });
      if (error) {
        console.warn('[rounds] update_score:', error);
        return { ok: false as const, error: error.message };
      }
      return { ok: true as const };
    },
    [account]
  );

  // -- Derived state --
  const pendingRoundsForMe = useMemo(() => {
    if (!account) return [];
    return completedRounds.filter((r) =>
      r.participants?.some(
        (p) => p.linkedUserId === account.userId && p.status === 'pending'
      )
    );
  }, [completedRounds, account]);

  const value = useMemo<GolfRoundContextValue>(
    () => ({
      completedRounds,
      courses,
      currentRound,
      pendingSelectedCourseId,
      setPendingSelectedCourseId,
      hydrated,
      pendingRoundsForMe,
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
          ownerId: defaultPlayerId ?? undefined,
          ownerUserId: account?.userId,
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
          return {
            ...round,
            scores: replaceScore(round.scores, { scorerId, holeNumber, strokes }),
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
          return {
            ...round,
            scores: replaceScore(round.scores, {
              scorerId,
              holeNumber,
              strokes: Math.max(1, strokes),
            }),
          };
        });
      },
      goToPreviousHole: () => {
        setCurrentRound((round) => {
          if (!round) throw new Error('Cannot go to previous hole without a current round.');
          return {
            ...round,
            currentHoleNumber: Math.max(1, round.currentHoleNumber - 1),
          };
        });
      },
      goToNextHole: () => {
        setCurrentRound((round) => {
          if (!round) throw new Error('Cannot go to next hole without a current round.');
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

          // Build a local participants array so the round shows up correctly
          // before the cloud round-trip completes. Mirrors the rules used by
          // buildParticipantRows on the server side.
          const teamForPlayer = (playerId: string): string | undefined => {
            if (!round.teams) return undefined;
            return round.teams.find((t) => t.playerIds.includes(playerId))?.id;
          };
          const ownerUserId = account?.userId;
          const localParticipants: RoundParticipant[] = [];
          for (const playerId of round.playerIds) {
            const p = playerRoster.find((q) => q.id === playerId);
            if (!p) continue;
            const isOwner = ownerUserId && p.userId === ownerUserId;
            const linkedUserId =
              p.userId && UUID_REGEX.test(p.userId) ? p.userId : undefined;
            localParticipants.push({
              participantKey: playerId,
              linkedUserId,
              status: isOwner || !linkedUserId ? 'confirmed' : 'pending',
              displayName: p.nickname,
              displayColor: p.color,
              teamId: teamForPlayer(playerId),
            });
          }

          const completedRound: Round = {
            ...round,
            completedAt: new Date().toISOString(),
            ownerUserId: account?.userId,
            participants: localParticipants,
          };

          setCompletedRounds((rounds) => [completedRound, ...rounds]);
          void cloudUpsertRound(completedRound);
          return null;
        });
      },
      abandonCurrentRound: () => {
        setCurrentRound(null);
      },
      editHoleScore: async (roundId, scorerId, holeNumber, strokes) => {
        const safeStrokes = Math.max(1, strokes);
        const previous = completedRoundsRef.current.find((r) => r.id === roundId);
        // Optimistic update.
        setCompletedRounds((rounds) =>
          rounds.map((r) =>
            r.id === roundId
              ? {
                  ...r,
                  scores: replaceScore(r.scores, { scorerId, holeNumber, strokes: safeStrokes }),
                }
              : r
          )
        );
        const result = await callUpdateScore(roundId, scorerId, holeNumber, safeStrokes);
        if (!result.ok && previous) {
          // Roll back.
          setCompletedRounds((rounds) =>
            rounds.map((r) => (r.id === roundId ? previous : r))
          );
        }
        return result;
      },
      confirmParticipation: async (roundId) => {
        if (!account) return;
        // Optimistic local: flip caller's row to confirmed.
        setCompletedRounds((rounds) =>
          rounds.map((r) => {
            if (r.id !== roundId || !r.participants) return r;
            return {
              ...r,
              participants: r.participants.map((p) =>
                p.linkedUserId === account.userId ? { ...p, status: 'confirmed' } : p
              ),
            };
          })
        );
        await callConfirm(roundId);
      },
      denyParticipation: async (roundId) => {
        if (!account) return;
        // Optimistic local: drop caller's row entirely.
        setCompletedRounds((rounds) =>
          rounds.map((r) => {
            if (r.id !== roundId || !r.participants) return r;
            return {
              ...r,
              participants: r.participants.filter(
                (p) => p.linkedUserId !== account.userId
              ),
            };
          })
        );
        await callDeny(roundId);
      },
      leaveRound: async (roundId) => {
        // Optimistic local: drop the round from history.
        setCompletedRounds((rounds) => rounds.filter((r) => r.id !== roundId));
        await callLeave(roundId);
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
      account,
      pendingRoundsForMe,
      cloudUpsertCourse,
      cloudDeleteCourse,
      cloudUpsertRound,
      callConfirm,
      callDeny,
      callLeave,
      callUpdateScore,
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
