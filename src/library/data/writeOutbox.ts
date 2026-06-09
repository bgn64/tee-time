/**
 * Persistent write outbox for idempotent Supabase writes.
 *
 * Entries are stored in AsyncStorage so writes survive app restarts, dead zones,
 * and app kills. Retries may re-send entries, so callers must only enqueue
 * idempotent operations: upserts should provide `onConflict`, and deletes
 * should be scoped with `match` so deleting an already-gone row is a no-op.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { queryClient } from '@/library/data/queryClient';
import { getIsOnline, subscribeToReconnect } from '@/library/net/networkStatus';
import { supabase } from '@/library/supabase/client';

const OUTBOX_STORAGE_KEY = 'tee-time:write-outbox:v1';
const FATAL_RESPONSE_CODES = [/^22...$/, /^23...$/, /^42501$/];

export type WriteOutboxOperation = 'upsert' | 'delete';

export type WriteOutboxEntry = {
  /** Stable client-generated id used for idempotency and queue deduplication. */
  id: string;
  table: string;
  op: WriteOutboxOperation;
  payload: Record<string, unknown>;
  /** Required for retry-safe upserts when the table has a natural unique key. */
  onConflict?: string;
  /** Required for deletes; scopes the delete so retrying is harmless. */
  match?: Record<string, unknown>;
  /** React Query keys to invalidate after this write flushes successfully. */
  queryKeys?: unknown[][];
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

class FatalOutboxEntryError extends Error {
  readonly code = 'OUTBOX_FATAL_ENTRY';
}

let isFlushing = false;
let flushRequested = false;
let storageChain: Promise<unknown> = Promise.resolve();
let pendingCountSnapshot = 0;

const pendingCountSubscribers = new Set<(count: number) => void>();

function queueKey(entry: Pick<WriteOutboxEntry, 'id' | 'table' | 'op'>): string {
  return `${entry.table}:${entry.op}:${entry.id}`;
}

function isFatalResponseCode(code: string | undefined): boolean {
  return !!code && FATAL_RESPONSE_CODES.some((regex) => regex.test(code));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeEntry(value: unknown): WriteOutboxEntry | null {
  if (!isRecord(value)) return null;

  const { id, table, op, payload, onConflict, match, queryKeys } = value;
  if (
    typeof id !== 'string' ||
    typeof table !== 'string' ||
    (op !== 'upsert' && op !== 'delete') ||
    !isRecord(payload)
  ) {
    return null;
  }

  return {
    id,
    table,
    op,
    payload,
    onConflict: typeof onConflict === 'string' ? onConflict : undefined,
    match: isRecord(match) ? match : undefined,
    queryKeys: Array.isArray(queryKeys)
      ? queryKeys.filter((key): key is unknown[] => Array.isArray(key))
      : undefined,
  };
}

async function readQueueUnlocked(): Promise<WriteOutboxEntry[]> {
  const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(sanitizeEntry).filter((entry): entry is WriteOutboxEntry => !!entry)
      : [];
  } catch {
    return [];
  }
}

async function writeQueueUnlocked(queue: WriteOutboxEntry[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(OUTBOX_STORAGE_KEY);
  } else {
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
  }
  updatePendingCount(queue.length);
}

function withStorageLock<T>(work: () => Promise<T>): Promise<T> {
  const next = storageChain.then(work, work);
  storageChain = next.catch(() => undefined);
  return next;
}

function updatePendingCount(count: number): void {
  pendingCountSnapshot = count;
  pendingCountSubscribers.forEach((subscriber) => subscriber(count));
}

async function refreshPendingCount(): Promise<void> {
  const count = await withStorageLock(async () => (await readQueueUnlocked()).length);
  updatePendingCount(count);
}

async function optimisticIsOnline(): Promise<boolean> {
  try {
    return await getIsOnline();
  } catch {
    return true;
  }
}

