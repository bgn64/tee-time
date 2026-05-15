/**
 * Offline write queue for cloud upserts/deletes.
 *
 * Every cloud mutation in the app (roster_players / courses / scorecards)
 * is wrapped to either:
 *   1. attempt the direct supabase call and succeed (fast path), or
 *   2. catch the error, classify it, and either enqueue for retry
 *      (transient) or dead-letter + rollback (permanent).
 *
 * Queue semantics:
 *
 *   · COALESCING (applied at enqueue):
 *       upsert(X) + upsert(X)  -> keep latest payload
 *       upsert(X) + delete(X)  -> drop both (entity never reached cloud)
 *       delete(X) + upsert(X)  -> anomaly. console.warn + last-writer-wins
 *       Two entries never coalesce across different (table, entityId).
 *
 *   · ERROR CLASSIFICATION (in classifyError):
 *       null/undefined         -> success
 *       401                    -> transient (token race; next refresh fixes)
 *       403, 404, 422, 23505   -> permanent
 *       408, 429, 5xx          -> transient
 *       message ~ network/...  -> transient
 *       otherwise              -> permanent (conservative — surface > loop)
 *
 *   · RETRY BUDGET: max 5 cumulative attempts on transient errors. On the
 *     5th failure, dead-letter (move to deadLetters list, fire rollback
 *     handler, persist). Exponential backoff between attempts within a
 *     single flush() call: 200 * 2^attempt ms capped at 5s.
 *
 *   · REPLAY TRIGGERS (any one drains the queue):
 *       - hydrate() completing AND setAccountReady(true) called.
 *       - AppState foreground transition (change -> 'active').
 *       - Explicit flush() invocation.
 *       - The wrapper layer calls flush() after a successful direct write
 *         (steady-state recovery: as soon as one write succeeds, retry
 *         the rest).
 *
 *   · PERSISTENCE: queue + deadLetters are serialized to AsyncStorage
 *     under the configured `storageKey` on every enqueue / drain / dead-
 *     letter. The default key is `tee-time:write-queue`; tests instantiate
 *     fresh queues with unique keys for isolation.
 *
 *   · ROLLBACK: each entry carries a `rollbackSnapshot` describing the
 *     pre-mutation local state (`prevRow: any | null`). On permanent
 *     failure, the registered rollback handler for the table is invoked
 *     so the optimistic local state can be reverted. prevRow === null
 *     means "the row didn't exist locally before this write" — rollback
 *     in that case removes the row.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { supabase as defaultSupabase } from '@/state/supabaseClient';

// =============================================================================
// Types
// =============================================================================

export type WriteOp = 'upsert' | 'delete';

/**
 * Shape of `payload` for a delete entry. Multiple `eq` filters are AND-ed
 * together (matches Postgrest semantics). Most call sites use a single
 * `{ col: 'id', val: entityId }` filter, but some (e.g. courses) want a
 * defensive owner-scoped delete for belt-and-suspenders.
 */
export type DeletePayload = {
  eqs: Array<{ col: string; val: any }>;
};

export type QueueEntry = {
  /** Unique within the queue. Used for in-place replacement during coalesce. */
  id: string;
  table: string;
  op: WriteOp;
  /** id of the row being written (used by the coalesce matcher). */
  entityId: string;
  /** For upserts: the row to write. For deletes: a `DeletePayload`. */
  payload: any;
  upsertOpts?: { onConflict?: string };
  attempts: number;
  firstFailedAt: string;
  lastError?: { message: string; code?: string | number };
  /**
   * Snapshot of the local optimistic state for this entity at the time
   * of enqueue. Used by the rollback path on dead-letter.
   *
   * Shape: { table: string, entityId: string, prevRow: any | null }
   * (null = entity didn't exist locally before this write).
   */
  rollbackSnapshot: any;
};

export type EnqueueInput = Omit<QueueEntry, 'id' | 'attempts' | 'firstFailedAt'> & {
  attempts?: number;
  firstFailedAt?: string;
};

