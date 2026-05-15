/**
 * Manual mock for `@/state/supabaseClient`.
 *
 * Auto-picked up by jest when a test calls `jest.mock('@/state/supabaseClient')`.
 * The mock exposes a controllable, in-memory fake of the surface our contexts
 * actually consume:
 *
 *   · supabase.from(table) chainable query builder (select/insert/update/upsert/
 *     delete + eq/in/ilike/neq/order/limit/single/maybeSingle).
 *   · supabase.auth.* with a working onAuthStateChange emitter, seedable
 *     getSession(), and stub action methods.
 *   · supabase.channel(name).on(...).subscribe() with subscribe-count spies and
 *     a manual mockSupabaseEmitChannel() helper for realtime events.
 *   · supabase.rpc(name, args) with per-name seedable responses.
 *   · supabase.removeChannel(channel).
 *
 * Tests interact via the named exports at the bottom of this file. The
 * `mockSupabaseReset()` helper must be called in beforeEach() so each test
 * starts with a clean slate.
 */

type Row = Record<string, any>;

type SeededError = { message: string; code?: string };

type ChannelHandler = {
  event: string;
  filter: { schema?: string; table?: string; event?: string };
  callback: (payload: { eventType: string; new?: Row; old?: Row }) => void;
};

type Channel = {
  name: string;
  handlers: ChannelHandler[];
  subscribed: boolean;
};

type AuthListener = (event: string, session: any) => void;

// =============================================================================
// In-memory state. Reset via mockSupabaseReset() between tests.
// =============================================================================

const state = {
  tables: new Map<string, Row[]>(),
  /** Pending error to apply on the next call against `table`. Single-shot. */
  tableErrors: new Map<string, SeededError>(),
  /**
   * Optional artificial delay (in ms) applied to every `select` against a
   * given table. Used by tests that need to simulate overlapping in-flight
   * queries (e.g., the latest-response-wins generation counter on
   * pull-to-refresh). The delay is applied AFTER the rows have been
   * captured for this call, so concurrent table mutations don't bleed
   * into the in-flight response — matches Postgres snapshot semantics
   * closely enough.
   */
  tableSelectDelays: new Map<string, number>(),
  rpcResponses: new Map<string, { data?: any; error?: SeededError }>(),
  session: null as any,
  authListeners: new Set<AuthListener>(),
  channels: new Map<string, Channel>(),
  channelSubscribeCount: new Map<string, number>(),
  callLog: [] as Array<{ kind: string; args: any[] }>,
};

function log(kind: string, ...args: any[]) {
  state.callLog.push({ kind, args });
}

// =============================================================================
// Filter chain — pragmatic subset of Postgrest's API.
// =============================================================================

type Filter =
  | { kind: 'eq'; col: string; val: any }
  | { kind: 'neq'; col: string; val: any }
  | { kind: 'in'; col: string; vals: any[] }
  | { kind: 'ilike'; col: string; pattern: string };

function rowMatches(row: Row, filters: Filter[]): boolean {
  for (const f of filters) {
    const v = row[f.col];
    switch (f.kind) {
      case 'eq':
        if (v !== f.val) return false;
        break;
      case 'neq':
        if (v === f.val) return false;
        break;
      case 'in':
        if (!f.vals.includes(v)) return false;
        break;
      case 'ilike': {
        const re = new RegExp(
          '^' + f.pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$',
          'i'
        );
        if (typeof v !== 'string' || !re.test(v)) return false;
        break;
      }
    }
  }
  return true;
}

// =============================================================================
// Builder returned by supabase.from(table).
// =============================================================================