async function executeEntry(entry: WriteOutboxEntry): Promise<SupabaseLikeError | null> {
  if (entry.op === 'upsert') {
    const { error } = entry.onConflict
      ? await supabase
          .from(entry.table)
          .upsert(entry.payload, { onConflict: entry.onConflict })
      : await supabase.from(entry.table).upsert(entry.payload);
    return error;
  }

  if (!entry.match || Object.keys(entry.match).length === 0) {
    throw new FatalOutboxEntryError('Outbox delete entries require a non-empty match object.');
  }

  const { error } = await supabase.from(entry.table).delete().match(entry.match);
  return error;
}

async function removeQueuedEntry(entry: WriteOutboxEntry): Promise<void> {
  const entryJson = JSON.stringify(entry);
  await withStorageLock(async () => {
    const queue = await readQueueUnlocked();
    const index = queue.findIndex(
      (queued) => queueKey(queued) === queueKey(entry) && JSON.stringify(queued) === entryJson
    );
    if (index >= 0) {
      queue.splice(index, 1);
      await writeQueueUnlocked(queue);
    }
  });
}

async function invalidateQueryKeys(queryKeys: unknown[][] | undefined): Promise<void> {
  if (!queryKeys?.length) return;

  await Promise.all(
    queryKeys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: queryKey as QueryKey })
    )
  );
}

/**
 * Append a write to the persistent queue, replacing any prior queued entry with
 * the same `id + table + op` so rapid edits coalesce, then attempt a flush.
 */
export async function enqueueWrite(entry: WriteOutboxEntry): Promise<void> {
  await withStorageLock(async () => {
    const queue = await readQueueUnlocked();
    const existingIndex = queue.findIndex((queued) => queueKey(queued) === queueKey(entry));

    if (existingIndex >= 0) {
      queue[existingIndex] = entry;
    } else {
      queue.push(entry);
    }

    await writeQueueUnlocked(queue);
  });

  void flushOutbox();
}

/**
 * Drain queued writes in FIFO order.
 *
 * Transient/network failures stop the flush and leave the failed entry plus the
 * rest of the queue persisted for retry. Fatal Postgres errors (class 22/23 or
 * 42501) drop only the bad entry and continue so it cannot block the queue.
 */
export async function flushOutbox(): Promise<void> {
  if (isFlushing) {
    flushRequested = true;
    return;
  }

  isFlushing = true;
  try {
    while (await optimisticIsOnline()) {
      const entry = await withStorageLock(async () => {
        const queue = await readQueueUnlocked();
        updatePendingCount(queue.length);
        return queue[0];
      });

      if (!entry) return;

      try {
        const error = await executeEntry(entry);
        if (error) {
          if (isFatalResponseCode(error.code)) {
            await removeQueuedEntry(entry);
            continue;
          }
          return;
        }

        await removeQueuedEntry(entry);
        await invalidateQueryKeys(entry.queryKeys);
      } catch (error) {
        if (error instanceof FatalOutboxEntryError) {
          await removeQueuedEntry(entry);
          continue;
        }
        return;
      }
    }
  } finally {
    isFlushing = false;
    if (flushRequested) {
      flushRequested = false;
      void flushOutbox();
    }
  }
}

/**
 * Start automatic flushing on mount, offline→online reconnect, and AppState
 * transitions to active. Returns an unsubscribe function for app shutdown/tests.
 */
export function startOutboxAutoFlush(): () => void {
  void refreshPendingCount();
  void flushOutbox();

  const unsubscribeReconnect = subscribeToReconnect(() => {
    void flushOutbox();
  });
  const appStateSubscription = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') {
        void flushOutbox();
      }
    }
  );

  return () => {
    unsubscribeReconnect();
    appStateSubscription.remove();
  };
}

/** Optional UI hook for displaying the number of writes waiting to flush. */
export function useOutboxPendingCount(): number {
  const [pendingCount, setPendingCount] = useState(pendingCountSnapshot);

  useEffect(() => {
    pendingCountSubscribers.add(setPendingCount);
    void refreshPendingCount();

    return () => {
      pendingCountSubscribers.delete(setPendingCount);
    };
  }, []);

  return pendingCount;
}
