/**
 * Backfill missing fields into already-snapshotted scorecards.
 *
 * Use case: when we add a new field to the catalog data pipeline
 * (e.g. `handicapIndex` on each hole), already-snapshotted
 * `scorecards.course_snapshot` jsonb columns don't pick it up
 * because rounds are intentionally self-contained — they read
 * from their own snapshot, not from the live catalog. This script
 * overlays missing fields from the canonical `public.courses` row
 * onto each scorecard's snapshot.
 *
 * Companion to `scripts/reenrich-opengolf.ts`. Typical workflow:
 *
 *   1. Add a new field to courseEnrichment.ts / useCourses.ts.
 *   2. Deploy code.
 *   3. Run reenrich-opengolf to backfill canonical catalog rows.
 *   4. Run THIS script to overlay missing fields into past rounds.
 *
 * Run via:
 *
 *   tsx scripts/resnapshot-rounds.ts                              # uses .env.local
 *   tsx scripts/resnapshot-rounds.ts --dry-run                    # show what would change
 *   tsx scripts/resnapshot-rounds.ts --env .prod.env              # write to prod
 *   tsx scripts/resnapshot-rounds.ts --id <scorecard-id>          # single round (testing)
 *   tsx scripts/resnapshot-rounds.ts --throttle-ms 100            # slow down between writes
 *   tsx scripts/resnapshot-rounds.ts --limit 50                   # cap the work
 *
 * Required env (loaded from `--env` file, defaults to `.env.local`):
 *
 *   SUPABASE_URL                 - your project URL
 *   SUPABASE_SERVICE_ROLE_KEY    - SERVICE ROLE key (bypasses RLS).
 *                                  Never commit. Never ship to clients.
 *
 * Important: this script DOES NOT bump `scorecards.updated_at`. The
 * column is only written when the UPDATE explicitly sets it, and we
 * deliberately leave it out so backfilled rounds don't resurface to
 * the top of every viewer's feed.
 *
 * Conservative merge: overlays missing values only. Never overwrites
 * an existing snapshot value — the snapshot is the source of truth
 * for what the player was scoring under (par, course name, tee
 * names, etc.). We only fill in gaps the canonical course has
 * filled in since the round was captured.
 *
 * Backfill registry: each entry mutates a Course snapshot in place
 * and returns true if anything changed. Adding a new entry is the
 * extension point for future field additions — keep the apply
 * function as narrow as possible (one field per entry) so the
 * dry-run output stays legible.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// ---------- argv ----------
const dryRun = process.argv.includes('--dry-run');

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
    : 100;

const limitFlagIndex = process.argv.indexOf('--limit');
const limit =
  limitFlagIndex >= 0 && process.argv[limitFlagIndex + 1]
    ? Math.max(1, parseInt(process.argv[limitFlagIndex + 1], 10) || 0)
    : null;

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

console.log(`[resnapshot] env file       : ${envFile}`);
console.log(`[resnapshot] target         : ${SUPABASE_URL}`);
console.log(
  `[resnapshot] mode           : ${singleId ? `single-id (${singleId})` : 'all-scorecards'}${dryRun ? ' DRY-RUN (no writes)' : ''}`
);
console.log(`[resnapshot] throttle (ms)  : ${throttleMs}`);
if (limit !== null) console.log(`[resnapshot] limit          : ${limit}`);

// =====================================================================
// Course shape — intentionally minimal subset of src/types/golf.ts.
// Both this script and the live app's parsers tolerate extra keys
// passing through, so we model only what the backfill registry reads
// or writes.
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
  colorToken?: string;
  slope?: number;
  rating?: number;
  totalYardage?: number;
};

type Course = {
  id: string;
  name?: string;
  holes?: Hole[];
  tees?: Tee[];
  [key: string]: unknown;
};

// =====================================================================
// Backfill registry — one entry per field that may be missing from
// historical snapshots. Each entry mutates `snapshot` in place and
// returns the number of leaf values it backfilled (used for the
// dry-run summary).
// =====================================================================

type BackfillResult = { count: number; description: string };

type Backfill = {
  /** Short label used in the per-round dry-run output. */
  label: string;
  /** Apply the backfill in place. Returns count of backfilled values. */
  apply: (snapshot: Course, canonical: Course) => BackfillResult;
};

