/**
 * Course catalog lookups — REST-only.
 *
 * The catalog (`public.courses`) is not synced via PowerSync because
 * it's a global, mostly-static dataset of ~14k+ rows that doesn't fit
 * the offline-first model (most clients only ever care about ~dozens
 * of rows near them). Instead we query Supabase REST on demand from
 * two screens:
 *
 *   - `useCoursesSearch(query)` — debounced text search, used by the
 *     new-round picker (`new/index.tsx`).
 *   - `useCourse(id)`           — single-row fetch by id, used by
 *     downstream picker steps (`format.tsx`, `players.tsx`).
 *
 * Once `startRound` runs, the round captures a `course_snapshot`
 * jsonb on `scorecards` so all in-flight + completed-round reads
 * stay fully offline (resolved through `round.course`, NOT through
 * this hook).
 */

import { useEffect, useState } from 'react';

import { supabase } from '@/library/supabase/client';
import type { Course, Hole, Tee } from '@/types/golf';

import { enrichCatalogCourse, needsEnrichment } from './courseEnrichment';

export const SEARCH_FIELDS = 'id,name,city,state,country,hole_count,holes,tees,source';
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 50;

export type CourseDbRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  hole_count: number;
  holes: unknown;
  tees: unknown;
  source?: string | null;
};

function locationOf(row: Pick<CourseDbRow, 'city' | 'state' | 'country'>): string {
  const parts: string[] = [];
  if (row.city && row.city.trim().length > 0) parts.push(row.city.trim());
  if (row.state && row.state.trim().length > 0) parts.push(row.state.trim());
  if (parts.length > 0) return parts.join(', ');
  if (row.country && row.country.trim().length > 0) return row.country.trim();
  return '';
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function mapHoles(raw: unknown): Hole[] {
  if (!Array.isArray(raw)) return [];
  const out: Hole[] = [];
  for (const h of raw) {
    if (!h || typeof h !== 'object') continue;
    const obj = h as Record<string, unknown>;
    const number = toNumberOrUndefined(obj.number);
    const par = toNumberOrUndefined(obj.par);
    if (number === undefined || par === undefined) continue;

    // Accept the same handicap-index field aliases the live-API
    // enrichment supports (handicap_index / handicap / stroke_index)
    // for forwards-compat with rows enriched by future code paths.
    // The canonical key for DB-stored rows is `handicapIndex` (set
    // by both the live enrichment in courseEnrichment.ts and the
    // reenrich-opengolf script).
    const rawHcp = toNumberOrUndefined(
      obj.handicapIndex ?? obj.handicap_index ?? obj.handicap ?? obj.stroke_index
    );
    const handicapIndex =
      rawHcp !== undefined && rawHcp >= 1 && rawHcp <= 18
        ? Math.round(rawHcp)
        : undefined;

    let yardages: Record<string, number> | undefined;
    if (obj.yardages && typeof obj.yardages === 'object' && !Array.isArray(obj.yardages)) {
      const yMap: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj.yardages as Record<string, unknown>)) {
        const n = toNumberOrUndefined(v);
        if (n !== undefined) yMap[k] = n;
      }
      if (Object.keys(yMap).length > 0) yardages = yMap;
    }

    const longest = yardages
      ? Math.max(0, ...Object.values(yardages))
      : undefined;

    out.push({
      number,
      par,
      handicapIndex,
      yardages,
      yardage: longest && longest > 0 ? longest : undefined,
    });
  }
  return out.sort((a, b) => a.number - b.number);
}