export type RollbackHandler = (entry: QueueEntry) => void | Promise<void>;

/**
 * Notified after rollback when an entry is permanently rejected. Unlike
 * the rollback handler — which is registered per-table and reverts local
 * optimistic state — the dead-letter handler is GLOBAL (a single handler
 * per queue). It exists so a UI layer can surface the failure to the
 * user, e.g. via a toast offering a Retry action.
 */
export type DeadLetterHandler = (entry: QueueEntry) => void | Promise<void>;

type FlushResult = { drained: number; deadLettered: number };

type PersistedState = {
  queue: QueueEntry[];
  deadLetters: QueueEntry[];
};

type Severity = 'success' | 'transient' | 'permanent';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STORAGE_KEY = 'tee-time:write-queue';
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 200;
const BACKOFF_MAX_MS = 5000;
/**
 * Per-flush per-entry inline retry cap. After this many in-flush retries
 * the entry is left for the next replay trigger. Set to 0 to keep the
 * test-7 semantics ("flush 5 times then dead-letter") trivial — each
 * flush call advances `attempts` by exactly one for a persistently-
 * failing entry.
 */
const INLINE_RETRIES_PER_FLUSH = 0;

// =============================================================================
// Error classification
// =============================================================================

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function classifyError(err: any): Severity {
  if (err == null) return 'success';

  const code = err.code ?? err.status;
  const codeNum = toNumber(code);

  // Postgres unique violation — caller's local state has diverged from
  // the unique index; retrying would just keep hitting the same wall.
  if (code === '23505' || code === 23505) return 'permanent';

  if (codeNum === 401) return 'transient';
  if (codeNum === 403) return 'permanent';
  if (codeNum === 404) return 'permanent';
  if (codeNum === 422) return 'permanent';
  if (codeNum === 408 || codeNum === 429) return 'transient';
  if (codeNum != null && codeNum >= 500 && codeNum < 600) return 'transient';

  const msg = String(err.message ?? '').toLowerCase();
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')) {
    return 'transient';
  }

  // Default: be conservative. Surface > loop.
  return 'permanent';
}

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// =============================================================================
// Identity helper
// =============================================================================

let entryCounter = 0;
function nextEntryId(): string {
  entryCounter += 1;
  return `wq-${Date.now().toString(36)}-${entryCounter}`;
}

// =============================================================================
// WriteQueue
// =============================================================================

export class WriteQueue {
  private readonly storageKey: string;

  private queue: QueueEntry[] = [];
  private deadLetterList: QueueEntry[] = [];
  private rollbackHandlers = new Map<string, RollbackHandler>();
  private deadLetterHandler: DeadLetterHandler | null = null;
  private client: any = null;

  private hydrated = false;
  private hydrating = false;
  private accountReady = false;
  /** Re-entrancy guard so concurrent flushes serialize. */
  private flushing = false;
  /** Set when a flush is requested while one is in progress. */
  private flushAgain = false;

  private appStateSubscription: { remove: () => void } | null = null;

