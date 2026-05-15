/**
 * WriteQueue — coverage for the Phase 3.2 offline write queue.
 *
 * Background:
 *   Before Phase 3.2, every cloud write fired fire-and-forget. A 5xx
 *   or a dropped connection silently desynced local optimistic state
 *   from cloud. The new queue catches those failures, classifies them,
 *   retries transient errors with backoff, dead-letters permanent ones,
 *   coalesces redundant writes, and persists across crashes so a
 *   relaunch resumes from where it left off.
 *
 * These tests pin the public contract the rest of the refactor depends
 * on. They instantiate fresh `WriteQueue` instances per test (NOT the
 * shared singleton) with unique storage keys for isolation; the mocked
 * supabase client is injected via `setSupabaseClient`.
 */

jest.mock('@/state/supabaseClient');

import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AppState = require('react-native/Libraries/AppState/AppState').default;

import { WriteQueue, classifyError } from '@/state/writeQueue';

import {
  mockSupabaseGetTable,
  mockSupabaseReset,
  mockSupabaseSetTableError,
} from './test-utils';

// The shared manual mock exports `supabase` as the fake client. Pull
// it in via the module-mocked path so tests can inject the SAME
// instance the contexts would receive in production.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { supabase: mockedSupabase } = require('@/state/supabaseClient');

// =============================================================================
// Test harness
// =============================================================================

let testCounter = 0;
function freshKey(label: string): string {
  testCounter += 1;
  return `test:wq:${label}:${testCounter}`;
}

function makeUpsertEntry(overrides?: Partial<{
  table: string;
  entityId: string;
  payload: any;
  upsertOpts: any;
  lastError: any;
  rollbackSnapshot: any;
}>) {
  return {
    table: overrides?.table ?? 'roster_players',
    op: 'upsert' as const,
    entityId: overrides?.entityId ?? 'p1',
    payload: overrides?.payload ?? {
      owner_user_id: 'u1',
      id: overrides?.entityId ?? 'p1',
      nickname: 'Alice',
      color: '#fff',
      linked_user_id: null,
    },
    upsertOpts: overrides?.upsertOpts ?? { onConflict: 'owner_user_id,id' },
    lastError: overrides?.lastError ?? { message: 'Network error' },
    rollbackSnapshot: overrides?.rollbackSnapshot ?? {
      table: overrides?.table ?? 'roster_players',
      entityId: overrides?.entityId ?? 'p1',
      prevRow: null,
    },
  };
}

function makeDeleteEntry(overrides?: Partial<{
  table: string;
  entityId: string;
  eqs: Array<{ col: string; val: any }>;
  lastError: any;
  rollbackSnapshot: any;
}>) {
  return {
    table: overrides?.table ?? 'roster_players',
    op: 'delete' as const,
    entityId: overrides?.entityId ?? 'p1',
    payload: { eqs: overrides?.eqs ?? [{ col: 'id', val: overrides?.entityId ?? 'p1' }] },
    lastError: overrides?.lastError ?? { message: 'Network error' },
    rollbackSnapshot: overrides?.rollbackSnapshot ?? {
      table: overrides?.table ?? 'roster_players',
      entityId: overrides?.entityId ?? 'p1',
      prevRow: { id: overrides?.entityId ?? 'p1' },
    },
  };
}

beforeEach(async () => {
  mockSupabaseReset();
  await AsyncStorage.clear();
});

// =============================================================================
// Tests
// =============================================================================

describe('classifyError', () => {
  test('null is success', () => {
    expect(classifyError(null)).toBe('success');
    expect(classifyError(undefined)).toBe('success');
  });
  test('401 transient', () => {
    expect(classifyError({ code: 401 })).toBe('transient');
    expect(classifyError({ status: 401 })).toBe('transient');
  });
  test('403/404/422/23505 permanent', () => {
    expect(classifyError({ code: 403 })).toBe('permanent');
    expect(classifyError({ code: 404 })).toBe('permanent');
    expect(classifyError({ code: 422 })).toBe('permanent');
    expect(classifyError({ code: '23505' })).toBe('permanent');
  });
  test('408/429/5xx transient', () => {
    expect(classifyError({ code: 408 })).toBe('transient');
    expect(classifyError({ code: 429 })).toBe('transient');
    expect(classifyError({ status: 500 })).toBe('transient');
    expect(classifyError({ status: 503 })).toBe('transient');
  });
  test('network/timeout/fetch messages transient', () => {
    expect(classifyError({ message: 'Network request failed' })).toBe('transient');
    expect(classifyError({ message: 'Request timeout' })).toBe('transient');
    expect(classifyError({ message: 'fetch failed' })).toBe('transient');
  });
  test('unrecognized errors default to permanent (conservative)', () => {
    expect(classifyError({ message: 'something weird' })).toBe('permanent');
  });
});

