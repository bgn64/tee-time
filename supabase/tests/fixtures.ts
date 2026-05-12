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
 *       const a = await createTestUser('alice');
 *       const b = await createTestUser('bob');
 *       await befriend(a, b);
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

/** Insert symmetric friendship rows + roster entries on both sides. */
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

export type SeedScorecardOpts = {
  owner: TestUser;
  /**
   * Named participants other than the owner. Owner's participant entry is
   * generated automatically.
   */
  others?: Array<{
    user?: TestUser;
    /** Used for local entries. */
    nickname?: string;
    /** Override the participant_key. Defaults to a unique key per index. */
    participantKey?: string;
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
 * Insert a Scorecard (v7) via the owner's authed client. The Scorecard's
 * inline `participants` jsonb is built from the owner + `others` list.
 */
export async function seedScorecard(opts: SeedScorecardOpts): Promise<string> {
  const {
    owner,
    others = [],
    scoringRule = 'stroke',
    teams,
    scores: scoresMap = {},
    courseHoles,
  } = opts;

  const id = `scorecard-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ownerKey = 'user';
  const holes =
    courseHoles ?? Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4 }));

  const ownerTeamId =
    scoringRule === 'scramble'
      ? teams?.find((t) => t.playerIds.includes(ownerKey))?.id
      : undefined;

  const participants: Array<Record<string, unknown>> = [
    {
      participantKey: ownerKey,
      linkedUserId: owner.userId,
      ...(ownerTeamId ? { teamId: ownerTeamId } : {}),
    },
  ];
  const playerIds: string[] = [ownerKey];
  const mentionedUserIds: string[] = [owner.userId];

  others.forEach((o, i) => {
    const key = o.participantKey ?? `player-test-${i}-${Date.now()}`;
    playerIds.push(key);
    const otherTeamId =
      scoringRule === 'scramble'
        ? teams?.find((t) => t.playerIds.includes(key))?.id ?? o.teamId
        : undefined;
    if (o.user) {
      participants.push({
        participantKey: key,
        linkedUserId: o.user.userId,
        ...(otherTeamId ? { teamId: otherTeamId } : {}),
      });
      if (!mentionedUserIds.includes(o.user.userId)) {
        mentionedUserIds.push(o.user.userId);
      }
    } else {
      participants.push({
        participantKey: key,
        localDisplayName: o.nickname ?? `Player${i}`,
        localDisplayColor: COLORS[i % COLORS.length],
        ...(otherTeamId ? { teamId: otherTeamId } : {}),
      });
    }
  });

  const scores = Object.entries(scoresMap).flatMap(([scorerId, perHole]) =>
    Object.entries(perHole).map(([h, strokes]) => ({
      scorerId,
      holeNumber: Number(h),
      strokes,
    }))
  );

  const { error: cardErr } = await owner.client.from('scorecards').insert({
    id,
    owner_user_id: owner.userId,
    course_snapshot: { id: 'tc', name: 'Test Course', location: '', source: 'custom', holes },
    scoring_rule: scoringRule,
    player_ids: playerIds,
    teams: teams ?? null,
    scores,
    participants,
    mentioned_user_ids: mentionedUserIds,
    current_hole_number: holes.length,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (cardErr) {
    throw new Error(`seedScorecard insert failed: ${cardErr.message}`);
  }

  return id;
}

/**
 * Wipe all app data + auth users. Run in beforeEach so each test starts
 * with an empty DB.
 */
export async function cleanupAll(): Promise<void> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  for (const u of data.users) {
    await admin.auth.admin.deleteUser(u.id);
  }
}