  constructor(opts?: { storageKey?: string; attachAppState?: boolean }) {
    this.storageKey = opts?.storageKey ?? DEFAULT_STORAGE_KEY;
    const attachAppState = opts?.attachAppState ?? true;
    if (attachAppState) {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        (state: string) => {
          if (state === 'active') {
            void this.flush();
          }
        }
      );
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Load persisted state from AsyncStorage. Safe to call multiple times;
   * subsequent calls are no-ops.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated || this.hydrating) return;
    this.hydrating = true;
    try {
      const raw = await AsyncStorage.getItem(this.storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PersistedState;
          if (parsed && Array.isArray(parsed.queue)) {
            this.queue = parsed.queue;
          }
          if (parsed && Array.isArray(parsed.deadLetters)) {
            this.deadLetterList = parsed.deadLetters;
          }
        } catch (e) {
          console.warn('[writeQueue] failed to parse persisted state:', e);
        }
      }
    } catch (e) {
      console.warn('[writeQueue] failed to load persisted state:', e);
    } finally {
      this.hydrating = false;
      this.hydrated = true;
    }
    this.maybeReplay();
  }

  setRollbackHandler(table: string, handler: RollbackHandler): void {
    this.rollbackHandlers.set(table, handler);
  }

  /**
   * Register a single global dead-letter handler. Called once per entry
   * AFTER the per-table rollback handler. Passing `null` clears the
   * registration. A subsequent `setDeadLetterHandler` call replaces the
   * previous handler — there is only one slot.
   */
  setDeadLetterHandler(handler: DeadLetterHandler | null): void {
    this.deadLetterHandler = handler;
  }

  setSupabaseClient(client: any): void {
    this.client = client;
  }

  /**
   * Lazy hydration trigger. Called from the public entry points (enqueue,
   * flush, setAccountReady) so we never touch AsyncStorage during web SSR
   * — it's only invoked after a real action happens on a client. Safe to
   * call repeatedly; `hydrate()` short-circuits if already hydrated or in
   * flight.
   */
  private ensureHydrated(): void {
    if (!this.hydrated && !this.hydrating) {
      void this.hydrate();
    }
  }

  setAccountReady(ready: boolean): void {
    this.accountReady = ready;
    this.ensureHydrated();
    if (ready) this.maybeReplay();
  }

  /** Remove AppState subscription. Tests should call this in afterEach. */
  dispose(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  // -----------------------------------------------------------------------
  // Enqueue (with coalescing + permanent-error fast path)
  // -----------------------------------------------------------------------

  enqueue(entry: EnqueueInput): void {
    this.ensureHydrated();
    const newEntry: QueueEntry = {
      id: nextEntryId(),
      table: entry.table,
      op: entry.op,
      entityId: entry.entityId,
      payload: entry.payload,
      upsertOpts: entry.upsertOpts,
      attempts: entry.attempts ?? 0,
      firstFailedAt: entry.firstFailedAt ?? new Date().toISOString(),
      lastError: entry.lastError,
      rollbackSnapshot: entry.rollbackSnapshot,
    };

    // Coalesce against the existing queue. Scan for the latest entry
    // sharing (table, entityId).
    const existingIndex = this.queue.findIndex(
      (e) => e.table === newEntry.table && e.entityId === newEntry.entityId
    );

    if (existingIndex !== -1) {
      const existing = this.queue[existingIndex];

      // delete + delete: idempotent; keep the existing entry, drop the new.
      if (existing.op === 'delete' && newEntry.op === 'delete') {
        // No-op; persist and return.
        void this.persist();
        return;
      }

      // upsert + upsert: replace payload, keep snapshot/attempts/firstFailedAt
      // from the existing entry (preserves the original pre-mutation snapshot).
      if (existing.op === 'upsert' && newEntry.op === 'upsert') {
        const merged: QueueEntry = {
          ...existing,
          payload: newEntry.payload,
          upsertOpts: newEntry.upsertOpts ?? existing.upsertOpts,
          lastError: newEntry.lastError ?? existing.lastError,
        };
        this.queue[existingIndex] = merged;
        void this.persist();
        // Permanent classification still applies to the merged entry's
        // lastError so we don't waste cycles re-trying a known-permanent
        // failure. (Rare in practice — the wrapper only enqueues on a
        // fresh failure.)
        if (classifyError(merged.lastError) === 'permanent') {
          this.deadLetter(merged);
        }
        return;
      }

      // upsert + delete: the row never reached cloud. Drop both.
      if (existing.op === 'upsert' && newEntry.op === 'delete') {
        this.queue.splice(existingIndex, 1);
        void this.persist();
        return;
      }

      // delete + upsert: anomaly — usually means local state thought the
      // row was deleted but the user re-created it before flush. Drop
      // the delete and keep the upsert (last-writer-wins).
      if (existing.op === 'delete' && newEntry.op === 'upsert') {
        console.warn(
          '[writeQueue] anomaly: upsert enqueued after delete for same entity; ' +
            'dropping the queued delete and keeping the upsert.',
          { table: newEntry.table, entityId: newEntry.entityId }
        );
        this.queue[existingIndex] = newEntry;
        void this.persist();
        if (classifyError(newEntry.lastError) === 'permanent') {
          this.deadLetter(newEntry);
        }
        return;
      }
    }

    this.queue.push(newEntry);
    void this.persist();

    // If the entry was created in response to a permanent error, bypass
    // the queue entirely — dead-letter + rollback immediately. The wrapper
    // already knows the error, so retrying would be wasted work and the
    // user-facing rollback should fire promptly.
    if (classifyError(newEntry.lastError) === 'permanent') {
      this.deadLetter(newEntry);
    }
  }

  // -----------------------------------------------------------------------
  // Flush
  // -----------------------------------------------------------------------

  async flush(): Promise<FlushResult> {
    this.ensureHydrated();
    if (this.flushing) {
      // Coalesce overlapping flush requests — the in-progress call will
      // re-loop once the current pass completes.
      this.flushAgain = true;
      return { drained: 0, deadLettered: 0 };
    }
    if (!this.client) return { drained: 0, deadLettered: 0 };

    this.flushing = true;
    let drained = 0;
    let deadLettered = 0;

    try {
      do {
        this.flushAgain = false;
        // Snapshot the queue at the start of the pass so newly-enqueued
        // entries (e.g., from a wrapper that ran during a long flush)
        // are deferred to the next outer iteration.
        const pass = this.queue.slice();
        for (const entry of pass) {
          // The entry may have been coalesced away during the pass.
          if (!this.queue.includes(entry)) continue;
          const outcome = await this.attemptEntry(entry);
          if (outcome === 'drained') drained += 1;
          if (outcome === 'deadLettered') deadLettered += 1;
        }
      } while (this.flushAgain && this.queue.length > 0);
    } finally {
      this.flushing = false;
    }

    return { drained, deadLettered };
  }

  /**
   * Drive a single entry through one (or more, if INLINE_RETRIES_PER_FLUSH > 0)
   * attempts. Returns:
   *   'drained' — entry succeeded and was removed.
   *   'deadLettered' — entry was permanently rejected and moved to dead letters.
   *   'pending' — entry still in queue (transient failure, attempts < max).
   */
  private async attemptEntry(
    entry: QueueEntry
  ): Promise<'drained' | 'deadLettered' | 'pending'> {
    let inlineRetries = 0;

    while (true) {
      const err = await this.performCloudWrite(entry);
      const severity = classifyError(err);

      if (severity === 'success') {
        this.removeFromQueue(entry);
        await this.persist();
        return 'drained';
      }

      entry.attempts += 1;
      entry.lastError = err
        ? { message: String(err.message ?? 'unknown error'), code: err.code ?? err.status }
        : entry.lastError;

      if (severity === 'permanent') {
        this.deadLetter(entry);
        return 'deadLettered';
      }

      // Transient failure.
      if (entry.attempts >= MAX_ATTEMPTS) {
        this.deadLetter(entry);
        return 'deadLettered';
      }

      if (inlineRetries >= INLINE_RETRIES_PER_FLUSH) {
        // Keep the entry in place; persist the updated attempts/lastError.
        await this.persist();
        return 'pending';
      }

      inlineRetries += 1;
      await sleep(backoffMs(entry.attempts));
      // Loop and retry inline.
    }
  }

  /**
   * Issue the actual supabase call for an entry. Returns the supabase
   * error object (or a thrown-and-caught error wrapped as such), or null
   * on success.
   */
  private async performCloudWrite(entry: QueueEntry): Promise<any | null> {
    const client = this.client;
    if (!client) {
      return { message: 'WriteQueue has no supabase client', code: 'no-client' };
    }
    try {
      if (entry.op === 'upsert') {
        const { error } = await client
          .from(entry.table)
          .upsert(entry.payload, entry.upsertOpts ?? undefined);
        return error ?? null;
      }
      if (entry.op === 'delete') {
        const deletePayload = entry.payload as DeletePayload;
        let q = client.from(entry.table).delete();
        for (const eq of deletePayload?.eqs ?? []) {
          q = q.eq(eq.col, eq.val);
        }
        const { error } = await q;
        return error ?? null;
      }
      return { message: 'unknown op', code: 'unknown-op' };
    } catch (err: any) {
      return { message: err?.message ?? 'thrown error', code: err?.code };
    }
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  size(): number {
    return this.queue.length;
  }

  deadLetterCount(): number {
    return this.deadLetterList.length;
  }

  deadLetters(): QueueEntry[] {
    return this.deadLetterList.slice();
  }

  /** Test utility — snapshot of the live queue. */
  entries(): QueueEntry[] {
    return this.queue.slice();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private removeFromQueue(entry: QueueEntry): void {
    const i = this.queue.indexOf(entry);
    if (i !== -1) this.queue.splice(i, 1);
  }

  private deadLetter(entry: QueueEntry): void {
    this.removeFromQueue(entry);
    this.deadLetterList.push(entry);
    console.warn('[writeQueue] dead-letter:', {
      table: entry.table,
      op: entry.op,
      entityId: entry.entityId,
      attempts: entry.attempts,
      lastError: entry.lastError,
      classification: entry.lastError ? classifyError(entry.lastError) : 'unknown',
      payload: entry.payload,
      upsertOpts: entry.upsertOpts,
    });
    const handler = this.rollbackHandlers.get(entry.table);
    if (handler) {
      try {
        void Promise.resolve(handler(entry)).catch((e) =>
          console.warn('[writeQueue] rollback handler threw:', e)
        );
      } catch (e) {
        console.warn('[writeQueue] rollback handler threw synchronously:', e);
      }
    }
    const dlHandler = this.deadLetterHandler;
    if (dlHandler) {
      try {
        void Promise.resolve(dlHandler(entry)).catch((e) =>
          console.warn('[writeQueue] dead-letter handler threw:', e)
        );
      } catch (e) {
        console.warn('[writeQueue] dead-letter handler threw synchronously:', e);
      }
    }
    void this.persist();
  }

  private async persist(): Promise<void> {
    try {
      const payload: PersistedState = {
        queue: this.queue,
        deadLetters: this.deadLetterList,
      };
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch (e) {
      console.warn('[writeQueue] failed to persist:', e);
    }
  }

  private maybeReplay(): void {
    if (this.hydrated && this.accountReady && this.queue.length > 0) {
      void this.flush();
    }
  }
}

// =============================================================================
// Singleton
// =============================================================================

/**
 * Process-wide singleton. Contexts import this instance directly so that
 * coalescing across contexts works (e.g., an upsert enqueued from
 * PlayerContext can be dropped by a delete enqueued from GolfRoundContext
 * for the same id — not currently a real path, but a property worth
 * preserving).
 *
 * Auto-hydration is **deferred** until first use. We do NOT call
 * `hydrate()` at module load because Expo Router's web SSR pass evaluates
 * every module in a Node context where `window` (and therefore
 * `AsyncStorage`) is unavailable. Instead, `enqueue()`, `flush()`, and
 * `setAccountReady()` call `ensureHydrated()` lazily — those are only
 * ever invoked after the React tree mounts on a real client.
 */
export const writeQueue: WriteQueue = new WriteQueue();
writeQueue.setSupabaseClient(defaultSupabase);

/** Public helper for explicit manual recovery (UI debug buttons, tests). */
export async function flushWriteQueue(): Promise<FlushResult> {
  return writeQueue.flush();
}
