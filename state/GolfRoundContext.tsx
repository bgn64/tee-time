/**
 * Provides in-memory + AsyncStorage-persisted golf round state, plus the
 * Supabase wiring for the v7 scorecard-owned round model.
 *
 * Persisted: `courses`, `currentRound`, `completedRounds` — survive app restarts.
 * Not persisted (transient): `pendingSelectedCourseId`.
 *
 * `hydrated` is exposed so the root layout can wait for storage reads before
 * un-blocking the splash screen.
 *
 * Cloud model (post-007 redesign):
 *   · A `scorecards` row carries owner_user_id, course_snapshot,
 *     scoring_rule, player_ids (jsonb string[] of local participant keys),
 *     teams, scores, participants (jsonb), mentioned_user_ids (uuid[]
 *     informational denorm), round_id (nullable cross-card identifier),
 *     and started_at/completed_at.
 *   · Visibility = owner OR friend-of-owner. There is no separate
 *     participants table; named players are inline jsonb owned solely by
 *     the scorer.
 *
 * All mutations are plain CRUD under owner-only RLS. No RPCs survive
 * from the v6 model.
 */

import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { recentCourses as seededRecentCourses } from '@/data/courses';
import { replaceScore } from '@/lib/scoring';
import { useAccount } from '@/state/AccountContext';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/state/persistence';
import { usePlayers } from '@/state/PlayerContext';
import { supabase } from '@/state/supabaseClient';
import {
  Course,
  Hole,
  HoleRange,
  Round,
  RoundParticipant,
  RoundScore,
  ScoringRule,
  Team,
  Tee,
} from '@/types/golf';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =========================================================================
// OpenGolfAPI enrichment helpers (Phase 1)
// =========================================================================
//
// The basic /v1/courses/:id response carries only par + handicap per hole
// (no tees, no per-tee yardages). The richer data lives on two extra
// endpoints:
//   · /v1/courses/:id/tees   → { tees: TeeRow[] }
//   · /v1/courses/:id/holes  → { holes: HoleRow[] }
// See scripts/survey-opengolf-tees.ts and plan.md (Phase 1 findings)
// for the schema notes that justify the shape and tolerances below.

