/**
 * Bulk-enrich every catalog course that has no per-hole yardages.
 *
 *   tsx scripts/bulk-enrich-catalog.ts            # run for real
 *   tsx scripts/bulk-enrich-catalog.ts --dry-run  # print plan only
 *   tsx scripts/bulk-enrich-catalog.ts --filter Holmes   # only courses whose name matches
 *
 * Iterates every `source = 'opengolf'` row in `public.courses` that the
 * one-time data fix in migration 015 reset (`last_enriched_at IS NULL`,
 * regardless of whether it had tees before). For each row:
 *
 *   1. Fetch `/v1/courses/:id`, `/v1/courses/:id/tees`,
 *      `/v1/courses/:id/holes` from OpenGolfAPI.
 *   2. Build the rich `holes` + `tees` jsonb the way the client does
 *      (mirrors dedupeTees + buildHoles in state/GolfRoundContext).
 *   3. Write directly via the service-role client (bypasses the RPC's
 *      authenticated-user check). Sets `last_enriched_at = now()` so the
 *      next client to open the course short-circuits cleanly.
 *
 * Throttled to ~3 req/sec to stay polite with the public API.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (same as the
 * other scripts in this folder). Idempotent — re-running only hits rows
 * that are still unenriched.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const dryRun = process.argv.includes('--dry-run');
const filterIdx = process.argv.indexOf('--filter');
const filter = filterIdx >= 0 ? process.argv[filterIdx + 1]?.toLowerCase() : null;

// Throttle to 3 req/sec.
async function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
const THROTTLE_MS = 350;

type Tee = {
  id: string;
  name: string;
  color?: string;
  slope?: number;
  rating?: number;
  totalYardage?: number;
  gender?: 'M' | 'F';
};

type Hole = {
  number: number;
  par: number;
  handicapIndex?: number;
  yardages?: Record<string, number>;
};

function numOrUndef(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Mirrors state/GolfRoundContext.tsx dedupeTees.
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

// Mirrors state/GolfRoundContext.tsx buildHoles.
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

async function fetchUpstream(externalId: string) {
  const [baseRes, teesRes, holesRes] = await Promise.all([
    fetch(`https://api.opengolfapi.org/v1/courses/${externalId}`),
    fetch(`https://api.opengolfapi.org/v1/courses/${externalId}/tees`),
    fetch(`https://api.opengolfapi.org/v1/courses/${externalId}/holes`),
  ]);
  if (!baseRes.ok) {
    throw new Error(`base HTTP ${baseRes.status}`);
  }
  const base = await baseRes.json();
  const teesJson = teesRes.ok ? await teesRes.json() : { tees: [] };
  const holesJson = holesRes.ok ? await holesRes.json() : { holes: [] };
  return { base, tees: teesJson, holes: holesJson };
}

async function main() {
  console.log('=== Bulk catalog enrichment ===');
  if (dryRun) console.log('(dry-run mode)');
  if (filter) console.log(`filter: name ILIKE %${filter}%`);

  let query = admin
    .from('courses')
    .select('id, name, source_external_id, last_enriched_at, tees, holes')
    .eq('source', 'opengolf')
    .is('last_enriched_at', null);
  if (filter) {
    query = query.ilike('name', `%${filter}%`);
  }
  const { data: rows, error } = await query;
  if (error) throw error;

  const candidates = (rows ?? []) as Array<{
    id: string;
    name: string;
    source_external_id: string | null;
    last_enriched_at: string | null;
    tees: unknown;
    holes: unknown;
  }>;

  console.log(`\nFound ${candidates.length} catalog rows to enrich.`);
  if (candidates.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const externalId =
      row.source_external_id ??
      (row.id.startsWith('opengolf:') ? row.id.slice('opengolf:'.length) : null);
    if (!externalId) {
      console.log(`  [${i + 1}/${candidates.length}] ${row.name}  SKIP (no external id)`);
      skipped++;
      continue;
    }

    try {
      const { base, tees: teesJson, holes: holesJson } = await fetchUpstream(externalId);
      const tees = dedupeTees(teesJson?.tees ?? []);
      const rawHoles =
        Array.isArray(holesJson?.holes) && holesJson.holes.length > 0
          ? holesJson.holes
          : Array.isArray(base?.scorecard)
          ? base.scorecard
          : [];
      const holes = buildHoles(rawHoles, tees);

      const holesWithYardages = holes.filter(
        (h) => h.yardages && Object.keys(h.yardages).length > 0
      ).length;

      const apiHoleCount = Number(base?.holes_count);
      const apiTotalPar = Number(base?.par_total);
      const enrichedHoleCount = Number.isFinite(apiHoleCount) ? apiHoleCount : holes.length;
      const enrichedTotalPar = Number.isFinite(apiTotalPar)
        ? apiTotalPar
        : holes.reduce((t, h) => t + h.par, 0);

      console.log(
        `  [${i + 1}/${candidates.length}] ${row.name}  ` +
          `tees=${tees.length}  holes=${holes.length}  ydg=${holesWithYardages}`
      );

      if (!dryRun) {
        // Write directly via service role: replace jsonb, stamp timestamp.
        // Equivalent to what the new RPC does, but bypasses the
        // authenticated-user check so this script can run unattended.
        const update: Record<string, unknown> = {
          last_enriched_at: new Date().toISOString(),
          hole_count: enrichedHoleCount,
          total_par: enrichedTotalPar,
        };
        if (holes.length > 0) update.holes = holes;
        if (tees.length > 0) update.tees = tees;
        const { error: updateErr } = await admin
          .from('courses')
          .update(update)
          .eq('id', row.id);
        if (updateErr) throw updateErr;
      }
      ok++;
    } catch (err: any) {
      console.log(
        `  [${i + 1}/${candidates.length}] ${row.name}  FAIL  ${err?.message ?? err}`
      );
      failed++;
    }

    if (i < candidates.length - 1) await sleep(THROTTLE_MS);
  }

  console.log(`\nDone. ok=${ok}  failed=${failed}  skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
