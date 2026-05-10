/**
 * Test fixtures for the local Supabase stack.
 *
 * Each test file imports from here. The `admin` client uses the service-
 * role key (bypasses RLS); per-user authed clients are returned by
 * `createTestUser` and exercise the same RLS users see in the app.
 *
 * Idiomatic test shape:
 *
 *   describe('feature', () => {
 *     beforeEach(cleanupAll);
 *
 *     test('does the thing', async () => {
 *       const { client: aClient, userId: aId } = await createTestUser('alice');
 *       const { client: bClient, userId: bId } = await createTestUser('bob');
 *       await befriend(aId, bId);
 *       // ...
 *     });
 *   });
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_TEST_URL!;
const ANON = process.env.SUPABASE_TEST_ANON_KEY!;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;

/** Service-role client, bypasses RLS. Used for setup/teardown only. */
export const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = {
  userId: string;
  handle: string;
  client: SupabaseClient;
};

const COLORS = ['#42a5f5', '#ab47bc', '#7cb342', '#ff8f00', '#26a69a', '#ef5350'];
let colorIdx = 0;

/**
 * Create a fresh auth user with a confirmed email and a profile row, then
 * sign them in via password and return an authed client.
 */
export async function createTestUser(handle: string): Promise<TestUser> {
  // Sanitize to satisfy profiles.handle CHECK ('^[a-z][a-z0-9._]{2,19}$').
  // Test callers can pass freer-form labels and we'll mangle them here.
  const safeHandle = handle
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20)
    .padEnd(3, 'x');
  const email = `${safeHandle}-${Date.now()}@test.local`;
  const password = 'test-password-123';

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    throw new Error(`createTestUser(${handle}) admin.createUser failed: ${authErr?.message}`);
  }
  const userId = authData.user.id;

  const color = COLORS[colorIdx++ % COLORS.length];
  const { error: profErr } = await admin.from('profiles').insert({
    user_id: userId,
    handle: safeHandle,
    display_name: handle,
    avatar_color: color,
  });
  if (profErr) {
    throw new Error(`createTestUser(${handle}) profile insert failed: ${profErr.message}`);
  }

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) {
    throw new Error(`createTestUser(${handle}) signIn failed: ${signInErr.message}`);
  }

  return { userId, handle: safeHandle, client };
}

/**
 * Insert symmetric friendship rows + roster entries on both sides. Mirrors
 * what the app's friend-request flow leaves behind.
 */
export async function befriend(a: TestUser, b: TestUser): Promise<void> {
  await admin.from('friendships').insert([
    { user_id: a.userId, friend_user_id: b.userId },
    { user_id: b.userId, friend_user_id: a.userId },
  ]);
  await admin.from('roster_players').insert([
    {
      owner_user_id: a.userId,
      id: `player-${b.userId}-1`,
      nickname: b.handle,
      color: COLORS[0],
      linked_user_id: b.userId,
    },
    {
      owner_user_id: b.userId,
      id: `player-${a.userId}-1`,
      nickname: a.handle,
      color: COLORS[1],
      linked_user_id: a.userId,
    },
  ]);
}

export type SeedRoundOpts = {
  owner: TestUser;
  /**
   * Participant rows to create alongside the owner's auto-seeded row. Owner
   * does NOT need to be included; the trigger handles that.
   */
  others?: Array<{
    user?: TestUser;
    /** Pre-seeded nickname for unlinked players. */
    nickname?: string;
    /** Override the participant_key. Defaults to 'player-<idx>-<ts>'. */
    participantKey?: string;
    /** Initial confirmation status. Defaults to 'pending' for linked, 'confirmed' for unlinked. */
    status?: 'pending' | 'confirmed';
    teamId?: string;
  }>;
  scoringRule?: 'stroke' | 'scramble';
  teams?: Array<{ id: string; name: string; color: string; playerIds: string[] }>;
  /** scorerId -> { hole: strokes }. Sparse / partial fine. */
  scores?: Record<string, Record<number, number>>;
  /** Defaults to a flat par-4 18-hole course. */
  courseHoles?: Array<{ number: number; par: number }>;
};

/**
 * Insert a round + non-owner participant rows via the owner's authed client
 * (the same way the app does). The owner's participant row is created by
 * the seed_owner_participant trigger.
 */
export async function seedRound(opts: SeedRoundOpts): Promise<string> {
  const {
    owner,
    others = [],
    scoringRule = 'stroke',
    teams,
    scores: scoresMap = {},
    courseHoles,
  } = opts;

  const id = `round-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ownerParticipantKey = 'user';
  const holes =
    courseHoles ?? Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4 }));

  // Build the player_ids list (owner first, then others).
  const playerIds = [
    ownerParticipantKey,
    ...others.map(
      (o, i) => o.participantKey ?? `player-test-${i}-${Date.now()}`
    ),
  ];

  // Flatten scores map -> jsonb array.
  const scores = Object.entries(scoresMap).flatMap(([scorerId, perHole]) =>
    Object.entries(perHole).map(([h, strokes]) => ({
      scorerId,
      holeNumber: Number(h),
      strokes,
    }))
  );

  const { error: roundErr } = await owner.client.from('rounds').insert({
    id,
    owner_user_id: owner.userId,
    owner_participant_key: ownerParticipantKey,
    course_snapshot: { id: 'tc', name: 'Test Course', location: '', source: 'custom', holes },
    scoring_rule: scoringRule,
    player_ids: playerIds,
    player_user_ids: [],
    teams: teams ?? null,
    scores,
    current_hole_number: holes.length,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (roundErr) {
    throw new Error(`seedRound rounds insert failed: ${roundErr.message}`);
  }

  if (others.length > 0) {
    const rows = others.map((o, i) => {
      const key = o.participantKey ?? `player-test-${i}-${Date.now()}`;
      const linkedUserId = o.user?.userId ?? null;
      return {
        round_id: id,
        participant_key: key,
        linked_user_id: linkedUserId,
        confirmation_status:
          o.status ?? (linkedUserId ? 'pending' : 'confirmed'),
        display_name: o.user?.handle ?? o.nickname ?? `Player${i}`,
        display_color: COLORS[i % COLORS.length],
        team_id: o.teamId ?? null,
      };
    });
    const { error: pErr } = await owner.client
      .from('round_participants')
      .insert(rows);
    if (pErr) {
      throw new Error(`seedRound round_participants insert failed: ${pErr.message}`);
    }
  }

  return id;
}

/**
 * Wipe all app data + auth users. Run in beforeEach so each test starts
 * with an empty DB. profiles, roster_players, courses, rounds,
 * round_participants, friendships, friend_requests all cascade off
 * auth.users via FK.
 */
export async function cleanupAll(): Promise<void> {
  // Get every auth user and delete via the admin API (cascades).
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  for (const u of data.users) {
    await admin.auth.admin.deleteUser(u.id);
  }
}
