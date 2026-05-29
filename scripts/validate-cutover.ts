/**
 * Phase 5 post-cutover validation.
 *
 * Runs the lightweight half of the dry-run validation suite against
 * whatever Supabase project `.prod.env` points at. Uses the
 * service-role key for full row visibility (RLS bypass).
 *
 * Counts only — for structural checks (e.g. friendships PK shape,
 * is_demo_seed column absence) we trust the local dry-run, which
 * passed all 13 checks.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

const envFlagIndex = process.argv.indexOf('--env');
const envFile =
  envFlagIndex >= 0 && process.argv[envFlagIndex + 1]
    ? process.argv[envFlagIndex + 1]
    : '.env.local';

dotenv.config({ path: envFile });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(`Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}
console.log(`[validate] env file: ${envFile}`);
console.log(`[validate] target  : ${url}`);

const supa = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type RowCounts = {
  profiles: number;
  courses: number;
  friend_requests: number;
  friendships: number;
  roster_players: number;
  scorecards: number;
  scorecard_scores: number;
  custom_players: number;
  comments: number;
};

async function count(table: string): Promise<number> {
  const { count, error } = await supa
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`[validate]   FAILED reading ${table}:`, error.message);
    return -1;
  }
  return count ?? 0;
}

async function main() {
  console.log('\n[validate] row counts on target DB:');
  const tables: (keyof RowCounts)[] = [
    'profiles',
    'courses',
    'friend_requests',
    'friendships',
    'roster_players',
    'scorecards',
    'scorecard_scores',
    'custom_players',
    'comments',
  ];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    counts[t] = await count(t);
    console.log(`  ${t.padEnd(20)} = ${counts[t]}`);
  }

  // Hard expectations for prod post-009:
  //   profiles = 3
  //   scorecards = 8
  //   scorecard_scores = 153   (dry-run sum)
  //   custom_players = 7       (4 roster + 3 legacy-key derived)
  //   friendships = 6
  //   friend_requests = 3      (existing)
  //   courses = 14023          (already in prod pre-cutover)
  //   comments = 0
  console.log('\n[validate] hard-expectation checks:');
  const checks: { name: string; got: number; expect: number }[] = [
    { name: 'profiles == 3 (existing users preserved)',                  got: counts.profiles,          expect: 3 },
    { name: 'scorecards == 8 (existing rounds preserved)',               got: counts.scorecards,        expect: 8 },
    { name: 'scorecard_scores == 153 (fan-out matches dry-run)',         got: counts.scorecard_scores,  expect: 153 },
    { name: 'custom_players == 7 (4 roster + 3 legacy-derived)',         got: counts.custom_players,    expect: 7 },
    { name: 'friendships == 6 (preserved)',                              got: counts.friendships,       expect: 6 },
    { name: 'friend_requests == 3 (preserved)',                          got: counts.friend_requests,   expect: 3 },
    { name: 'roster_players == 13 (legacy, kept during grace period)',   got: counts.roster_players,    expect: 13 },
    { name: 'comments == 0 (new table)',                                 got: counts.comments,          expect: 0 },
  ];

  let passes = 0;
  let fails = 0;
  for (const c of checks) {
    const ok = c.got === c.expect;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.name} (got ${c.got})`);
    if (ok) passes++;
    else fails++;
  }
  console.log(`\n[validate] ${passes} pass / ${fails} fail`);
  if (fails > 0) process.exit(1);
}

void main();
