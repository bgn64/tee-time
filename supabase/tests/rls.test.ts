/**
 * Tier 2 — RLS visibility tests for the v7 scorecards table.
 *
 * Visibility rule: owner OR friend-of-owner. No participant-derived
 * visibility (v6 used player_user_ids + friend-of-participant union; those
 * are gone).
 */

import { befriend, cleanupAll, createTestUser, seedScorecard } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe('scorecards SELECT', () => {
  test('owner can SELECT their own scorecard', async () => {
    const a = await createTestUser('a-rls-own');
    const id = await seedScorecard({ owner: a });

    const { data, error } = await a.client.from('scorecards').select('id').eq('id', id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test('non-friend stranger cannot SELECT the scorecard', async () => {
    const a = await createTestUser('a-rls-priv');
    const c = await createTestUser('c-rls-priv');
    const id = await seedScorecard({ owner: a });

    const { data } = await c.client.from('scorecards').select('id').eq('id', id);
    expect(data).toHaveLength(0);
  });

  test('friend-of-owner can SELECT', async () => {
    const a = await createTestUser('a-rls-friend');
    const b = await createTestUser('b-rls-friend');
    await befriend(a, b);
    const id = await seedScorecard({ owner: a });

    const { data, error } = await b.client.from('scorecards').select('id').eq('id', id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test('named-but-not-friend-of-owner cannot SELECT', async () => {
    // v7: visibility is owner-OR-friend-of-owner only. Even if you appear
    // in the scorecard's participants/mentioned_user_ids, that alone does
    // NOT grant visibility — being named without being a friend means you
    // can't see the scorecard at all.
    const a = await createTestUser('a-rls-named');
    const c = await createTestUser('c-rls-named');
    // No befriend(a, c).

    // We can't seed a participant referencing C without a friendship in
    // place at the app level, but RLS doesn't care about that — we can
    // still write the inline participants with C's userId via A's client
    // because A owns the row.
    const id = await seedScorecard({
      owner: a,
      others: [{ user: c, participantKey: 'c-key' }],
    });

    const { data } = await c.client.from('scorecards').select('id').eq('id', id);
    expect(data).toHaveLength(0);
  });

  test('friend-of-named-non-owner does NOT inherit visibility (no participant union path)', async () => {
    // C is friends with B but NOT A. A's scorecard names B. C should NOT
    // see A's scorecard.
    const a = await createTestUser('a-rls-union');
    const b = await createTestUser('b-rls-union');
    const c = await createTestUser('c-rls-union');
    await befriend(a, b);
    await befriend(b, c);

    const id = await seedScorecard({
      owner: a,
      others: [{ user: b, participantKey: 'b-key' }],
    });

    const { data } = await c.client.from('scorecards').select('id').eq('id', id);
    expect(data).toHaveLength(0);
  });
});