const BACKFILLS: Backfill[] = [
  {
    label: 'holes[*].handicapIndex',
    apply: (snap, canon) => {
      let count = 0;
      if (!Array.isArray(snap.holes) || !Array.isArray(canon.holes)) {
        return { count: 0, description: 'no holes array on snapshot or canonical' };
      }
      const canonByNumber = new Map<number, Hole>();
      for (const h of canon.holes) {
        if (typeof h?.number === 'number') canonByNumber.set(h.number, h);
      }
      for (const h of snap.holes) {
        if (typeof h?.number !== 'number') continue;
        if (h.handicapIndex !== undefined && h.handicapIndex !== null) continue;
        const c = canonByNumber.get(h.number);
        if (
          c &&
          typeof c.handicapIndex === 'number' &&
          c.handicapIndex >= 1 &&
          c.handicapIndex <= 18
        ) {
          h.handicapIndex = c.handicapIndex;
          count++;
        }
      }
      return { count, description: `filled ${count} hole handicapIndex` };
    },
  },
  {
    label: 'tees[*].color',
    apply: (snap, canon) => {
      let count = 0;
      if (!Array.isArray(snap.tees) || !Array.isArray(canon.tees)) {
        return { count: 0, description: 'no tees array on snapshot or canonical' };
      }
      const canonById = new Map<string, Tee>();
      for (const t of canon.tees) {
        if (typeof t?.id === 'string') canonById.set(t.id, t);
      }
      for (const t of snap.tees) {
        if (typeof t?.id !== 'string') continue;
        if (typeof t.color === 'string' && t.color.length > 0) continue;
        const c = canonById.get(t.id);
        if (c && typeof c.color === 'string' && c.color.length > 0) {
          t.color = c.color;
          count++;
        }
      }
      return { count, description: `filled ${count} tee color` };
    },
  },
];

// =====================================================================
// DB types
// =====================================================================

type ScorecardRow = {
  id: string;
  course_id: string | null;
  course_snapshot: unknown;
};

