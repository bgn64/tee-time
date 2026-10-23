import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { authOptions, openAuthDatabase } from "../src/lib/auth-config.mts";
import { provisionAccount } from "./provision-account.mts";

test("household authentication persists, isolates sessions, rejects signup, and revokes logout", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tee-time-auth-"));
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("base64");
  process.env.DATABASE_PATH = join(directory, "test.sqlite");
  let database = openAuthDatabase();
  try {
    const options = authOptions(database);
    await (await getMigrations(options)).runMigrations();
    const secondMigration = await getMigrations(options);
    assert.equal(secondMigration.toBeCreated.length, 0);
    assert.equal(secondMigration.toBeAdded.length, 0);
    await secondMigration.runMigrations();

    const alice = { name: "Alice", email: "alice@example.test", password: "Local-test-password-123!" };
    const bob = { name: "Bob", email: "bob@example.test", password: "Another-local-password-456!" };
    await provisionAccount(database, alice);
    await provisionAccount(database, bob);
    await assert.rejects(provisionAccount(database, alice));
    await assert.rejects(provisionAccount(database, { ...bob, email: "invalid" }));
    await assert.rejects(provisionAccount(database, { ...bob, email: "short@example.test", password: "short" }));
    assert.equal(database.prepare<[], { count: number }>("SELECT count(*) AS count FROM session").get()?.count, 0);

    database.close();
    database = openAuthDatabase();
    const auth = betterAuth(authOptions(database));
    const call = (path: string, body?: object, cookie = "") => auth.handler(
      new Request(`http://localhost:3000/api/auth/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          cookie,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    const signup = await call("sign-up/email", { ...alice, email: "uninvited@example.test" });
    assert.equal(signup.status, 400);
    assert.equal((await signup.json()).code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
    assert.equal(await (await call("get-session")).json(), null);
    const wrong = await call("sign-in/email", { email: alice.email, password: "wrong-password" });
    assert.equal(wrong.status, 401);

    async function login(email: string, password: string) {
      const response = await call("sign-in/email", { email, password });
      assert.equal(response.status, 200);
      const cookies = response.headers.getSetCookie();
      assert.ok(cookies.some((cookie) => /httponly/i.test(cookie)));
      return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
    }
    const aliceCookie = await login(alice.email, alice.password);
    const bobCookie = await login(bob.email, bob.password);
    assert.equal((await (await call("get-session", undefined, aliceCookie)).json()).user.email, alice.email);
    assert.equal((await (await call("get-session", undefined, bobCookie)).json()).user.email, bob.email);
    assert.equal(await (await call("get-session", undefined, "better-auth.session_token=forged")).json(), null);
    const csrf = await auth.handler(new Request("http://localhost:3000/api/auth/sign-out", {
      method: "POST",
      headers: { origin: "http://untrusted.example", cookie: aliceCookie, "content-type": "application/json" },
      body: "{}",
    }));
    assert.equal(csrf.status, 403);
    assert.equal((await call("sign-out", {}, aliceCookie)).status, 200);
    assert.equal(await (await call("get-session", undefined, aliceCookie)).json(), null);
    assert.equal((await (await call("get-session", undefined, bobCookie)).json()).user.email, bob.email);
  } finally {
    database.close();
    rmSync(directory, { recursive: true });
  }
});
