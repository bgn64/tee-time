/**
 * Round context — the Score tab's state hub (Supabase REST + React Query).
 *
 * Reads the user's currently-open scorecard + its per-cell score rows via
 * React Query and re-projects them as an in-memory `Round` for screens.
 *
 * Writes:
 *   - Score entry (`setScoreForRound`/`setCustomHoleScore`) is the
 *     offline-critical path: it optimistically updates the React Query cache
 *     and enqueues an idempotent upsert in the persistent write OUTBOX, so a
 *     stroke entered in a dead zone is never lost and flushes on reconnect.
 *   - Round setup/teardown (start, hole range, participant tees, complete,
 *     abandon, delete) optimistically update the cache and write directly to
 *     Supabase. These flows already require connectivity (course search,
 *     etc.), so they are online operations.
 *
 * jsonb columns (course_snapshot, participants, player_ids, teams,
 * enabled_stat_keys, tracked_scorer_ids) are returned by PostgREST as native
 * objects/arrays and written as objects — no TEXT/JSON-string boundary.
 *
 * Hydration flags (`roundHydrated`, `currentHoleHydrated`) are exposed so
 * setup screens don't bounce a user with an in-flight round back to
 * course-picking during the initial query gap. Per-device current hole is
 * persisted in AsyncStorage (see currentHoleStore), unchanged.
 */

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { enqueueWrite } from '@/library/data/writeOutbox';
import { supabase } from '@/library/supabase/client';
import { defaultTeeIdForCourse } from './courseHelpers';
import {
  clearCurrentHoleForScorecard,
  readCurrentHole,
  writeCurrentHole,
} from './currentHoleStore';
import { newRoundId, newScoreId } from './ids';
import { parseParticipantKey } from './participantKey';
import { holesInRange } from './scoring';
import type {
  Course,
  HoleRange,
  Round,
  RoundParticipant,
  RoundScore,
  ScoringRule,
  Team,
} from '@/types/golf';

const SCORECARDS_TABLE = 'scorecards';
const SCORECARD_SCORES_TABLE = 'scorecard_scores';
const CUSTOM_PLAYERS_TABLE = 'custom_players';

