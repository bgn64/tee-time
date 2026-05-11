/**
 * Tier 2 — owner-CRUD happy paths.
 *
 * Under v7 the v6 RPCs (confirm_participation, deny_participation,
 * leave_round, update_score, merge_unlinked_player) are gone. All
 * scoreline mutations are plain RLS-gated CRUD on `scorecards`. This file
 * covers the cases the v6 RPCs used to handle.
 */

import { admin, befriend, cleanupAll, createTestUser, seedScorecard } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe('scorecard CRUD by owner', () => {
  test('owner can update their scorecard scores', async () => {
    const a = await createTestUser('a-edit');
    const id = await seedScorecard({ owner: a });

    const { error } = await a.client
      .from('scorecards')
      .update({
        scores: [{ scorerId: 'user', holeNumber: 5, strokes: 6 }],
      })
      .eq('id', id);
    expect(error).toBeNull();

    const { data } = await admin.from('scorecards').select('scores').eq('id', id).single();
    const scores = data!.scores as Array<{ scorerId: string; holeNumber: number; strokes: number }>;
    expect(scores).toHaveLength(1);
    expect(scores[0].strokes).toBe(6);
  });

  test('owner can delete their scorecard', async () => {
    const a = await createTestUser('a-del');
    const id = await seedScorecard({ owner: a });

    const { error } = await a.client.from('scorecards').delete().eq('id', id);
    expect(error).toBeNull();

    const { data } = await admin.from('scorecards').select('id').eq('id', id);
    expect(data).toHaveLength(0);
  });

  test('owner can edit a named (linked) friend\'s scoreline on their own card', async () => {
    const a = await createTestUser('a-edit-other');
    const b = await createTestUser('b-edit-other');
    await befriend(a, b);
    const id = await seedScorecard({
      owner: a,
      others: [{ user: b, participantKey: 'b-key' }],
    });

    const { error } = await a.client
      .from('scorecards')
      .update({
        scores: [{ scorerId: 'b-key', holeNumber: 3, strokes: 7 }],
      })
      .eq('id', id);
    expect(error).toBeNull();

    const { data } = await admin.from('scorecards').select('scores').eq('id', id).single();
    const scores = data!.scores as Array<{ scorerId: string; holeNumber: number; strokes: number }>;
    expect(scores).toHaveLength(1);
    expect(scores[0]).toEqual({ scorerId: 'b-key', holeNumber: 3, strokes: 7 });
  });
});

describe('mentioned_user_ids', () => {
  test('persists the linked friend user_ids from inline participants', async () => {
    const a = await createTestUser('a-mention');
    const b = await createTestUser('b-mention');
    await befriend(a, b);
    const id = await seedScorecard({
      owner: a,
      others: [{ user: b, participantKey: 'b-key' }],
    });

    const { data } = await admin
      .from('scorecards')
      .select('mentioned_user_ids')
      .eq('id', id)
      .single();
    expect((data!.mentioned_user_ids as string[]).sort()).toEqual(
      [a.userId, b.userId].sort()
    );
  });
});

describe('accept_friend_request', () => {
  test('records a symmetric friendship and accepts the request', async () => {
    const a = await createTestUser('a-fr');
    const b = await createTestUser('b-fr');

    const { data: requestRow, error: insErr } = await a.client
      .from('friend_requests')
      .insert({
        from_user_id: a.userId,
        to_user_id: b.userId,
        status: 'pending',
        source_player_id: null,
      })
      .select()
      .single();
    expect(insErr).toBeNull();

    const { error: accErr } = await b.client.rpc('accept_friend_request', {
      request_id: requestRow!.id,
    });
    expect(accErr).toBeNull();

    const { data: friendships } = await admin
      .from('friendships')
      .select('user_id, friend_user_id');
    const pairs = (friendships ?? []).map((f) => `${f.user_id}:${f.friend_user_id}`).sort();
    expect(pairs).toEqual(
      [
        `${a.userId}:${b.userId}`,
        `${b.userId}:${a.userId}`,
      ].sort()
    );
  });
});
