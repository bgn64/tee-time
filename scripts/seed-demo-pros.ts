/**
 * Demo-data reset + pro-player imposter seeding.
 *
 *   tsx scripts/seed-demo-pros.ts            # nukes users + reseeds
 *   tsx scripts/seed-demo-pros.ts --dry-run  # print plan only
 *
 * Each run:
 *
 *   1. WIPES every auth.users row. ON DELETE CASCADE chains through to
 *      profiles, friendships, roster_players, and scorecards — leaving
 *      the `courses` catalog intact (it's not user-owned). Custom
 *      user-authored courses ARE deleted along with their owning user;
 *      that's expected. Catalog ('opengolf' source) courses stay.
 *
 *   2. CREATES four pro-player imposter accounts with realistic
 *      handles, display names, and avatar colors. Each is marked
 *      profiles.is_demo_seed = true so the auto-friend trigger
 *      (migration 016) wires them into every future sign-up's friend
 *      list automatically. Emails are non-deliverable placeholders
 *      under @teetime.demo — nobody signs in as these accounts.
 *
 *   3. SEEDS a handful of rounds per pro. Hand-picked famous-venue
 *      courses where they exist in the catalog (TPC Sawgrass, Pebble
 *      Beach, etc.); falls back to bgn64's favorite courses (which
 *      we know are enriched with full tee + hole data) when the
 *      famous ones aren't available. Scores plausibly tour-pro-ish
 *      (-5 to +1) with deterministic RNG so re-runs are identical.
 *
 * Requires migration 016 to be applied (otherwise is_demo_seed
 * column won't exist and the script's profile insert will fail).
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

import { CourseRow, enrichCourseInPlace, isFullyEnriched } from './lib/enrich';

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

// ---------- deterministic RNG ----------
let rngState = 0xfacade;
function rnd(): number {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 0x100000000;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

// ---------- pro player imposters ----------
type Pro = {
  handle: string;
  displayName: string;
  email: string;
  avatarColor: string;
  /** Tour-pro performance band: per-round avg relative-to-par. */
  avgRel: number;
};

const PROS: Pro[] = [
  {
    handle: 'rory',
    displayName: 'Rory McIlroy',
    email: 'rory@teetime.demo',
    avatarColor: '#10b981',
    avgRel: -4,
  },
  {
    handle: 'scottie',
    displayName: 'Scottie Scheffler',
    email: 'scottie@teetime.demo',
    avatarColor: '#ef5350',
    avgRel: -5,
  },
  {
    handle: 'bryson',
    displayName: 'Bryson DeChambeau',
    email: 'bryson@teetime.demo',
    avatarColor: '#ff8f00',
    avgRel: -3,
  },
  {
    handle: 'xander',
    displayName: 'Xander Schauffele',
    email: 'xander@teetime.demo',
    avatarColor: '#42a5f5',
    avgRel: -4,
  },
];

// ---------- famous-venue names to search the catalog for ----------
// Substring matches are case-insensitive. Falls back to bgn64-style
// well-enriched courses (any course with non-empty tees) if a famous
// venue isn't in the catalog.
const FAMOUS_VENUE_HINTS: readonly string[] = [
  'Pebble Beach',
  'TPC Sawgrass',
  'Bay Hill',
  'Riviera',
  'Quail Hollow',
  'Bethpage Black',
  'Torrey Pines',
  'Harbour Town',
  'Muirfield Village',
];

const FAKE_CAPTIONS = [
  'Felt the putter come alive on the back.',
  'Hard course, fair test. Loved it.',
  'Wind got us today. Still grinding.',
  'Birdie streak on the par 5s saved the day.',
  '',
  '',
  'Fairways were running. Pure conditions.',
  'Practice round vibes ahead of the weekend.',
];

function rowToCourseSnapshot(row: CourseRow): Record<string, unknown> {
  const city = row.city ?? undefined;
  const state = row.state ?? undefined;
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
}

