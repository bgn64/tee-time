/**
 * Round context — the Score tab's state hub.
 *
 * Wraps PowerSync `useQuery` over the user's currently-open scorecard
 * + its per-cell score rows and re-projects them as an in-memory
 * `Round` object that screens/components consume. Mutations write
 * back through PowerSync's local SQLite; the connector replicates to
 * Supabase, and the sync rule replays the change down to any other
 * device signed in to the same account.
 *
 * Hydration flags (`roundHydrated`, `currentHoleHydrated`) are
 * exposed explicitly so setup screens don't bounce a user with an
 * in-flight round back to course-picking during the initial query
 * gap.
 *
 * JSON columns (`course_snapshot`, `participants`, `player_ids`) are
 * TEXT locally; we JSON.parse them defensively on the read path and
 * JSON.stringify on the write path. The upload connector
 * (`SupabaseConnector.uploadData`) re-parses them before posting to
 * Supabase so Postgres's `jsonb` columns receive objects, not quoted
 * strings.
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
import { useQuery } from '@powersync/react';

import {
  SCORECARDS_TABLE,
  SCORECARD_SCORES_TABLE,
  CUSTOM_PLAYERS_TABLE,
  type CustomPlayerRecord,
  ScorecardRecord,
  ScorecardScoreRecord,
} from '@/library/powersync/AppSchema';
import { useSystem } from '@/library/powersync/system';
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
} from '@/types/golf';

type RoundContextValue = {
  currentRound: Round | null;
  roundHydrated: boolean;
  currentHoleHydrated: boolean;
  userId: string | null;
  startRound: (input: {
    course: Course;
    playerIds: string[];
    holeRange?: HoleRange;
    /** Optional map of participantKey → teeId. Missing entries fall back to the course's first tee. */
    teeIds?: Record<string, string | undefined>;
  }) => Promise<string>;
  setCustomHoleScore: (scorerId: string, holeNumber: number, strokes: number) => Promise<void>;
  setCurrentHole: (holeNumber: number) => Promise<void>;
  setHoleRange: (range: HoleRange) => Promise<void>;
  setParticipantTee: (participantKey: string, teeId: string | undefined) => Promise<void>;
  completeCurrentRound: () => Promise<void>;
  abandonCurrentRound: () => Promise<void>;
};

const RoundContext = createContext<RoundContextValue | null>(null);

const SELECT_OPEN_SCORECARD_SQL = `
  SELECT * FROM ${SCORECARDS_TABLE}
  WHERE completed_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1
`;