type CourseRow = {
  id: string;
  holes: unknown;
  tees: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCourse(raw: unknown): Course | null {
  if (raw == null) return null;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Course;
}

// =====================================================================
// Main
// =====================================================================

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Load candidate scorecards ----
  let scorecards: ScorecardRow[] = [];
  if (singleId) {
    const { data, error } = await supabase
      .from('scorecards')
      .select('id, course_id, course_snapshot')
      .eq('id', singleId);
    if (error) throw error;
    scorecards = (data ?? []) as ScorecardRow[];
  } else {
    console.log('[resnapshot] Querying scorecards…');
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('scorecards')
        .select('id, course_id, course_snapshot')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as ScorecardRow[];
      scorecards.push(...rows);
      process.stdout.write(`\r[resnapshot] loaded ${scorecards.length} scorecards`);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    process.stdout.write('\n');
  }

  if (scorecards.length === 0) {
    console.log('[resnapshot] No scorecards found. Exiting.');
    return;
  }

  const work = limit !== null ? scorecards.slice(0, limit) : scorecards;
  if (work.length < scorecards.length) {
    console.log(`[resnapshot] --limit ${limit} caps work to ${work.length}/${scorecards.length}.`);
  }

  // ---- Cache canonical courses to avoid refetching for shared catalog rows ----
  const courseCache = new Map<string, Course | null>();
  async function loadCanonical(courseId: string): Promise<Course | null> {
    if (courseCache.has(courseId)) return courseCache.get(courseId) ?? null;
    const { data, error } = await supabase
      .from('courses')
      .select('id, holes, tees')
      .eq('id', courseId)
      .maybeSingle();
    if (error) {
      console.warn(`[resnapshot] course ${courseId} fetch error: ${error.message}`);
      courseCache.set(courseId, null);
      return null;
    }
    if (!data) {
      courseCache.set(courseId, null);
      return null;
    }
    const row = data as CourseRow;
    const course: Course = {
      id: row.id,
      holes: Array.isArray(row.holes) ? (row.holes as Hole[]) : [],
      tees: Array.isArray(row.tees) ? (row.tees as Tee[]) : [],
    };
    courseCache.set(courseId, course);
    return course;
  }

  // ---- Process ----
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { id: string; error: string }[] = [];
  const backfillTotals = new Map<string, number>();
  for (const b of BACKFILLS) backfillTotals.set(b.label, 0);

  for (let i = 0; i < work.length; i++) {
    const row = work[i];
    const label = `[${i + 1}/${work.length}] ${row.id}`;

    if (!row.course_id) {
      console.log(`${label} — skipped: no course_id`);
      skipped++;
      continue;
    }

    const snapshot = parseCourse(row.course_snapshot);
    if (!snapshot) {
      console.log(`${label} — skipped: unparseable course_snapshot`);
      skipped++;
      continue;
    }

    const canonical = await loadCanonical(row.course_id);
    if (!canonical) {
      console.log(`${label} — skipped: canonical course ${row.course_id} not found`);
      skipped++;
      continue;
    }

    // Apply every backfill in order. Each mutates `snapshot` in
    // place. Aggregate the per-backfill changes for the per-round
    // summary line.
    const changes: string[] = [];
    let totalChanges = 0;
    for (const backfill of BACKFILLS) {
      const result = backfill.apply(snapshot, canonical);
      if (result.count > 0) {
        changes.push(`${backfill.label}: +${result.count}`);
        totalChanges += result.count;
        backfillTotals.set(
          backfill.label,
          (backfillTotals.get(backfill.label) ?? 0) + result.count
        );
      }
    }

    if (totalChanges === 0) {
      unchanged++;
      // Don't log unchanged rows individually — too noisy on a large run.
      continue;
    }

    if (dryRun) {
      console.log(`${label} — would update: ${changes.join(', ')}`);
      updated++;
      if (throttleMs > 0) await sleep(throttleMs);
      continue;
    }

    // Write back. Deliberately omit `updated_at` from the SET clause
    // — there's no BEFORE UPDATE trigger on scorecards that bumps it,
    // so the existing value is preserved and the feed doesn't
    // re-sort this round to the top.
    const { error } = await supabase
      .from('scorecards')
      .update({ course_snapshot: snapshot })
      .eq('id', row.id);

    if (error) {
      console.warn(`${label} — UPDATE failed: ${error.message}`);
      errors.push({ id: row.id, error: error.message });
      failed++;
    } else {
      console.log(`${label} — updated: ${changes.join(', ')}`);
      updated++;
    }

    if (throttleMs > 0) await sleep(throttleMs);
  }

  console.log('');
  console.log('========================================');
  console.log(`[resnapshot] Done.`);
  console.log(`  updated     : ${updated}`);
  console.log(`  unchanged   : ${unchanged}`);
  console.log(`  skipped     : ${skipped}`);
  console.log(`  failed      : ${failed}`);
  console.log('');
  console.log('[resnapshot] Per-backfill totals:');
  for (const b of BACKFILLS) {
    const total = backfillTotals.get(b.label) ?? 0;
    console.log(`  ${b.label.padEnd(28)} ${total}`);
  }
  if (errors.length > 0) {
    console.log('');
    console.log('[resnapshot] First 10 errors:');
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.id} — ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error('[resnapshot] Fatal:', err);
  process.exit(1);
});
