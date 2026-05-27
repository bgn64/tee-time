# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Score tab — out-of-repo setup

The Score tab introduces two new synced tables (`scorecards`, `scorecard_scores`) plus a server-side trigger that denormalizes `owner_user_id` onto child rows. After pulling these changes you need to apply the new schema to your Supabase project and update the PowerSync sync rules — neither is run automatically by the app.

1. **Apply the SQL migration.** Open the Supabase dashboard → SQL editor and paste the contents of [`supabase/migrations/002_scorecards.sql`](./supabase/migrations/002_scorecards.sql). This creates the two new tables, the `scorecard_scores` owner-denorm trigger, the `auth.uid()` RLS policies, and `ALTER PUBLICATION powersync ADD TABLE …` so PowerSync can replicate them.
2. **Update the PowerSync sync rules.** Open the PowerSync dashboard → Sync Rules and replace the rules with the contents of [`sync-rules.yaml`](./sync-rules.yaml). The new file adds `scorecards` and `scorecard_scores` streams scoped to `owner_user_id = request.user_id()` so two devices signed in to the same account see the same in-progress round.
3. **Smoke-test cross-device sync.** Sign in on web and on a phone/simulator with the same magic-link OTP account. Start a round on one device, tap a score, and confirm the second device's `ReadOnlyScorecard` reflects the change within a couple of seconds. The current-hole position (`HoleNavBar`) intentionally stays per-device — only the scores sync.

## Friending — out-of-repo setup

The friending feature adds three new tables (`profiles`, `friend_requests`, `friendships`) plus six SECURITY DEFINER RPCs that own all the write paths. The friend graph **is** synced to clients via PowerSync — the Home incoming-requests banner is realtime, and the friends list is offline-available — but writes still flow through RPCs so multi-row invariants (e.g., "accepted FR ⇔ two friendship rows") can be enforced atomically.

Search-result profiles are NOT synced: handle search needs a server-side prefix index across the global user set, so the Search tab queries Supabase directly.

1. **Apply the SQL migration.** Open the Supabase dashboard → SQL editor and paste the contents of [`supabase/migrations/003_friends.sql`](./supabase/migrations/003_friends.sql). This creates the three tables, the partial unique index that prevents duplicate pending requests in one direction, the RLS read policies (no direct insert/update/delete — clients must go through RPCs), and the six RPCs (`complete_profile`, `send_friend_request`, `accept_friend_request`, `decline_friend_request`, `cancel_friend_request`, `unfriend`). Each RPC starts with an `auth.uid()` null guard and is granted EXECUTE only to `authenticated`. The `friendships` PK is a synthetic `id uuid` (with `UNIQUE (user_id, friend_user_id)` preserving the symmetric-two-rows invariant) — PowerSync requires a single-column `id` on every synced row.
2. **Redeploy the PowerSync sync rules.** Five new streams have been added to [`powersync/sync-config.yaml`](./powersync/sync-config.yaml): `own_profile`, `friend_profiles`, `requester_profiles`, `friendships`, and `friend_requests`. The three profile streams alias `user_id AS id` so PowerSync sees a usable local row key. Push the file with `powersync deploy sync-config` (or paste the YAML into the PowerSync dashboard → Sync Rules and Deploy). The `powersync` publication is already `FOR ALL TABLES`, so no `ALTER PUBLICATION` is needed for the new tables.
3. **Smoke-test the end-to-end flow** with two invited accounts on two browser windows:
   - A signs in, picks `@alice`. B signs in, picks `@bob`.
   - A opens the **Search** tab, types `bo`, taps Bob's row → profile shows `+ Add Friend`. Tap → flips to `Requested`.
   - B opens **Home** → sees the incoming-request banner appear **without refreshing** (this is the realtime check; PowerSync pushes the new row to B's open tab). Tap Confirm → banner clears, A's profile flips to `Friends ✓`.
   - B taps the `Friends ✓` pill → dropdown shows `Unfriend` → confirm → friendship deleted on both sides.
4. **Offline check.** With B's friends list populated, disconnect the network and reload the web app. The friends list and any pending FRs should still render — PowerSync's local SQLite holds them across reloads, and the RPC writes are deliberately not queued offline (they need server-side multi-row transactions).

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
