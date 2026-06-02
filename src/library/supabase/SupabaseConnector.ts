import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncCredentials
} from '@powersync/common';
import type { SupportedStorage } from '@supabase/auth-js';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { AppConfig } from './AppConfig';

// Postgres response codes that we cannot recover from by retrying.
const FATAL_RESPONSE_CODES = [
  // Class 22 — Data Exception (e.g. type mismatch)
  new RegExp('^22...$'),
  // Class 23 — Integrity Constraint Violation (NOT NULL, FK, UNIQUE, ...)
  new RegExp('^23...$'),
  // 42501 — INSUFFICIENT PRIVILEGE (typically an RLS violation)
  new RegExp('^42501$')
];

export class SupabaseConnector implements PowerSyncBackendConnector {
  readonly client: SupabaseClient;

  constructor({
    kvStorage,
    supabaseUrl,
    supabaseAnonKey
  }: {
    kvStorage: SupportedStorage;
    supabaseUrl: string;
    supabaseAnonKey: string;
  }) {
    this.client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: kvStorage
      }
    });
  }

  async sendMagicCode(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      // Invite-only: refuse to provision accounts on the fly. Unknown
      // emails get a clear error which bubbles up as a UI alert.
      options: { shouldCreateUser: false }
    });
    if (error) {
      throw error;
    }
  }

  async verifyMagicCode(email: string, code: string): Promise<void> {
    const { error } = await this.client.auth.verifyOtp({
      email,
      token: code,
      type: 'email'
    });
    if (error) {
      throw error;
    }
  }

  async logout() {
    await this.client.auth.signOut();
  }

  async userId(): Promise<string | undefined> {
    const {
      data: { session }
    } = await this.client.auth.getSession();
    return session?.user.id;
  }

  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const {
      data: { session },
      error
    } = await this.client.auth.getSession();

    if (!session || error) {
      throw new Error(`Could not fetch Supabase credentials: ${error}`);
    }

    return {
      endpoint: AppConfig.powersyncUrl!,
      token: session.access_token ?? ''
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) {
      return;
    }

    let lastOp: CrudEntry | null = null;
    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = this.client.from(op.table);
        let result: { error?: { code?: string; message?: string } | null } = {};

        switch (op.op) {
          case UpdateType.PUT: {
            const record = parseJsonColumns(op.table, { ...op.opData, id: op.id });
            result = await table.upsert(record);
            break;
          }
          case UpdateType.PATCH:
            result = await table
              .update(parseJsonColumns(op.table, op.opData ?? {}))
              .eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
        }

        if (result.error) {
          console.error(result.error);
          result.error.message = `Could not ${op.op} data to Supabase: ${result.error.message}`;
          throw result.error;
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      console.debug(ex);
      if (typeof ex.code === 'string' && FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))) {
        // Discard the rest of the transaction — these errors are typically bugs
        // and retrying would block the queue forever.
        console.error('Data upload error — discarding:', lastOp, ex);
        await transaction.complete();
      } else {
        // Likely transient (network / server) — rethrow so PowerSync retries.
        throw ex;
      }
    }
  }
}

// Columns whose local representation is a JSON-encoded string but
// whose Postgres type is `jsonb`. The upload connector parses them
// back into objects before sending to Supabase so the jsonb column
// receives an object literal — not a quoted string scalar.
const JSON_COLUMNS_BY_TABLE: Record<string, readonly string[]> = {
  scorecards: ['course_snapshot', 'participants', 'player_ids', 'teams'],
  scorecard_achievement_tags: ['tags'],
  scorecard_tracked_stats: ['enabled_tags'],
  scorecard_shot_attributions: ['contributor_ids']
};

function parseJsonColumns(
  table: string,
  record: Record<string, any>
): Record<string, any> {
  const cols = JSON_COLUMNS_BY_TABLE[table];
  if (!cols || cols.length === 0) return record;
  const next: Record<string, any> = { ...record };
  for (const col of cols) {
    const value = next[col];
    if (value == null) continue;
    if (typeof value !== 'string') continue;
    try {
      next[col] = JSON.parse(value);
    } catch (e) {
      console.warn(
        `[SupabaseConnector] Failed to parse JSON column ${table}.${col}; sending as-is.`,
        e
      );
    }
  }
  return next;
}
