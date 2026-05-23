/**
 * Seed reusable dev test accounts (alice / bob / carol / dave) plus a
 * friendship mesh between most pairs. Pairs with the `DevAccountPicker`
 * component on the sign-in screen so you can spin up several browser
 * profiles and one-click-login as different users side-by-side.
 *
 *   npm run seed:test-users               # create or top-up
 *   npm run seed:test-users -- --reset    # drop them all first
 *
 * Idempotent: re-running is safe and fast. The script:
 *
 *   1. For each row in `constants/devTestAccounts.ts`:
 *      · Looks up the existing auth user by email. If absent, creates
 *        one with `email_confirm: true` so the next sign-in skips the
 *        magic-link step.
 *      · Ensures a `profiles` row exists (handle, display_name,
 *        avatar_color).
 *   2. Inserts the symmetric friendship mesh:
 *      · Most pairs (alice↔bob, alice↔carol, bob↔carol, bob↔dave,
 *        carol↔dave) are full friends with corresponding mirror
 *        roster rows on both sides.
 *      · **alice ↮ dave is intentionally NOT friends** so you can
 *        exercise the friend-request flow end-to-end (search by
 *        @handle → send → accept) without manually unfriending first.
 *        Any pre-existing friendship + pending request between this
 *        pair is removed so re-runs converge.
 *
 * --reset mode deletes the auth.users for every test email first; the
 * cascade on `profiles -> friendships / roster_players / scorecards`
 * cleans up everything else automatically. Catalog courses are owned by
 * nobody so they're untouched.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in `.env.local`.
 *
 * Refuses to run against the production project: if SUPABASE_URL matches
 * PRODUCTION_PROJECT_ID, the script exits immediately. Set
 * PRODUCTION_PROJECT_ID in `.env.local` to enable that guard (it's a
 * no-op if unset, but you should always set it).
 *
 * NOTE: these accounts are deliberately NOT marked `is_demo_seed = true`.
 * That flag triggers an auto-friend on every real user signup; we don't
 * want testers polluting prod-like sign-ups with these. Friendships
 * here are explicit + pairwise, not viral.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

import { DEV_TEST_ACCOUNTS } from '../constants/devTestAccounts';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

// Prod-URL guard: refuse to run against production. PRODUCTION_PROJECT_ID
// is the project ref from the dashboard URL — Supabase URLs embed it as a
// subdomain (e.g. https://<ref>.supabase.co), so substring match is safe.
const PRODUCTION_PROJECT_ID = process.env.PRODUCTION_PROJECT_ID;
if (PRODUCTION_PROJECT_ID && SUPABASE_URL.includes(PRODUCTION_PROJECT_ID)) {
  console.error(
    `Refusing to seed test users against production project (${PRODUCTION_PROJECT_ID}).`
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reset = process.argv.includes('--reset');

async function findUserIdByEmail(email: string): Promise<string | null> {
  // listUsers() is the supported path; filtering by email isn't natively
  // supported, so we paginate. Test envs have small user counts; the
  // first page (default 50) is plenty.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

async function ensureUser(email: string, password: string): Promise<{
  userId: string;
  created: boolean;
}> {
  const existing = await findUserIdByEmail(email);
  if (existing) return { userId: existing, created: false };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser(${email}) failed: ${error?.message}`);
  }
  return { userId: data.user.id, created: true };
}

async function ensureProfile(
  userId: string,
  handle: string,
  displayName: string,
  avatarColor: string
): Promise<{ created: boolean }> {
  const { data: existing, error: selErr } = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (selErr) throw new Error(`profiles select failed: ${selErr.message}`);

  if (existing) {
    // Keep handle / displayName / color in sync in case the constants
    // file changed.
    const { error } = await admin
      .from('profiles')
      .update({ handle, display_name: displayName, avatar_color: avatarColor })
      .eq('user_id', userId);
    if (error) throw new Error(`profiles update failed: ${error.message}`);
    return { created: false };
  }

  const { error } = await admin.from('profiles').insert({
    user_id: userId,
    handle,
    display_name: displayName,
    avatar_color: avatarColor,
  });
  if (error) throw new Error(`profiles insert failed: ${error.message}`);
  return { created: true };
}

async function ensureFriendship(
  a: { userId: string; handle: string; displayName: string; color: string },
  b: { userId: string; handle: string; displayName: string; color: string }
): Promise<void> {
  // Symmetric pair. `upsert` works because (user_id, friend_user_id) is
  // the primary key.
  await admin.from('friendships').upsert(
    [
      { user_id: a.userId, friend_user_id: b.userId },
      { user_id: b.userId, friend_user_id: a.userId },
    ],
    { onConflict: 'user_id,friend_user_id' }
  );

  // Mirror the v7 roster entries so each user sees the other as a linked
  // FRIEND player in their roster. id is composite of friend's userId so
  // re-runs are idempotent. Use displayName (e.g. "Bob") rather than the
  // lowercase handle for the nickname so the seeded rows match what the
  // app's `ensureRosterForFriend` writes when a friendship is created
  // through the accept flow at runtime — otherwise some friends would
  // render lowercase and others capitalized in the Friends list.
  await admin.from('roster_players').upsert(
    [
      {
        owner_user_id: a.userId,
        id: `friend-${b.userId}`,
        nickname: b.displayName,
        color: b.color,
        linked_user_id: b.userId,
      },
      {
        owner_user_id: b.userId,
        id: `friend-${a.userId}`,
        nickname: a.displayName,
        color: a.color,
        linked_user_id: a.userId,
      },
    ],
    { onConflict: 'owner_user_id,id' }
  );
}

/**
 * Inverse of `ensureFriendship`: drop the symmetric friendship + mirror
 * roster rows + any pending friend_requests between the pair. Used to
 * keep designated non-friend pairs converged across re-runs of this
 * script, even if a previous run (or the app under test) created them.
 */