function numOrUndef(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Dedupe the OpenGolfAPI tees array by lowercased tee_name. The upstream
 * sometimes returns the same tee twice (one with full ratings, one with
 * partials); we keep the first occurrence's id/name and merge missing
 * fields from later duplicates so we don't lose data.
 */
function dedupeTees(raw: any[]): Tee[] {
  const seen = new Map<string, Tee>();
  for (const r of raw ?? []) {
    const name = String(r?.tee_name ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const next: Tee = {
      id: typeof r?.id === 'string' && r.id ? r.id : key,
      name,
      color: typeof r?.tee_color === 'string' && r.tee_color ? r.tee_color : undefined,
      slope: numOrUndef(r?.slope_rating),
      rating: numOrUndef(r?.course_rating),
      totalYardage: numOrUndef(r?.total_yardage),
      gender: r?.gender === 'Male' ? 'M' : r?.gender === 'Female' ? 'F' : undefined,
    };
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, next);
    } else {
      seen.set(key, {
        ...existing,
        color: existing.color ?? next.color,
        slope: existing.slope ?? next.slope,
        rating: existing.rating ?? next.rating,
        totalYardage: existing.totalYardage ?? next.totalYardage,
        gender: existing.gender ?? next.gender,
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * Build the Hole[] array from the OpenGolfAPI per-hole entries. Accepts
 * the shape returned by /v1/courses/:id/holes (with the per-hole
 * `yardages` object) and falls back gracefully to the legacy
 * /v1/courses/:id `scorecard` shape (no yardages).
 *
 * The per-hole `yardages` object is keyed by lowercased tee_name in the
 * API; we re-key it to `Tee.id` so the rest of the app can join cleanly
 * without re-lowercasing every name.
 */
function buildHoles(raw: any[], tees: Tee[]): Hole[] {
  const teeIdByName = new Map<string, string>();
  for (const t of tees) teeIdByName.set(t.name.toLowerCase(), t.id);

  return (raw ?? [])
    .map((entry) => {
      const number = Number(entry?.hole_number ?? entry?.hole);
      const par = Number(entry?.par);
      if (!Number.isFinite(number) || !Number.isFinite(par)) return null;

      const handicapIndex = numOrUndef(entry?.handicap_index ?? entry?.handicap);

      const yardagesObj = entry?.yardages;
      let yardages: Record<string, number> | undefined;
      if (yardagesObj && typeof yardagesObj === 'object' && !Array.isArray(yardagesObj)) {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(yardagesObj)) {
          const teeId = teeIdByName.get(String(k).toLowerCase());
          const n = Number(v);
          if (teeId && Number.isFinite(n)) out[teeId] = n;
        }
        if (Object.keys(out).length > 0) yardages = out;
      }

      return {
        number,
        par,
        ...(handicapIndex !== undefined ? { handicapIndex } : {}),
        ...(yardages ? { yardages } : {}),
      } as Hole;
    })
    .filter((h): h is Hole => h !== null)
    .sort((a, b) => a.number - b.number);
}

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
    teams?: Team[],
    opts?: {
      holeRange?: HoleRange;
      /** Map of participantKey → teeId. Optional per player. */
      teeIds?: Record<string, string | undefined>;
    }
  ) => void;
  setHoleScore: (scorerId: string, holeNumber: number, relativeScore: number) => void;
  setCustomHoleScore: (scorerId: string, holeNumber: number, strokes: number) => void;
  goToPreviousHole: () => void;
  goToNextHole: () => void;
  /** Jump to an arbitrary hole within the current round (clamped to [1, holes.length]). */
  setCurrentHole: (holeNumber: number) => void;
  /**
   * Update the in-flight round's hole range. Used by the range
   * dropdown on the scoring screen. Existing scores outside the new
   * range are preserved but excluded from totals + "Finish" checks.
   * Clamps `currentHoleNumber` into the new range.
   */
  setHoleRange: (range: HoleRange) => void;
  completeCurrentRound: () => void;
  abandonCurrentRound: () => void;
  /**
   * Apply a batch of (scorerId, hole, strokes) edits to a completed Round.
   * Computes the next `scores` array client-side from the current local
   * state + all edits, then optimistically updates local state and issues
   * a single owner UPDATE. On failure the change is rolled back. RLS
   * gates the write to the owner.
   *
   * Always prefer this over multiple `editHoleScore` calls — concurrent
   * single-edit calls race each other and clobber state.
   */
  commitScoreEdits: (
    roundId: string,
    edits: Array<{ scorerId: string; holeNumber: number; strokes: number }>
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Mutate one (scorerId, hole) entry on a completed Round. Optimistically
   * patches local state, then issues a plain owner UPDATE; on failure the
   * change is rolled back. RLS gates the write to the owner.
   *
   * Note: NOT safe to call concurrently for multiple holes on the same
   * round — use `commitScoreEdits` for batches.
   */
  editHoleScore: (
    roundId: string,
    scorerId: string,
    holeNumber: number,
    strokes: number
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Delete a Round entirely. Owner-only via RLS. Drops the row everywhere
   * (the owner's history, all friends' feeds).
   */
  deleteRound: (roundId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Server-side course search across the OpenGolf catalog. Returns up to
   * `limit` matches ordered by name. Local custom courses are NOT
   * included — the caller filters its own roster separately so the
   * remote query stays cacheable.
   */
  searchCatalogCourses: (query: string, limit?: number) => Promise<Course[]>;
  /**
   * Insert a freshly-picked catalog course into the local `courses` cache
   * so it shows up as a recent / startable course. Idempotent.
   */
  rememberCatalogCourse: (course: Course) => void;
  /**
   * Ensure the given catalog course has its scorecard populated. Fast-
   * paths to a no-op if the course already has holes. Otherwise hits
   * the upstream OpenGolfAPI for the canonical scorecard, writes it
   * into the shared catalog row via the enrich_catalog_course RPC, and
   * returns the enriched `Course`. On any failure returns ok:false with
   * an error message; the caller decides whether to fall back to a
   * create-course flow.
   *
   * Custom courses pass through unchanged (already user-authored).
   */
  ensureCourseScorecard: (
    course: Course
  ) => Promise<{ ok: true; course: Course } | { ok: false; error: string }>;
  hydrated: boolean;
};

const GolfRoundContext = createContext<GolfRoundContextValue | undefined>(undefined);

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
      // Clear all locally-cached courses; both customs (account-specific)
      // and any catalog rows the previous user had interacted with.
      setCourses([]);
      setCompletedRounds([]);
      setCurrentRound(null);
      cloudCoursesSyncedAccountRef.current = null;
      cloudRoundsSyncedAccountRef.current = null;
    }
    prevAccountUserIdRef.current = curr;
  }, [account, accountHydrated, hydrated]);

  // ===========================================================================
  // Courses cloud sync (customs only; catalog comes via on-demand search)
  // ===========================================================================
  /**
   * Translate a raw cloud row into the local Course shape.
   */
  const cloudCourseRowToLocal = useCallback((row: any): Course => {
    const city: string | undefined = row.city ?? undefined;
    const state: string | undefined = row.state ?? undefined;
    const location = [city, state].filter((v) => v && v.length > 0).join(', ');
    return {
      id: row.id,
      name: row.name,
      location,
      holes: row.holes ?? [],
      source: row.source,
      city,
      state,
      country: row.country ?? undefined,
      address: row.address ?? undefined,
      postalCode: row.postal_code ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      courseType: row.course_type ?? undefined,
      totalPar: row.total_par ?? undefined,
      totalYardage: row.total_yardage ?? undefined,
      yearBuilt: row.year_built ?? undefined,
      architect: row.architect ?? undefined,
      phone: row.phone ?? undefined,
      website: row.website ?? undefined,
      tees: row.tees ?? [],
      sourceExternalId: row.source_external_id ?? undefined,
      lastEnrichedAt: row.last_enriched_at ?? undefined,
    };
  }, []);

  const cloudUpsertCourse = useCallback(
    async (course: Course) => {
      if (!account) return;
      if (course.source !== 'custom') return;
      const { error } = await supabase
        .from('courses')
        .upsert(
          {
            id: course.id,
            owner_user_id: account.userId,
            source: 'custom',
            name: course.name,
            // Custom courses store the user-typed location verbatim into
            // `city` so it round-trips on read. We don't try to parse
            // "Seattle, WA" into city+state — keep it simple.
            city: course.location || null,
            state: null,
            country: course.country ?? null,
            address: course.address ?? null,
            postal_code: course.postalCode ?? null,
            latitude: course.latitude ?? null,
            longitude: course.longitude ?? null,
            course_type: course.courseType ?? null,
            hole_count: course.holes.length,
            total_par: course.totalPar ?? course.holes.reduce((t, h) => t + h.par, 0),
            total_yardage: course.totalYardage ?? null,
            year_built: course.yearBuilt ?? null,
            architect: course.architect ?? null,
            phone: course.phone ?? null,
            website: course.website ?? null,
            holes: course.holes,
            tees: course.tees ?? [],
          },
          { onConflict: 'id' }
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
        .eq('id', courseId)
        .eq('owner_user_id', account.userId);
      if (error) console.warn('[courses] delete failed:', error);
    },
    [account]
  );

  // Initial pull: only user-owned customs. Catalog discovery happens via
  // searchCatalogCourses on demand.
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
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('owner_user_id', ownerUserId);
      if (error) {
        console.warn('[courses] initial sync pull failed:', error);
        return;
      }
      if (cancelled) return;

      const cloudRows = (data ?? []) as any[];
      const cloudById = new Map(cloudRows.map((r) => [r.id as string, r]));

      // Merge: cloud customs win for matching ids. Local-only customs
      // get pushed to cloud. Any locally-cached catalog rows (not in this
      // pull's owner-scoped result) are preserved so picks survive
      // reloads even though we don't sync the catalog.
      const localSnapshot = coursesRef.current;
      const merged: Course[] = [];
      const seen = new Set<string>();
      for (const local of localSnapshot) {
        const cloud = cloudById.get(local.id);
        if (cloud) {
          merged.push(cloudCourseRowToLocal(cloud));
          seen.add(cloud.id);
        } else if (local.source === 'opengolf') {
          merged.push(local);
        } else if (local.source === 'custom') {
          merged.push(local);
        }
      }
      for (const cloud of cloudRows) {
        if (seen.has(cloud.id)) continue;
        merged.push(cloudCourseRowToLocal(cloud));
      }

      if (cancelled) return;
      setCourses(merged);

      const localOnlyCustom = localSnapshot.filter(
        (c) => c.source === 'custom' && !cloudById.has(c.id)
      );
      for (const c of localOnlyCustom) {
        await cloudUpsertCourse(c);
      }

      cloudCoursesSyncedAccountRef.current = ownerUserId;
    };

    sync();
    return () => {
      cancelled = true;
    };
  }, [account, hydrated, accountHydrated, cloudCourseRowToLocal, cloudUpsertCourse]);

  // Catalog search (server-side, no client-side preload).
  const searchCatalogCourses = useCallback(
    async (query: string, limit: number = 20): Promise<Course[]> => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      // ilike with %...% works on the trigram index we created in 008. We
      // bias to authenticated catalog rows only — local customs are
      // filtered in the UI from `courses` directly.
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('source', 'opengolf')
        .ilike('name', `%${trimmed}%`)
        .order('name')
        .limit(limit);
      if (error) {
        console.warn('[courses] catalog search failed:', error);
        return [];
      }
      return (data ?? []).map(cloudCourseRowToLocal);
    },
    [cloudCourseRowToLocal]
  );

  const rememberCatalogCourse = useCallback((course: Course) => {
    if (course.source !== 'opengolf') return;
    setCourses((prev) => {
      const i = prev.findIndex((c) => c.id === course.id);
      if (i === -1) return [...prev, course];
      // Already present: merge — keep the locally-cached holes/tees if
      // they're already populated (avoids regressing a previously
      // enriched copy with stale empty data).
      const existing = prev[i];
      const merged: Course = {
        ...existing,
        ...course,
        holes: existing.holes.length > 0 ? existing.holes : course.holes,
        tees:
          existing.tees && existing.tees.length > 0 ? existing.tees : course.tees ?? [],
      };
      const next = prev.slice();
      next[i] = merged;
      return next;
    });
  }, []);

  // Lazy scorecard enrichment for catalog courses. The bulk-export
  // scorecards are unreliable (see migration 009 for context), so we
  // fetch them from the live REST API on first use and persist the
  // result back to the shared `courses` row via the
  // `enrich_catalog_course` RPC. Subsequent picks of the same course
  // by anyone skip the network round-trip.
  const ensureCourseScorecard = useCallback(
    async (
      course: Course
    ): Promise<{ ok: true; course: Course } | { ok: false; error: string }> => {
      if (course.source !== 'opengolf') return { ok: true, course };
      // Re-fetch only when we genuinely have no data yet. Three skip
      // conditions:
      //   1. We have both holes AND tees (fully enriched).
      //   2. We have holes and have previously attempted to fetch
      //      tees (`lastEnrichedAt` set) — the API genuinely had none
      //      for this course; retrying would just burn rate-limit
      //      budget.
      // Pre-Phase-1 enriched courses have holes but no
      // `lastEnrichedAt` → they'll re-fetch once to upgrade, then the
      // attempt timestamp keeps them quiet thereafter.
      const hasHoles = !!(course.holes && course.holes.length > 0);
      const hasTees = !!(course.tees && course.tees.length > 0);
      const alreadyTried = !!course.lastEnrichedAt;
      if (hasHoles && (hasTees || alreadyTried)) return { ok: true, course };

      const externalId =
        course.sourceExternalId ??
        (course.id.startsWith('opengolf:') ? course.id.slice('opengolf:'.length) : null);
      if (!externalId) {
        return { ok: false, error: 'Catalog course is missing its OpenGolf id.' };
      }

      // Fan out to all three endpoints in parallel. /courses/:id carries
      // top-level holes_count + par_total; /tees and /holes carry the
      // richer per-tee data we want to populate. Only the base endpoint
      // is required — the others are best-effort.
      let basePayload: any;
      let teesPayload: any = { tees: [] };
      let holesPayload: any = { holes: [] };
      try {
        const [baseRes, teesRes, holesRes] = await Promise.all([
          fetch(`https://api.opengolfapi.org/v1/courses/${externalId}`),
          fetch(`https://api.opengolfapi.org/v1/courses/${externalId}/tees`),
          fetch(`https://api.opengolfapi.org/v1/courses/${externalId}/holes`),
        ]);
        if (!baseRes.ok) {
          return { ok: false, error: `OpenGolfAPI returned HTTP ${baseRes.status}.` };
        }
        basePayload = await baseRes.json();
        if (teesRes.ok) teesPayload = await teesRes.json();
        if (holesRes.ok) holesPayload = await holesRes.json();
      } catch (err: any) {
        return { ok: false, error: err?.message ?? 'Network error contacting OpenGolfAPI.' };
      }

      // Build deduped tees first so buildHoles can join the per-hole
      // yardages object (keyed by lowercased tee_name) onto stable
      // Tee.id keys.
      const tees: Tee[] = dedupeTees(teesPayload?.tees ?? []);

      // Prefer /holes (richer) and fall back to /courses/:id's
      // `scorecard` array if the dedicated endpoint returned nothing.
      const rawHoles: any[] =
        Array.isArray(holesPayload?.holes) && holesPayload.holes.length > 0
          ? holesPayload.holes
          : Array.isArray(basePayload?.scorecard)
          ? basePayload.scorecard
          : [];

      const holes: Hole[] = buildHoles(rawHoles, tees);

      if (holes.length === 0) {
        return { ok: false, error: 'OpenGolfAPI returned no scorecard for this course.' };
      }

      // Trust the API's holes_count / par_total over our bulk-derived
      // values, both of which were broken upstream. Fall back to the
      // computed sums from the scorecard itself when the API doesn't
      // ship those fields.
      const computedTotalPar = holes.reduce((t, h) => t + h.par, 0);
      const apiHoleCount = Number(basePayload?.holes_count);
      const apiTotalPar = Number(basePayload?.par_total);
      const enrichedHoleCount = Number.isFinite(apiHoleCount) ? apiHoleCount : holes.length;
      const enrichedTotalPar = Number.isFinite(apiTotalPar) ? apiTotalPar : computedTotalPar;

      const enriched: Course = {
        ...course,
        holes,
        tees,
        totalPar: enrichedTotalPar,
        lastEnrichedAt: new Date().toISOString(),
      };

      // Write back to the shared catalog row. Best-effort: if the RPC
      // fails (offline, RLS misconfig, etc.) we still return the
      // locally-enriched course so the user can play their round.
      if (account) {
        const { error } = await supabase.rpc('enrich_catalog_course', {
          p_id: course.id,
          p_holes: holes,
          p_tees: tees,
          p_hole_count: enrichedHoleCount,
          p_total_par: enrichedTotalPar,
        });
        if (error) {
          console.warn('[courses] enrich_catalog_course RPC failed:', error);
        }
      }

      // Update local cache so re-picking the same course is instant.
      setCourses((prev) => prev.map((c) => (c.id === enriched.id ? enriched : c)));

      return { ok: true, course: enriched };
    },
    [account]
  );

  // ===========================================================================
  // Scorecards cloud sync
  // ===========================================================================

  type CloudScorecardRow = {
    id: string;
    owner_user_id: string;
    course_snapshot: Course;
    scoring_rule: ScoringRule;
    player_ids: string[];
    teams: Team[] | null;
    scores: RoundScore[];
    participants: RoundParticipant[];
    mentioned_user_ids: string[];
    round_id: string | null;
    current_hole_number: number;
    started_at: string;
    completed_at: string | null;
    caption: string | null;
  };

  const cloudToLocalRound = useCallback((row: CloudScorecardRow): Round => {
    const rawRange = (row as any).hole_range;
    const holeRange: HoleRange =
      rawRange === 'front9' || rawRange === 'back9' ? rawRange : 'all';
    return {
      id: row.id,
      course: row.course_snapshot,
      scoringRule: row.scoring_rule,
      playerIds: row.player_ids,
      teams: row.teams ?? undefined,
      holeRange,
      currentHoleNumber: row.current_hole_number,
      scores: row.scores ?? [],
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      ownerUserId: row.owner_user_id,
      participants: row.participants ?? [],
      mentionedUserIds: row.mentioned_user_ids ?? [],
      roundId: row.round_id ?? undefined,
      caption: row.caption ?? undefined,
    };
  }, []);

  /**
   * Build the participants[] inline jsonb for a freshly completed Round
   * from the local roster. Linked participants get NO snapshot
   * (name/color render live from profile); local participants snapshot
   * the nickname and color captured at completion time. `teeId` is
   * copied through from the in-flight round's existing participants
   * array (set at startRound time).
   */
  const buildParticipants = useCallback((round: Round): RoundParticipant[] => {
    const teamForPlayer = (playerId: string): string | undefined => {
      if (!round.teams) return undefined;
      return round.teams.find((t) => t.playerIds.includes(playerId))?.id;
    };
    const teeByKey = new Map<string, string>();
    for (const p of round.participants ?? []) {
      if (p.teeId) teeByKey.set(p.participantKey, p.teeId);
    }

    const out: RoundParticipant[] = [];
    for (const playerId of round.playerIds) {
      const p = playerRosterRef.current.find((q) => q.id === playerId);
      if (!p) continue;
      const linkedUserId =
        p.userId && UUID_REGEX.test(p.userId) ? p.userId : undefined;
      const teamId = teamForPlayer(playerId);
      const teeId = teeByKey.get(playerId);

      if (linkedUserId) {
        out.push({
          participantKey: playerId,
          linkedUserId,
          teamId,
          ...(teeId ? { teeId } : {}),
        });
      } else {
        out.push({
          participantKey: playerId,
          teamId,
          localDisplayName: p.nickname,
          localDisplayColor: p.color,
          ...(teeId ? { teeId } : {}),
        });
      }
    }
    return out;
  }, []);

  const buildMentionedUserIds = useCallback(
    (participants: RoundParticipant[]): string[] => {
      const out: string[] = [];
      for (const p of participants) {
        if (p.linkedUserId && !out.includes(p.linkedUserId)) {
          out.push(p.linkedUserId);
        }
      }
      return out;
    },
    []
  );

  const cloudUpsertRound = useCallback(
    async (round: Round) => {
      if (!account) return;
      const ownerUserId = account.userId;

      const { error } = await supabase
        .from('scorecards')
        .upsert(
          {
            id: round.id,
            owner_user_id: ownerUserId,
            course_snapshot: round.course,
            scoring_rule: round.scoringRule,
            player_ids: round.playerIds,
            teams: round.teams ?? null,
            scores: round.scores,
            participants: round.participants,
            mentioned_user_ids: round.mentionedUserIds,
            round_id: round.roundId ?? null,
            hole_range: round.holeRange,
            current_hole_number: round.currentHoleNumber,
            started_at: round.startedAt,
            completed_at: round.completedAt ?? null,
            caption: round.caption ?? null,
          },
          { onConflict: 'id' }
        );
      if (error) console.warn('[scorecards] upsert failed:', error);
    },
    [account]
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
      const { data, error } = await supabase.from('scorecards').select('*');
      if (error) {
        console.warn('[scorecards] initial sync pull failed:', error);
        return;
      }
      if (cancelled) return;

      const rows = (data ?? []) as CloudScorecardRow[];
      const cloudById = new Map(rows.map((r) => [r.id, r]));
      const localSnapshot = completedRoundsRef.current;

      const merged: Round[] = [];
      const seen = new Set<string>();
      for (const local of localSnapshot) {
        const cloud = cloudById.get(local.id);
        if (cloud) {
          merged.push(cloudToLocalRound(cloud));
          seen.add(cloud.id);
          continue;
        }
        // Local round not in cloud. Two valid cases keep it:
        //   · Round we own and haven't pushed yet → kept for the upsert
        //     below.
        //   · Anonymous-mode round (no ownerUserId) → kept as local-only
        //     history that this account will eventually adopt.
        // Anything else (a friend-owned round we cached previously) is
        // stale — the friend deleted it or RLS no longer grants access.
        // Drop it so the local cache reconverges with the server.
        if (!local.ownerUserId || local.ownerUserId === ownerUserId) {
          merged.push(local);
        }
      }
      for (const cloud of rows) {
        if (seen.has(cloud.id)) continue;
        merged.push(cloudToLocalRound(cloud));
      }

      if (cancelled) return;
      setCompletedRounds(merged);

      // Push local-only rounds owned by this account up to cloud.
      const localOnly = localSnapshot.filter(
        (r) => !cloudById.has(r.id) && r.ownerUserId === ownerUserId
      );
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

  // Realtime: scorecards table only. Inline participants ride along.
  useEffect(() => {
    if (!account) return;

    const channel = supabase
      .channel('scorecards-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scorecards' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string })?.id;
            if (!oldId) return;
            setCompletedRounds((prev) => prev.filter((r) => r.id !== oldId));
            return;
          }
          const row = payload.new as CloudScorecardRow;
          const merged = cloudToLocalRound(row);
          setCompletedRounds((prev) => {
            const i = prev.findIndex((r) => r.id === merged.id);
            if (i === -1) return [merged, ...prev];
            const next = prev.slice();
            next[i] = merged;
            return next;
          });
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
      startRound: (courseId, playerIds = [], scoringRule = 'stroke', teams, opts) => {
        const course = courses.find((c) => c.id === courseId);
        if (!course) {
          throw new Error(`Cannot start round for unknown course: ${courseId}`);
        }
        const requestedRange = opts?.holeRange ?? 'all';
        const totalHoles = course.holes.length;
        // 9-hole courses can only play 'all'. front9/back9 require >=18
        // for full semantics; we don't validate aggressively but clamp
        // to a sensible value.
        const holeRange: HoleRange =
          totalHoles < 18 && requestedRange !== 'all' ? 'all' : requestedRange;
        const startingHole = holeRange === 'back9' ? 10 : 1;

        // Seed participants[] with teeIds when supplied. Linked-user
        // resolution + name/color snapshots are deferred to
        // completeCurrentRound; here we just need to capture teeId
        // alongside participantKey + teamId for the scorecard UI.
        const teamForPlayer = (playerId: string): string | undefined => {
          if (!teams) return undefined;
          return teams.find((t) => t.playerIds.includes(playerId))?.id;
        };
        const participants: RoundParticipant[] = playerIds.map((pid) => {
          const teeId = opts?.teeIds?.[pid];
          const teamId = teamForPlayer(pid);
          return {
            participantKey: pid,
            ...(teamId ? { teamId } : {}),
            ...(teeId ? { teeId } : {}),
          };
        });

        setCurrentRound({
          id: `round-${Date.now()}`,
          course,
          scoringRule,
          playerIds,
          teams,
          holeRange,
          currentHoleNumber: startingHole,
          scores: [],
          startedAt: new Date().toISOString(),
          ownerUserId: account?.userId,
          participants,
          mentionedUserIds: [],
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
      setCurrentHole: (holeNumber) => {
        setCurrentRound((round) => {
          if (!round) throw new Error('Cannot set current hole without a current round.');
          const clamped = Math.max(1, Math.min(round.course.holes.length, holeNumber));
          return { ...round, currentHoleNumber: clamped };
        });
      },
      setHoleRange: (range) => {
        setCurrentRound((round) => {
          if (!round) throw new Error('Cannot set hole range without a current round.');
          // 9-hole courses can't meaningfully restrict to front/back.
          const totalHoles = round.course.holes.length;
          const next: HoleRange =
            totalHoles < 18 && range !== 'all' ? 'all' : range;
          if (next === round.holeRange) return round;
          // Clamp currentHoleNumber into the new range so the next
          // render of the scoring screen lands on a hole the user can
          // actually score. Existing out-of-range scores stay in the
          // `scores` array (preserved for a future swap back).
          let nextHole = round.currentHoleNumber;
          if (next === 'front9' && nextHole > 9) nextHole = 9;
          if (next === 'back9' && nextHole < 10) nextHole = 10;
          return { ...round, holeRange: next, currentHoleNumber: nextHole };
        });
      },
      completeCurrentRound: () => {
        setCurrentRound((round) => {
          if (!round) {
            throw new Error('Cannot complete a round when no current round exists.');
          }
          const participants = buildParticipants(round);
          const mentionedUserIds = buildMentionedUserIds(participants);
          const completedRound: Round = {
            ...round,
            completedAt: new Date().toISOString(),
            ownerUserId: account?.userId,
            participants,
            mentionedUserIds,
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
        if (!previous) {
          return { ok: false, error: 'Round not found in local history.' };
        }
        const nextScores = replaceScore(previous.scores, {
          scorerId,
          holeNumber,
          strokes: safeStrokes,
        });
        // Optimistic update.
        setCompletedRounds((rounds) =>
          rounds.map((r) => (r.id === roundId ? { ...r, scores: nextScores } : r))
        );
        if (!account) return { ok: true };
        const { error } = await supabase
          .from('scorecards')
          .update({ scores: nextScores })
          .eq('id', roundId);
        if (error) {
          console.warn('[scorecards] update_score failed:', error);
          // Roll back.
          setCompletedRounds((rounds) =>
            rounds.map((r) => (r.id === roundId ? previous : r))
          );
          return { ok: false, error: error.message };
        }
        return { ok: true };
      },
      commitScoreEdits: async (roundId, edits) => {
        if (edits.length === 0) return { ok: true };
        const previous = completedRoundsRef.current.find((r) => r.id === roundId);
        if (!previous) {
          return { ok: false, error: 'Round not found in local history.' };
        }
        // Fold every edit into a single next-scores array so concurrent
        // edits across multiple holes can't clobber one another.
        let nextScores = previous.scores;
        for (const e of edits) {
          nextScores = replaceScore(nextScores, {
            scorerId: e.scorerId,
            holeNumber: e.holeNumber,
            strokes: Math.max(1, e.strokes),
          });
        }
        setCompletedRounds((rounds) =>
          rounds.map((r) => (r.id === roundId ? { ...r, scores: nextScores } : r))
        );
        if (!account) return { ok: true };
        const { data, error } = await supabase
          .from('scorecards')
          .update({ scores: nextScores })
          .eq('id', roundId)
          .select();
        if (error) {
          console.warn('[scorecards] commit_score_edits failed:', error);
          setCompletedRounds((rounds) =>
            rounds.map((r) => (r.id === roundId ? previous : r))
          );
          return { ok: false, error: error.message };
        }
        if (!data || data.length === 0) {
          // Owner-only RLS denied (or row missing). Roll back.
          setCompletedRounds((rounds) =>
            rounds.map((r) => (r.id === roundId ? previous : r))
          );
          return { ok: false, error: 'Update returned no rows.' };
        }
        return { ok: true };
      },
      deleteRound: async (roundId) => {
        const previous = completedRoundsRef.current.find((r) => r.id === roundId);
        // Optimistic local removal.
        setCompletedRounds((rounds) => rounds.filter((r) => r.id !== roundId));
        if (!account) return { ok: true };
        const { error } = await supabase.from('scorecards').delete().eq('id', roundId);
        if (error) {
          console.warn('[scorecards] delete failed:', error);
          if (previous) {
            setCompletedRounds((rounds) => [previous, ...rounds]);
          }
          return { ok: false, error: error.message };
        }
        return { ok: true };
      },
      searchCatalogCourses,
      rememberCatalogCourse,
      ensureCourseScorecard,
    }),
    [
      completedRounds,
      courses,
      currentRound,
      pendingSelectedCourseId,
      hydrated,
      defaultPlayerId,
      account,
      buildParticipants,
      buildMentionedUserIds,
      cloudUpsertCourse,
      cloudDeleteCourse,
      cloudUpsertRound,
      searchCatalogCourses,
      rememberCatalogCourse,
      ensureCourseScorecard,
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
