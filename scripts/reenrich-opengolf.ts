/**
 * Backfill / re-enrichment of opengolf catalog courses.
 *
 * Use case: when we add a new field to the catalog data pipeline
 * (e.g. `handicapIndex` on each hole), already-enriched rows in
 * `public.courses` don't pick it up on their own — the client's
 * lazy enrichment path short-circuits whenever `holes.length > 0`.
 * This script walks the catalog, identifies rows that are missing
 * the new field, re-fetches from the OpenGolfAPI live endpoints,
 * and writes back the updated `holes` + `tees`.
 *
 * Run via:
 *
 *   tsx scripts/reenrich-opengolf.ts                              # uses .env.local, default filter
 *   tsx scripts/reenrich-opengolf.ts --dry-run                    # show what would change
 *   tsx scripts/reenrich-opengolf.ts --env .prod.env              # write to prod
 *   tsx scripts/reenrich-opengolf.ts --all-enriched               # re-enrich every enriched course
 *   tsx scripts/reenrich-opengolf.ts --id opengolf:abc-123        # single course (testing)
 *   tsx scripts/reenrich-opengolf.ts --throttle-ms 500            # slow down API calls
 *   tsx scripts/reenrich-opengolf.ts --limit 50                   # cap the work
 *
 * Filters (mutually exclusive):
 *   default        : enriched courses with at least one hole missing
 *                    `handicapIndex` (the field added in this branch).
 *   --all-enriched : every row with `last_enriched_at IS NOT NULL`.
 *                    Use after adding a new field that doesn't have
 *                    a clean "is missing" predicate.
 *   --id <id>      : single catalog id (with the `opengolf:` prefix).
 *
 * Writes go through a direct UPDATE on `public.courses` using the
 * service-role key. The `enrich_catalog_course` RPC requires
 * `auth.uid()` so it can't be called from a service-role script.
 * The script's own validation mirrors what the RPC enforces.
 *
 * Required env (loaded from `--env` file, defaults to `.env.local`):
 *
 *   SUPABASE_URL                 - your project URL
 *   SUPABASE_SERVICE_ROLE_KEY    - SERVICE ROLE key (bypasses RLS).
 *                                  Never commit. Never ship to clients.
 *
 * Source: https://api.opengolfapi.org/v1/courses
 * License (data): ODbL 1.0 — attribution required wherever this data appears.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

const OPENGOLF_ID_PREFIX = 'opengolf:';
const API_BASE = 'https://api.opengolfapi.org/v1/courses';
const DEFAULT_THROTTLE_MS = 200;

// ---------- argv ----------
const dryRun = process.argv.includes('--dry-run');
const allEnriched = process.argv.includes('--all-enriched');

const envFlagIndex = process.argv.indexOf('--env');
const envFile =
  envFlagIndex >= 0 && process.argv[envFlagIndex + 1]
    ? process.argv[envFlagIndex + 1]
    : '.env.local';

const idFlagIndex = process.argv.indexOf('--id');
const singleId =
  idFlagIndex >= 0 && process.argv[idFlagIndex + 1]
    ? process.argv[idFlagIndex + 1]
    : null;

const throttleFlagIndex = process.argv.indexOf('--throttle-ms');
const throttleMs =
  throttleFlagIndex >= 0 && process.argv[throttleFlagIndex + 1]
    ? Math.max(0, parseInt(process.argv[throttleFlagIndex + 1], 10) || 0)
    : DEFAULT_THROTTLE_MS;

const limitFlagIndex = process.argv.indexOf('--limit');
const limit =
  limitFlagIndex >= 0 && process.argv[limitFlagIndex + 1]
    ? Math.max(1, parseInt(process.argv[limitFlagIndex + 1], 10) || 0)
    : null;

if (allEnriched && singleId) {
  console.error('[reenrich] --all-enriched and --id are mutually exclusive.');
  process.exit(1);
}

// ---------- env ----------
dotenv.config({ path: envFile });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to ${envFile} before running.`
  );
  process.exit(1);
}

console.log(`[reenrich] env file       : ${envFile}`);
console.log(`[reenrich] target         : ${SUPABASE_URL}`);
console.log(
  `[reenrich] mode           : ${
    singleId
      ? `single-id (${singleId})`
      : allEnriched
        ? 'all-enriched'
        : 'missing-handicap (default)'
  }${dryRun ? ' DRY-RUN (no writes)' : ''}`
);
console.log(`[reenrich] throttle (ms)  : ${throttleMs}`);
if (limit !== null) console.log(`[reenrich] limit          : ${limit}`);

// =====================================================================
// Pure parsing — duplicated from src/library/golf/courseEnrichment.ts so
// this script stays self-contained (no path-alias bundler config). Keep
// the two in sync when adding new fields. Both ingest from the same
// OpenGolfAPI shape and produce the same Hole / Tee records.
// =====================================================================

type Hole = {
  number: number;
  par: number;
  handicapIndex?: number;
  yardages?: Record<string, number>;
  yardage?: number;
};

type Tee = {
  id: string;
  name: string;
  color?: string;
  slope?: number;
  rating?: number;
  totalYardage?: number;
};

function numOrUndef(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

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

// =====================================================================
// Predicates + DB helpers
// =====================================================================

type CourseRow = {
  id: string;
  name: string;
  holes: unknown;
  tees: unknown;
  hole_count: number | null;
  total_par: number | null;
  last_enriched_at: string | null;
};

/** True when the row is enriched but at least one hole lacks `handicapIndex`. */
function needsHandicapBackfill(row: CourseRow): boolean {
  if (!Array.isArray(row.holes) || row.holes.length === 0) return false;
  for (const h of row.holes) {
    if (!h || typeof h !== 'object') continue;
    const hcp = (h as Record<string, unknown>).handicapIndex;
    if (hcp === undefined || hcp === null) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type EnrichOutcome =
  | { ok: true; holes: Hole[]; tees: Tee[]; holeCount: number; totalPar: number }
  | { ok: false; error: string };

async function fetchEnriched(externalId: string): Promise<EnrichOutcome> {
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
        error: `HTTP ${baseRes.status} on base endpoint`,
      };
    }
    basePayload = (await baseRes.json()) as Record<string, unknown>;
    if (teesRes.ok) teesPayload = (await teesRes.json()) as { tees?: unknown[] };
    if (holesRes.ok) holesPayload = (await holesRes.json()) as { holes?: unknown[] };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: message };
  }

  const tees = dedupeTees(teesPayload.tees ?? []);
  const rawHoles: unknown[] =
    Array.isArray(holesPayload.holes) && holesPayload.holes.length > 0
      ? holesPayload.holes
      : Array.isArray(basePayload.scorecard)
        ? (basePayload.scorecard as unknown[])
        : [];
  const holes = buildHoles(rawHoles, tees);
  if (holes.length === 0) {
    return { ok: false, error: 'API returned no scorecard' };
  }

  const computedTotalPar = holes.reduce((t, h) => t + h.par, 0);
  const apiHoleCount = numOrUndef(basePayload.holes_count);
  const apiTotalPar = numOrUndef(basePayload.par_total);

  return {
    ok: true,
    holes,
    tees,
    holeCount: apiHoleCount ?? holes.length,
    totalPar: apiTotalPar ?? computedTotalPar,
  };
}