async function ensureNotFriends(
  a: { userId: string; handle: string },
  b: { userId: string; handle: string }
): Promise<void> {
  // Drop both symmetric friendships rows.
  await admin
    .from('friendships')
    .delete()
    .or(
      `and(user_id.eq.${a.userId},friend_user_id.eq.${b.userId}),` +
        `and(user_id.eq.${b.userId},friend_user_id.eq.${a.userId})`
    );

  // Drop the mirror roster rows the seed planted (id = `friend-${userId}`).
  // App-created rows (id = `player-${userId}`) are also linked to the
  // same user; drop those too so the pair is fully unfriended.
  await admin
    .from('roster_players')
    .delete()
    .eq('owner_user_id', a.userId)
    .eq('linked_user_id', b.userId);
  await admin
    .from('roster_players')
    .delete()
    .eq('owner_user_id', b.userId)
    .eq('linked_user_id', a.userId);

  // Drop any pending friend_requests between the pair so the next test
  // run starts from a clean slate (no request to accept/decline).
  await admin
    .from('friend_requests')
    .delete()
    .or(
      `and(from_user_id.eq.${a.userId},to_user_id.eq.${b.userId}),` +
        `and(from_user_id.eq.${b.userId},to_user_id.eq.${a.userId})`
    );
}

async function nukeAllTestUsers(): Promise<number> {
  let deleted = 0;
  for (const acc of DEV_TEST_ACCOUNTS) {
    const id = await findUserIdByEmail(acc.email);
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      console.warn(`  · deleteUser(${acc.email}) failed: ${error.message}`);
      continue;
    }
    deleted++;
  }
  return deleted;
}

async function main(): Promise<void> {
  console.log('=== Seed dev test users ===');
  console.log(`  target: ${SUPABASE_URL}`);
  console.log(`  accounts: ${DEV_TEST_ACCOUNTS.map((a) => a.handle).join(', ')}`);

  if (reset) {
    console.log('\n--reset → deleting existing test users first…');
    const n = await nukeAllTestUsers();
    console.log(`  deleted ${n} user(s).`);
  }

  // 1. ensure auth + profiles
  type SeededRow = {
    userId: string;
    handle: string;
    displayName: string;
    color: string;
  };
  const seeded: SeededRow[] = [];
  for (const acc of DEV_TEST_ACCOUNTS) {
    const { userId, created } = await ensureUser(acc.email, acc.password);
    const { created: profCreated } = await ensureProfile(
      userId,
      acc.handle,
      acc.displayName,
      acc.avatarColor
    );
    seeded.push({
      userId,
      handle: acc.handle,
      displayName: acc.displayName,
      color: acc.avatarColor,
    });
    console.log(
      `  · ${acc.handle.padEnd(8)} userId=${userId.slice(0, 8)}…  ` +
        `user:${created ? 'CREATED' : 'kept'}  profile:${profCreated ? 'CREATED' : 'kept'}`
    );
  }

  // 2. friendship mesh — full pairwise EXCEPT a single non-friend
  // pair so the friend-request flow is testable end-to-end out of the
  // box. Pick alice ↔ dave to leave unfriended: alice is the obvious
  // "primary tester" account, and dave is the lowest-traffic of the
  // others (carol gets used for mutual-friend scenarios).
  const NON_FRIEND_PAIR: ReadonlySet<string> = new Set(['alice/dave', 'dave/alice']);

  console.log('\nFriendship mesh:');
  let skippedCount = 0;
  for (let i = 0; i < seeded.length; i++) {
    for (let j = i + 1; j < seeded.length; j++) {
      const a = seeded[i];
      const b = seeded[j];
      const pairKey = `${a.handle}/${b.handle}`;
      if (NON_FRIEND_PAIR.has(pairKey)) {
        // Idempotent: if a previous run (older version of this script,
        // or a manual app action during testing) created this pair as
        // friends, drop it so the desired non-friend state holds.
        await ensureNotFriends(a, b);
        console.log(`  · ${a.handle} ↮ ${b.handle}  (kept unfriended for friend-request testing)`);
        skippedCount++;
        continue;
      }
      await ensureFriendship(a, b);
      console.log(`  · ${a.handle} ↔ ${b.handle}`);
    }
  }
  if (skippedCount > 0) {
    console.log(
      `\n  ${skippedCount} pair(s) intentionally left unfriended so you can ` +
        `exercise the friend-request flow without manually unfriending first. ` +
        `Sign in as alice in one browser profile, dave in another, and search ` +
        `the other's @handle to send a request.`
    );
  }

  console.log('\nDone. Open the app in dev mode and tap a face in the DevAccountPicker.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
