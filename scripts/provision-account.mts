import { betterAuth } from "better-auth";
import { authOptions } from "../src/lib/auth-config.mts";
import type Database from "better-sqlite3";

export async function provisionAccount(
  database: Database.Database,
  input: { name: string; email: string; password: string },
) {
  if (!input.name.trim()) throw new Error("Name is required.");
  const options = authOptions(database);
  // Only this local command enables signup; this instance is never mounted as an HTTP handler.
  const provisioning = betterAuth({
    ...options,
    emailAndPassword: { ...options.emailAndPassword, disableSignUp: false },
  });
  const result = await provisioning.api.signUpEmail({
    body: { ...input, name: input.name.trim(), email: input.email.trim() },
    returnHeaders: true,
  });
  if (result.response.token) {
    await provisioning.api.signOut({
      headers: new Headers({
        cookie: result.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; "),
      }),
    });
  }
  return result.response.user;
}
