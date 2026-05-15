/**
 * Tier 2 — schema-level invariants on scorecards.
 *
 * v7 ships no per-scorecard triggers beyond the generic touch_updated_at,
 * so this file mostly verifies cascade behavior off auth.users.
 */

import { admin, befriend, cleanupAll, createTestUser, seedScorecard } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe('cascade: auth.users -> scorecards', () => {
  test('deleting the owner drops their scorecards', async () => {
    const a = await createTestUser('a-cascade');
    const b = await createTestUser('b-cascade');
    await befriend(a, b);
    const id = await seedScorecard({
      owner: a,
      others: [{ user: b, participantKey: 'b-key' }],
    });

    await admin.auth.admin.deleteUser(a.userId);

    const { data } = await admin.from('scorecards').select('id').eq('id', id);
    expect(data).toHaveLength(0);
  });

  test('deleting a named friend leaves the owner\'s scorecard alone', async () => {
    const a = await createTestUser('a-keep');
    const b = await createTestUser('b-keep');
    await befriend(a, b);
    const id = await seedScorecard({
      owner: a,
      others: [{ user: b, participantKey: 'b-key' }],
    });

    await admin.auth.admin.deleteUser(b.userId);

    const { data } = await admin.from('scorecards').select('id').eq('id', id);
    expect(data).toHaveLength(1);
  });
});

describe('touch_updated_at', () => {
  test('updated_at advances on score edit', async () => {
    const a = await createTestUser('a-touch');
    const id = await seedScorecard({ owner: a });

    const before = (
      await admin.from('scorecards').select('updated_at').eq('id', id).single()
    ).data!.updated_at as string;

    // Small delay to ensure the timestamp can advance.
    await new Promise((r) => setTimeout(r, 25));

    await a.client
      .from('scorecards')
      .update({ scores: [{ scorerId: 'user', holeNumber: 1, strokes: 4 }] })
      .eq('id', id);

    const after = (
      await admin.from('scorecards').select('updated_at').eq('id', id).single()
    ).data!.updated_at as string;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });
});

// =============================================================================
// Phase 1.4 — migration 018 partial-unique on roster_players.
//
// The dedupe + scorecard-rewrite half of the migration is best-tested by
// re-running the migration against handcrafted duplicates, which would
// require custom infrastructure to splice the SQL into the test setup
// path. We instead pin the post-migration invariant directly: a second
// insert into `(owner_user_id, linked_user_id)` is rejected with the
// Postgres unique-violation code.
// =============================================================================

describe('roster_players partial-unique on (owner_user_id, linked_user_id)', () => {
  test('a second linked roster row for the same friend is rejected with 23505', async () => {
    const a = await createTestUser('a-roster-uniq');
    const b = await createTestUser('b-roster-uniq');

    // First insert succeeds.
    const first = await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: `player-${b.userId}`,
      nickname: 'Bob',
      color: '#42a5f5',
      linked_user_id: b.userId,
    });
    expect(first.error).toBeNull();

    // Second insert with a different `id` but the same
    // (owner_user_id, linked_user_id) pair must collide on the partial
    // unique index added by migration 018.
    const second = await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: `player-${b.userId}-${Date.now()}`,
      nickname: 'Bob (dup)',
      color: '#ab47bc',
      linked_user_id: b.userId,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe('23505');
  });

  test('multiple UNLINKED rows under the same owner are still allowed', async () => {
    const a = await createTestUser('a-unlinked-ok');

    // Two distinct unlinked rows (linked_user_id IS NULL) — the partial
    // index only covers the NOT-NULL subset, so these should coexist.
    const first = await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: 'player-local-1',
      nickname: 'Local One',
      color: '#42a5f5',
      linked_user_id: null,
    });
    expect(first.error).toBeNull();

    const second = await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: 'player-local-2',
      nickname: 'Local Two',
      color: '#ab47bc',
      linked_user_id: null,
    });
    expect(second.error).toBeNull();

    const { data } = await admin
      .from('roster_players')
      .select('id')
      .eq('owner_user_id', a.userId);
    expect(data).toHaveLength(2);
  });
});
