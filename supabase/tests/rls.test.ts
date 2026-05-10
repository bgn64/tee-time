/**
 * Tier 2 — RLS visibility tests. Validates the rounds + round_participants
 * SELECT policies and the limited-write policies.
 */

import { admin, befriend, cleanupAll, createTestUser, seedRound } from './fixtures';

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe('rounds SELECT', () => {
  test('owner can SELECT their own round', async () => {
    const a = await createTestUser('a-rls-own');
    const roundId = await seedRound({ owner: a });

    const { data, error } = await a.client
      .from('rounds')
      .select('id')
      .eq('id', roundId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test('non-friend stranger cannot SELECT the round', async () => {
    const a = await createTestUser('a-rls-priv');
    const c = await createTestUser('c-rls-priv'); // not friends with anyone
    const roundId = await seedRound({ owner: a });

    const { data } = await c.client.from('rounds').select('id').eq('id', roundId);
    expect(data).toHaveLength(0);
  });

  test('friend-of-owner can SELECT a round they did not participate in', async () => {
    const a = await createTestUser('a-rls-friend');
    const b = await createTestUser('b-rls-friend');
    await befriend(a, b);

    const roundId = await seedRound({ owner: a });

    const { data, error } = await b.client
      .from('rounds')
      .select('id')
      .eq('id', roundId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test('friend-of-confirmed-participant (not owner-friend) can SELECT (union path)', async () => {
    // C is friends with B but NOT A. A scores a round with B confirmed.
    // RLS union path should let C see A's round through B's friendship.
    const a = await createTestUser('a-rls-union');
    const b = await createTestUser('b-rls-union');
    const c = await createTestUser('c-rls-union');
    await befriend(a, b);
    await befriend(b, c);

    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'confirmed', participantKey: 'b-key' }],
    });

    const { data, error } = await c.client
      .from('rounds')
      .select('id')
      .eq('id', roundId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe('round_participants writes', () => {
  test('owner CAN insert participant rows on their own round', async () => {
    const a = await createTestUser('a-rls-ins-own');
    const b = await createTestUser('b-rls-ins-own');
    await befriend(a, b);
    const roundId = await seedRound({ owner: a });

    const { error } = await a.client.from('round_participants').insert({
      round_id: roundId,
      participant_key: 'manual-key',
      linked_user_id: b.userId,
      confirmation_status: 'pending',
      display_name: 'Bob',
    });
    expect(error).toBeNull();
  });

  test("non-owner CANNOT insert participant rows on another's round", async () => {
    const a = await createTestUser('a-rls-ins-rej');
    const b = await createTestUser('b-rls-ins-rej');
    await befriend(a, b);
    const roundId = await seedRound({ owner: a });

    const { error } = await b.client.from('round_participants').insert({
      round_id: roundId,
      participant_key: 'manual-key',
      linked_user_id: b.userId,
      confirmation_status: 'pending',
      display_name: 'Bob',
    });
    expect(error).not.toBeNull();
  });

  test('no direct UPDATE on round_participants (must flow through RPCs)', async () => {
    const a = await createTestUser('a-rls-up');
    const b = await createTestUser('b-rls-up');
    await befriend(a, b);
    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'pending', participantKey: 'b-key' }],
    });

    // B tries to flip their own row to confirmed without going through the
    // RPC. Should be denied.
    const { data, error } = await b.client
      .from('round_participants')
      .update({ confirmation_status: 'confirmed' })
      .eq('round_id', roundId)
      .eq('participant_key', 'b-key')
      .select();

    // Either an explicit error OR the update succeeds but returns no rows
    // because RLS filters them out. Both indicate the policy is denying it.
    expect(error === null ? data?.length === 0 : true).toBe(true);

    // Definitive check: the row is still pending.
    const { data: cur } = await admin
      .from('round_participants')
      .select('confirmation_status')
      .eq('round_id', roundId)
      .eq('participant_key', 'b-key')
      .single();
    expect(cur!.confirmation_status).toBe('pending');
  });

  test('no direct DELETE on round_participants', async () => {
    const a = await createTestUser('a-rls-del');
    const b = await createTestUser('b-rls-del');
    await befriend(a, b);
    const roundId = await seedRound({
      owner: a,
      others: [{ user: b, status: 'confirmed', participantKey: 'b-key' }],
    });

    await b.client
      .from('round_participants')
      .delete()
      .eq('round_id', roundId)
      .eq('participant_key', 'b-key');

    const { data } = await admin
      .from('round_participants')
      .select('participant_key')
      .eq('round_id', roundId)
      .eq('participant_key', 'b-key');
    expect(data).toHaveLength(1);
  });
});
