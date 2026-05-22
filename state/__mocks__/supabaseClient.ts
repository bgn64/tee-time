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

type ChannelFilter = {
  schema?: string;
  table?: string;
  event?: string;
  filter?: string;
};

type ChannelPayload = { new?: Row; old?: Row };

type ChannelHandler = {
  event: string;
  filter: ChannelFilter;
  callback: (payload: { eventType: string } & ChannelPayload) => void;
};

type Channel = {
  name: string;
  handlers: ChannelHandler[];
  subscribed: boolean;
};

type AuthListener = (event: string, session: any) => void;

type QueryResult = {
  data: any;
  error: SeededError | null;
  count?: number;
};

/**
 * Narrow shape of the chainable query builder returned by `from(table)`.
 * Captures only the methods our context code actually invokes — does not
 * attempt to satisfy the full `PostgrestFilterBuilder` generic from
 * `@supabase/supabase-js`.
 */
interface MockQueryBuilder extends PromiseLike<QueryResult> {
  select(cols?: string): MockQueryBuilder;
  insert(rowOrRows: Row | Row[]): MockQueryBuilder;
  update(patch: Row): MockQueryBuilder;
  upsert(rowOrRows: Row | Row[], opts?: { onConflict?: string }): MockQueryBuilder;
  delete(): MockQueryBuilder;
  eq(col: string, val: unknown): MockQueryBuilder;
  neq(col: string, val: unknown): MockQueryBuilder;
  in(col: string, vals: unknown[]): MockQueryBuilder;
  ilike(col: string, pattern: string): MockQueryBuilder;
  order(col: string, opts?: { ascending?: boolean }): MockQueryBuilder;
  limit(n: number): MockQueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}

interface MockChannelHandle {
  name: string;
  on(
    event: string,
    filter: ChannelFilter,
    callback: ChannelHandler['callback']
  ): MockChannelHandle;
  subscribe(): MockChannelHandle;
}

interface MockSupabaseAuth {
  getSession(): Promise<{ data: { session: any }; error: null }>;
  onAuthStateChange(listener: AuthListener): {
    data: { subscription: { unsubscribe: () => void } };
  };
  signInWithOtp(): Promise<{ data: Record<string, unknown>; error: null }>;
  verifyOtp(): Promise<{ data: { session: any }; error: null }>;
  signInWithPassword(args: { email: string }): Promise<{
    data: { session: any };
    error: null;
  }>;
  signInWithOAuth(): Promise<{ data: { url: string }; error: null }>;
  signOut(): Promise<{ error: null }>;
}

interface MockSupabaseClient {
  from(table: string): MockQueryBuilder;
  channel(name: string): MockChannelHandle;
  removeChannel(channel: { name?: string } | null | undefined): void;
  rpc(name: string, args?: unknown): Promise<QueryResult>;
  auth: MockSupabaseAuth;
}

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
  rpcResponses: new Map<string, { data?: any; error?: SeededError | null }>(),
  session: null as any,
  authListeners: new Set<AuthListener>(),
  channels: new Map<string, Channel>(),
  channelSubscribeCount: new Map<string, number>(),
  callLog: [] as Array<{ kind: string; args: any[] }>,
};

