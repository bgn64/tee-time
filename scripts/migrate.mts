import nextEnv from "@next/env";
import { getMigrations } from "better-auth/db/migration";
import { authOptions, openAuthDatabase } from "../src/lib/auth-config.mts";
import { migrateGolf } from "../src/lib/golf-db.mts";

nextEnv.loadEnvConfig(process.cwd());
const database = openAuthDatabase();
try {
  const migration = await getMigrations(authOptions(database));
  await migration.runMigrations();
  migrateGolf(database);
  console.log("Authentication and golf databases are up to date.");
} finally {
  database.close();
}
