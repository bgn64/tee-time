import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { BetterAuthOptions } from "better-auth";

export function openAuthDatabase() {
  const path = resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || "./data/tee-time.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

export function authOptions(database: Database.Database) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Set BETTER_AUTH_SECRET to a random secret of at least 32 characters in .env.local.");
  }

  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) {
    throw new Error("Set BETTER_AUTH_URL in .env.local (for example http://localhost:3000).");
  }
  const url = new URL(baseURL);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== baseURL) {
    throw new Error("BETTER_AUTH_URL must be an HTTP(S) origin without a trailing slash or path.");
  }

  return {
    appName: "Tee Time",
    database,
    secret,
    baseURL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
  } satisfies BetterAuthOptions;
}