describe('WriteQueue.enqueue (coalescing)', () => {
  test('upsert + upsert keeps only the latest payload', async () => {
    const q = new WriteQueue({ storageKey: freshKey('upsert-upsert'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    q.enqueue(makeUpsertEntry({
      entityId: 'p1',
      payload: { id: 'p1', nickname: 'Alice' },
    }));
    q.enqueue(makeUpsertEntry({
      entityId: 'p1',
      payload: { id: 'p1', nickname: 'Alice 2' },
    }));

    expect(q.size()).toBe(1);
    const entries = q.entries();
    expect(entries[0].payload.nickname).toBe('Alice 2');
    q.dispose();
  });

  test('upsert + delete drops both (entity never reached cloud)', async () => {
    const q = new WriteQueue({ storageKey: freshKey('upsert-delete'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    q.enqueue(makeUpsertEntry({ entityId: 'p1' }));
    q.enqueue(makeDeleteEntry({ entityId: 'p1' }));

    expect(q.size()).toBe(0);
    expect(q.deadLetterCount()).toBe(0);
    q.dispose();
  });

  test('delete + upsert keeps the upsert (anomaly, last-writer-wins, console.warn fires)', async () => {
    const q = new WriteQueue({ storageKey: freshKey('delete-upsert'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    q.enqueue(makeDeleteEntry({ entityId: 'p1' }));
    q.enqueue(makeUpsertEntry({ entityId: 'p1' }));

    expect(q.size()).toBe(1);
    expect(q.entries()[0].op).toBe('upsert');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('anomaly'),
      expect.any(Object)
    );

    warnSpy.mockRestore();
    q.dispose();
  });

  test('different entity ids never coalesce', async () => {
    const q = new WriteQueue({ storageKey: freshKey('different-ids'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    q.enqueue(makeUpsertEntry({ entityId: 'p1' }));
    q.enqueue(makeUpsertEntry({ entityId: 'p2' }));

    expect(q.size()).toBe(2);
    q.dispose();
  });
});

describe('WriteQueue.flush (drain + classification)', () => {
  test('failed transient write enqueued; subsequent flush drains', async () => {
    const q = new WriteQueue({ storageKey: freshKey('drain'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    q.enqueue(makeUpsertEntry({
      entityId: 'p1',
      payload: {
        id: 'p1',
        owner_user_id: 'u1',
        nickname: 'Alice',
        color: null,
        linked_user_id: null,
      },
    }));

    expect(q.size()).toBe(1);

    // No error seeded — flush should retry successfully.
    const result = await q.flush();
    expect(result.drained).toBe(1);
    expect(q.size()).toBe(0);
    const cloud = mockSupabaseGetTable('roster_players');
    expect(cloud.find((r: any) => r.id === 'p1')).toBeTruthy();
    q.dispose();
  });

  test('error classification — 401 is transient; entry remains', async () => {
    const q = new WriteQueue({ storageKey: freshKey('401'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    q.enqueue(makeUpsertEntry({ entityId: 'p1' }));
    expect(q.size()).toBe(1);
    const attemptsBefore = q.entries()[0].attempts;

    mockSupabaseSetTableError('roster_players', { message: 'JWT expired', code: 401 } as any);

    const result = await q.flush();
    expect(result.drained).toBe(0);
    expect(result.deadLettered).toBe(0);
    expect(q.size()).toBe(1);
    expect(q.entries()[0].attempts).toBeGreaterThan(attemptsBefore);
    q.dispose();
  });

  test('error classification — 403 dead-letters immediately + rollback called', async () => {
    const q = new WriteQueue({ storageKey: freshKey('403'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    const rollbackSpy = jest.fn();
    q.setRollbackHandler('roster_players', rollbackSpy);

    // 403 is the seeded error type — wrapper would catch it BEFORE
    // enqueuing. Simulate that by passing the permanent error as
    // `lastError` on the new entry; `enqueue()` detects it and
    // dead-letters synchronously.
    q.enqueue(makeUpsertEntry({
      entityId: 'p1',
      lastError: { message: 'forbidden', code: 403 } as any,
    }));

    expect(q.size()).toBe(0);
    expect(q.deadLetterCount()).toBe(1);
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy.mock.calls[0][0].entityId).toBe('p1');
    q.dispose();
  });

  test('403 returned from cloud during flush dead-letters mid-pass', async () => {
    const q = new WriteQueue({ storageKey: freshKey('403-flush'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    const rollbackSpy = jest.fn();
    q.setRollbackHandler('roster_players', rollbackSpy);

    // Enqueue with a TRANSIENT error so the entry stays queued.
    q.enqueue(makeUpsertEntry({
      entityId: 'p1',
      lastError: { message: 'Network error' },
    }));
    expect(q.size()).toBe(1);

    // Now the flush itself fails with 403 — entry should dead-letter.
    mockSupabaseSetTableError('roster_players', { message: 'forbidden', code: 403 } as any);

    await q.flush();
    expect(q.size()).toBe(0);
    expect(q.deadLetterCount()).toBe(1);
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    q.dispose();
  });

  test('5 transient failures dead-letter the entry', async () => {
    const q = new WriteQueue({ storageKey: freshKey('5-attempts'), attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();

    const rollbackSpy = jest.fn();
    q.setRollbackHandler('roster_players', rollbackSpy);

    q.enqueue(makeUpsertEntry({ entityId: 'p1' }));
    expect(q.size()).toBe(1);

    // Flush 5 times with a transient error each time.
    for (let i = 0; i < 5; i++) {
      mockSupabaseSetTableError('roster_players', { message: 'Network error' });
      await q.flush();
    }

    expect(q.size()).toBe(0);
    expect(q.deadLetterCount()).toBe(1);
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(q.deadLetters()[0].attempts).toBeGreaterThanOrEqual(5);
    q.dispose();
  });
});

describe('WriteQueue.replay triggers', () => {
  test('replay on hydrate + setAccountReady(true)', async () => {
    const key = freshKey('replay-hydrate');
    // Seed AsyncStorage as if a previous session had persisted a queue.
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        queue: [
          {
            id: 'wq-seed',
            table: 'roster_players',
            op: 'upsert',
            entityId: 'p1',
            payload: {
              id: 'p1',
              owner_user_id: 'u1',
              nickname: 'Restored',
              color: null,
              linked_user_id: null,
            },
            upsertOpts: { onConflict: 'owner_user_id,id' },
            attempts: 1,
            firstFailedAt: new Date().toISOString(),
            lastError: { message: 'Network error' },
            rollbackSnapshot: { table: 'roster_players', entityId: 'p1', prevRow: null },
          },
        ],
        deadLetters: [],
      })
    );

    const q = new WriteQueue({ storageKey: key, attachAppState: false });
    q.setSupabaseClient(mockedSupabase);
    const flushSpy = jest.spyOn(q, 'flush');

    await q.hydrate();
    expect(q.size()).toBe(1);

    // Flush should fire when accountReady flips on. Both prerequisites
    // (hydrated && accountReady) are now satisfied.
    q.setAccountReady(true);
    // Yield so the async flush gets a chance to complete.
    await new Promise<void>((r) => setTimeout(r, 0));
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(flushSpy).toHaveBeenCalled();
    expect(q.size()).toBe(0);
    expect(mockSupabaseGetTable('roster_players').find((r: any) => r.id === 'p1')).toBeTruthy();
    q.dispose();
  });

  test('replay on AppState foreground transition', async () => {
    const q = new WriteQueue({ storageKey: freshKey('replay-appstate'), attachAppState: true });
    q.setSupabaseClient(mockedSupabase);
    await q.hydrate();
    q.setAccountReady(true);

    // Force the queue NOT to drain on the readiness latch by seeding it
    // AFTER hydrate. The fresh instance has nothing in the queue at
    // hydrate time, so maybeReplay() is a no-op.
    q.enqueue(makeUpsertEntry({ entityId: 'p-appstate' }));
    expect(q.size()).toBe(1);

    const flushSpy = jest.spyOn(q, 'flush');

    // Emit the AppState 'active' event.
    AppState.__emit('background');
    AppState.__emit('active');
    await new Promise<void>((r) => setTimeout(r, 0));
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(flushSpy).toHaveBeenCalled();
    expect(q.size()).toBe(0);
    q.dispose();
  });
});

describe('WriteQueue persistence across remount', () => {
  test('entries persisted to AsyncStorage are restored after re-hydrate', async () => {
    const key = freshKey('persist');

    const q1 = new WriteQueue({ storageKey: key, attachAppState: false });
    q1.setSupabaseClient(mockedSupabase);
    await q1.hydrate();

    q1.enqueue(makeUpsertEntry({
      entityId: 'p-persist',
      payload: { id: 'p-persist', owner_user_id: 'u1', nickname: 'Persisted', color: null, linked_user_id: null },
    }));
    expect(q1.size()).toBe(1);
    q1.dispose();

    // New instance with the same storage key — should read back the seeded entry.
    const q2 = new WriteQueue({ storageKey: key, attachAppState: false });
    q2.setSupabaseClient(mockedSupabase);
    await q2.hydrate();

    expect(q2.size()).toBe(1);
    expect(q2.entries()[0].entityId).toBe('p-persist');
    q2.dispose();
  });

  test('dead letters are also persisted across remount', async () => {
    const key = freshKey('persist-dl');

    const q1 = new WriteQueue({ storageKey: key, attachAppState: false });
    q1.setSupabaseClient(mockedSupabase);
    q1.setRollbackHandler('roster_players', () => {});
    await q1.hydrate();

    q1.enqueue(makeUpsertEntry({
      entityId: 'p-dl',
      lastError: { message: 'forbidden', code: 403 } as any,
    }));
    expect(q1.deadLetterCount()).toBe(1);
    // Allow persist() to flush.
    await new Promise<void>((r) => setTimeout(r, 0));
    q1.dispose();

    const q2 = new WriteQueue({ storageKey: key, attachAppState: false });
    q2.setSupabaseClient(mockedSupabase);
    await q2.hydrate();
    expect(q2.deadLetterCount()).toBe(1);
    q2.dispose();
  });
});
