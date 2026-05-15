/**
 * One-shot diagnostic script for the "bgn64 doesn't see alice's rounds in
 * the feed" issue. Runs against whatever `SUPABASE_URL` +
 * `SUPABASE_SERVICE_ROLE_KEY` point to in .env (currently staging).
 *
 * Probes:
 *   1. Find both users' user_ids by handle.
 *   2. Inspect friendship rows (should be symmetric: A→B AND B→A).
 *   3. Count alice's scorecards (ownership + completion + visibility flags).
 *   4. Show what RLS thinks bgn64 can see by impersonating alice's
 *      friend-of-owner check via the service-role SELECT, then a
 *      second SELECT using alice's owner filter.
 *   5. Print mentioned_user_ids on alice's rounds so we know whether
 *      bgn64 is mentioned (informational only — visibility doesn't depend
 *      on it under v7 RLS).
 *
 * Run: `npx tsx scripts/diagnose-feed-visibility.ts`
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const admin = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('Project:', URL);
  console.log();

  // 1. Resolve user ids by handle.
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('user_id, handle, display_name')
    .in('handle', ['bgn64', 'alice']);
  if (pErr) throw pErr;

  console.log('=== profiles for bgn64 / alice ===');
  console.table(profiles ?? []);
  const bgn64 = profiles?.find((p) => p.handle === 'bgn64');
  const alice = profiles?.find((p) => p.handle === 'alice');
  if (!bgn64 || !alice) {
    console.error('Missing one of the profiles — aborting.');
    return;
  }

  console.log();
  console.log('=== friendships involving bgn64 or alice ===');
  const { data: fs, error: fErr } = await admin
    .from('friendships')
    .select('user_id, friend_user_id, created_at')
    .or(
      `user_id.in.(${bgn64.user_id},${alice.user_id}),friend_user_id.in.(${bgn64.user_id},${alice.user_id})`
    );
  if (fErr) throw fErr;
  console.log('row count:', fs?.length);
  for (const f of fs ?? []) {
    const u = f.user_id === bgn64.user_id ? 'bgn64' : f.user_id === alice.user_id ? 'alice' : f.user_id;
    const fr =
      f.friend_user_id === bgn64.user_id ? 'bgn64' : f.friend_user_id === alice.user_id ? 'alice' : f.friend_user_id;
    console.log(`  ${u} -> ${fr}  (${f.created_at})`);
  }

  console.log();
  console.log('=== pending friend_requests between bgn64 / alice ===');
  const { data: reqs, error: rErr } = await admin
    .from('friend_requests')
    .select('id, from_user_id, to_user_id, status, created_at')
    .or(
      `from_user_id.in.(${bgn64.user_id},${alice.user_id}),to_user_id.in.(${bgn64.user_id},${alice.user_id})`
    );
  if (rErr) throw rErr;
  for (const r of reqs ?? []) {
    const from = r.from_user_id === bgn64.user_id ? 'bgn64' : r.from_user_id === alice.user_id ? 'alice' : r.from_user_id;
    const to = r.to_user_id === bgn64.user_id ? 'bgn64' : r.to_user_id === alice.user_id ? 'alice' : r.to_user_id;
    console.log(`  ${from} -> ${to}  status=${r.status}  (${r.created_at})`);
  }

  console.log();
  console.log("=== alice's scorecards ===");
  const { data: aliceCards, error: scErr } = await admin
    .from('scorecards')
    .select(
      'id, owner_user_id, started_at, completed_at, is_live_shareable, last_score_at, mentioned_user_ids'
    )
    .eq('owner_user_id', alice.user_id)
    .order('started_at', { ascending: false });
  if (scErr) throw scErr;
  console.log('count:', aliceCards?.length);
  for (const c of aliceCards ?? []) {
    console.log(
      `  ${c.id}  started=${c.started_at}  completed=${c.completed_at ?? '(in-progress)'}  liveShareable=${c.is_live_shareable}  lastScoreAt=${c.last_score_at ?? '(null)'}  mentions=${(c.mentioned_user_ids ?? []).length}`
    );
    const mu = (c.mentioned_user_ids ?? []) as string[];
    const bgnMentioned = mu.includes(bgn64.user_id);
    console.log(
      `      mentions bgn64? ${bgnMentioned}  (mentioned list: ${mu.join(', ') || '(empty)'})`
    );
  }

  console.log();
  console.log('=== simulate bgn64 fetching scorecards via RLS ===');
  // Use bgn64's session by signing in as them. We don't have the password
  // here — instead we mimic the RLS check at the SQL level: a scorecard is
  // visible if owner = me OR there's a friendships row where user_id = me
  // AND friend_user_id = owner.
  // Cross-check against the actual RLS by selecting via PostgREST as anon
  // (no row policy → 0 rows, expected) and via service-role (all rows).
  // For an authed check we'd need a real session; this script is
  // service-role only.
  const { data: rlsRows, error: rlsErr } = await admin
    .from('scorecards')
    .select('id, owner_user_id, completed_at')
    .eq('owner_user_id', alice.user_id);
  if (rlsErr) throw rlsErr;
  console.log(
    `  total alice scorecards (service-role): ${rlsRows?.length}; expect bgn64 to see ALL of these once friendship row(s) include user_id=bgn64 -> friend_user_id=alice`
  );

  console.log();
  console.log('=== summary ===');
  const bgn64Sees =
    (fs ?? []).find(
      (f) => f.user_id === bgn64.user_id && f.friend_user_id === alice.user_id
    ) != null;
  const aliceSees =
    (fs ?? []).find(
      (f) => f.user_id === alice.user_id && f.friend_user_id === bgn64.user_id
    ) != null;
  console.log(`  bgn64 -> alice friendship row present? ${bgn64Sees}`);
  console.log(`  alice -> bgn64 friendship row present? ${aliceSees}`);
  console.log(`  alice has ${aliceCards?.length ?? 0} scorecard(s)`);
  console.log(
    `  alice has ${(aliceCards ?? []).filter((c) => c.completed_at).length} COMPLETED scorecard(s)`
  );
  console.log();
  if (!bgn64Sees) {
    console.log(
      "  ❗ bgn64 -> alice friendship row is missing. Under v7 RLS, scorecard visibility is owner-OR-friend-of-owner; without the (user_id=bgn64, friend_user_id=alice) row, RLS will hide alice's scorecards from bgn64."
    );
  } else if ((aliceCards ?? []).filter((c) => c.completed_at).length === 0) {
    console.log(
      "  ❗ Alice has no COMPLETED scorecards. The Feed filters completedRounds (rows with completed_at != null); in-progress rounds appear only in the live-strip and only if last_score_at is fresh and is_live_shareable is true."
    );
  } else {
    console.log(
      "  ✓ Friendship symmetric AND alice has completed rounds. Client-side investigation needed: confirm bgn64's client received the realtime sync OR pull-to-refresh once."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