function safeParse<T>(raw: string | null | undefined, fallback: T, label: string): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[RoundContext] Failed to parse ${label}; using fallback.`, e, raw);
    return fallback;
  }
}

export function RoundProvider({ children }: { children: ReactNode }) {
  const system = useSystem();
  const [userId, setUserId] = useState<string | null>(null);
  const [currentHole, setCurrentHoleState] = useState<number>(1);
  const [hydratedHoleKey, setHydratedHoleKey] = useState<string | null>(null);

  // Resolve current user id once on mount + whenever the auth state
  // changes. PowerSync's local SQLite is already filtered server-side
  // by `owner_user_id = request.user_id()`, so our queries don't need
  // a userId filter — we keep the id around for write-side bookkeeping
  // (denormalized owner_user_id columns + AsyncStorage namespacing).
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const id = await system.supabaseConnector.userId().catch(() => undefined);
      if (!cancelled) setUserId(id ?? null);
    };
    refresh();
    const { data } = system.supabaseConnector.client.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setUserId(session?.user?.id ?? null);
      }
    );
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [system]);

  const { data: scorecardRows, isLoading: scorecardLoading } = useQuery<ScorecardRecord>(
    SELECT_OPEN_SCORECARD_SQL
  );
  const scorecardRow = scorecardRows[0] ?? null;
  const scorecardId = scorecardRow?.id ?? null;

  const { data: scoreRows, isLoading: scoresLoading } = useQuery<ScorecardScoreRecord>(
    scorecardId
      ? `SELECT * FROM ${SCORECARD_SCORES_TABLE} WHERE scorecard_id = ?`
      : `SELECT * FROM ${SCORECARD_SCORES_TABLE} WHERE 1 = 0`,
    scorecardId ? [scorecardId] : []
  );

  const roundHydrated = !scorecardLoading && (!scorecardId || !scoresLoading);

  // Per-device current hole, hydrated from AsyncStorage whenever the
  // active scorecard id changes. Hydration completion is tracked via a
  // `hydratedHoleKey` (userId:scorecardId) string so the boolean is
  // derived during render instead of being set inside the effect.
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
    const course = safeParse<Course | null>(
      scorecardRow.course_snapshot,
      null,
      'scorecards.course_snapshot'
    );
    if (!course) return null;
    const participants = safeParse<RoundParticipant[]>(
      scorecardRow.participants,
      [],
      'scorecards.participants'
    );
    const playerIds = safeParse<string[]>(
      scorecardRow.player_ids,
      [],
      'scorecards.player_ids'
    );
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
      playerIds,
      participants,
      holeRange: (scorecardRow.hole_range as HoleRange) ?? 'all',
      currentHoleNumber: currentHole,
      scores,
      startedAt: scorecardRow.started_at ?? new Date().toISOString(),
      completedAt: scorecardRow.completed_at ?? undefined,
    };
  }, [scorecardRow, scoreRows, currentHole]);

  // Snapshot the latest scorecardId in a ref so callbacks don't capture
  // a stale value when the user races writes against a hydration tick.
  const scorecardIdRef = useRef<string | null>(null);
  useEffect(() => {
    scorecardIdRef.current = scorecardId;
  });

  const startRound = useCallback<RoundContextValue['startRound']>(
    async ({ course, playerIds, holeRange = 'all', teeIds }) => {
      if (!userId) {
        throw new Error('You must be signed in to start a round.');
      }
      if (playerIds.length === 0) {
        throw new Error('Pick at least one player before starting a round.');
      }
      const defaultTee = defaultTeeIdForCourse(course);

      // Snapshot custom-player nicknames + colors into the round
      // participants so a friend viewing the round in their feed
      // (where the owner's custom_players rows do NOT sync) still
      // sees the owner's nicknames. One small query, only against
      // the custom: participants in this specific round.
      const customIds = playerIds
        .map((pid) => parseParticipantKey(pid))
        .filter((p) => p.kind === 'custom')
        .map((p) => (p as { kind: 'custom'; customPlayerId: string }).customPlayerId);
      const customSnapshots = new Map<string, { name: string; color: string }>();
      if (customIds.length > 0) {
        const placeholders = customIds.map(() => '?').join(', ');
        const rows = await system.powersync.getAll<
          Pick<CustomPlayerRecord, 'nickname' | 'avatar_color'> & { id: string }
        >(
          `SELECT id, nickname, avatar_color FROM ${CUSTOM_PLAYERS_TABLE} WHERE id IN (${placeholders})`,
          customIds
        );
        for (const row of rows) {
          customSnapshots.set(row.id, {
            name: row.nickname ?? '',
            color: row.avatar_color ?? '',
          });
        }
      }

      const participants: RoundParticipant[] = playerIds.map((pid) => {
        const parsed = parseParticipantKey(pid);
        const teeId = teeIds && pid in teeIds ? teeIds[pid] : defaultTee;
        if (parsed.kind === 'custom') {
          const snap = customSnapshots.get(parsed.customPlayerId);
          return {
            participantKey: pid,
            teeId,
            localDisplayName: snap?.name,
            localDisplayColor: snap?.color,
          };
        }
        return { participantKey: pid, teeId };
      });

      const id = newRoundId();
      const now = new Date().toISOString();
      await system.powersync.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO ${SCORECARDS_TABLE}
             (id, owner_user_id, course_id, course_snapshot, scoring_rule,
              player_ids, participants, hole_range, started_at, completed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
          [
            id,
            userId,
            course.id,
            JSON.stringify(course),
            'stroke',
            JSON.stringify(playerIds),
            JSON.stringify(participants),
            holeRange,
            now,
            now,
          ]
        );
      });
      await writeCurrentHole(userId, id, 1);
      setCurrentHoleState(1);
      return id;
    },
    [system, userId]
  );

  const setCustomHoleScore = useCallback<RoundContextValue['setCustomHoleScore']>(
    async (scorerId, holeNumber, strokes) => {
      const id = scorecardIdRef.current;
      if (!id) return;
      if (!userId) return;
      if (!Number.isFinite(strokes) || strokes < 1) return;
      const now = new Date().toISOString();
      await system.powersync.writeTransaction(async (tx) => {
        const existing = await tx.getOptional<{ id: string }>(
          `SELECT id FROM ${SCORECARD_SCORES_TABLE}
           WHERE scorecard_id = ? AND scorer_id = ? AND hole_number = ?`,
          [id, scorerId, holeNumber]
        );
        if (existing) {
          await tx.execute(
            `UPDATE ${SCORECARD_SCORES_TABLE}
             SET strokes = ?, updated_at = ?
             WHERE id = ?`,
            [strokes, now, existing.id]
          );
        } else {
          await tx.execute(
            `INSERT INTO ${SCORECARD_SCORES_TABLE}
               (id, scorecard_id, scorer_id, hole_number, strokes, owner_user_id, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [newScoreId(), id, scorerId, holeNumber, strokes, userId, now]
          );
        }
        // Bump the parent scorecard's updated_at so it serves as
        // the canonical "last activity" timestamp. Friends' devices
        // sort live feed cards by this value (most-recently-active
        // bubbles to the top) without needing a derived
        // MAX(scorecard_scores.updated_at) aggregate.
        //
        // Yes, this re-replicates the full scorecards row (including
        // the multi-KB course_snapshot) on every tap. For ≤ a handful
        // of concurrently-active live rounds the cost is acceptable;
        // re-introduce a denormalized last_score_at column if
        // profiling ever shows the snapshot re-sync hurting on
        // mobile data.
        await tx.execute(
          `UPDATE ${SCORECARDS_TABLE} SET updated_at = ? WHERE id = ?`,
          [now, id]
        );
      });
    },
    [system, userId]
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
      await system.powersync.execute(
        `UPDATE ${SCORECARDS_TABLE} SET hole_range = ?, updated_at = ? WHERE id = ?`,
        [range, now, id]
      );
      // Re-clamp the current hole into the new range so the nav bar
      // doesn't strand the user on a now-out-of-range hole.
      if (currentRound) {
        const holes = holesInRange(currentRound.course.holes, range).map((h) => h.number);
        if (holes.length > 0 && !holes.includes(currentHole)) {
          await setCurrentHole(holes[0]);
        }
      }
    },
    [system, currentRound, currentHole, setCurrentHole]
  );

  const setParticipantTee = useCallback<RoundContextValue['setParticipantTee']>(
    async (participantKey, teeId) => {
      const id = scorecardIdRef.current;
      if (!id || !currentRound) return;
      const nextParticipants = currentRound.participants.map((p) =>
        p.participantKey === participantKey ? { ...p, teeId } : p
      );
      const now = new Date().toISOString();
      await system.powersync.execute(
        `UPDATE ${SCORECARDS_TABLE} SET participants = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(nextParticipants), now, id]
      );
    },
    [system, currentRound]
  );

  const completeCurrentRound = useCallback<RoundContextValue['completeCurrentRound']>(
    async () => {
      const id = scorecardIdRef.current;
      if (!id) return;
      const now = new Date().toISOString();
      await system.powersync.execute(
        `UPDATE ${SCORECARDS_TABLE} SET completed_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );
      if (userId) {
        await clearCurrentHoleForScorecard(userId, id);
      }
    },
    [system, userId]
  );

  const abandonCurrentRound = useCallback<RoundContextValue['abandonCurrentRound']>(
    async () => {
      const id = scorecardIdRef.current;
      if (!id) return;
      await system.powersync.writeTransaction(async (tx) => {
        await tx.execute(
          `DELETE FROM ${SCORECARD_SCORES_TABLE} WHERE scorecard_id = ?`,
          [id]
        );
        await tx.execute(`DELETE FROM ${SCORECARDS_TABLE} WHERE id = ?`, [id]);
      });
      if (userId) {
        await clearCurrentHoleForScorecard(userId, id);
      }
    },
    [system, userId]
  );

  const value = useMemo<RoundContextValue>(
    () => ({
      currentRound,
      roundHydrated,
      currentHoleHydrated,
      userId,
      startRound,
      setCustomHoleScore,
      setCurrentHole,
      setHoleRange,
      setParticipantTee,
      completeCurrentRound,
      abandonCurrentRound,
    }),
    [
      currentRound,
      roundHydrated,
      currentHoleHydrated,
      userId,
      startRound,
      setCustomHoleScore,
      setCurrentHole,
      setHoleRange,
      setParticipantTee,
      completeCurrentRound,
      abandonCurrentRound,
    ]
  );

  return <RoundContext.Provider value={value}>{children}</RoundContext.Provider>;
}

export function useRound(): RoundContextValue {
  const ctx = useContext(RoundContext);
  if (!ctx) {
    throw new Error('useRound must be used inside <RoundProvider>');
  }
  return ctx;
}