function log(kind: string, ...args: any[]): void {
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

function makeBuilder(table: string): MockQueryBuilder {
  const filters: Filter[] = [];
  let action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  let payload: Row | Row[] | undefined;
  let upsertOpts: { onConflict?: string } | undefined;
  let returnSingle: 'none' | 'single' | 'maybeSingle' = 'none';
  let limit: number | undefined;

  const execute = async (): Promise<QueryResult> => {
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
      // Generate ids for rows that don't have one — production tables
      // like `friend_requests` use `uuid_generate_v4()` as the default,
      // and `.insert(row).select().single()` callers expect the returned
      // row to carry that server-generated id.
      const stamped: Row[] = toInsert.map((r) => {
        if (r.id != null) return r;
        const generated =
          typeof globalThis.crypto?.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return { ...r, id: generated };
      });
      const next = rows.concat(stamped);
      state.tables.set(table, next);
      // Honor .single() / .maybeSingle() chained off the insert (used
      // by callers that need the server-generated id back for an
      // optimistic local update).
      if (returnSingle === 'single') {
        if (stamped.length !== 1) {
          return {
            data: null,
            error: { message: `expected one row, got ${stamped.length}`, code: 'PGRST116' },
          };
        }
        return { data: stamped[0], error: null };
      }
      if (returnSingle === 'maybeSingle') {
        return { data: stamped[0] ?? null, error: null };
      }
      return { data: stamped, error: null };
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
      return { data: null, error: null, count: before - next.length };
    }

    return { data: null, error: { message: 'unknown action' } };
  };

  const builder: MockQueryBuilder = {
    select(_cols?: string) {
      // PostgREST semantics: `.select()` chained after a mutation
      // (insert/update/upsert/delete) returns the affected rows in the
      // response — it doesn't downgrade the operation to a plain
      // select. Only treat .select() as the primary action when no
      // mutation is in flight yet.
      if (action === 'select') {
        // No-op — already in select mode.
      }
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
    eq(col: string, val: unknown) {
      filters.push({ kind: 'eq', col, val });
      return builder;
    },
    neq(col: string, val: unknown) {
      filters.push({ kind: 'neq', col, val });
      return builder;
    },
    in(col: string, vals: unknown[]) {
      filters.push({ kind: 'in', col, vals });
      return builder;
    },
    ilike(col: string, pattern: string) {
      filters.push({ kind: 'ilike', col, pattern });
      return builder;
    },
    order(_col: string, _opts?: { ascending?: boolean }) {
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
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ): Promise<TResult1 | TResult2> {
      return execute().then(onfulfilled, onrejected);
    },
  };

  return builder;
}

// =============================================================================
// Channel surface
// =============================================================================

function makeChannel(name: string): MockChannelHandle {
  let channel = state.channels.get(name);
  if (!channel) {
    channel = { name, handlers: [], subscribed: false };
    state.channels.set(name, channel);
  }
  const handle: MockChannelHandle = {
    name,
    on(event, filter, callback) {
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

export const supabase: MockSupabaseClient = {
  from(table) {
    log('from', { table });
    return makeBuilder(table);
  },
  channel(name) {
    log('channel', { name });
    return makeChannel(name);
  },
  removeChannel(channel) {
    log('removeChannel', { name: channel?.name });
    if (channel?.name) state.channels.delete(channel.name);
  },
  async rpc(name, args) {
    log('rpc', { name, args });
    const seeded = state.rpcResponses.get(name);
    return seeded
      ? { data: seeded.data ?? null, error: seeded.error ?? null }
      : { data: null, error: null };
  },
  auth: {
    async getSession() {
      return { data: { session: state.session }, error: null };
    },
    onAuthStateChange(listener) {
      state.authListeners.add(listener);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              state.authListeners.delete(listener);
            },
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
    async signInWithPassword({ email }) {
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
  response: { data?: any; error?: SeededError | null }
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
  payload: ChannelPayload
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

// =============================================================================
// Module augmentation
//
// The mock helpers below are only present on the manual mock (this file), not
// on the real `state/supabaseClient.ts`. Tests, however, import them from
// `@/state/supabaseClient` (jest swaps in the mock at runtime via the
// `__mocks__` convention). Without this augmentation, TypeScript would emit
// TS2305 ("has no exported member") for every such import even though the
// imports succeed at test runtime. Declaring them here teaches `tsc` that
// these names exist on the module path, while keeping the production
// `supabase` export intact via declaration merging.
// =============================================================================

declare module '@/state/supabaseClient' {
  export function mockSupabaseReset(): void;
  export function mockSupabaseSeedTable(
    table: string,
    rows: Array<Record<string, any>>
  ): void;
  export function mockSupabaseGetTable(table: string): Array<Record<string, any>>;
  export function mockSupabaseSeedRpc(
    name: string,
    response: {
      data?: any;
      error?: { message: string; code?: string } | null;
    }
  ): void;
  export function mockSupabaseSeedSession(session: any): void;
  export function mockSupabaseSetTableError(
    table: string,
    error: { message: string; code?: string }
  ): void;
  export function mockSupabaseSetTableDelay(table: string, ms: number): void;
  export function mockSupabaseEmitAuthEvent(event: string, session?: any): void;
  export function mockSupabaseEmitChannel(
    channelName: string,
    table: string,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: { new?: Record<string, any>; old?: Record<string, any> }
  ): void;
  export function mockSupabaseChannelSubscribeCount(name: string): number;
  export function mockSupabaseCallLog(): Array<{ kind: string; args: any[] }>;
  export function mockSupabaseCallCount(kind: string): number;
}