// =====================================================================
// Main
// =====================================================================

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Load candidate rows ----
  // For the default filter (`needsHandicapBackfill`) we have to fetch
  // candidate rows and inspect their jsonb client-side — Supabase's
  // PostgREST jsonb operators don't easily express "any element of
  // array is missing key". Acceptable: only ~10s of thousands of
  // catalog rows total, paginated.
  let candidates: CourseRow[] = [];
  if (singleId) {
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, holes, tees, hole_count, total_par, last_enriched_at')
      .eq('id', singleId)
      .eq('source', 'opengolf');
    if (error) throw error;
    candidates = (data ?? []) as CourseRow[];
  } else {
    console.log('[reenrich] Querying enriched catalog rows…');
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, holes, tees, hole_count, total_par, last_enriched_at')
        .eq('source', 'opengolf')
        .not('last_enriched_at', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as CourseRow[];
      candidates.push(...rows);
      process.stdout.write(`\r[reenrich] loaded ${candidates.length} enriched rows`);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    process.stdout.write('\n');
  }

  // ---- Filter ----
  const targets = allEnriched || singleId
    ? candidates
    : candidates.filter(needsHandicapBackfill);

  console.log(
    `[reenrich] ${candidates.length} candidate rows, ${targets.length} matched filter.`
  );
  if (targets.length === 0) {
    console.log('[reenrich] Nothing to do. Exiting.');
    return;
  }

  const work = limit !== null ? targets.slice(0, limit) : targets;
  if (work.length < targets.length) {
    console.log(`[reenrich] --limit ${limit} caps work to ${work.length}/${targets.length}.`);
  }

  // ---- Process ----
  let ok = 0;
  let failed = 0;
  let unchanged = 0;
  const errors: { id: string; error: string }[] = [];

  for (let i = 0; i < work.length; i++) {
    const row = work[i];
    const externalId = row.id.startsWith(OPENGOLF_ID_PREFIX)
      ? row.id.slice(OPENGOLF_ID_PREFIX.length)
      : null;
    const label = `[${i + 1}/${work.length}] ${row.id} (${row.name})`;
    if (!externalId) {
      console.warn(`${label} — skipped: id missing opengolf: prefix`);
      failed++;
      continue;
    }

    const result = await fetchEnriched(externalId);
    if (!result.ok) {
      console.warn(`${label} — ERROR: ${result.error}`);
      errors.push({ id: row.id, error: result.error });
      failed++;
      if (throttleMs > 0) await sleep(throttleMs);
      continue;
    }

    // Detect no-op: every existing hole already carries the same
    // par + handicapIndex as the new fetch. Cheap pre-check to avoid
    // spamming UPDATEs (and to give the operator visibility into
    // how much actually drifted).
    const existingHoles = Array.isArray(row.holes) ? (row.holes as unknown[]) : [];
    const changed = result.holes.length !== existingHoles.length
      || result.holes.some((h, idx) => {
        const ex = existingHoles[idx] as Record<string, unknown> | undefined;
        if (!ex) return true;
        if (ex.par !== h.par) return true;
        if ((ex.handicapIndex ?? null) !== (h.handicapIndex ?? null)) return true;
        return false;
      });

    if (!changed) {
      console.log(`${label} — no change`);
      unchanged++;
      if (throttleMs > 0) await sleep(throttleMs);
      continue;
    }

    if (dryRun) {
      const before = existingHoles
        .filter((h) => h && typeof h === 'object' && (h as Record<string, unknown>).handicapIndex == null)
        .length;
      const after = result.holes.filter((h) => h.handicapIndex == null).length;
      console.log(
        `${label} — would update (${before} holes missing hcp before → ${after} after, ${result.tees.length} tees)`
      );
      ok++;
      if (throttleMs > 0) await sleep(throttleMs);
      continue;
    }

    const { error } = await supabase
      .from('courses')
      .update({
        holes: result.holes,
        tees: result.tees,
        hole_count: result.holeCount,
        total_par: result.totalPar,
        last_enriched_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('source', 'opengolf');

    if (error) {
      console.warn(`${label} — UPDATE failed: ${error.message}`);
      errors.push({ id: row.id, error: error.message });
      failed++;
    } else {
      console.log(`${label} — updated (${result.holes.length} holes, ${result.tees.length} tees)`);
      ok++;
    }

    if (throttleMs > 0) await sleep(throttleMs);
  }

  console.log('');
  console.log('========================================');
  console.log(`[reenrich] Done.`);
  console.log(`  updated     : ${ok}`);
  console.log(`  unchanged   : ${unchanged}`);
  console.log(`  failed      : ${failed}`);
  if (errors.length > 0) {
    console.log('');
    console.log('[reenrich] First 10 errors:');
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.id} — ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error('[reenrich] Fatal:', err);
  process.exit(1);
});
