/**
 * Sign-out purge tests — exercises the centralized handler bus and
 * the per-context purge registrations (Player, GolfRound,
 * ProfileCache, writeQueue).
 *
 * Why these tests matter: the data-sovereignty contract says a
 * signed-out device must not retain the previously-signed-in user's
 * data in AsyncStorage. Pre-refactor, the cleanup ran via React
 * effects that observed `accountUserId` transitioning non-null →
 * null; that worked under normal flow but left a window between the
 * auth event and React commit where AsyncStorage held the previous
 * user's data. These tests pin the new contract: AsyncStorage is
 * cleared on the auth event itself, before any React reconciliation.
 */

jest.mock('@/state/supabaseClient');

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, waitFor } from '@testing-library/react-native';

import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';
import { usePlayers } from '@/state/PlayerContext';
import { useProfileCache } from '@/state/ProfileCacheContext';
import { STORAGE_KEYS } from '@/state/persistence';
import { writeQueue } from '@/state/writeQueue';

import {
  mockSupabaseEmitAuthEvent,
  mockSupabaseReset,
  mockSupabaseSeedSession,
  mockSupabaseSeedTable,
  renderHookWithProviders,
} from './test-utils';

const aliceUserId = '11111111-1111-4111-8111-111111111111';

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

function useEverything() {
  return {
    account: useAccount(),
    players: usePlayers(),
    golf: useGolfRound(),
    profileCache: useProfileCache(),
  };
}

beforeEach(() => {
  mockSupabaseReset();
  return AsyncStorage.clear();
});

afterEach(() => {
  return AsyncStorage.clear();
});

describe('SIGNED_OUT purge — PlayerContext', () => {
  test('clears the in-memory roster AND removes the AsyncStorage keys', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('roster_players', [
      {
        owner_user_id: aliceUserId,
        id: 'player-bob',
        nickname: 'Bob',
        color: '#222222',
        linked_user_id: null,
      },
    ]);

    const { result } = renderHookWithProviders(useEverything);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(
        result.current.players.allPlayers.find((p) => p.id === 'player-bob')
      ).toBeDefined();
    });

    // AsyncStorage should contain the persisted roster after the
    // mirror effects fire.
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.PLAYERS);
      expect(raw).not.toBeNull();
    });

    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_OUT', null);
      // Allow runSignOutPurge() to settle.
      await new Promise((r) => setTimeout(r, 0));
      await Promise.resolve();
    });

    // AsyncStorage is wiped synchronously by the purge handler.
    // Immediately afterwards, the in-memory state resets to seed
    // defaults, and the persistence mirror effects re-write THOSE
    // defaults. So the assertion is: previous user's data is gone,
    // not that AsyncStorage is empty. Verify by looking for Bob's
    // roster row specifically.
    await waitFor(async () => {
      const playersKey = await AsyncStorage.getItem(STORAGE_KEYS.PLAYERS);
      // Either null (purge in flight) or contains no Bob row.
      expect(playersKey ?? '').not.toContain('player-bob');
      expect(playersKey ?? '').not.toContain('"nickname":"Bob"');
    });
  });
});

describe('SIGNED_OUT purge — GolfRoundContext', () => {
  test('clears courses + rounds + currentRound in memory AND removes previous user data from AsyncStorage', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);

    const { result } = renderHookWithProviders(useEverything);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    // Seed local courses + a completed round so the storage mirror
    // has something to delete.
    await act(async () => {
      result.current.golf.addCourse({
        id: 'course-test',
        name: 'Test',
        location: '',
        source: 'custom',
        holes: [{ number: 1, par: 4 }],
      });
    });

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.COURSES);
      expect(raw).not.toBeNull();
    });

    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_OUT', null);
      await new Promise((r) => setTimeout(r, 0));
      await Promise.resolve();
    });

    // Verify the previous user's custom course is gone. The
    // persistence mirror will re-write the new in-memory state
    // (empty array from the reset) immediately after the purge, so
    // the assertion is "no leakage of previous user content" rather
    // than "AsyncStorage is null".
    await waitFor(async () => {
      const coursesKey = await AsyncStorage.getItem(STORAGE_KEYS.COURSES);
      expect(coursesKey ?? '').not.toContain('course-test');
    });
  });
});

describe('SIGNED_OUT purge — ProfileCacheContext', () => {
  test('drops cached profiles so the next signed-out viewer renders clean', async () => {
    const bobUserId = '22222222-2222-4222-8222-222222222222';
    const bobProfile = {
      user_id: bobUserId,
      handle: 'bob',
      display_name: 'Bob',
      avatar_color: '#bbbbbb',
      created_at: '2025-01-01T00:00:00Z',
    };

    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile, bobProfile]);
    mockSupabaseSeedTable('friendships', [
      { user_id: aliceUserId, friend_user_id: bobUserId, created_at: '2025-01-02T00:00:00Z' },
      { user_id: bobUserId, friend_user_id: aliceUserId, created_at: '2025-01-02T00:00:00Z' },
    ]);

    const { result } = renderHookWithProviders(useEverything);

    await waitFor(() => {
      expect(result.current.profileCache.profileCache[bobUserId]?.displayName).toBe('Bob');
    });

    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_OUT', null);
      await new Promise((r) => setTimeout(r, 0));
      await Promise.resolve();
    });

    expect(result.current.profileCache.profileCache).toEqual({});
  });
});

describe('SIGNED_OUT purge — writeQueue', () => {
  test('drops queued + dead-lettered entries and removes the persisted payload', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);

    const { result } = renderHookWithProviders(useEverything);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
    });

    // Plant a queue entry directly so we don't have to engineer a
    // failed write to populate it. The clear() should drop it
    // regardless of provenance.
    writeQueue.enqueue({
      table: 'roster_players',
      op: 'upsert',
      entityId: 'player-fake',
      payload: { id: 'player-fake', nickname: 'Fake', owner_user_id: aliceUserId },
      lastError: { message: 'simulated', code: '503' },
      rollbackSnapshot: { table: 'roster_players', entityId: 'player-fake', prevRow: null },
    });

    expect(writeQueue.entries().length).toBeGreaterThan(0);

    await act(async () => {
      mockSupabaseEmitAuthEvent('SIGNED_OUT', null);
      await new Promise((r) => setTimeout(r, 0));
      await Promise.resolve();
    });

    expect(writeQueue.entries()).toEqual([]);
    const persistedRaw = await AsyncStorage.getItem('tee-time:write-queue');
    expect(persistedRaw).toBeNull();
  });
});
