/**
 * Tier 2 — RPC error / authorization tests. Each one drives the RPC into
 * an unauthorized or invalid state and asserts the expected error.
 */

import { admin, befriend, cleanupAll, createTestUser, seedRound } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe('confirm_participation', () => {
  test('errors when caller has no pending row', async () => {
    const a = await createTestUser('a-cf-err');
    const roundId = await seedRound({ owner: a });

    const { error } = await a.client.rpc('confirm_participation', {
      p_round_id: roundId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('no pending');
  });
});

describe('deny_participation', () => {
  test('errors when caller has no pending row', async () => {
    const a = await createTestUser('a-dn-err');
    const roundId = await seedRound({ owner: a });

    const { error } = await a.client.rpc('deny_participation', {
      p_round_id: roundId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('no pending');
  });
});

describe('update_score', () => {
  test('rejects unauthorized scorer (non-participant trying to edit)', async () => {
    const a = await createTestUser('a-us-rej');
    const b = await createTestUser('b-us-rej');
    await befriend(a, b);
    const roundId = await seedRound({ owner: a });

    // B is friends with A but isn't on the round; B tries to write A's
    // scoreline.
    const { error } = await b.client.rpc('update_score', {
      p_round_id: roundId,
      p_scorer_id: 'user',
      p_hole: 1,
      p_strokes: 4,
    });
    expect(error).not.toBeNull();
  });

  test('rejects strokes < 1', async () => {
    const a = await createTestUser('a-us-low');
    const roundId = await seedRound({ owner: a });

    const { error } = await a.client.rpc('update_score', {
      p_round_id: roundId,
      p_scorer_id: 'user',
      p_hole: 1,
      p_strokes: 0,
    });
    expect(error).not.toBeNull();
  });
});

describe('merge_unlinked_player', () => {
  test('errors when caller is not friends with target', async () => {
    const a = await createTestUser('a-merge-nofriend');
    const b = await createTestUser('b-merge-nofriend');
    // Note: NO befriend() call.

    await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: 'dad',
      nickname: 'Dad',
      color: '#aabbcc',
      linked_user_id: null,
    });

    const { error } = await a.client.rpc('merge_unlinked_player', {
      p_unlinked_local_id: 'dad',
      p_friend_user_id: b.userId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('friends');
  });

  test('errors on uniqueness conflict (round already has the friend)', async () => {
    const a = await createTestUser('a-merge-uniq');
    const b = await createTestUser('b-merge-uniq');
    await befriend(a, b);

    // A's roster has both an unlinked "Mike" and the linked friend B.
    await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: 'mike',
      nickname: 'Mike',
      color: '#aabbcc',
      linked_user_id: null,
    });

    // Round contains BOTH the unlinked Mike AND linked B.
    const roundId = await seedRound({
      owner: a,
      others: [
        { participantKey: 'mike', nickname: 'Mike', status: 'confirmed' },
        { user: b, status: 'confirmed', participantKey: 'b-key' },
      ],
    });

    const { error } = await a.client.rpc('merge_unlinked_player', {
      p_unlinked_local_id: 'mike',
      p_friend_user_id: b.userId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('duplicate participant');
    // Round and roster should be untouched after error.
    const { data: roster } = await admin
      .from('roster_players')
      .select('*')
      .eq('owner_user_id', a.userId)
      .eq('id', 'mike');
    expect(roster).toHaveLength(1);
    void roundId;
  });

  test('errors when merging into yourself', async () => {
    const a = await createTestUser('a-merge-self');

    await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: 'past-me',
      nickname: 'Past Me',
      color: '#aabbcc',
      linked_user_id: null,
    });

    const { error } = await a.client.rpc('merge_unlinked_player', {
      p_unlinked_local_id: 'past-me',
      p_friend_user_id: a.userId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('yourself');
  });
});

describe('leave_round', () => {
  test('is a no-op when caller has no participation in the round', async () => {
    const a = await createTestUser('a-lr-noop-a');
    const b = await createTestUser('b-lr-noop-b');
    await befriend(a, b);
    const roundId = await seedRound({ owner: a });

    // B has no participant row on this round.
    const { error } = await b.client.rpc('leave_round', { p_round_id: roundId });
    // RPC returns void without raising.
    expect(error).toBeNull();

    // Round and A's participant row are unchanged.
    const { data: parts } = await admin
      .from('round_participants')
      .select('*')
      .eq('round_id', roundId);
    expect(parts).toHaveLength(1);
    expect(parts![0].linked_user_id).toBe(a.userId);
  });
});
