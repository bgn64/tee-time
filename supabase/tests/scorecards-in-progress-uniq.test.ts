/**
 * Migration 020 — partial unique index on `scorecards (owner_user_id)
 * WHERE completed_at IS NULL`.
 *
 * Pinned contract:
 *   · A single in-progress scorecard per owner is allowed.
 *   · A second insert with a different id but `completed_at = NULL` for
 *     the same owner raises 23505 ("duplicate key value violates unique
 *     constraint").
 *   · Completed rows are NOT subject to the constraint — many per owner
 *     are fine.
 *   · Once the first row's `completed_at` is set, a fresh in-progress
 *     row may be inserted for the same owner.
 *
 * Requires migration 020 to have been applied against the local stack
 * (`supabase db push` or pasting the migration into the Studio SQL
 * editor) before this test will pass.
 */

import { admin, cleanupAll, createTestUser } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

/**
 * Insert a minimal-shape scorecard row via the admin (service-role)
 * client, bypassing RLS. We use admin here rather than the owner's
 * authed client because the test is about the DB constraint, not about
 * RLS policies — and `seedScorecard()` in fixtures always sets
 * `completed_at`, which is the opposite of what we need here.
 */
async function insertScorecard(
  id: string,
  ownerUserId: string,
  completedAt: string | null,
): Promise<{ error: { code?: string; message: string } | null }> {
  const { error } = await admin.from('scorecards').insert({
    id,
    owner_user_id: ownerUserId,
    course_snapshot: {
      id: 'tc',
      name: 'Test Course',
      location: '',
      source: 'custom',
      holes: [{ number: 1, par: 4 }],
    },
    scoring_rule: 'stroke',
    player_ids: ['user'],
    teams: null,
    scores: [],
    participants: [{ participantKey: 'user', linkedUserId: ownerUserId }],
    mentioned_user_ids: [ownerUserId],
    current_hole_number: 1,
    started_at: new Date().toISOString(),
    completed_at: completedAt,
  });
  return { error: error ? { code: (error as any).code, message: error.message } : null };
}

describe('scorecards partial unique index (migration 020)', () => {
  test('first in-progress row inserts cleanly', async () => {
    const a = await createTestUser('a-uniq-first');
    const r = await insertScorecard('sc-uniq-first-1', a.userId, null);
    expect(r.error).toBeNull();
  });

  test('second in-progress row for the same owner is rejected with 23505', async () => {
    const a = await createTestUser('a-uniq-dup');

    const first = await insertScorecard('sc-uniq-dup-1', a.userId, null);
    expect(first.error).toBeNull();

    const second = await insertScorecard('sc-uniq-dup-2', a.userId, null);
    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe('23505');
  });

  test('many completed rows for the same owner are allowed', async () => {
    const a = await createTestUser('a-uniq-many-completed');
    const completedAt = new Date().toISOString();

    const r1 = await insertScorecard('sc-uniq-done-1', a.userId, completedAt);
    const r2 = await insertScorecard('sc-uniq-done-2', a.userId, completedAt);
    const r3 = await insertScorecard('sc-uniq-done-3', a.userId, completedAt);

    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect(r3.error).toBeNull();
  });

  test('one in-progress row plus many completed rows is fine', async () => {
    const a = await createTestUser('a-uniq-mixed');
    const completedAt = new Date().toISOString();

    expect((await insertScorecard('sc-uniq-mix-d1', a.userId, completedAt)).error).toBeNull();
    expect((await insertScorecard('sc-uniq-mix-d2', a.userId, completedAt)).error).toBeNull();
    expect((await insertScorecard('sc-uniq-mix-live', a.userId, null)).error).toBeNull();
  });

  test('completing the first row clears the way for a fresh in-progress row', async () => {
    const a = await createTestUser('a-uniq-clear');

    expect((await insertScorecard('sc-uniq-clear-1', a.userId, null)).error).toBeNull();

    // Mark the first row completed.
    const { error: updErr } = await admin
      .from('scorecards')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', 'sc-uniq-clear-1');
    expect(updErr).toBeNull();

    // Now a new in-progress row is allowed.
    expect((await insertScorecard('sc-uniq-clear-2', a.userId, null)).error).toBeNull();
  });

  test('different owners can each have their own in-progress row', async () => {
    const a = await createTestUser('a-uniq-multi-owner');
    const b = await createTestUser('b-uniq-multi-owner');

    expect((await insertScorecard('sc-uniq-mo-a', a.userId, null)).error).toBeNull();
    expect((await insertScorecard('sc-uniq-mo-b', b.userId, null)).error).toBeNull();
  });
});
