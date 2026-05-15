/**
 * PlayerContext — coverage for the Phase 1.4 `ensureRosterForFriend`
 * helper.
 *
 * Background:
 *   Before Phase 1.4 the friends auto-roster path lived in two places
 *   (`acceptIncomingRequest` on the receiver, the realtime `friendships`
 *   INSERT handler on the sender). Each minted a row with id
 *   `player-${userId}-${Date.now()}`, so a race between the two paths
 *   produced two duplicate rows for the same friend. The new helper
 *   collapses both call sites onto a deterministic id and is the
 *   client-side half of the dedupe + partial-unique-index pair shipped
 *   in migration 018.
 *
 * These tests pin the contract the rest of the refactor relies on:
 *   · Two calls with the same profile = exactly one roster row, with the
 *     deterministic id `player-${userId}`.
 *   · A second call with cosmetic field changes (displayName / handle /
 *     avatarColor) updates the row in place — id stays the same, no
 *     duplicate is appended.
 *   · The cloud upsert for a linked row uses
 *     `onConflict: 'owner_user_id,linked_user_id'` so the new DB index
 *     accepts repeated upserts of the same friend.
 */

jest.mock('@/state/supabaseClient');

import { act, waitFor } from '@testing-library/react-native';

import { useAccount } from '@/state/AccountContext';
import { usePlayers } from '@/state/PlayerContext';
import { writeQueue } from '@/state/writeQueue';
import type { ProfileSummary } from '@/types/social';

import {
  mockSupabaseCallLog,
  mockSupabaseGetTable,
  mockSupabaseReset,
  mockSupabaseSeedSession,
  mockSupabaseSeedTable,
  mockSupabaseSetTableError,
  renderHookWithProviders,
} from './test-utils';

// =============================================================================
// Fixtures — UUIDs are required for `safeLinkedUserId` to retain them on
// the cloud payload. Non-UUID userIds get filtered to null and the upsert
// looks "unlinked" to the mock.
// =============================================================================

const aliceUserId = '11111111-1111-4111-8111-111111111111';
const bobUserId = '22222222-2222-4222-8222-222222222222';

const aliceSession = {
  user: { id: aliceUserId, email: 'alice@example.com', user_metadata: {} },
};

const aliceProfile = {
  user_id: aliceUserId,
  handle: 'alice',
  display_name: 'Alice',
  avatar_color: '#aaaaaa',
  created_at: '2025-01-01T00:00:00Z',
};

const bobProfileSummary: ProfileSummary = {
  userId: bobUserId,
  handle: 'bob',
  displayName: 'Bob',
  avatarColor: '#bbbbbb',
};

function useAccountAndPlayers() {
  return {
    account: useAccount(),
    players: usePlayers(),
  };
}

function rosterUpserts() {
  return mockSupabaseCallLog().filter(
    (c: { kind: string; args: any[] }) =>
      c.kind === 'from.upsert' && c.args[0]?.table === 'roster_players'
  );
}

beforeEach(() => {
  mockSupabaseReset();
});

// =============================================================================
// Tests
// =============================================================================

describe('PlayerContext.ensureRosterForFriend', () => {
  test('two consecutive calls produce exactly one roster row with the deterministic id', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('roster_players', []);

    const { result } = renderHookWithProviders(useAccountAndPlayers);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.players.hydrated).toBe(true);
    });

    const beforeCount = result.current.players.allPlayers.length;

    let firstReturn: ReturnType<typeof result.current.players.ensureRosterForFriend>;
    let secondReturn: ReturnType<typeof result.current.players.ensureRosterForFriend>;

    await act(async () => {
      firstReturn = result.current.players.ensureRosterForFriend(bobProfileSummary);
    });
    await act(async () => {
      secondReturn = result.current.players.ensureRosterForFriend(bobProfileSummary);
    });

    expect(firstReturn!.id).toBe(`player-${bobUserId}`);
    expect(secondReturn!.id).toBe(firstReturn!.id);
    expect(secondReturn!.userId).toBe(bobUserId);

    const bobRows = result.current.players.allPlayers.filter(
      (p) => p.userId === bobUserId
    );
    expect(bobRows).toHaveLength(1);
    expect(bobRows[0].id).toBe(`player-${bobUserId}`);
    expect(result.current.players.allPlayers.length).toBe(beforeCount + 1);
  });

  test('updating cosmetic fields on an existing row keeps the id stable', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('roster_players', []);

    const { result } = renderHookWithProviders(useAccountAndPlayers);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.players.hydrated).toBe(true);
    });

    await act(async () => {
      result.current.players.ensureRosterForFriend(bobProfileSummary);
    });

    const firstRow = result.current.players.allPlayers.find(
      (p) => p.userId === bobUserId
    );
    expect(firstRow?.id).toBe(`player-${bobUserId}`);
    expect(firstRow?.displayName).toBe('Bob');
    expect(firstRow?.handle).toBe('bob');

    // Now call again with mutated cosmetic fields.
    const renamed: ProfileSummary = {
      ...bobProfileSummary,
      displayName: 'Bobby',
      handle: 'bobby',
      avatarColor: '#cccccc',
    };

    await act(async () => {
      result.current.players.ensureRosterForFriend(renamed);
    });

    const bobRows = result.current.players.allPlayers.filter(
      (p) => p.userId === bobUserId
    );
    expect(bobRows).toHaveLength(1);
    expect(bobRows[0].id).toBe(`player-${bobUserId}`);
    expect(bobRows[0].displayName).toBe('Bobby');
    expect(bobRows[0].handle).toBe('bobby');
  });

  test('cloud upsert for a linked row uses onConflict=owner_user_id,linked_user_id', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('roster_players', []);

    const { result } = renderHookWithProviders(useAccountAndPlayers);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.players.hydrated).toBe(true);
    });

    const upsertsBefore = rosterUpserts().length;

    await act(async () => {
      result.current.players.ensureRosterForFriend(bobProfileSummary);
      // Let the fire-and-forget cloud upsert resolve.
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(rosterUpserts().length).toBeGreaterThan(upsertsBefore);
    });

    const helperUpsert = rosterUpserts()[upsertsBefore];
    const args = helperUpsert.args[0];
    expect(args.payload.linked_user_id).toBe(bobUserId);
    expect(args.payload.id).toBe(`player-${bobUserId}`);
    expect(args.payload.owner_user_id).toBe(aliceUserId);
    // The linked-row conflict target — what cooperates with migration
    // 018's partial-unique index instead of exploding on 23505 during a
    // stale-id retry.
    expect(args.upsertOpts).toEqual({ onConflict: 'owner_user_id,linked_user_id' });

    // Calling again must not create a second cloud row — onConflict
    // collapses the duplicate into the existing row.
    await act(async () => {
      result.current.players.ensureRosterForFriend(bobProfileSummary);
      await Promise.resolve();
    });

    await waitFor(() => {
      const bobCloudRows = mockSupabaseGetTable('roster_players').filter(
        (r: { linked_user_id?: string | null }) => r.linked_user_id === bobUserId
      );
      expect(bobCloudRows).toHaveLength(1);
    });
  });
});

