/**
 * Tier 2 — RPC happy-path tests. Each test exercises one RPC's intended
 * behavior and asserts the resulting database state via the service-role
 * `admin` client (bypasses RLS).
 */

import { admin, befriend, cleanupAll, createTestUser, seedRound } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe('confirm_participation', () => {
  test("flips the caller's pending row to confirmed", async () => {
    const a = await createTestUser('a-confirm');
    const b = await createTestUser('b-confirm');
    await befriend(a, b);

    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'pending' }],
    });

    const { error } = await b.client.rpc('confirm_participation', {
      p_round_id: roundId,
    });
    expect(error).toBeNull();

    const { data: rows } = await admin
      .from('round_participants')
      .select('*')
      .eq('round_id', roundId)
      .eq('linked_user_id', b.userId);
    expect(rows).toHaveLength(1);
    expect(rows![0].confirmation_status).toBe('confirmed');
  });
});

describe('deny_participation', () => {
  test("hard-deletes the caller's pending participant row", async () => {
    const a = await createTestUser('a-deny');
    const b = await createTestUser('b-deny');
    await befriend(a, b);

    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'pending' }],
    });

    const { error } = await b.client.rpc('deny_participation', {
      p_round_id: roundId,
    });
    expect(error).toBeNull();

    const { data: rows } = await admin
      .from('round_participants')
      .select('*')
      .eq('round_id', roundId)
      .eq('linked_user_id', b.userId);
    expect(rows).toHaveLength(0);
  });
});

describe('leave_round (non-owner confirmed)', () => {
  test("deletes only the caller's row; round + others unchanged", async () => {
    const a = await createTestUser('a-leave');
    const b = await createTestUser('b-leave');
    await befriend(a, b);

    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'confirmed' }],
    });

    const { error } = await b.client.rpc('leave_round', { p_round_id: roundId });
    expect(error).toBeNull();

    const { data: parts } = await admin
      .from('round_participants')
      .select('*')
      .eq('round_id', roundId);
    expect(parts).toHaveLength(1);
    expect(parts![0].linked_user_id).toBe(a.userId);

    const { data: rounds } = await admin
      .from('rounds')
      .select('owner_user_id')
      .eq('id', roundId);
    expect(rounds).toHaveLength(1);
    expect(rounds![0].owner_user_id).toBe(a.userId);
  });
});

describe('update_score', () => {
  test('owner can edit their own scoreline', async () => {
    const a = await createTestUser('a-score');
    const roundId = await seedRound({ owner: a });

    const { error } = await a.client.rpc('update_score', {
      p_round_id: roundId,
      p_scorer_id: 'user',
      p_hole: 5,
      p_strokes: 6,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('rounds')
      .select('scores')
      .eq('id', roundId)
      .single();
    const scores = data!.scores as Array<any>;
    const entry = scores.find((s) => s.scorerId === 'user' && s.holeNumber === 5);
    expect(entry).toBeDefined();
    expect(entry.strokes).toBe(6);
  });

  test('owner can edit a pending linked participant pre-confirmation', async () => {
    const a = await createTestUser('a-pre');
    const b = await createTestUser('b-pre');
    await befriend(a, b);
    const roundId = await seedRound({
      owner: a,
      others: [
        { user: b, status: 'pending', participantKey: 'b-key' },
      ],
    });

    const { error } = await a.client.rpc('update_score', {
      p_round_id: roundId,
      p_scorer_id: 'b-key',
      p_hole: 1,
      p_strokes: 7,
    });
    expect(error).toBeNull();

    const { data } = await admin.from('rounds').select('scores').eq('id', roundId).single();
    const entry = (data!.scores as any[]).find(
      (s) => s.scorerId === 'b-key' && s.holeNumber === 1
    );
    expect(entry?.strokes).toBe(7);
  });

  test('confirmed linked participant edits own line; owner cannot', async () => {
    const a = await createTestUser('a-post');
    const b = await createTestUser('b-post');
    await befriend(a, b);
    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'confirmed', participantKey: 'b-key' }],
    });

    // B (confirmed) can edit B's row.
    const { error: bErr } = await b.client.rpc('update_score', {
      p_round_id: roundId,
      p_scorer_id: 'b-key',
      p_hole: 1,
      p_strokes: 4,
    });
    expect(bErr).toBeNull();

    // A (owner) can NOT edit B's row post-confirm.
    const { error: aErr } = await a.client.rpc('update_score', {
      p_round_id: roundId,
      p_scorer_id: 'b-key',
      p_hole: 2,
      p_strokes: 5,
    });
    expect(aErr).not.toBeNull();
  });
});

describe('merge_unlinked_player', () => {
  test('overwrites display_name/color from friend profile and flips to pending', async () => {
    const a = await createTestUser('a-merge');
    const b = await createTestUser('b-merge');
    await befriend(a, b);

    // A has an unlinked roster entry "Dad" used in one round.
    await admin.from('roster_players').insert({
      owner_user_id: a.userId,
      id: 'dad',
      nickname: 'Dad',
      color: '#aabbcc',
      linked_user_id: null,
    });
    const roundId = await seedRound({
      owner: a,
      others: [
        { participantKey: 'dad', nickname: 'Dad', status: 'confirmed' },
      ],
    });

    const { error } = await a.client.rpc('merge_unlinked_player', {
      p_unlinked_local_id: 'dad',
      p_friend_user_id: b.userId,
    });
    expect(error).toBeNull();

    // Roster row gone.
    const { data: roster } = await admin
      .from('roster_players')
      .select('*')
      .eq('owner_user_id', a.userId)
      .eq('id', 'dad');
    expect(roster).toHaveLength(0);

    // Participant row now linked to B, pending, with B's profile snapshot.
    const { data: parts } = await admin
      .from('round_participants')
      .select('*')
      .eq('round_id', roundId)
      .eq('participant_key', 'dad');
    expect(parts).toHaveLength(1);
    expect(parts![0].linked_user_id).toBe(b.userId);
    expect(parts![0].confirmation_status).toBe('pending');
    expect(parts![0].display_name).toBe('b-merge');
  });
});