function makeBuilder(table: string) {
  const filters: Filter[] = [];
  let action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  let payload: Row | Row[] | undefined;
  let upsertOpts: { onConflict?: string } | undefined;
  let returnSingle: 'none' | 'single' | 'maybeSingle' = 'none';
  let limit: number | undefined;

  const execute = async (): Promise<{ data: any; error: any }> => {
    log('from.' + action, { table, filters, payload, limit, upsertOpts });

    const seededErr = state.tableErrors.get(table);
    if (seededErr) {
      state.tableErrors.delete(table);
      return { data: null, error: seededErr };
    }

    const rows = state.tables.get(table) ?? [];

    if (action === 'select') {
      // Snapshot rows BEFORE any artificial delay so concurrent
      // mutations to the table don't bleed into this in-flight
      // response. Then defer the response by the configured delay if
      // any — tests use this to interleave operations between query-
      // send and query-receive.
      const snapshot = rows.slice();
      const delayMs = state.tableSelectDelays.get(table);
      if (delayMs != null && delayMs > 0) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
      let result = snapshot.filter((r) => rowMatches(r, filters));
      if (limit != null) result = result.slice(0, limit);
      if (returnSingle === 'single') {
        if (result.length !== 1) {
          return {
            data: null,
            error: { message: `expected one row, got ${result.length}`, code: 'PGRST116' },
          };
        }
        return { data: result[0], error: null };
      }
      if (returnSingle === 'maybeSingle') {
        return { data: result[0] ?? null, error: null };
      }
      return { data: result, error: null };
    }

    if (action === 'insert') {
      const toInsert = Array.isArray(payload) ? payload : [payload!];
      // Best-effort unique check: if a row with the same primary id already
      // exists, return 23505 — matches real Postgres behavior closely enough
      // for our context's error-handling tests.
      for (const r of toInsert) {
        if (r.id != null && rows.some((x) => x.id === r.id)) {
          return {
            data: null,
            error: { message: 'duplicate key value violates unique constraint', code: '23505' },
          };
        }
      }
      const next = rows.concat(toInsert);
      state.tables.set(table, next);
      return { data: toInsert, error: null };
    }

    if (action === 'update') {
      const next = rows.map((r) =>
        rowMatches(r, filters) ? { ...r, ...(payload as Row) } : r
      );
      state.tables.set(table, next);
      const updated = next.filter((r) => rowMatches(r, filters));
      return { data: updated, error: null };
    }

    if (action === 'upsert') {
      const toUpsert = Array.isArray(payload) ? payload : [payload!];
      const conflictCols = upsertOpts?.onConflict?.split(',').map((s) => s.trim()) ?? ['id'];
      let next = rows.slice();
      const inserted: Row[] = [];
      for (const r of toUpsert) {
        const i = next.findIndex((x) =>
          conflictCols.every((c) => x[c] === r[c])
        );
        if (i === -1) {
          next.push(r);
          inserted.push(r);
        } else {
          next[i] = { ...next[i], ...r };
          inserted.push(next[i]);
        }
      }
      state.tables.set(table, next);
      return { data: inserted, error: null };
    }

    if (action === 'delete') {
      const before = rows.length;
      const next = rows.filter((r) => !rowMatches(r, filters));
      state.tables.set(table, next);
      return { data: null, error: null, count: before - next.length } as any;
    }

    return { data: null, error: { message: 'unknown action' } };
  };

  const builder: any = {
    select(_cols?: string) {
      action = 'select';
      return builder;
    },
    insert(rowOrRows: Row | Row[]) {
      action = 'insert';
      payload = rowOrRows;
      return builder;
    },
    update(patch: Row) {
      action = 'update';
      payload = patch;
      return builder;
    },
    upsert(rowOrRows: Row | Row[], opts?: { onConflict?: string }) {
      action = 'upsert';
      payload = rowOrRows;
      upsertOpts = opts;
      return builder;
    },
    delete() {
      action = 'delete';
      return builder;
    },
    eq(col: string, val: any) {
      filters.push({ kind: 'eq', col, val });
      return builder;
    },
    neq(col: string, val: any) {
      filters.push({ kind: 'neq', col, val });
      return builder;
    },
    in(col: string, vals: any[]) {
      filters.push({ kind: 'in', col, vals });
      return builder;
    },
    ilike(col: string, pattern: string) {
      filters.push({ kind: 'ilike', col, pattern });
      return builder;
    },
    order(_col: string, _opts?: any) {
      return builder;
    },
    limit(n: number) {
      limit = n;
      return builder;
    },
    single() {
      returnSingle = 'single';
      return execute();
    },
    maybeSingle() {
      returnSingle = 'maybeSingle';
      return execute();
    },
    then(resolve: any, reject: any) {
      return execute().then(resolve, reject);
    },
  };

  return builder;
}

// =============================================================================
// Channel surface
// =============================================================================

function makeChannel(name: string): any {
  let channel = state.channels.get(name);
  if (!channel) {
    channel = { name, handlers: [], subscribed: false };
    state.channels.set(name, channel);
  }
  const handle: any = {
    name,
    on(event: string, filter: any, callback: any) {
      channel!.handlers.push({ event, filter, callback });
      return handle;
    },
    subscribe() {
      channel!.subscribed = true;
      state.channelSubscribeCount.set(
        name,
        (state.channelSubscribeCount.get(name) ?? 0) + 1
      );
      log('channel.subscribe', { name });
      return handle;
    },
  };
  return handle;
}

