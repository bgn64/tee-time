import "server-only";
import { betterAuth } from "better-auth";
import { authOptions, openAuthDatabase } from "./auth-config.mts";

export const auth = betterAuth(authOptions(openAuthDatabase()));