async function main() {
  console.log('=== Demo-data reset + pro seeding ===');
  if (dryRun) console.log('(dry-run mode)');

  // ---------- 1. WIPE every auth user ----------
  console.log('\n=== Wiping all user data ===');
  const { data: usersListing, error: listErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const users = usersListing.users;
  console.log(`Found ${users.length} auth users to delete (cascades to all user data):`);
  for (const u of users) console.log(`  ${u.id}  ${u.email ?? '(no email)'}`);

  if (!dryRun) {
    for (const u of users) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) console.warn(`  ! failed to delete ${u.id}: ${error.message}`);
    }
    console.log(`Deleted ${users.length} auth users.`);
  }

  // ---------- 2. Build the venue pool ----------
  console.log('\n=== Building venue pool ===');
  const venuePool: CourseRow[] = [];
  for (const hint of FAMOUS_VENUE_HINTS) {
    const { data, error } = await admin
      .from('courses')
      .select('*')
      .eq('source', 'opengolf')
      .ilike('name', `%${hint}%`)
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      const row = data[0] as CourseRow;
      const enriched = (row.holes ?? []).some(
        (h) => h.yardages && Object.keys(h.yardages).length > 0
      );
      console.log(`  ${hint.padEnd(20)} -> ${row.name}  enriched=${enriched}`);
      venuePool.push(row);
    } else {
      console.log(`  ${hint.padEnd(20)} -> (not in catalog)`);
    }
  }

  // Top up with any opengolf rows that have full per-hole yardages, so
  // we always have at least a few good venues.
  if (venuePool.length < 5) {
    const { data: enrichedExtras } = await admin
      .from('courses')
      .select('*')
      .eq('source', 'opengolf')
      .not('last_enriched_at', 'is', null)
      .limit(8);
    for (const row of (enrichedExtras ?? []) as CourseRow[]) {
      if (venuePool.some((v) => v.id === row.id)) continue;
      const enriched = (row.holes ?? []).some(
        (h) => h.yardages && Object.keys(h.yardages).length > 0
      );
      if (enriched) {
        venuePool.push(row);
        if (venuePool.length >= 8) break;
      }
    }
    console.log(`  topped up venue pool to ${venuePool.length} via enriched fallback`);
  }

  if (venuePool.length === 0) {
    console.error('No venues available. Aborting.');
    process.exit(1);
  }

  // ---------- 2b. Ensure each venue is fully enriched ----------
  // The snapshot we embed in each scorecard gets baked in permanently —
  // even after the catalog row gets enriched later. So we enrich here
  // before creating the rounds, otherwise demo cards would render with
  // no tee bars / no yardage rows. enrichCourseInPlace is a no-op when
  // the row already has tees + per-hole yardages, so this is cheap on
  // re-runs.
  console.log('\n=== Enriching venues (one-time per row) ===');
  if (dryRun) {
    for (const row of venuePool) {
      const enriched = isFullyEnriched(row);
      console.log(
        `  ${row.name.padEnd(40)} enriched=${enriched}` + (enriched ? '' : '  (would fetch)')
      );
    }
  } else {
    for (let i = 0; i < venuePool.length; i++) {
      const row = venuePool[i];
      if (isFullyEnriched(row)) {
        console.log(`  ${row.name.padEnd(40)} already enriched, skipping`);
        continue;
      }
      try {
        await enrichCourseInPlace(admin, row);
        const after = isFullyEnriched(row);
        console.log(
          `  ${row.name.padEnd(40)} ${after ? 'enriched' : 'fetched but no per-hole data upstream'}`
        );
      } catch (err) {
        console.warn(`  ${row.name.padEnd(40)} FAILED: ${(err as Error).message}`);
      }
      // Light throttle between fetches.
      if (i < venuePool.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
  }

  // Drop any venues that still lack per-hole data after the enrichment
  // attempt — embedding their snapshots in demo rounds would leave the
  // scorecards looking broken. If we end up with zero usable venues,
  // bail loudly.
  const usableVenues = venuePool.filter(isFullyEnriched);
  if (!dryRun) {
    if (usableVenues.length === 0) {
      console.error(
        '\nNo usable enriched venues remained after the enrichment pass. Aborting.'
      );
      process.exit(1);
    }
    if (usableVenues.length < venuePool.length) {
      console.log(
        `\nProceeding with ${usableVenues.length} of ${venuePool.length} venues that have per-hole data.`
      );
    }
  }
  const finalPool = dryRun ? venuePool : usableVenues;

  // ---------- 3. Create the pros ----------
  console.log('\n=== Creating pro imposter accounts ===');
  const proUserIds: string[] = [];
  for (const pro of PROS) {
    if (dryRun) {
      console.log(`  [dry-run] would create ${pro.handle} <${pro.email}>`);
      proUserIds.push(`(dry-run-${pro.handle})`);
      continue;
    }
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: pro.email,
      password: `demo-${pro.handle}-${Math.random().toString(36).slice(2, 10)}`,
      email_confirm: true,
    });
    if (authErr || !authData.user) {
      console.error(`  ! createUser(${pro.email}) failed: ${authErr?.message}`);
      continue;
    }
    const userId = authData.user.id;
    proUserIds.push(userId);

    const { error: profErr } = await admin.from('profiles').insert({
      user_id: userId,
      handle: pro.handle,
      display_name: pro.displayName,
      avatar_color: pro.avatarColor,
      is_demo_seed: true,
    });
    if (profErr) {
      console.error(`  ! profile insert for ${pro.handle} failed: ${profErr.message}`);
      continue;
    }
    console.log(`  ${pro.handle.padEnd(10)} ${pro.displayName.padEnd(22)} ${userId}`);
  }

  // ---------- 4. Seed rounds per pro ----------
  console.log('\n=== Seeding rounds per pro ===');
  const ROUNDS_PER_PRO = 5;
  const now = Date.now();
  const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;
  const inserts: Record<string, unknown>[] = [];

  for (let pi = 0; pi < PROS.length; pi++) {
    const pro = PROS[pi];
    const ownerUserId = proUserIds[pi];
    if (!ownerUserId || ownerUserId.startsWith('(dry-run')) {
      // dry-run path — still print the plan
      for (let i = 0; i < ROUNDS_PER_PRO; i++) {
        const venue = finalPool[(pi * ROUNDS_PER_PRO + i) % finalPool.length];
        console.log(`  [dry-run] ${pro.handle.padEnd(10)} ${venue.name}`);
      }
      continue;
    }
    for (let i = 0; i < ROUNDS_PER_PRO; i++) {
      // Cycle through the venue pool so each pro hits a different mix.
      const venue = finalPool[(pi * ROUNDS_PER_PRO + i) % finalPool.length];

      const ownerKey = 'user';
      const participants = [
        {
          participantKey: ownerKey,
          linkedUserId: ownerUserId,
        },
      ];

      // Per-hole strokes around par + pro's avgRel skill band + small jitter.
      const holes = venue.holes ?? [];
      const scores: Array<{ scorerId: string; holeNumber: number; strokes: number }> = [];
      for (const h of holes) {
        // Distribute the pro's avg-rel over the round with bias toward
        // birdies on par 5s.
        let rel: number;
        const r = rnd();
        if (h.par >= 5) {
          // Par 5: half birdies, third pars, rest scattered.
          rel = r < 0.55 ? -1 : r < 0.85 ? 0 : r < 0.95 ? -2 : 1;
        } else if (h.par === 3) {
          // Par 3: mostly pars, occasional birdie, rare bogey.
          rel = r < 0.65 ? 0 : r < 0.85 ? -1 : 1;
        } else {
          // Par 4: pars + birdies bias, sprinkle of bogeys.
          rel = r < 0.45 ? 0 : r < 0.75 ? -1 : r < 0.9 ? 1 : -2;
        }
        scores.push({
          scorerId: ownerKey,
          holeNumber: h.number,
          strokes: Math.max(1, h.par + rel),
        });
      }

      const id = `demo:${pro.handle}:${i.toString().padStart(2, '0')}-${rnd()
        .toString(36)
        .slice(2, 7)}`;

      const completedAt = new Date(now - (pi * ROUNDS_PER_PRO + i) * 60 * 60 * 1000 * 18 - rnd() * SIX_MONTHS_MS);
      const startedAt = new Date(completedAt.getTime() - 4 * 60 * 60 * 1000);

      const caption = pick(FAKE_CAPTIONS) || null;

      inserts.push({
        id,
        owner_user_id: ownerUserId,
        course_snapshot: rowToCourseSnapshot(venue),
        scoring_rule: 'stroke',
        player_ids: [ownerKey],
        teams: null,
        scores,
        participants,
        mentioned_user_ids: [ownerUserId],
        hole_range: 'all',
        current_hole_number: holes[holes.length - 1]?.number ?? 1,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        caption,
      });

      const total = scores.reduce((s, x) => s + x.strokes, 0);
      const par = holes.reduce((s, h) => s + h.par, 0);
      const rel = total - par;
      console.log(
        `  ${pro.handle.padEnd(10)} ${venue.name.padEnd(38)} ${total}  ${rel >= 0 ? '+' : ''}${rel}`
      );
    }
  }

  if (dryRun) {
    console.log('\n(dry-run) no writes performed.');
    return;
  }

  console.log(`\n=== Inserting ${inserts.length} scorecards ===`);
  const { error: insErr } = await admin.from('scorecards').insert(inserts);
  if (insErr) throw insErr;
  console.log('Done.');

  console.log('\nNext steps:');
  console.log('  1. Sign in to the deployed app with your real account.');
  console.log('  2. Migration 016 trigger auto-creates friendships with every pro.');
  console.log('  3. Open the Feed tab — you should see ~20 rounds across 4 pros.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