// =============================================================================
// The fake supabase client itself.
// =============================================================================

export const supabase: any = {
  from(table: string) {
    log('from', { table });
    return makeBuilder(table);
  },
  channel(name: string) {
    log('channel', { name });
    return makeChannel(name);
  },
  removeChannel(channel: any) {
    log('removeChannel', { name: channel?.name });
    if (channel?.name) state.channels.delete(channel.name);
  },
  rpc(name: string, args?: any) {
    log('rpc', { name, args });
    const seeded = state.rpcResponses.get(name);
    return Promise.resolve(seeded ?? { data: null, error: null });
  },
  auth: {
    async getSession() {
      return { data: { session: state.session }, error: null };
    },
    onAuthStateChange(listener: AuthListener) {
      state.authListeners.add(listener);
      return {
        data: {
          subscription: {
            unsubscribe: () => state.authListeners.delete(listener),
          },
        },
      };
    },
    async signInWithOtp() {
      return { data: {}, error: null };
    },
    async verifyOtp() {
      return { data: { session: state.session }, error: null };
    },
    async signInWithPassword({ email }: { email: string }) {
      if (!state.session) {
        state.session = {
          user: { id: 'mock-user-' + email, email, user_metadata: {} },
        };
      }
      for (const l of state.authListeners) l('SIGNED_IN', state.session);
      return { data: { session: state.session }, error: null };
    },
    async signInWithOAuth() {
      return { data: { url: 'https://mock' }, error: null };
    },
    async signOut() {
      state.session = null;
      for (const l of state.authListeners) l('SIGNED_OUT', null);
      return { error: null };
    },
  },
};

// =============================================================================
// Test-control helpers
// =============================================================================

export function mockSupabaseReset(): void {
  state.tables.clear();
  state.tableErrors.clear();
  state.tableSelectDelays.clear();
  state.rpcResponses.clear();
  state.session = null;
  state.authListeners.clear();
  state.channels.clear();
  state.channelSubscribeCount.clear();
  state.callLog.length = 0;
}

export function mockSupabaseSeedTable(table: string, rows: Row[]): void {
  state.tables.set(table, rows.map((r) => ({ ...r })));
}

export function mockSupabaseGetTable(table: string): Row[] {
  return state.tables.get(table) ?? [];
}

export function mockSupabaseSeedRpc(
  name: string,
  response: { data?: any; error?: SeededError }
): void {
  state.rpcResponses.set(name, response);
}

export function mockSupabaseSeedSession(session: any): void {
  state.session = session;
}

export function mockSupabaseSetTableError(table: string, error: SeededError): void {
  state.tableErrors.set(table, error);
}

/**
 * Configure an artificial delay (in milliseconds) applied to every
 * `select(...)` against `table` until cleared (pass `0` to clear). Used by
 * tests that need to simulate overlapping in-flight queries, such as the
 * latest-response-wins generation counter on pull-to-refresh.
 *
 * The rows returned by the delayed response are snapshotted at the moment
 * the select STARTS executing (matches Postgres snapshot isolation), so
 * tests can mutate the underlying table between the `await select` and
 * its resolution without bleeding into the in-flight response.
 */
export function mockSupabaseSetTableDelay(table: string, ms: number): void {
  if (ms <= 0) state.tableSelectDelays.delete(table);
  else state.tableSelectDelays.set(table, ms);
}

export function mockSupabaseEmitAuthEvent(event: string, session?: any): void {
  if (session !== undefined) state.session = session;
  for (const l of state.authListeners) l(event, state.session);
}

export function mockSupabaseEmitChannel(
  channelName: string,
  table: string,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: { new?: Row; old?: Row }
): void {
  const channel = state.channels.get(channelName);
  if (!channel) return;
  for (const h of channel.handlers) {
    if (h.filter?.table && h.filter.table !== table) continue;
    h.callback({ eventType, ...payload });
  }
}

export function mockSupabaseChannelSubscribeCount(name: string): number {
  return state.channelSubscribeCount.get(name) ?? 0;
}

export function mockSupabaseCallLog(): Array<{ kind: string; args: any[] }> {
  return state.callLog.slice();
}

export function mockSupabaseCallCount(kind: string): number {
  return state.callLog.filter((e) => e.kind === kind).length;
}
