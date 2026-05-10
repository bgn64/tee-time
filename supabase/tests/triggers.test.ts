/**
 * Tier 2 — trigger / cascade tests. Validates the participant lifecycle
 * triggers on the rounds + round_participants tables.
 */

import { admin, befriend, cleanupAll, createTestUser, seedRound } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe('seed_owner_participant', () => {
  test('sets team_id for the owner in scramble rounds', async () => {
    const a = await createTestUser('a-seed-team');
    const teams = [
      { id: 'red', name: 'Red', color: '#d54848', playerIds: ['user'] },
    ];
    const roundId = await seedRound({
      owner: a,
      scoringRule: 'scramble',
      teams,
    });

    const { data } = await admin
      .from('round_participants')
      .select('participant_key, team_id')
      .eq('round_id', roundId);
    const owner = data!.find((r) => r.participant_key === 'user');
    expect(owner).toBeDefined();
    expect(owner!.team_id).toBe('red');
  });

  test('leaves team_id NULL for stroke rounds', async () => {
    const a = await createTestUser('a-seed-stroke');
    const roundId = await seedRound({ owner: a });

    const { data } = await admin
      .from('round_participants')
      .select('team_id')
      .eq('round_id', roundId)
      .eq('participant_key', 'user');
    expect(data![0].team_id).toBeNull();
  });
});

describe('participants_after_change — score preservation', () => {
  test('does NOT prune scores on INSERT (preserves co-player scores)', async () => {
    // Regression test: previously the trigger pruned scores whenever any
    // participant change fired, which wiped co-player scores during the
    // window between owner-row seeding and pushing other participants.
    const a = await createTestUser('a-prune-ins');
    const b = await createTestUser('b-prune-ins');
    await befriend(a, b);

    const roundId = await seedRound({
      owner: a,
      others: [
        { user: b, status: 'pending', participantKey: 'b-key' },
      ],
      scores: {
        user: { 1: 4, 2: 5 },
        'b-key': { 1: 6, 2: 7 },
      },
    });

    const { data } = await admin.from('rounds').select('scores').eq('id', roundId).single();
    const scores = data!.scores as any[];
    expect(scores).toHaveLength(4);
    const scorers = new Set(scores.map((s) => s.scorerId));
    expect(scorers.has('user')).toBe(true);
    expect(scorers.has('b-key')).toBe(true);
  });

  test('DOES prune scores on DELETE when a scorer leaves', async () => {
    const a = await createTestUser('a-prune-del');
    const b = await createTestUser('b-prune-del');
    await befriend(a, b);

    const roundId = await seedRound({
      owner: a,
      others: [
        { user: b, status: 'pending', participantKey: 'b-key' },
      ],
      scores: {
        user: { 1: 4 },
        'b-key': { 1: 6 },
      },
    });

    // B denies, which hard-deletes B's row. Trigger should prune B's score.
    await b.client.rpc('deny_participation', { p_round_id: roundId });

    const { data } = await admin.from('rounds').select('scores').eq('id', roundId).single();
    const scores = data!.scores as any[];
    const scorers = new Set(scores.map((s) => s.scorerId));
    expect(scorers.has('user')).toBe(true);
    expect(scorers.has('b-key')).toBe(false);
  });
});

describe('participants_after_change — round cleanup', () => {
  test('deletes the round when no participants remain', async () => {
    const a = await createTestUser('a-empty');
    const roundId = await seedRound({ owner: a });

    // Manually delete the owner's participant row (test harness only — real
    // app would use leave_round). Use the admin client to bypass RLS.
    await admin
      .from('round_participants')
      .delete()
      .eq('round_id', roundId);

    const { data } = await admin.from('rounds').select('id').eq('id', roundId);
    expect(data).toHaveLength(0);
  });

  test('recomputes player_user_ids when a participant confirms', async () => {
    const a = await createTestUser('a-puids');
    const b = await createTestUser('b-puids');
    await befriend(a, b);

    const roundId = await seedRound({
      owner: a,
      others: [
        { user: b, status: 'pending', participantKey: 'b-key' },
      ],
    });

    // Initially only A is confirmed-linked.
    const before = await admin
      .from('rounds')
      .select('player_user_ids')
      .eq('id', roundId)
      .single();
    expect(before.data!.player_user_ids).toEqual([a.userId]);

    // B confirms.
    await b.client.rpc('confirm_participation', { p_round_id: roundId });

    const after = await admin
      .from('rounds')
      .select('player_user_ids')
      .eq('id', roundId)
      .single();
    const ids = (after.data!.player_user_ids as string[]).sort();
    expect(ids).toEqual([a.userId, b.userId].sort());
  });
});

describe('leave_round (owner) — ordering regression', () => {
  test('transfers ownership to a confirmed linked participant before deletion', async () => {
    // Regression: previously leave_round deleted the owner's row first,
    // which made the trigger's player_user_ids recompute fire while
    // owner_user_id was still set to A. The realtime UPDATE event then
    // carried the old owner, briefly leaving A's client thinking it was
    // still their round.
    const a = await createTestUser('a-leave-own');
    const b = await createTestUser('b-leave-own');
    await befriend(a, b);

    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'confirmed', participantKey: 'b-key' }],
    });

    await a.client.rpc('leave_round', { p_round_id: roundId });

    // Round survives, owner is now B.
    const { data: round } = await admin
      .from('rounds')
      .select('owner_user_id, owner_participant_key')
      .eq('id', roundId)
      .single();
    expect(round!.owner_user_id).toBe(b.userId);
    expect(round!.owner_participant_key).toBe('b-key');

    // A's row is gone; only B remains.
    const { data: parts } = await admin
      .from('round_participants')
      .select('linked_user_id')
      .eq('round_id', roundId);
    expect(parts).toHaveLength(1);
    expect(parts![0].linked_user_id).toBe(b.userId);
  });

  test('deletes the round when the owner leaves and no confirmed participants remain', async () => {
    const a = await createTestUser('a-leave-solo');
    const b = await createTestUser('b-leave-solo');
    await befriend(a, b);

    // B is on the round but only as PENDING — not a successor candidate.
    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'pending', participantKey: 'b-key' }],
    });

    await a.client.rpc('leave_round', { p_round_id: roundId });

    const { data } = await admin.from('rounds').select('id').eq('id', roundId);
    expect(data).toHaveLength(0);
  });

  test("cascades unlinked + pending rows when owner leaves", async () => {
    const a = await createTestUser('a-cascade');
    const b = await createTestUser('b-cascade');
    const c = await createTestUser('c-cascade');
    await befriend(a, b);
    await befriend(a, c);

    // Round has: owner A (auto-confirmed), unlinked Mike, pending B,
    // confirmed C.
    const roundId = await seedRound({
      owner: a,
      others: [
        { participantKey: 'mike', nickname: 'Mike', status: 'confirmed' }, // unlinked
        { user: b, status: 'pending', participantKey: 'b-key' },
        { user: c, status: 'confirmed', participantKey: 'c-key' },
      ],
    });

    await a.client.rpc('leave_round', { p_round_id: roundId });

    // Round persists with C as the only participant; A's row, Mike, and
    // B's pending row are all gone.
    const { data } = await admin
      .from('round_participants')
      .select('participant_key, linked_user_id')
      .eq('round_id', roundId);
    expect(data).toHaveLength(1);
    expect(data![0].participant_key).toBe('c-key');
    expect(data![0].linked_user_id).toBe(c.userId);

    const { data: round } = await admin
      .from('rounds')
      .select('owner_user_id')
      .eq('id', roundId)
      .single();
    expect(round!.owner_user_id).toBe(c.userId);
  });
});