// =============================================================================
// Phase 3.2 — Offline write queue integration
//
// addPlayer's cloud upsert path is now wrapped by the write queue.
// Verifies:
//   · Transient (network) failure leaves the optimistic local row
//     intact AND enqueues the write; a later flush drains it.
//   · Permanent (403) failure triggers the rollback handler, which
//     removes the optimistic local row.
// =============================================================================

describe('PlayerContext addPlayer — write queue integration', () => {
  test('offline (network error) keeps optimistic row, enqueues, flush drains', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('roster_players', []);

    const { result } = renderHookWithProviders(useAccountAndPlayers);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.players.hydrated).toBe(true);
    });

    // Simulate offline: the next write against roster_players fails
    // with a transient network error. The mock auto-clears after one
    // call (single-shot), so a later flush will succeed cleanly.
    mockSupabaseSetTableError('roster_players', { message: 'Network request failed' });

    const newPlayer = {
      id: 'player-offline-1',
      nickname: 'Offline Player',
      color: '#333333',
    };

    await act(async () => {
      result.current.players.addPlayer(newPlayer);
      await Promise.resolve();
    });

    // Local optimistic state holds the player.
    await waitFor(() => {
      const local = result.current.players.allPlayers.find(
        (p) => p.id === 'player-offline-1'
      );
      expect(local).toBeTruthy();
      expect(local!.nickname).toBe('Offline Player');
    });

    // Queue holds the pending write.
    await waitFor(() => {
      const pending = writeQueue
        .entries()
        .find((e) => e.entityId === 'player-offline-1');
      expect(pending).toBeTruthy();
      expect(pending!.table).toBe('roster_players');
      expect(pending!.op).toBe('upsert');
    });

    // Cloud has nothing (the only attempt failed).
    expect(
      mockSupabaseGetTable('roster_players').find((r: any) => r.id === 'player-offline-1')
    ).toBeUndefined();

    // Reconnect (the seeded error is single-shot and was consumed on
    // the first attempt; flush retries cleanly).
    await act(async () => {
      await writeQueue.flush();
    });

    // Cloud now has the row.
    await waitFor(() => {
      const cloud = mockSupabaseGetTable('roster_players').find(
        (r: any) => r.id === 'player-offline-1'
      );
      expect(cloud).toBeTruthy();
      expect(cloud!.nickname).toBe('Offline Player');
    });
    // Queue drained.
    expect(
      writeQueue.entries().find((e) => e.entityId === 'player-offline-1')
    ).toBeUndefined();
  });

  test('permanent failure (403) rolls back the optimistic local row', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('roster_players', []);

    const { result } = renderHookWithProviders(useAccountAndPlayers);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.players.hydrated).toBe(true);
    });

    // 403 = permanent. The wrapper catches, enqueues with the permanent
    // error, and the queue dead-letters immediately + invokes the
    // PlayerContext's registered rollback handler.
    mockSupabaseSetTableError('roster_players', {
      message: 'forbidden',
      code: 403 as any,
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const doomedPlayer = {
      id: 'player-permanent-1',
      nickname: 'Doomed Player',
      color: '#990000',
    };

    await act(async () => {
      result.current.players.addPlayer(doomedPlayer);
      // Let the cloudUpsertPlayer promise chain (and the enqueue+rollback) settle.
      await new Promise<void>((r) => setTimeout(r, 0));
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    // Rollback handler should have removed the optimistic row.
    await waitFor(() => {
      const local = result.current.players.allPlayers.find(
        (p) => p.id === 'player-permanent-1'
      );
      expect(local).toBeUndefined();
    });

    // Cloud never received it.
    expect(
      mockSupabaseGetTable('roster_players').find(
        (r: any) => r.id === 'player-permanent-1'
      )
    ).toBeUndefined();

    warnSpy.mockRestore();
  });
});
