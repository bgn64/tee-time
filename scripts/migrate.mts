import nextEnv from "@next/env";
import { getMigrations } from "better-auth/db/migration";
import { authOptions, openAuthDatabase } from "../src/lib/auth-config.mts";

nextEnv.loadEnvConfig(process.cwd());
const database = openAuthDatabase();
try {
  const migration = await getMigrations(authOptions(database));
  await migration.runMigrations();
  console.log("Authentication database is up to date.");
} finally {
  database.close();
}