type ScorecardRow = {
  id: string;
  owner_user_id: string | null;
  course_id: string | null;
  course_snapshot: Course | null;
  scoring_rule: string | null;
  player_ids: string[] | null;
  participants: RoundParticipant[] | null;
  teams: Team[] | null;
  hole_range: string | null;
  enabled_stat_keys: string[] | null;
  tracked_scorer_ids: string[] | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

type ScoreRow = {
  id: string;
  scorecard_id: string | null;
  scorer_id: string | null;
  hole_number: number | null;
  strokes: number | null;
  owner_user_id: string | null;
  updated_at: string | null;
};

type RoundContextValue = {
  currentRound: Round | null;
  roundHydrated: boolean;
  currentHoleHydrated: boolean;
  userId: string | null;
  startRound: (input: {
    course: Course;
    playerIds: string[];
    holeRange?: HoleRange;
    teeIds?: Record<string, string | undefined>;
    scoringRule?: ScoringRule;
    teams?: Team[];
    enabledStatKeys?: readonly string[];
    trackedScorerIds?: readonly string[];
  }) => Promise<string>;
  setCustomHoleScore: (scorerId: string, holeNumber: number, strokes: number) => Promise<void>;
  setScoreForRound: (
    roundId: string,
    scorerId: string,
    holeNumber: number,
    strokes: number
  ) => Promise<void>;
  setCurrentHole: (holeNumber: number) => Promise<void>;
  setHoleRange: (range: HoleRange) => Promise<void>;
  setParticipantTee: (participantKey: string, teeId: string | undefined) => Promise<void>;
  setParticipantTees: (updates: { participantKey: string; teeId: string | undefined }[]) => Promise<void>;
  setParticipantTeesForRound: (
    roundId: string,
    updates: { participantKey: string; teeId: string | undefined }[]
  ) => Promise<void>;
  completeCurrentRound: () => Promise<void>;
  abandonCurrentRound: () => Promise<void>;
  deleteRound: (id: string) => Promise<void>;
};

const RoundContext = createContext<RoundContextValue | null>(null);

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function openScorecardKey(userId: string | null) {
  return ['scorecards', 'open', userId] as const;
}

function scoresKey(scorecardId: string | null) {
  return ['scorecard_scores', scorecardId] as const;
}

export function RoundProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [currentHole, setCurrentHoleState] = useState<number>(1);
  const [hydratedHoleKey, setHydratedHoleKey] = useState<string | null>(null);

  // Resolve current user id on mount + on auth change via the shared client.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) setUserId(session?.user?.id ?? null);
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Open (in-progress) scorecard owned by the signed-in user. Friends'
  // in-progress rounds are excluded by the owner filter + RLS.
  const { data: scorecardData, isLoading: scorecardLoading } = useQuery<ScorecardRow | null>({
    queryKey: openScorecardKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(SCORECARDS_TABLE)
        .select('*')
        .is('completed_at', null)
        .eq('owner_user_id', userId as string)
        .order('started_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as ScorecardRow | undefined) ?? null;
    },
  });
  const scorecardRow = scorecardData ?? null;
  const scorecardId = scorecardRow?.id ?? null;

  const { data: scoreData, isLoading: scoresLoading } = useQuery<ScoreRow[]>({
    queryKey: scoresKey(scorecardId),
    enabled: !!scorecardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(SCORECARD_SCORES_TABLE)
        .select('*')
        .eq('scorecard_id', scorecardId as string);
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
  });
  const scoreRows = useMemo<ScoreRow[]>(() => scoreData ?? [], [scoreData]);

  const roundHydrated = !scorecardLoading && (!scorecardId || !scoresLoading);

  // Per-device current hole, hydrated from AsyncStorage when the active
  // scorecard id changes. Unchanged from the PowerSync implementation.
  const holeKey = `${userId ?? ''}:${scorecardId ?? ''}`;
  const currentHoleHydrated = hydratedHoleKey === holeKey;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId || !scorecardId) {
        if (!cancelled) {
          setCurrentHoleState(1);
          setHydratedHoleKey(`${userId ?? ''}:${scorecardId ?? ''}`);
        }
        return;
      }
      const stored = await readCurrentHole(userId, scorecardId);
      if (!cancelled) {
        setCurrentHoleState(stored ?? 1);
        setHydratedHoleKey(`${userId}:${scorecardId}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, scorecardId]);

  const currentRound: Round | null = useMemo(() => {
    if (!scorecardRow) return null;
    const course = scorecardRow.course_snapshot;
    if (!course) return null;
    const scores: RoundScore[] = scoreRows.map((r) => ({
      scorerId: r.scorer_id ?? '',
      holeNumber: Number(r.hole_number ?? 0),
      strokes: Number(r.strokes ?? 0),
    }));
    return {
      id: scorecardRow.id,
      ownerUserId: scorecardRow.owner_user_id ?? undefined,
      course,
      scoringRule: (scorecardRow.scoring_rule as ScoringRule) ?? 'stroke',
      playerIds: asArray<string>(scorecardRow.player_ids),
      participants: asArray<RoundParticipant>(scorecardRow.participants),
      teams: asArray<Team>(scorecardRow.teams),
      holeRange: (scorecardRow.hole_range as HoleRange) ?? 'all',
      currentHoleNumber: currentHole,
      scores,
      startedAt: scorecardRow.started_at ?? new Date().toISOString(),
      lastScoreAt: scorecardRow.updated_at ?? undefined,
      completedAt: scorecardRow.completed_at ?? undefined,
      enabledStatKeys: asArray<string>(scorecardRow.enabled_stat_keys),
      trackedScorerIds: asArray<string>(scorecardRow.tracked_scorer_ids),
    };
  }, [scorecardRow, scoreRows, currentHole]);

  const scorecardIdRef = useRef<string | null>(null);
  useEffect(() => {
    scorecardIdRef.current = scorecardId;
  });

  const invalidateRoundLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['completed_scorecards'] });
    queryClient.invalidateQueries({ queryKey: ['completed_scores'] });
    queryClient.invalidateQueries({ queryKey: ['scorecard_stats'] });
    queryClient.invalidateQueries({ queryKey: ['feed_rounds'] });
    queryClient.invalidateQueries({ queryKey: ['round_detail'] });
  }, [queryClient]);

  const startRound = useCallback<RoundContextValue['startRound']>(
    async ({
      course,
      playerIds,
      holeRange = 'all',
      teeIds,
      scoringRule = 'stroke',
      teams,
      enabledStatKeys = [],
      trackedScorerIds = [],
    }) => {
      if (!userId) {
        throw new Error('You must be signed in to start a round.');
      }
      if (playerIds.length === 0) {
        throw new Error('Pick at least one player before starting a round.');
      }
      if (scoringRule === 'scramble') {
        if (!teams || teams.length === 0) {
          throw new Error('Scramble rounds need at least one team.');
        }
        if (teams.some((t) => t.playerIds.length === 0)) {
          throw new Error('Every scramble team needs at least one player.');
        }
      }
      const defaultTee = defaultTeeIdForCourse(course);

      const teamIdByParticipant = new Map<string, string>();
      if (scoringRule === 'scramble' && teams) {
        for (const team of teams) {
          for (const pid of team.playerIds) {
            teamIdByParticipant.set(pid, team.id);
          }
        }
      }

      // Snapshot custom-player nicknames + colors so a friend viewing the
      // round in their feed (where the owner's custom_players don't sync)
      // still sees the owner's nicknames.
      const customIds = playerIds
        .map((pid) => parseParticipantKey(pid))
        .filter((p) => p.kind === 'custom')
        .map((p) => (p as { kind: 'custom'; customPlayerId: string }).customPlayerId);
      const customSnapshots = new Map<string, { name: string; color: string }>();
      if (customIds.length > 0) {
        const { data } = await supabase
          .from(CUSTOM_PLAYERS_TABLE)
          .select('id, nickname, avatar_color')
          .in('id', customIds);
        for (const row of (data ?? []) as {
          id: string;
          nickname: string | null;
          avatar_color: string | null;
        }[]) {
          customSnapshots.set(row.id, {
            name: row.nickname ?? '',
            color: row.avatar_color ?? '',
          });
        }
      }

      const participants: RoundParticipant[] = playerIds.map((pid) => {
        const parsed = parseParticipantKey(pid);
        const explicit = teeIds ? teeIds[pid] : undefined;
        const teeId = explicit ?? (scoringRule === 'scramble' ? defaultTee : undefined);
        const teamId = teamIdByParticipant.get(pid);
        const base: RoundParticipant = { participantKey: pid, teeId };
        if (teamId) base.teamId = teamId;
        if (parsed.kind === 'custom') {
          const snap = customSnapshots.get(parsed.customPlayerId);
          base.localDisplayName = snap?.name;
          base.localDisplayColor = snap?.color;
        }
        return base;
      });

      const teamsToPersist: Team[] = scoringRule === 'scramble' && teams ? teams : [];

      const id = newRoundId();
      const now = new Date().toISOString();
      const row: ScorecardRow = {
        id,
        owner_user_id: userId,
        course_id: course.id,
        course_snapshot: course,
        scoring_rule: scoringRule,
        player_ids: playerIds,
        participants,
        teams: teamsToPersist,
        hole_range: holeRange,
        enabled_stat_keys: [...enabledStatKeys],
        tracked_scorer_ids: [...trackedScorerIds],
        started_at: now,
        completed_at: null,
        updated_at: now,
      };

      const { error } = await supabase.from(SCORECARDS_TABLE).insert(row);
      if (error) throw error;

      queryClient.setQueryData<ScorecardRow | null>(openScorecardKey(userId), row);
      queryClient.setQueryData<ScoreRow[]>(scoresKey(id), []);
      await writeCurrentHole(userId, id, 1);
      setCurrentHoleState(1);
      return id;
    },
    [queryClient, userId]
  );

  const setScoreForRound = useCallback<RoundContextValue['setScoreForRound']>(
    async (roundId, scorerId, holeNumber, strokes) => {
      if (!roundId || !userId) return;
      if (!Number.isFinite(strokes) || strokes < 1) return;
      const now = new Date().toISOString();

      // Resolve a stable row id from the cache so an upsert never churns the
      // PK of an existing cell (and so rapid taps on the same cell coalesce
      // in the outbox, which dedups by entry id).
      const cachedScores = queryClient.getQueryData<ScoreRow[]>(scoresKey(roundId)) ?? [];
      const existing = cachedScores.find(
        (s) => s.scorer_id === scorerId && s.hole_number === holeNumber
      );
      const scoreId = existing?.id ?? newScoreId();

      queryClient.setQueryData<ScoreRow[]>(scoresKey(roundId), (old) => {
        const arr = old ? [...old] : [];
        const idx = arr.findIndex(
          (s) => s.scorer_id === scorerId && s.hole_number === holeNumber
        );
        const next: ScoreRow = {
          id: scoreId,
          scorecard_id: roundId,
          scorer_id: scorerId,
          hole_number: holeNumber,
          strokes,
          owner_user_id: userId,
          updated_at: now,
        };
        if (idx >= 0) arr[idx] = next;
        else arr.push(next);
        return arr;
      });
      // Optimistically bump the open scorecard's activity timestamp.
      queryClient.setQueryData<ScorecardRow | null>(openScorecardKey(userId), (old) =>
        old && old.id === roundId ? { ...old, updated_at: now } : old
      );

      await enqueueWrite({
        id: scoreId,
        table: SCORECARD_SCORES_TABLE,
        op: 'upsert',
        payload: {
          id: scoreId,
          scorecard_id: roundId,
          scorer_id: scorerId,
          hole_number: holeNumber,
          strokes,
          owner_user_id: userId,
          updated_at: now,
        },
        onConflict: 'scorecard_id,scorer_id,hole_number',
        queryKeys: [[...scoresKey(roundId)]],
      });

      // Best-effort online bump of the parent activity timestamp (drives the
      // live-feed sort). Lost offline is harmless — friends only see live
      // updates when online anyway, and the next online write re-bumps it.
      void supabase
        .from(SCORECARDS_TABLE)
        .update({ updated_at: now })
        .eq('id', roundId)
        .then(
          () => undefined,
          () => undefined
        );
    },
    [queryClient, userId]
  );

  const setCustomHoleScore = useCallback<RoundContextValue['setCustomHoleScore']>(
    async (scorerId, holeNumber, strokes) => {
      const id = scorecardIdRef.current;
      if (!id) return;
      await setScoreForRound(id, scorerId, holeNumber, strokes);
    },
    [setScoreForRound]
  );

  const setCurrentHole = useCallback<RoundContextValue['setCurrentHole']>(
    async (holeNumber) => {
      const id = scorecardIdRef.current;
      if (!Number.isFinite(holeNumber) || holeNumber < 1) return;
      setCurrentHoleState(holeNumber);
      if (userId && id) {
        await writeCurrentHole(userId, id, holeNumber);
      }
    },
    [userId]
  );

  const setHoleRange = useCallback<RoundContextValue['setHoleRange']>(
    async (range) => {
      const id = scorecardIdRef.current;
      if (!id) return;
      const now = new Date().toISOString();
      queryClient.setQueryData<ScorecardRow | null>(openScorecardKey(userId), (old) =>
        old && old.id === id ? { ...old, hole_range: range, updated_at: now } : old
      );
      const { error } = await supabase
        .from(SCORECARDS_TABLE)
        .update({ hole_range: range, updated_at: now })
        .eq('id', id);
      if (error) {
        queryClient.invalidateQueries({ queryKey: openScorecardKey(userId) });
      }
      if (currentRound) {
        const holes = holesInRange(currentRound.course.holes, range).map((h) => h.number);
        if (holes.length > 0 && !holes.includes(currentHole)) {
          await setCurrentHole(holes[0]);
        }
      }
    },
    [queryClient, userId, currentRound, currentHole, setCurrentHole]
  );

  const setParticipantTeesForRound = useCallback<
    RoundContextValue['setParticipantTeesForRound']
  >(
    async (roundId, updates) => {
      if (!roundId || updates.length === 0) return;
      const updateByKey = new Map(updates.map((u) => [u.participantKey, u.teeId]));
      const now = new Date().toISOString();

      const open = queryClient.getQueryData<ScorecardRow | null>(openScorecardKey(userId));
      let participants: RoundParticipant[];
      if (open && open.id === roundId) {
        participants = asArray<RoundParticipant>(open.participants);
      } else {
        const { data } = await supabase
          .from(SCORECARDS_TABLE)
          .select('participants')
          .eq('id', roundId)
          .maybeSingle();
        participants = asArray<RoundParticipant>(
          (data as { participants: RoundParticipant[] | null } | null)?.participants
        );
      }
      const nextParticipants = participants.map((p) =>
        updateByKey.has(p.participantKey)
          ? { ...p, teeId: updateByKey.get(p.participantKey) }
          : p
      );

      if (open && open.id === roundId) {
        queryClient.setQueryData<ScorecardRow | null>(openScorecardKey(userId), (old) =>
          old && old.id === roundId
            ? { ...old, participants: nextParticipants, updated_at: now }
            : old
        );
      }
      const { error } = await supabase
        .from(SCORECARDS_TABLE)
        .update({ participants: nextParticipants, updated_at: now })
        .eq('id', roundId);
      if (error) {
        if (open && open.id === roundId) {
          queryClient.invalidateQueries({ queryKey: openScorecardKey(userId) });
        }
        throw error;
      }
      invalidateRoundLists();
    },
    [queryClient, userId, invalidateRoundLists]
  );

  const setParticipantTee = useCallback<RoundContextValue['setParticipantTee']>(
    async (participantKey, teeId) => {
      const id = scorecardIdRef.current;
      if (!id) return;
      await setParticipantTeesForRound(id, [{ participantKey, teeId }]);
    },
    [setParticipantTeesForRound]
  );

  const setParticipantTees = useCallback<RoundContextValue['setParticipantTees']>(
    async (updates) => {
      const id = scorecardIdRef.current;
      if (!id) return;
      await setParticipantTeesForRound(id, updates);
    },
    [setParticipantTeesForRound]
  );

  const completeCurrentRound = useCallback<RoundContextValue['completeCurrentRound']>(
    async () => {
      const id = scorecardIdRef.current;
      if (!id) return;
      const now = new Date().toISOString();
      const prevOpen = queryClient.getQueryData<ScorecardRow | null>(
        openScorecardKey(userId)
      );
      queryClient.setQueryData<ScorecardRow | null>(openScorecardKey(userId), null);
      const { error } = await supabase
        .from(SCORECARDS_TABLE)
        .update({ completed_at: now, updated_at: now })
        .eq('id', id);
      if (error) {
        queryClient.setQueryData<ScorecardRow | null>(openScorecardKey(userId), prevOpen);
        throw error;
      }
      if (userId) {
        await clearCurrentHoleForScorecard(userId, id);
      }
      invalidateRoundLists();
    },
    [queryClient, userId, invalidateRoundLists]
  );

  const abandonCurrentRound = useCallback<RoundContextValue['abandonCurrentRound']>(
    async () => {
      const id = scorecardIdRef.current;
      if (!id) return;
      const prevOpen = queryClient.getQueryData<ScorecardRow | null>(
        openScorecardKey(userId)
      );
      queryClient.setQueryData<ScorecardRow | null>(openScorecardKey(userId), null);
      queryClient.removeQueries({ queryKey: scoresKey(id) });
      try {
        const scoresDel = await supabase
          .from(SCORECARD_SCORES_TABLE)
          .delete()
          .eq('scorecard_id', id);
        if (scoresDel.error) throw scoresDel.error;
        const cardDel = await supabase.from(SCORECARDS_TABLE).delete().eq('id', id);
        if (cardDel.error) throw cardDel.error;
      } catch (e) {
        queryClient.setQueryData<ScorecardRow | null>(openScorecardKey(userId), prevOpen);
        queryClient.invalidateQueries({ queryKey: scoresKey(id) });
        throw e;
      }
      if (userId) {
        await clearCurrentHoleForScorecard(userId, id);
      }
    },
    [queryClient, userId]
  );

  const deleteRound = useCallback<RoundContextValue['deleteRound']>(
    async (id) => {
      if (!id || !userId) return;
      const scoresDel = await supabase
        .from(SCORECARD_SCORES_TABLE)
        .delete()
        .eq('scorecard_id', id)
        .eq('owner_user_id', userId);
      if (scoresDel.error) throw scoresDel.error;
      const cardDel = await supabase
        .from(SCORECARDS_TABLE)
        .delete()
        .eq('id', id)
        .eq('owner_user_id', userId);
      if (cardDel.error) throw cardDel.error;
      await clearCurrentHoleForScorecard(userId, id);
      invalidateRoundLists();
    },
    [userId, invalidateRoundLists]
  );

  const value = useMemo<RoundContextValue>(
    () => ({
      currentRound,
      roundHydrated,
      currentHoleHydrated,
      userId,
      startRound,
      setCustomHoleScore,
      setScoreForRound,
      setCurrentHole,
      setHoleRange,
      setParticipantTee,
      setParticipantTees,
      setParticipantTeesForRound,
      completeCurrentRound,
      abandonCurrentRound,
      deleteRound,
    }),
    [
      currentRound,
      roundHydrated,
      currentHoleHydrated,
      userId,
      startRound,
      setCustomHoleScore,
      setScoreForRound,
      setCurrentHole,
      setHoleRange,
      setParticipantTee,
      setParticipantTees,
      setParticipantTeesForRound,
      completeCurrentRound,
      abandonCurrentRound,
      deleteRound,
    ]
  );

  return <RoundContext.Provider value={value}>{children}</RoundContext.Provider>;
}

export function useRound(): RoundContextValue {
  const ctx = useContext(RoundContext);
  if (!ctx) {
    throw new Error('useRound must be used within a <RoundProvider>.');
  }
  return ctx;
}