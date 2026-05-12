/**
 * Dev-only: clear local roster players and seed a varied set of fake
 * scorecards for the two test users (handles: bgn64, benjaming) so the
 * Feed and Rounds tabs render against real-looking data.
 *
 *   tsx scripts/seed-fake-rounds.ts            # write to DB
 *   tsx scripts/seed-fake-rounds.ts --dry-run  # print plan only
 *
 * Idempotent: every scorecard inserted has id 'fake:...' and any
 * pre-existing 'fake:%' rows owned by either test user are deleted
 * before insert. Local roster_players (linked_user_id IS NULL) for
 * both users are also wiped each run.
 *
 * Requires .env at the repo root with SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. Bypasses RLS via the service role.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// ---------- argv ----------
const dryRun = process.argv.includes('--dry-run');
const ROUND_COUNT = 24;

// ---------- env ----------
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

// ---------- deterministic RNG (so re-runs produce same data) ----------
let rngState = 0xc0ffee;
function rnd(): number {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 0x100000000;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rnd() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

// ---------- types ----------
type Profile = { user_id: string; handle: string; display_name: string };

type CourseRow = {
  id: string;
  source: string;
  name: string;
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
  holes: Array<{ number: number; par: number; handicapIndex?: number; yardages?: Record<string, number> }>;
  tees: Array<{ id: string; name: string; color?: string; slope?: number; rating?: number; totalYardage?: number; gender?: 'M' | 'F' }>;
  source_external_id: string | null;
  last_enriched_at: string | null;
};

// Mirror state/GolfRoundContext.tsx course-row -> Course snapshot.
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
}

// ---------- local-player snapshot pool ----------
const LOCAL_NAME_POOL = [
  'Dad', 'Mom', 'Tom', 'Greg', 'Aunt Sally', 'Coach', 'Jess',
  'Mark', 'Uncle Pete', 'Coworker', 'Ben Sr.', 'Casey', 'Pat',
] as const;

const PLAYER_COLORS = [
  '#42a5f5', '#ab47bc', '#7cb342', '#ff8f00', '#26a69a',
  '#ef5350', '#5c6bc0', '#ec407a', '#ffa726', '#66bb6a',
] as const;

// ---------- main ----------
async function main() {
  // 1. Look up the two test users by handle.
  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('user_id, handle, display_name')
    .in('handle', ['bgn64', 'benjaming']);
  if (profErr) throw profErr;
  const byHandle = new Map<string, Profile>((profiles ?? []).map((p) => [p.handle, p]));
  const bgn64 = byHandle.get('bgn64');
  const benjaming = byHandle.get('benjaming');
  if (!bgn64 || !benjaming) {
    console.error(
      `Could not find both test users. Found: ${[...byHandle.keys()].join(', ') || '(none)'}`
    );
    process.exit(1);
  }
  console.log(`Found bgn64=${bgn64.user_id}`);
  console.log(`Found benjaming=${benjaming.user_id}`);

  const owners = [bgn64, benjaming];
  const ownerIds = owners.map((p) => p.user_id);

  // 2. Clear local roster players for both users.
  console.log('\n=== Clearing local roster players ===');
  if (!dryRun) {
    const { error: delRosterErr, count: rosterDeleted } = await admin
      .from('roster_players')
      .delete({ count: 'exact' })
      .in('owner_user_id', ownerIds)
      .is('linked_user_id', null);
    if (delRosterErr) throw delRosterErr;
    console.log(`Deleted ${rosterDeleted ?? 0} local roster_players rows`);
  } else {
    const { data, error } = await admin
      .from('roster_players')
      .select('owner_user_id, id, nickname')
      .in('owner_user_id', ownerIds)
      .is('linked_user_id', null);
    if (error) throw error;
    console.log(`Would delete ${data?.length ?? 0} local roster_players rows:`);
    for (const r of data ?? []) console.log(`  ${r.owner_user_id}  ${r.id}  ${r.nickname}`);
  }

  // 3. Ensure friendship between the two users + a roster_players entry
  //    on each side (linked) so the friend renders correctly in the app.
  console.log('\n=== Ensuring friendship + linked roster entries ===');
  if (!dryRun) {
    const { error: fErr } = await admin
      .from('friendships')
      .upsert(
        [
          { user_id: bgn64.user_id, friend_user_id: benjaming.user_id },
          { user_id: benjaming.user_id, friend_user_id: bgn64.user_id },
        ],
        { onConflict: 'user_id,friend_user_id', ignoreDuplicates: true }
      );
    if (fErr) throw fErr;

    // roster_players: keep existing linked entries if present (so the
    // app's own ids don't shift). Only insert when missing.
    for (const [owner, friend] of [
      [bgn64, benjaming],
      [benjaming, bgn64],
    ] as const) {
      const { data: existing } = await admin
        .from('roster_players')
        .select('id')
        .eq('owner_user_id', owner.user_id)
        .eq('linked_user_id', friend.user_id)
        .maybeSingle();
      if (existing) continue;
      const newId = `player-${friend.user_id}-1`;
      const { error: insErr } = await admin.from('roster_players').insert({
        owner_user_id: owner.user_id,
        id: newId,
        nickname: friend.handle,
        color: pick(PLAYER_COLORS),
        linked_user_id: friend.user_id,
      });
      if (insErr) throw insErr;
      console.log(`Inserted roster entry: ${owner.handle} -> ${friend.handle}`);
    }
  } else {
    console.log('(skipped in dry-run)');
  }

  // 4. Fetch each user's linked roster entry for the other so we have
  //    a stable participant_key to reference in scorecards.
  const linkedRosterId: Record<string, string> = {};
  for (const owner of owners) {
    const friend = owner.handle === 'bgn64' ? benjaming : bgn64;
    const { data, error } = await admin
      .from('roster_players')
      .select('id')
      .eq('owner_user_id', owner.user_id)
      .eq('linked_user_id', friend.user_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Missing linked roster entry for ${owner.handle}`);
    linkedRosterId[owner.user_id] = data.id;
  }

  // 5. Wipe prior fake scorecards from earlier runs.
  console.log('\n=== Wiping prior fake scorecards ===');
  if (!dryRun) {
    const { count, error } = await admin
      .from('scorecards')
      .delete({ count: 'exact' })
      .in('owner_user_id', ownerIds)
      .like('id', 'fake:%');
    if (error) throw error;
    console.log(`Deleted ${count ?? 0} prior fake scorecards`);
  } else {
    console.log('(skipped in dry-run)');
  }

  // 6. Collect catalog course ids bgn64 has played, then load their full
  //    enriched rows.
  console.log("\n=== Reading bgn64's played catalog courses ===");
  const { data: pastCards, error: pastErr } = await admin
    .from('scorecards')
    .select('course_snapshot')
    .eq('owner_user_id', bgn64.user_id)
    .not('id', 'like', 'fake:%');
  if (pastErr) throw pastErr;

  const seenIds = new Set<string>();
  for (const row of pastCards ?? []) {
    const snap = (row as { course_snapshot: { id?: string; source?: string } }).course_snapshot;
    if (snap && snap.source === 'opengolf' && typeof snap.id === 'string') {
      seenIds.add(snap.id);
    }
  }
  console.log(`bgn64 has played ${seenIds.size} distinct catalog courses`);
  if (seenIds.size === 0) {
    console.error('No catalog course history for bgn64 to seed against. Aborting.');
    process.exit(1);
  }

  const { data: courseRows, error: courseErr } = await admin
    .from('courses')
    .select('*')
    .in('id', [...seenIds]);
  if (courseErr) throw courseErr;
  const courses = (courseRows ?? []) as CourseRow[];
  console.log(`Loaded ${courses.length} catalog rows`);
  for (const c of courses) {
    const teeCount = (c.tees ?? []).length;
    const holeCount = (c.holes ?? []).length;
    console.log(`  ${c.name} (${c.city ?? ''})  holes=${holeCount}  tees=${teeCount}`);
  }

  // 7. Build the fake scorecards.
  console.log(`\n=== Generating ${ROUND_COUNT} fake scorecards ===`);
  const inserts: Record<string, unknown>[] = [];
  const now = Date.now();
  const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

  for (let i = 0; i < ROUND_COUNT; i++) {
    const owner = owners[i % 2];
    const friend = owner.handle === 'bgn64' ? benjaming : bgn64;
    const course = pick(courses);

    // Holes available + chosen range.
    const holeCount = course.holes.length;
    const supports18 = holeCount >= 18;
    const supports9 = holeCount >= 9;
    const rangeRoll = rnd();
    let holeRange: 'all' | 'front9' | 'back9' = 'all';
    if (supports18 && rangeRoll < 0.2) holeRange = 'front9';
    else if (supports18 && rangeRoll < 0.35) holeRange = 'back9';
    else if (!supports18 && supports9) holeRange = 'all';

    const inRange = (n: number) =>
      holeRange === 'front9' ? n >= 1 && n <= 9 : holeRange === 'back9' ? n >= 10 && n <= 18 : true;
    const activeHoles = course.holes.filter((h) => inRange(h.number));

    // Format.
    const isScramble = rnd() < 0.25;
    const scoringRule = isScramble ? 'scramble' : 'stroke';

    // Players: 1–4 total.
    const playerCount = isScramble
      ? 2 + Math.floor(rnd() * 3) // 2-4 for scramble
      : 1 + Math.floor(rnd() * 4); // 1-4 for stroke

    // Always include the owner ('user' key).
    type FakePlayer = {
      participantKey: string;
      linkedUserId?: string;
      localDisplayName?: string;
      localDisplayColor?: string;
    };
    const ownerPlayer: FakePlayer = { participantKey: 'user', linkedUserId: owner.user_id };
    const players: FakePlayer[] = [ownerPlayer];

    // Maybe add the friend.
    const includeFriend = rnd() < 0.55 && playerCount >= 2;
    if (includeFriend) {
      players.push({
        participantKey: linkedRosterId[owner.user_id],
        linkedUserId: friend.user_id,
      });
    }
    // Fill the rest with local snapshot players.
    const localNamesAvailable = pickN(LOCAL_NAME_POOL, Math.max(0, playerCount - players.length));
    for (const name of localNamesAvailable) {
      players.push({
        participantKey: `local-${i}-${name.toLowerCase().replace(/\s+/g, '-')}`,
        localDisplayName: name,
        localDisplayColor: pick(PLAYER_COLORS),
      });
    }

    // Per-player tees (when course has tees).
    const teeIdByPlayer: Record<string, string | undefined> = {};
    const tees = course.tees ?? [];
    if (tees.length > 0) {
      for (const p of players) {
        teeIdByPlayer[p.participantKey] = rnd() < 0.75 ? pick(tees).id : undefined;
      }
    }

    // Teams for scramble: split into 2 teams of 1-2.
    let teams:
      | Array<{ id: string; name: string; color: string; playerIds: string[] }>
      | undefined;
    if (isScramble) {
      const shuffled = pickN(players, players.length);
      const half = Math.ceil(shuffled.length / 2);
      const team1Players = shuffled.slice(0, half).map((p) => p.participantKey);
      const team2Players = shuffled.slice(half).map((p) => p.participantKey);
      teams = [
        {
          id: 'team-1',
          name: 'Team A',
          color: '#42a5f5',
          playerIds: team1Players,
        },
        {
          id: 'team-2',
          name: 'Team B',
          color: '#ef5350',
          playerIds: team2Players,
        },
      ];
    }

    // Generate scores: one stroke per scoring entity per active hole.
    //   stroke -> scorerId = player participantKey
    //   scramble -> scorerId = team id
    const scoringIds: string[] = isScramble
      ? (teams ?? []).map((t) => t.id)
      : players.map((p) => p.participantKey);

    const scores: Array<{ scorerId: string; holeNumber: number; strokes: number }> = [];
    for (const scorerId of scoringIds) {
      // Per-scorer skill offset: -1 (good) to +2 (high handicapper).
      const skillOffset = -1 + Math.floor(rnd() * 4);
      for (const hole of activeHoles) {
        // Base strokes = par + skillOffset + small jitter.
        let strokes = hole.par + skillOffset;
        const r = rnd();
        if (r < 0.05) strokes -= 2; // eagle-ish
        else if (r < 0.2) strokes -= 1; // birdie / par
        else if (r < 0.7) strokes += 0;
        else if (r < 0.9) strokes += 1;
        else strokes += 2;
        strokes = Math.max(1, Math.min(12, strokes));
        scores.push({ scorerId, holeNumber: hole.number, strokes });
      }
    }

    // Participants jsonb.
    const participants = players.map((p) => {
      const teeId = teeIdByPlayer[p.participantKey];
      const team = teams?.find((t) => t.playerIds.includes(p.participantKey));
      const base: Record<string, unknown> = { participantKey: p.participantKey };
      if (p.linkedUserId) base.linkedUserId = p.linkedUserId;
      if (p.localDisplayName) base.localDisplayName = p.localDisplayName;
      if (p.localDisplayColor) base.localDisplayColor = p.localDisplayColor;
      if (team) base.teamId = team.id;
      if (teeId) base.teeId = teeId;
      return base;
    });

    const mentionedUserIds: string[] = [];
    for (const p of players) {
      if (p.linkedUserId && !mentionedUserIds.includes(p.linkedUserId)) {
        mentionedUserIds.push(p.linkedUserId);
      }
    }

    // Timing: spread across the last 6 months, with 4-hour rounds.
    const completedAt = new Date(now - rnd() * SIX_MONTHS_MS);
    const startedAt = new Date(completedAt.getTime() - 4 * 60 * 60 * 1000);

    const id = `fake:${owner.handle}:${i.toString().padStart(2, '0')}-${rnd()
      .toString(36)
      .slice(2, 7)}`;

    inserts.push({
      id,
      owner_user_id: owner.user_id,
      course_snapshot: rowToCourseSnapshot(course),
      scoring_rule: scoringRule,
      player_ids: players.map((p) => p.participantKey),
      teams: teams ?? null,
      scores,
      participants,
      mentioned_user_ids: mentionedUserIds,
      hole_range: holeRange,
      current_hole_number: activeHoles[activeHoles.length - 1]?.number ?? 1,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
    });

    console.log(
      `  [${i.toString().padStart(2, '0')}] ${owner.handle}  ${course.name}  ` +
        `${scoringRule}  range=${holeRange}  players=${players.length}` +
        (isScramble ? `  teams=${teams!.length}` : '') +
        `  scores=${scores.length}`
    );
  }

  // 8. Insert.
  if (dryRun) {
    console.log(`\n(dry-run) would insert ${inserts.length} scorecards`);
    return;
  }

  console.log(`\n=== Inserting ${inserts.length} scorecards ===`);
  const { error: insertErr } = await admin.from('scorecards').insert(inserts);
  if (insertErr) throw insertErr;
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
