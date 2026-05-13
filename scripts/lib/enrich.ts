/**
 * Shared OpenGolfAPI enrichment helpers for the catalog scripts.
 *
 * Mirrors state/GolfRoundContext.tsx's dedupeTees + buildHoles + the
 * three-endpoint fan-out so both bulk-enrich-catalog.ts and the
 * demo-seed script land on the same data shape that the client would
 * if the user themselves had picked the course.
 *
 * Side-effect ('enrichCourseInPlace') talks to Supabase via a
 * service-role client the caller supplies; bypasses RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type Tee = {
  id: string;
  name: string;
  color?: string;
  slope?: number;
  rating?: number;
  totalYardage?: number;
  gender?: 'M' | 'F';
};

export type Hole = {
  number: number;
  par: number;
  handicapIndex?: number;
  yardages?: Record<string, number>;
};

export type CourseRow = {
  id: string;
  name: string;
  source: string;
  city: string | null;
  state: string | null;
  country: string | null;
  course_type: string | null;
  hole_count: number;
  total_par: number | null;
  total_yardage: number | null;
  year_built: number | null;
  architect: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  holes: Hole[];
  tees: Tee[];
  source_external_id: string | null;
  last_enriched_at: string | null;
};

function numOrUndef(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function dedupeTees(raw: any[]): Tee[] {
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

export function buildHoles(raw: any[], tees: Tee[]): Hole[] {
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

export async function fetchUpstream(externalId: string) {
  const [baseRes, teesRes, holesRes] = await Promise.all([
    fetch(`https://api.opengolfapi.org/v1/courses/${externalId}`),
    fetch(`https://api.opengolfapi.org/v1/courses/${externalId}/tees`),
    fetch(`https://api.opengolfapi.org/v1/courses/${externalId}/holes`),
  ]);
  if (!baseRes.ok) throw new Error(`base HTTP ${baseRes.status}`);
  const base = await baseRes.json();
  const teesJson = teesRes.ok ? await teesRes.json() : { tees: [] };
  const holesJson = holesRes.ok ? await holesRes.json() : { holes: [] };
  return { base, tees: teesJson, holes: holesJson };
}

/**
 * Returns true if the row has per-hole yardages on at least one hole.
 * Practical "is this row enriched enough to render a scorecard
 * correctly?" test — `last_enriched_at` alone isn't sufficient because
 * pre-migration-015 rows have a stamp but skinny holes.
 */
export function isFullyEnriched(row: CourseRow): boolean {
  const hasTees = Array.isArray(row.tees) && row.tees.length > 0;
  const hasYardages = (row.holes ?? []).some(
    (h) => h.yardages && Object.keys(h.yardages).length > 0
  );
  return hasTees && hasYardages;
}

/**
 * If `row` isn't fully enriched, fetch from OpenGolfAPI and write the
 * richer data back to public.courses via the supplied admin client.
 * Updates the row in place (mutates the object) so callers can reuse
 * it without re-querying. Throws on hard failures; silently returns
 * the original row if the upstream simply has no extra data.
 */
export async function enrichCourseInPlace(
  admin: SupabaseClient,
  row: CourseRow
): Promise<CourseRow> {
  if (isFullyEnriched(row)) return row;

  const externalId =
    row.source_external_id ??
    (row.id.startsWith('opengolf:') ? row.id.slice('opengolf:'.length) : null);
  if (!externalId) {
    throw new Error(`row ${row.id} has no external id`);
  }

  const { base, tees: teesJson, holes: holesJson } = await fetchUpstream(externalId);
  const tees = dedupeTees(teesJson?.tees ?? []);
  const rawHoles =
    Array.isArray(holesJson?.holes) && holesJson.holes.length > 0
      ? holesJson.holes
      : Array.isArray(base?.scorecard)
      ? base.scorecard
      : [];
  const holes = buildHoles(rawHoles, tees);

  if (holes.length === 0) {
    await admin
      .from('courses')
      .update({ last_enriched_at: new Date().toISOString() })
      .eq('id', row.id);
    return row;
  }

  const apiHoleCount = Number(base?.holes_count);
  const apiTotalPar = Number(base?.par_total);
  const enrichedHoleCount = Number.isFinite(apiHoleCount) ? apiHoleCount : holes.length;
  const enrichedTotalPar = Number.isFinite(apiTotalPar)
    ? apiTotalPar
    : holes.reduce((t, h) => t + h.par, 0);

  const update: Record<string, unknown> = {
    last_enriched_at: new Date().toISOString(),
    hole_count: enrichedHoleCount,
    total_par: enrichedTotalPar,
  };
  if (holes.length > 0) update.holes = holes;
  if (tees.length > 0) update.tees = tees;

  const { error } = await admin.from('courses').update(update).eq('id', row.id);
  if (error) throw error;

  // Mutate in place so the caller's reference is up to date.
  row.holes = holes;
  row.tees = tees;
  row.hole_count = enrichedHoleCount;
  row.total_par = enrichedTotalPar;
  row.last_enriched_at = new Date().toISOString();
  return row;
}
