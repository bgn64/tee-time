/**
 * Lazy catalog-course enrichment.
 *
 * The OpenGolfAPI bulk CSV that `scripts/ingest-opengolf.ts` loads
 * does NOT carry per-hole par/yardages or per-tee detail (multiple
 * upstream bugs documented in the script header). Catalog rows
 * therefore land in `public.courses` with `holes = []` and
 * `tees = []`. They become playable only after enrichment from the
 * OpenGolfAPI live endpoints + a write-back to the shared catalog
 * row via the `enrich_catalog_course` RPC.
 *
 * This module exposes the enrichment as a standalone async function
 * so any future picker (e.g. the Search tab) can reuse it. The
 * built-in `useCourse(id)` hook (see `useCourses.ts`) calls it
 * automatically when it loads an un-enriched row.
 *
 * Ported from the legacy app's `state/GolfRoundContext.tsx` (the
 * "OpenGolfAPI enrichment helpers" + `ensureCourseScorecard`
 * sections). Key changes for the new app:
 *   - decoupled from `GolfRoundContext` so non-round flows can call
 *     it directly;
 *   - returns an enriched `Course` (the app-level shape) instead of
 *     mutating a context's local state;
 *   - uses the shared Supabase client (src/library/supabase/client) for
 *     the write-back RPC.
 */

import { supabase } from '@/library/supabase/client';
import type { Course, Hole, Tee } from '@/types/golf';

const OPENGOLF_ID_PREFIX = 'opengolf:';
const API_BASE = 'https://api.opengolfapi.org/v1/courses';

export type EnrichmentResult =
  | { ok: true; course: Course }
  | { ok: false; error: string };

// =========================================================================
// Public predicates
// =========================================================================

/**
 * Catalog courses with an empty `holes` array haven't been hit by the
 * live API yet. Custom courses (user-created, not `opengolf:`-prefixed)
 * always carry their own holes and never need enrichment.
 */
export function isCatalogCourse(course: Pick<Course, 'id'>): boolean {
  return course.id.startsWith(OPENGOLF_ID_PREFIX);
}

/**
 * True when the course is a catalog row and we don't yet have
 * scorecard data (par per hole). Tees are not required to consider
 * a course "playable" — many short / par-3 courses genuinely have
 * no rated tees, and the picker just falls back to a "default tee"
 * for those.
 */
export function needsEnrichment(course: Course): boolean {
  if (!isCatalogCourse(course)) return false;
  return !course.holes || course.holes.length === 0;
}

// =========================================================================
// Internal helpers (ported from legacy)
// =========================================================================

