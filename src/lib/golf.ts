import "server-only";
import { openAuthDatabase } from "./auth-config.mts";

export const golfDb = openAuthDatabase();
