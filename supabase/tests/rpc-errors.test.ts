/**
 * Tier 2 — write-rejection tests for the v7 owner-only scorecard model.
 *
 * Under v7 every scoreline mutation is plain CRUD gated by RLS to the
 * scorecard's owner. These tests drive a non-owner client at update/delete
 * and verify the policy denies the write.
 */

import { admin, befriend, cleanupAll, createTestUser, seedScorecard } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe('scorecards UPDATE', () => {
  test('non-friend stranger cannot UPDATE the scorecard', async () => {
    const a = await createTestUser('a-up-stranger');
    const c = await createTestUser('c-up-stranger');
    const id = await seedScorecard({ owner: a });

    const { data, error } = await c.client
      .from('scorecards')
      .update({ scores: [{ scorerId: 'user', holeNumber: 1, strokes: 9 }] })
      .eq('id', id)
      .select();

    // RLS denial either errors or returns no rows.
    expect(error === null ? (data?.length ?? 0) === 0 : true).toBe(true);

    const { data: cur } = await admin
      .from('scorecards')
      .select('scores')
      .eq('id', id)
      .single();
    expect(cur!.scores).toEqual([]);
  });

  test('friend-of-owner cannot UPDATE the scorecard', async () => {
    const a = await createTestUser('a-up-friend');
    const b = await createTestUser('b-up-friend');
    await befriend(a, b);
    const id = await seedScorecard({
      owner: a,
      others: [{ user: b, participantKey: 'b-key' }],
    });

    const { data, error } = await b.client
      .from('scorecards')
      .update({ scores: [{ scorerId: 'b-key', holeNumber: 1, strokes: 4 }] })
      .eq('id', id)
      .select();
    expect(error === null ? (data?.length ?? 0) === 0 : true).toBe(true);

    const { data: cur } = await admin
      .from('scorecards')
      .select('scores')
      .eq('id', id)
      .single();
    expect(cur!.scores).toEqual([]);
  });
});

describe('scorecards DELETE', () => {
  test('non-owner cannot DELETE the scorecard', async () => {
    const a = await createTestUser('a-del-rej');
    const b = await createTestUser('b-del-rej');
    await befriend(a, b);
    const id = await seedScorecard({
      owner: a,
      others: [{ user: b, participantKey: 'b-key' }],
    });

    await b.client.from('scorecards').delete().eq('id', id);

    const { data } = await admin.from('scorecards').select('id').eq('id', id);
    expect(data).toHaveLength(1);
  });
});

describe('scorecards INSERT', () => {
  test('user cannot insert a scorecard owned by someone else', async () => {
    const a = await createTestUser('a-ins-rej');
    const b = await createTestUser('b-ins-rej');

    const { error } = await b.client.from('scorecards').insert({
      id: 'forged',
      owner_user_id: a.userId,
      course_snapshot: { id: 'tc', name: 'X', location: '', source: 'custom', holes: [] },
      scoring_rule: 'stroke',
      player_ids: ['user'],
      teams: null,
      scores: [],
      participants: [{ participantKey: 'user', linkedUserId: a.userId }],
      mentioned_user_ids: [a.userId],
      current_hole_number: 1,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });
});
