import '@azure/core-asynciterator-polyfill';

import React from 'react';
import { Platform } from 'react-native';
import {
  AbstractPowerSyncDatabase,
  createBaseLogger,
  LogLevel
} from '@powersync/common';

import { AppConfig } from '../supabase/AppConfig';
import { SupabaseConnector } from '../supabase/SupabaseConnector';
import { ExpoKVStorage, WebKVStorage } from '../storage/KVStorage';
import { AppSchema } from './AppSchema';

const logger = createBaseLogger();
logger.useDefaults();
logger.setLevel(LogLevel.DEBUG);

/**
 * Lazily creates the PowerSync database for the current platform.
 * Imports are gated by `Platform.OS` so that Metro's stub resolutions
 * (see metro.config.js) are not actually evaluated on the wrong platform.
 */
function createPowerSyncDatabase(): AbstractPowerSyncDatabase {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PowerSyncDatabase, WASQLiteOpenFactory } = require('@powersync/web');
    const factory = new WASQLiteOpenFactory({
      dbFilename: 'tee-time.db',
      // Worker copied into /public/@powersync via `npx powersync-web copy-assets`
      worker: '/@powersync/worker/WASQLiteDB.umd.js'
    });
    return new PowerSyncDatabase({
      schema: AppSchema,
      database: factory,
      sync: {
        worker: '/@powersync/worker/SharedSyncImplementation.umd.js'
      },
      logger
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PowerSyncDatabase } = require('@powersync/react-native');
  return new PowerSyncDatabase({
    schema: AppSchema,
    database: { dbFilename: 'tee-time.db' },
    logger
  });
}

export class System {
  readonly kvStorage: ExpoKVStorage | WebKVStorage;
  readonly supabaseConnector: SupabaseConnector;
  readonly powersync: AbstractPowerSyncDatabase;

  private initPromise: Promise<void> | null = null;
  private connected = false;
  private authSubscription: { unsubscribe: () => void } | null = null;

  constructor() {
    this.kvStorage = Platform.OS === 'web' ? new WebKVStorage() : new ExpoKVStorage();
    this.supabaseConnector = new SupabaseConnector({
      kvStorage: this.kvStorage,
      supabaseUrl: AppConfig.supabaseUrl ?? '',
      supabaseAnonKey: AppConfig.supabaseAnonKey ?? ''
    });
    this.powersync = createPowerSyncDatabase();
  }

  /**
   * Initialise the local DB and wire auth-state changes to PowerSync's connect/disconnect.
   * Safe to call multiple times — the work runs once.
   */
  init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      await this.powersync.init();

      // Connect immediately if a session already exists (e.g. after a refresh).
      const {
        data: { session }
      } = await this.supabaseConnector.client.auth.getSession();
      if (session) {
        await this.ensureConnected();
      }

      // React to login/logout for the lifetime of the app.
      const {
        data: { subscription }
      } = this.supabaseConnector.client.auth.onAuthStateChange(async (event, nextSession) => {
        if (event === 'SIGNED_OUT' || !nextSession) {
          await this.ensureDisconnectedAndClear();
        } else {
          await this.ensureConnected();
        }
      });
      this.authSubscription = subscription;
    })();

    return this.initPromise;
  }

  private async ensureConnected() {
    if (this.connected) return;
    await this.powersync.connect(this.supabaseConnector);
    this.connected = true;
  }

  private async ensureDisconnectedAndClear() {
    if (!this.connected) return;
    try {
      await this.powersync.disconnectAndClear();
    } finally {
      this.connected = false;
    }
  }

  /** Sign the user out and clear all local PowerSync data. Safe to call multiple times. */
  async signOut() {
    await this.supabaseConnector.logout();
    await this.ensureDisconnectedAndClear();
  }
}

// Guarded singleton — survives Fast Refresh / HMR without creating a second
// PowerSyncDatabase instance (which would conflict on the same dbFilename).
const SYSTEM_KEY = '__teeTimeSystem__';
type GlobalWithSystem = typeof globalThis & { [SYSTEM_KEY]?: System };
const g = globalThis as GlobalWithSystem;
export const system: System = g[SYSTEM_KEY] ?? (g[SYSTEM_KEY] = new System());

export const SystemContext = React.createContext<System | null>(null);

export const useSystem = (): System => {
  const ctx = React.useContext(SystemContext);
  if (!ctx) {
    throw new Error('useSystem must be used within a <SystemContext.Provider>');
  }
  return ctx;
};