function numOrUndef(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Dedupe the OpenGolfAPI tees array by lowercased tee name. The
 * upstream sometimes returns the same tee twice (one with full
 * ratings, one with partials); we keep the first occurrence's
 * id/name and merge missing fields from later duplicates so we
 * don't lose data.
 */
function dedupeTees(raw: unknown[]): Tee[] {
  const seen = new Map<string, Tee>();
  for (const r of raw ?? []) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    const name = String(row.tee_name ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const id =
      typeof row.id === 'string' && row.id.length > 0 ? row.id : key;
    const next: Tee = {
      id,
      name,
      color:
        typeof row.tee_color === 'string' && row.tee_color.length > 0
          ? row.tee_color
          : undefined,
      slope: numOrUndef(row.slope_rating),
      rating: numOrUndef(row.course_rating),
      totalYardage: numOrUndef(row.total_yardage),
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
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * Build the Hole[] array from OpenGolfAPI per-hole entries. Accepts
 * the shape returned by `/v1/courses/:id/holes` (rich, with per-hole
 * `yardages` keyed by lowercased tee_name) and falls back gracefully
 * to the legacy `/v1/courses/:id` `scorecard` shape (par-only).
 *
 * The per-hole `yardages` object is re-keyed from lowercased tee_name
 * onto stable `Tee.id` so the rest of the app can join cleanly
 * without re-lowercasing every name on every render.
 *
 * Handicap index (stroke index 1–18) is read from any of the common
 * upstream field names — the OpenGolfAPI uses `handicap_index` but
 * the legacy scorecard endpoint and ad-hoc course data sometimes use
 * `handicap` or `stroke_index`. Sanitised to the 1–18 range.
 */
function buildHoles(raw: unknown[], tees: Tee[]): Hole[] {
  const teeIdByName = new Map<string, string>();
  for (const t of tees) teeIdByName.set(t.name.toLowerCase(), t.id);

  const holes: Hole[] = [];
  for (const entry of raw ?? []) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const number = numOrUndef(obj.hole_number ?? obj.hole);
    const par = numOrUndef(obj.par);
    if (number === undefined || par === undefined) continue;

    const rawHcp = numOrUndef(
      obj.handicap_index ?? obj.handicap ?? obj.stroke_index
    );
    const handicapIndex =
      rawHcp !== undefined && rawHcp >= 1 && rawHcp <= 18
        ? Math.round(rawHcp)
        : undefined;

    const yardagesObj = obj.yardages;
    let yardages: Record<string, number> | undefined;
    if (
      yardagesObj &&
      typeof yardagesObj === 'object' &&
      !Array.isArray(yardagesObj)
    ) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(yardagesObj as Record<string, unknown>)) {
        const teeId = teeIdByName.get(String(k).toLowerCase());
        const n = numOrUndef(v);
        if (teeId && n !== undefined) out[teeId] = n;
      }
      if (Object.keys(out).length > 0) yardages = out;
    }

    const longest = yardages ? Math.max(0, ...Object.values(yardages)) : undefined;

    holes.push({
      number,
      par,
      handicapIndex,
      yardages,
      yardage: longest && longest > 0 ? longest : undefined,
    });
  }
  return holes.sort((a, b) => a.number - b.number);
}

// =========================================================================
// Public API
// =========================================================================

/**
 * Lazy-enrich a catalog course from the OpenGolfAPI live endpoints
 * and persist the result back to the shared `public.courses` row via
 * the `enrich_catalog_course` RPC.
 *
 * Idempotent + non-fatal:
 *   - Already-enriched courses short-circuit and return immediately.
 *   - Non-catalog (custom) courses return as-is.
 *   - RPC write-back failures are logged but don't fail the call;
 *     the user can still play the round with the locally-enriched
 *     course returned in `result.course`.
 *
 * Reusable from any picker context (current Score tab; future
 * Search tab; ad-hoc course detail screen). Caller controls when
 * to invoke and how to surface the (cheap-but-not-free) network
 * round-trip in their UI.
 */
export async function enrichCatalogCourse(
  course: Course
): Promise<EnrichmentResult> {
  if (!needsEnrichment(course)) {
    return { ok: true, course };
  }

  const externalId = course.id.slice(OPENGOLF_ID_PREFIX.length);
  if (!externalId) {
    return { ok: false, error: 'Catalog course is missing its OpenGolf id.' };
  }

  let basePayload: Record<string, unknown> = {};
  let teesPayload: { tees?: unknown[] } = { tees: [] };
  let holesPayload: { holes?: unknown[] } = { holes: [] };

  try {
    const [baseRes, teesRes, holesRes] = await Promise.all([
      fetch(`${API_BASE}/${externalId}`),
      fetch(`${API_BASE}/${externalId}/tees`),
      fetch(`${API_BASE}/${externalId}/holes`),
    ]);
    if (!baseRes.ok) {
      return {
        ok: false,
        error: `OpenGolfAPI returned HTTP ${baseRes.status}.`,
      };
    }
    basePayload = (await baseRes.json()) as Record<string, unknown>;
    if (teesRes.ok) teesPayload = (await teesRes.json()) as { tees?: unknown[] };
    if (holesRes.ok) holesPayload = (await holesRes.json()) as { holes?: unknown[] };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Network error contacting OpenGolfAPI.';
    return { ok: false, error: message };
  }

  // Tees first so per-hole yardages can join onto stable Tee.id keys.
  const tees: Tee[] = dedupeTees(teesPayload.tees ?? []);

  // Prefer /holes (richer) and fall back to /courses/:id's `scorecard`
  // when the dedicated endpoint returned nothing.
  const rawHoles: unknown[] =
    Array.isArray(holesPayload.holes) && holesPayload.holes.length > 0
      ? holesPayload.holes
      : Array.isArray(basePayload.scorecard)
        ? (basePayload.scorecard as unknown[])
        : [];

  const holes: Hole[] = buildHoles(rawHoles, tees);

  if (holes.length === 0) {
    return {
      ok: false,
      error: 'OpenGolfAPI returned no scorecard for this course.',
    };
  }

  // Trust the API's holes_count / par_total over our bulk-derived
  // values (both broken upstream). Fall back to computed sums from
  // the scorecard itself when the API doesn't ship those fields.
  const computedTotalPar = holes.reduce((t, h) => t + h.par, 0);
  const apiHoleCount = numOrUndef(basePayload.holes_count);
  const apiTotalPar = numOrUndef(basePayload.par_total);
  const enrichedHoleCount = apiHoleCount ?? holes.length;
  const enrichedTotalPar = apiTotalPar ?? computedTotalPar;

  const enriched: Course = {
    ...course,
    holes,
    tees: tees.length > 0 ? tees : course.tees,
  };

  // Best-effort RPC write-back. Failures are logged and swallowed —
  // the user still gets the locally-enriched course back so they can
  // play their round. Next user picking the same course will retry
  // the write-back via their own enrichment cycle.
  try {
    const { error } = await supabase.rpc(
      'enrich_catalog_course',
      {
        p_id: course.id,
        p_holes: holes,
        p_tees: tees,
        p_hole_count: enrichedHoleCount,
        p_total_par: enrichedTotalPar,
      }
    );
    if (error) {
      console.warn('[courseEnrichment] enrich_catalog_course RPC failed:', error);
    }
  } catch (err: unknown) {
    console.warn('[courseEnrichment] enrich_catalog_course RPC threw:', err);
  }

  return { ok: true, course: enriched };
}
