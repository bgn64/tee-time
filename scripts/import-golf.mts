import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openAuthDatabase } from "../src/lib/auth-config.mts";
import { migrateGolf } from "../src/lib/golf-db.mts";
import { importGolf, readGolfDump } from "../src/lib/golf-import.mts";
import { object, text } from "../src/lib/golf-validation.mts";

nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const dumpIndex = args.indexOf("--dump");
const mappingIndex = args.indexOf("--mapping");
if (dumpIndex < 0 || mappingIndex < 0 || !args[dumpIndex + 1] || !args[mappingIndex + 1]) {
  throw new Error("Usage: npm run golf:import -- --dump <backup.gz> --mapping <private-mapping.json> [--dry-run]");
}
const mapping = Object.fromEntries(Object.entries(object(JSON.parse(readFileSync(resolve(args[mappingIndex + 1]), "utf8")))).map(([id, email]) => [id, text(email, "Account email")]));
const data = readGolfDump(resolve(args[dumpIndex + 1]));
const db = openAuthDatabase();
try {
  const dryRun = args.includes("--dry-run");
  if (!dryRun) {
    const path = `${db.name}.before-golf-${Date.now()}.sqlite`;
    await db.backup(path);
    console.log(`Consistent pre-import backup: ${path}`);
  }
  migrateGolf(db);
  const report = importGolf(db, data, mapping, dryRun);
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
