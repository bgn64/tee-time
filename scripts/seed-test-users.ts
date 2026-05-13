/**
 * Seed reusable dev test accounts (alice / bob / carol / dave) plus a
 * full friendship mesh between them. Pairs with the `DevAccountPicker`
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
 *   2. Inserts every symmetric friendship pair (alice↔bob, alice↔carol,
 *      …) and corresponding roster rows on both sides — same shape used
 *      by the supabase test fixtures' `befriend` helper.
 *
 * --reset mode deletes the auth.users for every test email first; the
 * cascade on `profiles -> friendships / roster_players / scorecards`
 * cleans up everything else automatically. Catalog courses are owned by
 * nobody so they're untouched.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in `.env` /
 * `.env.local` (same envvars the demo-pros script reads).
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
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.');
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
  a: { userId: string; handle: string; color: string },
  b: { userId: string; handle: string; color: string }
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
  // re-runs are idempotent.
  await admin.from('roster_players').upsert(
    [
      {
        owner_user_id: a.userId,
        id: `friend-${b.userId}`,
        nickname: b.handle,
        color: b.color,
        linked_user_id: b.userId,
      },
      {
        owner_user_id: b.userId,
        id: `friend-${a.userId}`,
        nickname: a.handle,
        color: a.color,
        linked_user_id: a.userId,
      },
    ],
    { onConflict: 'owner_user_id,id' }
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
    seeded.push({ userId, handle: acc.handle, color: acc.avatarColor });
    console.log(
      `  · ${acc.handle.padEnd(8)} userId=${userId.slice(0, 8)}…  ` +
        `user:${created ? 'CREATED' : 'kept'}  profile:${profCreated ? 'CREATED' : 'kept'}`
    );
  }

  // 2. friendship mesh
  console.log('\nFriendship mesh:');
  for (let i = 0; i < seeded.length; i++) {
    for (let j = i + 1; j < seeded.length; j++) {
      await ensureFriendship(seeded[i], seeded[j]);
      console.log(`  · ${seeded[i].handle} ↔ ${seeded[j].handle}`);
    }
  }

  console.log('\nDone. Open the app in dev mode and tap a face in the DevAccountPicker.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