function mapTees(raw: unknown): Tee[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Tee[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const obj = t as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id : '';
    if (id.length === 0) continue;
    const name = typeof obj.name === 'string' ? obj.name : id;
    out.push({
      id,
      name,
      color: typeof obj.color === 'string' ? obj.color : undefined,
      slope: toNumberOrUndefined(obj.slope),
      rating: toNumberOrUndefined(obj.rating),
      totalYardage: toNumberOrUndefined(obj.totalYardage),
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Public for unit-tests and the rare callsite that already has a row
 * in hand (e.g. a future "recents" hook). Most consumers should use
 * `useCoursesSearch` / `useCourse`.
 */
export function mapDbCourseToCourse(row: CourseDbRow): Course {
  return {
    id: row.id,
    name: row.name,
    location: locationOf(row),
    holes: mapHoles(row.holes),
    tees: mapTees(row.tees),
    isCustom: row.source === 'custom',
  };
}

/**
 * Debounced text search over the catalog. Empty / whitespace query
 * returns no rows — by design; we don't have a recents surface yet.
 *
 * The query is matched case-insensitively against `name` only.
 * Underscore (`_`) and percent (`%`) keep their PostgreSQL ILIKE
 * wildcard semantics, which is acceptable for friend-group MVP usage.
 *
 * Implementation note: the "empty query" idle state is *derived* from
 * the input — we never call `setState` to reset it. This keeps us
 * onside with React 19's `react-hooks/set-state-in-effect` rule.
 * The fetch effect bails out entirely for empty queries; the
 * downstream `isStale` check covers the gap while the user types
 * faster than the debounce.
 */
export function useCoursesSearch(query: string): {
  courses: Course[];
  loading: boolean;
  error: string | null;
} {
  const trimmed = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(trimmed);
  const [results, setResults] = useState<{
    queryAtFetch: string;
    courses: Course[];
    error: string | null;
  }>({ queryAtFetch: '', courses: [], error: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [trimmed]);

  useEffect(() => {
    if (debouncedQuery.length === 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: restError } = await supabase
        .from('courses')
        .select(SEARCH_FIELDS)
        .ilike('name', `%${debouncedQuery}%`)
        .order('name', { ascending: true })
        .limit(SEARCH_LIMIT);
      if (cancelled) return;
      setResults({
        queryAtFetch: debouncedQuery,
        courses: restError
          ? []
          : ((data ?? []) as CourseDbRow[]).map(mapDbCourseToCourse),
        error: restError?.message ?? null,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  if (debouncedQuery.length === 0) {
    return { courses: [], loading: false, error: null };
  }
  // While the user types past the debounce, the in-state results refer
  // to an older query. Treat that gap as "loading" instead of flashing
  // stale matches.
  const isStale = results.queryAtFetch !== debouncedQuery;
  return {
    courses: isStale ? [] : results.courses,
    loading: loading || isStale,
    error: isStale ? null : results.error,
  };
}

/**
 * Single-row REST fetch by id, with automatic enrichment when the
 * loaded row is a catalog course that hasn't been enriched yet.
 *
 * Used after the picker step — the format + players screens deep-link
 * with `?courseId=...` and need the full course object back. Both
 * `loading` (initial REST fetch) and `enriching` (OpenGolfAPI live
 * call + RPC write-back) are surfaced so the caller can show distinct
 * UX for "loading course" vs "loading scorecard".
 *
 * Returns `course = undefined` while either step is in flight or on
 * miss; check `error` to distinguish.
 *
 * Implementation note: like `useCoursesSearch`, the "no id" idle
 * state is *derived* from the input rather than synced via setState
 * to stay onside with React 19's `react-hooks/set-state-in-effect`
 * rule. State only tracks the most-recent fetched id; if the input
 * id no longer matches, we treat the in-state course as stale.
 */
export function useCourse(id: string | null | undefined): {
  course: Course | undefined;
  loading: boolean;
  enriching: boolean;
  error: string | null;
} {
  const [result, setResult] = useState<{
    idAtFetch: string | null;
    course: Course | undefined;
    error: string | null;
  }>({ idAtFetch: null, course: undefined, error: null });
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: restError } = await supabase
        .from('courses')
        .select(SEARCH_FIELDS)
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (restError) {
        setResult({ idAtFetch: id, course: undefined, error: restError.message });
        setLoading(false);
        return;
      }
      if (!data) {
        setResult({ idAtFetch: id, course: undefined, error: 'Course not found.' });
        setLoading(false);
        return;
      }
      const loaded = mapDbCourseToCourse(data as CourseDbRow);
      setLoading(false);

      // Enrichment is best-effort: if it succeeds the caller gets the
      // full scorecard; if it fails we keep the bare row + surface the
      // error so the picker UI can prompt a retry.
      if (needsEnrichment(loaded)) {
        setResult({ idAtFetch: id, course: loaded, error: null });
        setEnriching(true);
        const enriched = await enrichCatalogCourse(loaded);
        if (cancelled) return;
        setEnriching(false);
        if (enriched.ok) {
          setResult({ idAtFetch: id, course: enriched.course, error: null });
        } else {
          setResult({ idAtFetch: id, course: loaded, error: enriched.error });
        }
      } else {
        setResult({ idAtFetch: id, course: loaded, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return { course: undefined, loading: false, enriching: false, error: null };
  }
  // If the input id has changed but the fetch for it hasn't landed,
  // treat the in-state course as stale and surface loading.
  const isStale = result.idAtFetch !== id;
  return {
    course: isStale ? undefined : result.course,
    loading: loading || isStale,
    enriching,
    error: isStale ? null : result.error,
  };
}
