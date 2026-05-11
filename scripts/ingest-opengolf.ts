/**
 * One-shot ingest of the OpenGolfAPI US course dataset.
 *
 * Pulls the canonical CSV bulk export from the opengolfapi/data GitHub
 * repo, parses it, and upserts every course into the `courses` table
 * under `source = 'opengolf'`, owner_user_id NULL.
 *
 * Run via:
 *
 *   tsx scripts/ingest-opengolf.ts            # against remote env (vars below)
 *   tsx scripts/ingest-opengolf.ts --dry-run  # parse + print stats, no DB writes
 *
 * Required env (typically loaded from `.env.local` via dotenv):
 *
 *   SUPABASE_URL                 - your project URL
 *   SUPABASE_SERVICE_ROLE_KEY    - SERVICE ROLE key (bypasses RLS).
 *                                  Never commit. Never ship to clients.
 *
 * The script is idempotent: it upserts on `id`, so re-running pulls in
 * any updates from a fresher bulk file. Existing custom courses are
 * untouched (different `id` namespace + different `source`).
 *
 * Source: https://github.com/opengolfapi/data
 * License: ODbL 1.0 — attribution required wherever this data appears.
 */

import { createClient } from '@supabase/supabase-js';
import { gunzipSync } from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

const BULK_URL = 'https://raw.githubusercontent.com/opengolfapi/data/main/opengolfapi-us.csv.gz';
const SOURCE = 'opengolf' as const;
const BATCH_SIZE = 500;

type CsvRow = Record<string, string>;

type CourseRow = {
  id: string;
  owner_user_id: null;
  source: 'opengolf';
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  course_type: string | null;
  hole_count: number;
  total_par: number | null;
  total_yardage: number | null;
  year_built: number | null;
  architect: string | null;
  phone: string | null;
  website: string | null;
  holes: Array<{ number: number; par: number; handicapIndex?: number }>;
  tees: never[];
  source_external_id: string | null;
  source_updated_at: string | null;
};

// ---------- argv ----------
const dryRun = process.argv.includes('--dry-run');

// ---------- env ----------
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (or pass --dry-run).'
  );
  process.exit(1);
}

// ---------- helpers ----------

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields with embedded
 * commas, escaped quotes (`""`), and CRLF line endings. Returns an array
 * of objects keyed by the header row.
 */
function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else if (ch === '\r') {
      // ignore; handled by following \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  const out: CsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length === 1 && cols[0] === '') continue; // trailing newline
    const obj: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = cols[c] ?? '';
    }
    out.push(obj);
  }
  return out;
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseIntOrNull(v: string | undefined | null): number | null {
  const s = emptyToNull(v);
  if (s === null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatOrNull(v: string | undefined | null): number | null {
  const s = emptyToNull(v);
  if (s === null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function rowToCourse(row: CsvRow): CourseRow | null {
  const id = emptyToNull(row.id);
  const name = emptyToNull(row.name);
  if (!id || !name) return null;

  // NOTE: We deliberately do NOT carry the bulk export's hole data over
  // into our DB. The upstream CSV / NDJSON / GeoJSON generators have a
  // bug that drops scorecard entries (Holmes Harbor is missing 5 of 18
  // pars in the bulk but complete in the live `/v1/courses/:id`
  // endpoint). Catalog rows ship empty `holes`; the client enriches
  // them lazily on first use via the `enrich_catalog_course` RPC.
  const holes: CourseRow['holes'] = [];

  // hole_count comes from the bulk's `holes` column for display in
  // search results; once the client enriches the row, the trustworthy
  // value will be holes.length on the row itself.
  const hole_count = parseIntOrNull(row.holes) ?? 0;
  if (hole_count <= 0) return null;

  return {
    id: `opengolf:${id}`,
    owner_user_id: null,
    source: SOURCE,
    name,
    city: emptyToNull(row.city),
    state: emptyToNull(row.state),
    country: emptyToNull(row.country),
    address: emptyToNull(row.address),
    postal_code: emptyToNull(row.postal_code),
    latitude: parseFloatOrNull(row.latitude),
    longitude: parseFloatOrNull(row.longitude),
    course_type: emptyToNull(row.type),
    hole_count,
    total_par: parseIntOrNull(row.par),
    total_yardage: parseIntOrNull(row.total_yardage),
    year_built: parseIntOrNull(row.year_built),
    architect: emptyToNull(row.architect),
    phone: emptyToNull(row.phone),
    website: emptyToNull(row.website),
    holes,
    tees: [],
    source_external_id: id,
    source_updated_at: emptyToNull(row.updated_at),
  };
}

async function downloadBulk(): Promise<string> {
  const cachePath = path.resolve('.cache/opengolf/opengolfapi-us.csv.gz');
  const cachedCsvPath = path.resolve('.cache/opengolf/opengolfapi-us.csv');

  if (fs.existsSync(cachedCsvPath)) {
    console.log(`[ingest] Using cached CSV at ${cachedCsvPath}`);
    return fs.readFileSync(cachedCsvPath, 'utf-8');
  }

  console.log(`[ingest] Downloading bulk CSV from ${BULK_URL}…`);
  const res = await fetch(BULK_URL);
  if (!res.ok) {
    throw new Error(`Bulk download failed: HTTP ${res.status}`);
  }
  const gzBuf = Buffer.from(await res.arrayBuffer());

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, gzBuf);

  console.log(`[ingest] Decompressing…`);
  const csvBuf = gunzipSync(gzBuf);
  fs.writeFileSync(cachedCsvPath, csvBuf);
  console.log(`[ingest] Cached at ${cachedCsvPath} (${(csvBuf.length / 1_000_000).toFixed(2)} MB)`);
  return csvBuf.toString('utf-8');
}

async function main() {
  const csvText = await downloadBulk();

  console.log('[ingest] Parsing CSV…');
  const t0 = Date.now();
  const rows = parseCsv(csvText);
  console.log(`[ingest] Parsed ${rows.length} CSV rows in ${Date.now() - t0}ms.`);

  const courses: CourseRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const course = rowToCourse(row);
    if (course) courses.push(course);
    else skipped++;
  }
  console.log(
    `[ingest] Transformed ${courses.length} courses (${skipped} skipped for missing id/name).`
  );

  if (dryRun) {
    console.log('[ingest] Dry run — sample course:');
    console.log(JSON.stringify(courses[0], null, 2));
    return;
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[ingest] Upserting in batches of ${BATCH_SIZE}…`);
  let upserted = 0;
  for (let i = 0; i < courses.length; i += BATCH_SIZE) {
    const batch = courses.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('courses')
      .upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`[ingest] Batch ${i / BATCH_SIZE} failed:`, error);
      throw error;
    }
    upserted += batch.length;
    process.stdout.write(`\r[ingest] Upserted ${upserted}/${courses.length}`);
  }
  process.stdout.write('\n');
  console.log(`[ingest] Done. ${upserted} catalog rows in the courses table.`);
}

main().catch((err) => {
  console.error('[ingest] Fatal:', err);
  process.exit(1);
});
