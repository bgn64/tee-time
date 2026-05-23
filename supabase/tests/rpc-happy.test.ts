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

  test("auto-creates the sender's roster row for the new friend (S3 fan-out)", async () => {
    const a = await createTestUser('a-fanout');
    const b = await createTestUser('b-fanout');

    const { data: requestRow } = await a.client
      .from('friend_requests')
      .insert({
        from_user_id: a.userId,
        to_user_id: b.userId,
        status: 'pending',
        source_player_id: null,
      })
      .select()
      .single();

    const { error: accErr } = await b.client.rpc('accept_friend_request', {
      request_id: requestRow!.id,
    });
    expect(accErr).toBeNull();

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, avatar_color')
      .eq('user_id', b.userId)
      .single();

    const { data: rosterRows } = await admin
      .from('roster_players')
      .select('id, nickname, color, linked_user_id')
      .eq('owner_user_id', a.userId);
    expect(rosterRows).toHaveLength(1);
    expect(rosterRows![0]).toEqual({
      id: `player-${b.userId}`,
      nickname: profile!.display_name,
      color: profile!.avatar_color,
      linked_user_id: b.userId,
    });
  });

  test('is a no-op when the sender already has a linked roster row for the friend', async () => {
    const a = await createTestUser('a-idem');
    const b = await createTestUser('b-idem');

    // Pre-seed a legacy-style linked row under a non-deterministic id, as
    // would exist if `ensureRosterForFriend` had already minted one (e.g.,
    // via befriend() in another test path).
    await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: 'legacy-row-1',
      nickname: 'legacy-nickname',
      color: '#123456',
      linked_user_id: b.userId,
    });

    const { data: requestRow } = await a.client
      .from('friend_requests')
      .insert({
        from_user_id: a.userId,
        to_user_id: b.userId,
        status: 'pending',
        source_player_id: null,
      })
      .select()
      .single();

    const { error: accErr } = await b.client.rpc('accept_friend_request', {
      request_id: requestRow!.id,
    });
    expect(accErr).toBeNull();

    const { data: rosterRows } = await admin
      .from('roster_players')
      .select('id, nickname, color, linked_user_id')
      .eq('owner_user_id', a.userId);
    expect(rosterRows).toHaveLength(1);
    expect(rosterRows![0]).toEqual({
      id: 'legacy-row-1',
      nickname: 'legacy-nickname',
      color: '#123456',
      linked_user_id: b.userId,
    });
  });

  test('links an existing unlinked deterministic-id row instead of colliding on PK', async () => {
    const a = await createTestUser('a-coll');
    const b = await createTestUser('b-coll');

    // Pre-seed an unlinked row whose id is exactly what the fan-out would
    // INSERT. The UPDATE-then-INSERT shape should link this row instead of
    // raising a primary-key violation.
    await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: `player-${b.userId}`,
      nickname: 'pre-existing-nick',
      color: '#abcdef',
      linked_user_id: null,
    });

    const { data: requestRow } = await a.client
      .from('friend_requests')
      .insert({
        from_user_id: a.userId,
        to_user_id: b.userId,
        status: 'pending',
        source_player_id: null,
      })
      .select()
      .single();

    const { error: accErr } = await b.client.rpc('accept_friend_request', {
      request_id: requestRow!.id,
    });
    expect(accErr).toBeNull();

    const { data: rosterRows } = await admin
      .from('roster_players')
      .select('id, nickname, color, linked_user_id')
      .eq('owner_user_id', a.userId);
    expect(rosterRows).toHaveLength(1);
    // Existing nickname/color preserved; only linked_user_id changes.
    expect(rosterRows![0]).toEqual({
      id: `player-${b.userId}`,
      nickname: 'pre-existing-nick',
      color: '#abcdef',
      linked_user_id: b.userId,
    });
  });
});
