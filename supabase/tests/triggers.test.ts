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
